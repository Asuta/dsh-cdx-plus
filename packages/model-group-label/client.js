window.__ModuleLoader__.load({
  id: 'dsh-asuta-model-group-label',
  factory(require) {
    const { createElement: h } = require('react')
    const { Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const slot = 'conversation.input.model.label'
    const badgeLayout = { display: 'inline-flex', verticalAlign: 'baseline', alignItems: 'center', maxWidth: '100%', gap: 4, whiteSpace: 'nowrap' }
    const storageKey = 'dsh-model-group-label:favorites:v1'
    const rowSelector = 'button[role="menuitemradio"]:has([data-cdx-model-key])'
    function installFavorites(ctx) {
      let favorites = readFavorites(), scheduled = false, stopped = false
      const stars = new Map(), menus = new Map()
      function readFavorites() {
        try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]').filter(key => typeof key === 'string')) }
        catch { return new Set() }
      }
      function copy(key) {
        const zh = (ctx.locale.getSnapshot?.().active || navigator.language).toLowerCase().startsWith('zh')
        return (zh ? { folder: '收藏模型', add: '收藏', remove: '取消收藏' } : { folder: 'Favorite models', add: 'Favorite', remove: 'Remove favorite' })[key]
      }
      const css = document.createElement('style')
      css.dataset.plugin = 'dsh-asuta-model-group-label'
      css.textContent = '[data-menu-group]:has(>[data-cdx-model-row]){position:relative}' +
        '[data-menu-group]>[data-cdx-model-row]{padding-inline-end:34px}' +
        '.cdx-model-star{box-sizing:border-box;width:28px;height:28px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;font:inherit;font-size:17px}' +
        '[data-menu-group]>.cdx-model-star{position:absolute;inset-inline-end:3px;transform:translateY(calc(-100% - 3px))}' +
        '.cdx-model-star[aria-pressed="true"]{color:var(--dsw-alias-brand-primary,#eab54d)}' +
        '.cdx-model-star:hover,.cdx-model-favorite-choice:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
        '.cdx-model-favorites{margin-bottom:4px;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:4px}' +
        '.cdx-model-favorites-label{padding:4px 7px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500}' +
        '.cdx-model-favorite-row{display:flex;align-items:center;padding-inline-end:3px;gap:3px}' +
        '.cdx-model-favorite-choice{flex:1;min-width:0;text-align:start;min-height:34px;padding:5px 7px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font-family:inherit;font-size:13px;line-height:18px;font-weight:400;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.cdx-model-star:focus-visible,.cdx-model-favorite-choice:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}'
      document.head.append(css)
      function toggle(key) {
        favorites.has(key) ? favorites.delete(key) : favorites.add(key)
        try { localStorage.setItem(storageKey, JSON.stringify([...favorites])) } catch {}
        reconcile()
      }
      function paint(star, key, label) {
        const selected = favorites.has(key), text = selected ? '★' : '☆'
        if (star.textContent !== text) star.textContent = text
        star.setAttribute('aria-pressed', String(selected))
        const title = copy(selected ? 'remove' : 'add') + ' · ' + label
        star.title = title + ' (F2)'
        star.setAttribute('aria-label', title)
      }
      function starButton(action) {
        const star = document.createElement('button')
        star.type = 'button'; star.className = 'cdx-model-star'
        star.setAttribute('aria-keyshortcuts', 'F2')
        star.addEventListener('click', action)
        return star
      }
      function reconcile() {
        if (stopped) return
        const byMenu = new Map(), seen = new Set()
        for (const row of document.querySelectorAll(rowSelector)) {
          const label = row.querySelector('[data-cdx-model-key]')
          const menu = row.closest('[role="menu"]')
          if (!menu || !row.parentElement?.matches('[data-menu-group]')) continue
          seen.add(row)
          let star = stars.get(row)
          if (!star) {
            star = starButton(() => {
              const current = row.querySelector('[data-cdx-model-key]')
              if (current) toggle(current.dataset.cdxModelKey)
            })
            row.setAttribute('data-cdx-model-row', '')
            stars.set(row, star)
          }
          if (row.nextElementSibling !== star) row.after(star)
          const key = label.dataset.cdxModelKey, name = label.dataset.cdxModelName
          paint(star, key, name)
          const list = byMenu.get(menu) || []
          if (favorites.has(key)) list.push({ key, name, group: label.dataset.cdxModelGroup, row, star })
          byMenu.set(menu, list)
        }
        for (const [row, star] of stars) if (!seen.has(row)) { star.remove(); row.removeAttribute('data-cdx-model-row'); stars.delete(row) }
        for (const [menu, entry] of menus) if (!byMenu.get(menu)?.length) { entry.section.remove(); menus.delete(menu) }
        for (const [menu, rows] of byMenu) {
          if (!rows.length) continue
          let entry = menus.get(menu)
          if (!entry) {
            const section = document.createElement('section')
            section.className = 'cdx-model-favorites'; section.setAttribute('aria-label', copy('folder'))
            const heading = document.createElement('div')
            heading.className = 'cdx-model-favorites-label'; heading.textContent = copy('folder')
            section.append(heading); menu.prepend(section)
            entry = { section, rows: new Map() }; menus.set(menu, entry)
          }
          for (const [key, item] of entry.rows) if (!rows.some(row => row.key === key)) { item.line.remove(); entry.rows.delete(key) }
          let previous = entry.section.firstElementChild
          for (const data of rows) {
            let item = entry.rows.get(data.key)
            if (!item) {
              const line = document.createElement('div'), choice = document.createElement('button')
              line.className = 'cdx-model-favorite-row'; choice.type = 'button'; choice.className = 'cdx-model-favorite-choice'
              choice.setAttribute('role', 'menuitem')
              choice.addEventListener('click', () => item.data.row.click())
              const star = starButton(() => { item.data.star.focus(); toggle(item.data.key) })
              line.append(choice, star)
              item = { line, choice, star }; entry.rows.set(data.key, item)
            }
            item.data = data
            if (previous.nextElementSibling !== item.line) previous.after(item.line)
            previous = item.line
            const name = data.group + ' / ' + data.name
            if (item.choice.textContent !== name) item.choice.textContent = name
            item.choice.title = name; item.choice.disabled = data.row.disabled
            item.choice.setAttribute('aria-current', data.row.getAttribute('aria-checked') === 'true' ? 'true' : 'false')
            paint(item.star, data.key, data.name)
          }
        }
      }
      function onKeyDown(event) {
        if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        const target = event.target
        if (event.key === 'Enter' && target.matches?.('.cdx-model-favorite-choice:not(:disabled)')) {
          event.preventDefault(); event.stopPropagation()
          if (!event.repeat) target.click()
          return
        }
        const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        if (!direction && event.key !== 'F2') return
        const controls = target.matches?.('[role="searchbox"][aria-controls]') ? target.getAttribute('aria-controls') : null
        const menu = controls ? document.getElementById(controls) : target.closest?.('[role="menu"]')
        if (!menu || menu.hidden) return
        const nativeRows = [...menu.querySelectorAll(rowSelector)].filter(row => stars.has(row) && !row.disabled)
        if (!nativeRows.length) return
        const search = [...menu.parentElement.querySelectorAll('[role="searchbox"][aria-controls]')]
          .find(input => input.getAttribute('aria-controls') === menu.id)
        const favorites = [...menu.querySelectorAll('.cdx-model-favorite-choice:not(:disabled)')]
        const choice = target.matches('.cdx-model-star') ? target.previousElementSibling
          : target === search ? document.getElementById(search.getAttribute('aria-activedescendant')) : target
        const rows = [...favorites, ...nativeRows]
        const index = rows.indexOf(choice)
        if (event.key === 'F2') {
          if (index < 0) return
          const star = choice.nextElementSibling
          if (!star?.matches('.cdx-model-star')) return
          event.preventDefault(); event.stopPropagation()
          if (!event.repeat) star.click()
          return
        }
        // In search mode the host tracks only its own rows. Intercept steps
        // into/out of favorites and let the host handle ordinary search steps.
        // Without search the host already navigates role=menuitem buttons.
        const next = rows[index < 0 ? (direction > 0 ? 0 : rows.length - 1) : (index + direction + rows.length) % rows.length]
        const fromStar = target.matches('.cdx-model-star')
        const toFavorite = favorites.includes(next)
        if (!fromStar && (!search || (!toFavorite && !favorites.includes(choice)) || (target !== search && index < 0))) return
        event.preventDefault(); event.stopPropagation()
        next.focus()
        if (search && !toFavorite) search.focus()
      }
      const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; reconcile() }) } }
      const observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' ? record.target.matches(rowSelector)
          : [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches?.(rowSelector) || node.querySelector?.(rowSelector) || node.matches?.('[data-cdx-model-key]') || node.querySelector?.('[data-cdx-model-key]'))))) schedule()
      })
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'disabled', 'data-cdx-model-key'] })
      const onStorage = event => { if (event.key === storageKey || event.key === null) { favorites = readFavorites(); schedule() } }
      window.addEventListener('storage', onStorage)
      document.addEventListener('keydown', onKeyDown, true)
      reconcile()
      return () => {
        stopped = true; observer.disconnect(); window.removeEventListener('storage', onStorage); css.remove()
        document.removeEventListener('keydown', onKeyDown, true)
        for (const [row, star] of stars) { row.removeAttribute('data-cdx-model-row'); star.remove() }
        for (const { section } of menus.values()) section.remove()
      }
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot }, ({ provider, model, placement }) => {
          const trigger = placement === 'trigger'
          const group = provider.name?.trim() || provider.id
          const label = trigger && group ? group + '/' + model.name : model.name
          const option = placement === 'option' ? { 'data-cdx-model-key': JSON.stringify([provider.id, model.id]), 'data-cdx-model-name': model.name, 'data-cdx-model-group': group } : null
          if (!model.badge) return option ? h('span', option, label) : label
          // A single slot replaces the whole label, so keep the native badge in each placement.
          const badge = h('span', { style: { flex: 'none' } }, h(Tag, { tone: model.badge.tone }, ctx.locale.resolveText(model.badge.text)))
          const name = h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, label)
          return h('span', { ...option, style: badgeLayout }, ...(trigger ? [badge, ' ', name] : [name, ' ', badge]))
        })), 'model-group-label: composer label')
        ctx.effect(() => installFavorites(ctx), 'model-group-label: model favorites')
      },
    }
  },
})
