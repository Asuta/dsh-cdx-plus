import { randomUUID } from 'node:crypto'

export const discoveryDescription = 'Discover and run DSH conversation, workspace, artifact and PR-check operations. Call with no arguments for the full catalog and discoveryId. To run an operation, call this same tool with discoveryId, operation, and arguments from the catalog. If discovery expires, call again with no arguments.'

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function validate(schema, value, path) {
  switch (schema.type) {
    case 'object':
      if (!isObject(value)) throw new Error(path + ' must be an object')
      for (const key of schema.required ?? []) {
        if (!Object.hasOwn(value, key)) throw new Error(path + '.' + key + ' is required')
      }
      for (const [key, item] of Object.entries(value)) {
        if (Object.hasOwn(schema.properties ?? {}, key)) validate(schema.properties[key], item, path + '.' + key)
        else if (schema.additionalProperties === false) throw new Error(path + '.' + key + ' is not supported')
      }
      break
    case 'array':
      if (!Array.isArray(value)) throw new Error(path + ' must be an array')
      value.forEach((item, index) => validate(schema.items, item, path + '[' + index + ']'))
      break
    case 'integer':
      if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw new Error(path + ' must be an integer within the allowed range')
      break
    case 'string':
    case 'boolean':
      if (typeof value !== schema.type) throw new Error(path + ' must be a ' + schema.type)
      break
    default:
      throw new Error('Unsupported schema at ' + path)
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(path + ' must be one of: ' + schema.enum.join(', '))
}

export function createDiscovery(catalog) {
  const discoveries = new WeakMap()

  return async function discoverOrRun(args, exec) {
    const agent = exec?.agent
    const generation = agent?.session?.surface?.replaceGeneration
    if (!Number.isSafeInteger(generation)) throw new Error('Conversation tool discovery requires a DSH session with context replacement tracking')
    if (!isObject(args) || Object.keys(args).some(key => !['operation', 'discoveryId', 'arguments'].includes(key))) {
      throw new Error('Call with {} to discover operations, or supply operation, discoveryId and arguments')
    }
    if (Object.keys(args).length === 0) {
      const id = randomUUID()
      discoveries.set(agent, { id, generation })
      return {
        discoveryId: id,
        tools: [...catalog.values()].map(({ name, description, parameters }) => ({ name, description, parameters })),
      }
    }

    const discovery = discoveries.get(agent)
    if (!discovery || discovery.generation !== generation || discovery.id !== args.discoveryId) {
      throw new Error('Conversation tool discovery expired or missing. Call search_conversation_tools with {} again.')
    }
    const tool = catalog.get(args.operation)
    if (!tool) throw new Error('Unknown conversation operation. Use a name from the catalog.')
    const parameters = Object.hasOwn(args, 'arguments') ? args.arguments : {}
    validate(tool.parameters, parameters, 'arguments')

    // Route only the selected operation through DSH's usual tool policies. Its
    // temporary registration is gone before the next model request is assembled.
    const callId = randomUUID()
    const unregister = agent.ctx.tools.register({
      ...tool,
      execute(parameters, inner) {
        if (inner.agent !== agent || inner.callId !== callId) throw new Error('Use search_conversation_tools to run this operation')
        if (agent.session.surface.replaceGeneration !== generation) {
          throw new Error('Conversation context changed. Call search_conversation_tools with {} again.')
        }
        return tool.execute(parameters, inner)
      },
    })
    try {
      const { results } = await agent.ctx.tools.execute({
        agent, signal: exec.signal,
        calls: [{ type: 'tool-call', id: callId, name: tool.name, arguments: JSON.stringify(parameters) }],
      })
      const outcome = results[0]?.result
      if (!outcome) throw new Error('DSH did not return a result for ' + tool.name)
      if (outcome.isError) throw new Error(outcome.error.message)
      return outcome.value
    } finally {
      unregister()
    }
  }
}
