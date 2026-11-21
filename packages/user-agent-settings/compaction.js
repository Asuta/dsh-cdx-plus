/**
 * Runtime-only compaction routing. Persistence belongs to the settings core.
 *
 * Native contract verified against dsh-compaction-basic: summarize is the sole
 * customization hook and every automatic/manual/region path dispatches it.
 * We never register llm/stream middleware, edit Loader/profile configuration,
 * mutate AgentOptions/session headers, or change the live engine config.
 *
 * createCompactionAdapter(ctx, getSelection) returns synchronously:
 *   status(): detached diagnostic object (no model requests)
 *   refresh(): rescan live scopes; existing wrappers read selection per call
 *   validate(selection): Promise<normalized selection>; metadata-only check
 *   dispose(): Promise<void>; idempotent, restores owned method descriptors
 * Selection is {provider, model} or null (follow each conversation's route).
 * Changing the getter affects the next summary, never an in-flight summary.
 */
const ORIGINAL = Symbol.for('cordis.original')
const OWNED = Symbol.for('user-agent-settings.compaction-adapter.v1')

function failure(code, message) { return Object.assign(new Error(message), { code }) }
function canonical(value) { return value?.[ORIGINAL] ?? value }
export function normalizeSelection(selection) {
  if (selection == null) return null
  if (!selection || typeof selection !== 'object' || Array.isArray(selection) ||
      Object.keys(selection).some(key => !['provider', 'model', 'reasoningEffort'].includes(key)) ||
      typeof selection.provider !== 'string' || !selection.provider.trim() || selection.provider.length > 256 ||
      typeof selection.model !== 'string' || !selection.model.trim() || selection.model.length > 512 ||
      (selection.reasoningEffort !== undefined && (typeof selection.reasoningEffort !== 'string' ||
        selection.reasoningEffort.length > 256 || !selection.reasoningEffort.trim()))) {
    throw failure('BAD_SELECTION', 'Choose a provider and model with an optional reasoning effort, or follow the conversation model.')
  }
  const { provider, model, reasoningEffort } = selection
  return Object.freeze({ provider: provider.trim(), model: model.trim(), ...(reasoningEffort === undefined ? {} : { reasoningEffort: reasoningEffort.trim() }) })
}

function inspectEngine(value) {
  const engine = canonical(value)
  if (!engine) return { engine: null, supported: false, reason: 'No compaction service is active in this scope.' }
  let proto = engine
  let native
  while (proto && proto !== Object.prototype) {
    const constructor = Object.getOwnPropertyDescriptor(proto, 'constructor')?.value
    if (constructor?.name === 'BasicCompactionEngine') {
      native = Object.getOwnPropertyDescriptor(proto, 'summarize')?.value
      break
    }
    proto = Object.getPrototypeOf(proto)
  }
  const current = engine.summarize
  const base = current?.[OWNED]?.original ?? current
  if (typeof native !== 'function' || base !== native ||
      !engine.config || !Array.isArray(engine.config.modelPolicies) ||
      typeof engine.compactNow !== 'function' || typeof engine.compactRegion !== 'function' ||
      typeof engine.compactIfNeeded !== 'function') {
    return { engine, supported: false, reason: 'Custom/unknown compaction engine: only the native BasicCompactionEngine summarizer hook is supported.' }
  }
  const descriptor = Object.getOwnPropertyDescriptor(engine, 'summarize')
  if (descriptor && !descriptor.configurable && !descriptor.writable) {
    return { engine, supported: false, reason: 'The compaction summarizer is not replaceable.' }
  }
  if (!descriptor && !Object.isExtensible(engine)) {
    return { engine, supported: false, reason: 'The compaction instance is not extensible.' }
  }
  return { engine, supported: true, original: base }
}

function summaryConfig(config, selection) {
  const pair = {
    summarizationProvider: selection?.provider ?? '',
    summarizationModel: selection?.model ?? '',
  }
  // Exact model policies otherwise win over the top-level summarizer route.
  // All pressure, retention, retry and output-cap policy values are preserved.
  return Object.freeze({
    ...config, ...pair,
    modelPolicies: Object.freeze(config.modelPolicies.map(policy => Object.freeze({ ...policy, ...pair }))),
  })
}

export function createCompactionAdapter(ctx, getSelection) {
  if (typeof getSelection !== 'function') throw new TypeError('getSelection must be a function')
  const records = new Map()
  const patches = new Map()
  const listeners = []
  const rootKey = {}
  let disposed = false
  let disposal
  let lastError = null
  let summariesStarted = 0

  function warn(error) {
    lastError = error instanceof Error ? error.message : String(error)
    try { ctx.logger?.warn?.('Compaction model adapter: ' + lastError) } catch {}
  }
  function getService(scope, name) { return scope?.get?.(name) }
  function compactionFor(record) {
    if (record.kind === 'agent') {
      // Preset groups isolate compaction BELOW Agent.ctx; ctx.get cannot see
      // them. This public resolver also returns a caller-traced service.
      const presets = getService(ctx, 'agentPresets')
      const service = presets?.serviceFor?.(record.agent, 'compaction')
      if (service !== undefined) { record.source = 'preset'; return service }
    }
    record.source = record.kind === 'host' ? 'host' : 'agent'
    return getService(record.scope, 'compaction')
  }
  function release(record) {
    const patch = record.patch
    record.patch = null
    if (!patch || --patch.users > 0) return
    patches.delete(patch.engine)
    if (patch.engine.summarize !== patch.wrapper) return // never clobber a later owner
    if (patch.descriptor) Object.defineProperty(patch.engine, 'summarize', patch.descriptor)
    else delete patch.engine.summarize
  }
  function sync(record) {
    if (disposed || record.stopped) return
    let inspection
    try { inspection = inspectEngine(compactionFor(record)) }
    catch (error) { inspection = { engine: null, supported: false, reason: String(error.message ?? error) } }
    if (record.patch && record.patch.engine === inspection.engine &&
        inspection.engine.summarize === record.patch.wrapper) {
      record.supported = true; record.reason = null; return
    }
    release(record)
    record.supported = inspection.supported
    record.reason = inspection.reason ?? null
    if (!inspection.supported) return
    let patch = patches.get(inspection.engine)
    if (!patch) {
      if (inspection.engine.summarize?.[OWNED]) {
        record.supported = false
        record.reason = 'Another compaction settings adapter already owns this instance.'
        return
      }
      const { engine, original } = inspection
      patch = { engine, original, descriptor: Object.getOwnPropertyDescriptor(engine, 'summarize'), users: 0 }
      patch.wrapper = function (input, agent, signal) {
        if (disposed) return Reflect.apply(original, this, [input, agent, signal])
        const selection = normalizeSelection(getSelection())
        const receiver = Object.create(this)
        Object.defineProperty(receiver, 'config', { value: summaryConfig(this.config, selection) })
        if (selection?.reasoningEffort !== undefined) {
          // The native summarizer reads ctx.llm.stream from this receiver.
          // Inject the effort in this one call, preserving the actual host service.
          const llm = this.ctx?.llm
          if (typeof llm?.stream !== 'function') throw failure('COMPACTION_UNSUPPORTED', 'The native compression stream is unavailable.')
          const callContext = Object.create(this.ctx)
          Object.defineProperty(callContext, 'llm', { value: { stream(options) {
            if (options.purpose !== 'compaction' || options.provider !== selection.provider || options.model !== selection.model) {
              throw failure('COMPACTION_UNSUPPORTED', 'The native compression request does not match the configured model.')
            }
            return llm.stream({ ...options, reasoningEffort: selection.reasoningEffort })
          } } })
          Object.defineProperty(receiver, 'ctx', { value: callContext })
        }
        summariesStarted++
        // Per-call receiver preserves the caller's Cordis ctx and cancellation.
        // No mutation, await window, request middleware, or global LLM rewrite.
        return Reflect.apply(original, receiver, [input, agent, signal])
      }
      Object.defineProperty(patch.wrapper, OWNED, { value: { original } })
      try {
        Object.defineProperty(engine, 'summarize', {
          ...(patch.descriptor ?? { configurable: true, enumerable: false, writable: true }),
          value: patch.wrapper,
        })
      } catch (error) {
        record.supported = false; record.reason = String(error.message ?? error); warn(error); return
      }
      patches.set(engine, patch)
    }
    patch.users++
    record.patch = patch
  }
  function watch(key, scope, kind) {
    if (!scope || records.has(key) || disposed) return
    const record = { scope, kind, agent: kind === 'agent' ? key : null, source: null, id: kind === 'agent' ? String(key.id) : null, stopped: false, patch: null, supported: false, reason: null, watcher: null, lifetime: null }
    records.set(key, record)
    const stop = () => {
      if (record.stopped) return
      record.stopped = true
      records.delete(key)
      release(record)
      const watcher = record.watcher; record.watcher = null
      return watcher?.dispose?.()
    }
    record.stop = stop
    sync(record) // cover already-loaded agents before asynchronous inject setup
    try {
      if (typeof scope.inject === 'function') {
        record.watcher = scope.inject(['compaction'], function compactionSettingsScope() {
          sync(record)
          return () => release(record)
        })
        // Fiber is thenable: observe startup failures, not a detached rejection.
        if (record.watcher?.then) Promise.resolve(record.watcher).catch(warn)
      }
      // Agent scope and plugin both own this registration (practices.md).
      if (kind === 'agent' && typeof scope.effect === 'function') {
        record.lifetime = scope.effect(() => stop, 'user-agent-settings: compaction scope')
      }
    } catch (error) { warn(error) }
  }
  function refresh() {
    if (disposed) return status()
    try {
      watch(rootKey, ctx, 'host')
      const agents = getService(ctx, 'agents')
      const live = agents?.list?.() ?? []
      const keys = new Set(live)
      for (const agent of live) watch(agent, agent.ctx, 'agent')
      for (const [key, record] of records) {
        if (record.kind === 'agent' && !keys.has(key)) {
          const result = record.stop(); result?.catch?.(warn)
        } else sync(record)
      }
    } catch (error) { warn(error) }
    return status()
  }
  function status() {
    let selection = null
    let selectionError = null
    try { selection = normalizeSelection(getSelection()) } catch (error) { selectionError = error.message }
    const scopes = [...records.values()].map(record => ({
      kind: record.kind, source: record.source, sessionId: record.id, supported: record.supported, reason: record.reason,
    }))
    const active = scopes.filter(scope => scope.supported).length
    const unsupported = scopes.filter(scope => !scope.supported && !scope.reason?.startsWith('No compaction service'))
    return {
      available: !disposed && active > 0 && unsupported.length === 0 && !selectionError,
      mode: selection === null ? 'follow-conversation' : 'fixed',
      selection, disposed, mechanism: 'native-summarize-hook',
      coverage: ['automatic', 'context-overflow', 'manual', 'region'],
      activeEngines: patches.size, activeScopes: active, scopes, summariesStarted,
      limitations: unsupported.map(scope => ({ sessionId: scope.sessionId, reason: scope.reason })),
      error: selectionError ?? lastError,
    }
  }
  async function validate(value) {
    if (disposed) throw failure('COMPACTION_ADAPTER_DISPOSED', 'Compaction adapter is disposed.')
    const selection = normalizeSelection(value)
    const report = refresh()
    if (selection !== null && (!report.activeEngines || report.limitations.length)) {
      throw failure('COMPACTION_UNSUPPORTED', report.limitations[0]?.reason ?? 'No supported native compaction service is active.')
    }
    if (selection === null) return null
    const llm = getService(ctx, 'llm')
    const providers = await llm?.listProviders?.()
    if (!providers?.some(provider => provider.id === selection.provider)) {
      throw failure('COMPACTION_PROVIDER_UNAVAILABLE', 'The selected compaction provider is not registered.')
    }
    const models = await llm.listModels(selection.provider)
    const model = models.find(model => model.id === selection.model)
    if (!model) {
      throw failure('COMPACTION_MODEL_UNAVAILABLE', 'The selected compaction model is not in the provider model catalog.')
    }
    if (selection.reasoningEffort !== undefined) {
      const exact = await llm.resolveModelInfo(selection.provider, selection.model)
      if (!exact.reasoning?.efforts?.some(effort => effort.id === selection.reasoningEffort)) {
        throw failure('COMPACTION_EFFORT_UNAVAILABLE', 'The selected model does not support this reasoning effort.')
      }
    }
    return selection
  }
  function dispose() {
    if (disposal) return disposal
    disposed = true
    const pending = []
    for (const off of listeners.splice(0)) {
      try { const result = off(); if (result?.then) pending.push(result) } catch (error) { warn(error) }
    }
    for (const record of [...records.values()]) {
      try {
        const result = record.stop(); if (result?.then) pending.push(result)
        const lifetime = record.lifetime?.(); if (lifetime?.then) pending.push(lifetime)
      } catch (error) { warn(error) }
    }
    disposal = Promise.allSettled(pending).then(() => undefined)
    return disposal
  }
  if (typeof ctx.on === 'function') {
    listeners.push(ctx.on('agent/created', ({ agent }) => { watch(agent, agent.ctx, 'agent') }))
    listeners.push(ctx.on('agent/disposed', ({ agent }) => {
      const record = records.get(agent); const result = record?.stop(); result?.catch?.(warn)
    }))
    listeners.push(ctx.on('app-boot/config-reload', () => { refresh() }))
    listeners.push(ctx.on('agent-preset/selected', () => { refresh() }))
  }
  refresh()
  return { status, refresh, validate, dispose }
}
