window.__ModuleLoader__.load({
  id: 'dsh-asuta-model-group-label',
  factory(require) {
    const { createElement: h } = require('react')
    const { Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const slot = 'conversation.input.model.label'
    const badgeLayout = { display: 'inline-flex', verticalAlign: 'baseline', alignItems: 'center', maxWidth: '100%', gap: 4, whiteSpace: 'nowrap' }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot }, ({ provider, model, placement }) => {
          const trigger = placement === 'trigger'
          const group = provider.name?.trim() || provider.id
          const label = trigger && group ? group + '/' + model.name : model.name
          if (!model.badge) return label
          // A single slot replaces the whole label, so keep the native badge in each placement.
          const badge = h('span', { style: { flex: 'none' } }, h(Tag, { tone: model.badge.tone }, ctx.locale.resolveText(model.badge.text)))
          const name = h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, label)
          return h('span', { style: badgeLayout }, ...(trigger ? [badge, ' ', name] : [name, ' ', badge]))
        })), 'model-group-label: composer label')
      },
    }
  },
})
