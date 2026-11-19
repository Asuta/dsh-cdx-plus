import { randomUUID } from 'node:crypto'

const searchName = 'search_browser_tools'
const expired = 'Browser tool discovery expired or missing. Call search_browser_tools with {} again.'
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

// Raw DSH registry definitions describe inputs; their execute callbacks still
// need to validate them. This covers the input schema types used by the catalog.
function validate(schema, value, path) {
  const { type, properties = {}, required = [], items } = schema
  if (type === 'object') {
    if (!isObject(value)) throw new Error(path + ' must be an object')
    for (const key of required) {
      if (!Object.hasOwn(value, key)) throw new Error(path + '.' + key + ' is required')
    }
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) validate(properties[key], entry, path + '.' + key)
      else if (schema.additionalProperties === false) throw new Error(path + '.' + key + ' is not supported')
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) throw new Error(path + ' must be an array')
    value.forEach((entry, index) => validate(items, entry, path + '[' + index + ']'))
  } else if (type === 'number' ? !Number.isFinite(value) : typeof value !== type) {
    throw new Error(path + ' must be of type ' + type)
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(path + ' must be one of: ' + schema.enum.join(', '))
}

export function registerDiscovery(ctx, definitions) {
  const catalog = new Map(definitions.map(tool => [tool.name, tool]))
  const discoveries = new WeakMap()
  const parameters = {
    type: 'object',
    properties: {
      operation: { type: 'string', description: 'Operation name from the browser catalog. Omit all fields to discover.' },
      discoveryId: { type: 'string', description: 'Copy from the latest discovery result in this conversation.' },
      arguments: { type: 'object', additionalProperties: true, description: 'Arguments following the selected operation schema.' },
    },
    additionalProperties: false,
  }

  ctx.effect(() => ctx.tools.register({
    name: searchName,
    description: 'Discover and run operations for the current DSH sidebar browser: tabs, navigation, interaction, reading, screenshots and developer diagnostics. Call with no arguments for the full catalog and discoveryId. To run an operation, call this same tool with discoveryId, operation and arguments from the catalog. If discovery expires, call again with no arguments.',
    parameters,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, result) => result.content ?? [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute(args, exec) {
      const agent = exec?.agent
      const generation = agent?.session?.surface?.replaceGeneration
      if (!Number.isSafeInteger(generation)) throw new Error('Browser discovery requires an Agent-backed Session with context replacement tracking')
      validate(parameters, args, 'search_browser_tools')
      if (Object.keys(args).length === 0) {
        const id = randomUUID()
        discoveries.set(agent, { id, generation })
        return {
          discoveryId: id,
          tools: definitions.map(({ name, description, parameters }) => ({ name, description, parameters })),
        }
      }

      const discovery = discoveries.get(agent)
      if (!discovery || discovery.generation !== generation || discovery.id !== args.discoveryId) throw new Error(expired)
      const tool = catalog.get(args.operation)
      if (!tool) throw new Error('Unknown browser operation. Use a name from the catalog.')
      const input = args.arguments ?? {}
      validate(tool.parameters, input, 'arguments')

      // Use the normal DSH tool policies for this call. The registration is
      // scoped to the caller and removed before the next model step.
      const callId = randomUUID()
      const unregister = agent.ctx.tools.register({
        ...tool,
        execute(input, inner) {
          if (inner.agent !== agent || inner.callId !== callId) throw new Error('Use search_browser_tools to run this operation')
          if (agent.session.surface.replaceGeneration !== generation || discoveries.get(agent) !== discovery) throw new Error(expired)
          return tool.execute(input, inner)
        },
      })
      try {
        const { results } = await agent.ctx.tools.execute({
          agent, signal: exec.signal,
          calls: [{ type: 'tool-call', id: callId, name: tool.name, arguments: JSON.stringify(input) }],
        })
        const outcome = results[0]?.result
        if (!outcome) throw new Error('DSH did not return a result for ' + tool.name)
        if (outcome.isError) throw new Error(outcome.error?.message ?? 'Browser operation failed')
        return { value: outcome.value, content: outcome.content }
      } finally {
        unregister()
      }
    },
  }), 'dsh-asuta-sidebrowser: discover browser tools')
}
