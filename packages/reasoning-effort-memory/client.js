window.__ModuleLoader__.load({
  id: 'dsh-asuta-reasoning-effort-memory',
  factory() {
    const STORAGE_KEY = 'reasoning-effort-memory:v1'
    function read() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      } catch { return {} }
    }
    function write(value) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch (error) { console.warn('reasoning-effort-memory: could not persist preferences', error) }
    }
    function keyOf(selection) {
      return typeof selection?.provider === 'string' && typeof selection?.model === 'string'
        ? JSON.stringify([selection.provider, selection.model]) : null
    }
    return {
      inject: ['remote', 'remote.session'],
      apply(ctx) {
        ctx.effect(() => {
          const sessionRemote = ctx.remote.session
          const owner = sessionRemote?.[Symbol.for('cordis.original')]
          const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'selectModel')
          if (!descriptor?.configurable || typeof descriptor.get !== 'function') return
          const active = new Map()
          const remembered = read()
          function wrappedGetter() {
            const select = descriptor.get.call(this)
            return async function(selection, ...rest) {
              const key = keyOf(selection)
              if (!key) return select.call(this, selection, ...rest)
              const sessionId = selection.sessionId
              const previousKey = active.get(sessionId)
              const outgoing = { ...selection }
              if (key !== previousKey && Object.hasOwn(remembered, key)) {
                if (remembered[key] === null) delete outgoing.reasoningEffort
                else outgoing.reasoningEffort = remembered[key]
              }
              const result = await select.call(this, outgoing, ...rest)
              if (result?.ok !== false) {
                if (key === previousKey || !Object.hasOwn(remembered, key)) {
                  remembered[key] = selection.reasoningEffort ?? null
                  write(remembered)
                }
                active.set(sessionId, key)
              }
              return result
            }
          }
          try { Object.defineProperty(owner, 'selectModel', { ...descriptor, get: wrappedGetter }) }
          catch (error) { console.warn('reasoning-effort-memory: model selector is not patchable', error); return }
          return () => {
            if (Object.getOwnPropertyDescriptor(owner, 'selectModel')?.get === wrappedGetter) Object.defineProperty(owner, 'selectModel', descriptor)
          }
        }, 'reasoning-effort-memory: model preference persistence')
      },
    }
  },
})
