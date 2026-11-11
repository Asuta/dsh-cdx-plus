window.__ModuleLoader__.load({
  id: 'dsh-asuta-conversation-workbench',
  factory() {
    async function api(endpoint, body) {
      const response = await fetch('/conversation-workbench/' + endpoint, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin',
        headers: { 'x-conversation-workbench': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Request failed')
      return result
    }

    return {
      inject: ['uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => {
          let stopped = false, pending = false, lastOpenedId = null
          async function refresh() {
            if (pending || stopped) return
            pending = true
            try {
              const { navigation } = await api('state')
              if (stopped || !navigation || document.visibilityState !== 'visible') return
              if (navigation.id !== lastOpenedId) {
                try {
                  await ctx.uiWorkspace.openSession(navigation.sessionId)
                  lastOpenedId = navigation.id
                } catch (error) {
                  await api('navigation-ack', { id: navigation.id, success: false, error: String(error) })
                  return
                }
              }
              await api('navigation-ack', { id: navigation.id, success: true })
            } catch {
              // Keep the request pending and retry when the client is available.
            } finally { pending = false }
          }
          void refresh()
          const timer = setInterval(refresh, 8000)
          return () => { stopped = true; clearInterval(timer) }
        }, 'conversation-workbench: navigation')
      },
    }
  },
})
