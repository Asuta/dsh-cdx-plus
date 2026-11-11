window.__ModuleLoader__.load({
  id: 'dsh-asuta-history-edit',
  factory() {
    const ROW = '[data-chat-flow-kind="user"][data-chat-node-key]'
    const STYLE = [
      '.he-inline{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;font-size:16px;line-height:1}',
      '.he-action{border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#aaa);font:inherit;cursor:pointer;padding:3px 7px;-webkit-app-region:no-drag}',
      '.he-action:hover,.he-action:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#444);color:var(--dsw-alias-label-primary,#fff)}',
      '.he-action:disabled{opacity:.5;cursor:default}',
      '.he-editor{position:relative;display:flex;flex-direction:column;gap:8px;margin:4px 0 0 auto;width:min(100%,880px);border-radius:20px;background:var(--dsw-alias-interactive-bg-hover-solid,#303030);padding:14px 16px 12px;box-sizing:border-box;-webkit-app-region:no-drag}',
      '.he-editor textarea{box-sizing:border-box;display:block;width:100%;min-height:112px;max-height:360px;resize:vertical;border:0;background:transparent;color:var(--dsw-alias-label-primary,#fff);font:inherit;font-size:15px;line-height:1.55;outline:none;padding:2px 1px}',
      '.he-command-list{position:absolute;z-index:20;left:0;right:0;bottom:calc(100% + 8px);max-height:400px;overflow:auto;padding:6px;border:1px solid var(--dsw-alias-border-secondary,#444);border-radius:14px;background:var(--dsw-alias-interactive-bg-primary,#252525);box-shadow:0 8px 28px #0008}',
      '.he-command-section{min-height:23px;padding:5px 8px 2px;color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:16px}',
      '.he-command-option{display:flex;align-items:center;gap:8px;width:100%;min-height:34px;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#fff);text-align:left;font:inherit;font-size:13px;line-height:20px;cursor:pointer}',
      '.he-command-option[aria-selected="true"],.he-command-option:hover{background:var(--dsw-alias-interactive-bg-hover,#444)}',
      '.he-command-title{flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.he-command-name{flex:none;max-width:20%;overflow:hidden;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;text-overflow:ellipsis;white-space:nowrap}',
      '.he-command-description{flex:1;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;text-align:right;text-overflow:ellipsis;white-space:nowrap}',
      '.he-attachment-rail{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px}',
      '.he-attachment-item{position:relative;width:64px;height:64px}',
      '.he-attachment-item img{width:100%;height:100%;object-fit:cover;border-radius:8px;cursor:zoom-in}',
      '.he-original-image{display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--dsw-alias-interactive-bg-primary,#252525);color:var(--dsw-alias-label-secondary,#aaa);font-size:12px}',
      '.he-original-image[data-removed="true"]{opacity:.5}',
      '.he-original-image[data-removed="true"] img{filter:grayscale(1)}',
      '.he-attachment-remove{position:absolute;top:2px;right:2px;width:20px;height:20px;border:0;border-radius:50%;background:#222c;color:white;cursor:pointer}',
      '.he-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}',
      '.he-footer-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}',
      '.he-add-image{flex:none;width:36px;height:36px;padding:0;border-radius:50%;background:var(--dsw-alias-interactive-bg-hover,#414141);font-size:21px}',
      '.he-file-input{display:none}',
      '.he-lightbox{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(0,0,0,.82);cursor:zoom-out;-webkit-app-region:no-drag}',
      '.he-lightbox img{max-width:100%;max-height:100%;object-fit:contain;border-radius:10px;box-shadow:0 16px 60px rgba(0,0,0,.6);cursor:default}',
      '.he-lightbox-close{position:absolute;top:14px;right:16px;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:22px;line-height:36px;text-align:center;cursor:pointer}',
      '.he-lightbox-close:hover,.he-lightbox-close:focus-visible{background:rgba(255,255,255,.28)}',
      '.he-primary{border-radius:9px;background:var(--dsw-alias-state-business-primary,#4187d9);color:white;padding:7px 12px}',
      '.he-error{color:var(--dsw-alias-state-error-primary,#f66);margin:4px 0;white-space:pre-wrap}',
      '[data-history-edit-shadowed]{display:none!important}',
    ].join(String.fromCharCode(10))

    function message(ctx, sessionId, key, visibleSeqs) {
      const binding = ctx.sessions.binding(sessionId)
      const node = binding && ctx.uiConversation.binding(binding).target('chat').getSnapshot().nodes.get(key)
      const data = node?.data
      if (node?.kind !== 'user' || data?.source?.kind !== 'user' || !Number.isSafeInteger(data.seq)) return null
      if (visibleSeqs && !visibleSeqs.has(data.seq)) return null
      if (!Array.isArray(data.content) || !data.content.length) return null
      let text = ''
      let imageCount = 0
      for (const part of data.content) {
        if (part?.type === 'text' && typeof part.text === 'string') text += part.text
        else if (part?.type === 'image' && part.attachment !== undefined && part.attachment !== null) imageCount++
        else return null
      }
      if (!text.trim() && imageCount === 0) return null
      const messageId = data.id
      const rpcId = data.source.rpcId
      if (typeof messageId !== 'string' && typeof rpcId !== 'string') return null
      const intake = binding.eventSource.getSnapshot().entries
        .map(entry => entry.event)
        .find(event => event.seq < data.seq && event.type === 'agent/inbox/spliced' &&
          event.data?.target === 'next-turn' && event.data?.inserted?.length === 1 &&
          (event.data.inserted[0]?.id === messageId ||
            (typeof rpcId === 'string' && event.data.inserted[0]?.source?.rpcId === rpcId)))
      const images = data.content.filter(part => part.type === 'image').map(part => part.attachment)
      return intake && intake.seq > 0 ? { seq: data.seq, text, imageCount, images } : null
    }

    async function encodeImage(file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      }
      return { name: file.name, mediaType: file.type, data: btoa(binary) }
    }

    async function regenerate(sessionId, original, text, files, removeImageIndices) {
      const images = await Promise.all(files.map(encodeImage))
      const response = await fetch('/history-edit/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-history-edit': '1' },
        body: JSON.stringify({ sessionId, messageSeq: original.seq, text, images, removeImageIndices }),
      })
      let result
      try { result = await response.json() }
      catch { throw new Error('服务器返回了无效结果，请稍后重试。') }
      if (!response.ok || result?.ok !== true) throw new Error(result?.error?.message || '编辑并重新生成失败。')
      if (result.value?.sessionId !== sessionId || result.value?.queued !== true) {
        throw new Error('服务器未能确认同一对话中的新回复已排队。')
      }
    }

    return {
      inject: ['sessions', 'uiConversation', 'uiWorkspace', 'sidebarRight', 'commandUi', 'inputTriggers'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = 'dsh-asuta-history-edit'
          style.textContent = STYLE
          document.head.append(style)
          const actions = new Map()
          const drafts = new Map()
          let editor = null
          let lightbox = null
          let scheduled = false
          let disposed = false

          function draftKey(sessionId, seq) {
            return JSON.stringify([sessionId, seq])
          }

          function saveDraft(target) {
            drafts.set(target.key, {
              text: target.input.value,
              files: target.pendingImages.map(image => image.file),
              removedOriginalImages: [...target.removedOriginalImages],
            })
          }

          function closeCommandList(target = editor) {
            if (!target) return
            target.commandAbort?.abort()
            target.commandAbort = null
            target.candidates = []
            target.commandList.replaceChildren()
            target.commandList.hidden = true
          }

          function closeLightbox() {
            if (!lightbox) return
            const { overlay, onKey, opener } = lightbox
            lightbox = null
            document.removeEventListener('keydown', onKey, true)
            overlay.remove()
            if (opener?.isConnected) opener.focus()
          }

          function openLightbox(src, alt, opener) {
            if (!src) return
            closeLightbox()
            const overlay = document.createElement('div')
            overlay.className = 'he-lightbox'
            overlay.setAttribute('role', 'dialog')
            overlay.setAttribute('aria-modal', 'true')
            overlay.setAttribute('aria-label', alt ? '预览：' + alt : '图片预览')
            const image = document.createElement('img')
            image.src = src
            image.alt = alt || '图片预览'
            const close = document.createElement('button')
            close.type = 'button'
            close.className = 'he-lightbox-close'
            close.textContent = '×'
            close.setAttribute('aria-label', '关闭预览')
            close.addEventListener('click', () => closeLightbox())
            overlay.addEventListener('click', event => {
              if (event.target === overlay) closeLightbox()
            })
            overlay.append(image, close)
            const onKey = event => {
              if (event.key !== 'Escape') return
              event.preventDefault?.()
              closeLightbox()
            }
            document.addEventListener('keydown', onKey, true)
            document.body.append(overlay)
            lightbox = { overlay, onKey, opener }
            close.focus()
          }

          function closeEditor(discard = false) {
            if (!editor) return
            closeLightbox()
            const key = editor.key
            if (!discard) saveDraft(editor)
            closeCommandList(editor)
            for (const image of editor.pendingImages ?? []) URL.revokeObjectURL(image.url)
            editor.element.remove()
            editor = null
            if (discard) drafts.delete(key)
          }

          function scan() {
            scheduled = false
            if (disposed) return
            const sessionId = ctx.sidebarRight.mounted.getSnapshot()
            const running = sessionId && ctx.sessions.list.getSnapshot().byId[sessionId]?.running
            const binding = sessionId && ctx.sessions.binding(sessionId)
            const entries = binding?.eventSource.getSnapshot().entries ?? []
            const visibleSeqs = new Set()
            const surfaceNodes = []
            const visibleTurns = new Set()
            for (const entry of entries) {
              const event = entry.event
              if (event.surfaceOp === 'append') surfaceNodes.push(event.seq)
              else if (event.surfaceOp?.op === 'replace') {
                const start = surfaceNodes.indexOf(event.surfaceOp.startSeq)
                const end = surfaceNodes.indexOf(event.surfaceOp.endSeq)
                if (start >= 0 && end >= start) surfaceNodes.splice(start, end - start + 1, event.seq)
              }
            }
            for (const seq of surfaceNodes) visibleSeqs.add(seq)
            let turn
            for (const entry of entries) {
              const event = entry.event
              if (event.type === 'turn/start') turn = event.data?.turn
              if (event.type === 'user/message' && event.surfaceOp === 'append' && visibleSeqs.has(event.seq) && Number.isSafeInteger(turn)) visibleTurns.add(turn)
              if (event.type === 'turn/end' && event.data?.turn === turn) turn = undefined
            }
            const chatNodes = binding && ctx.uiConversation.binding(binding).target('chat').getSnapshot().nodes
            for (const row of document.querySelectorAll('[data-chat-node-key]')) {
              const node = chatNodes?.get(row.getAttribute('data-chat-node-key'))
              if (!node || entries.length === 0) {
                row.removeAttribute('data-history-edit-shadowed')
                continue
              }
              // The turn tail holds native copy/fork actions and uses the turn/end seq,
              // which is not a surface message seq. Keep it with its visible turn.
              const isTurnAggregate = node.kind === 'assistant-step' || node.kind === 'turn-process' || node.kind === 'turn-tail'
              const turnAttribute = row.getAttribute('data-chat-turn')
              const renderedTurn = Number.isSafeInteger(node.data?.turn)
                ? node.data.turn
                : typeof turnAttribute === 'string' && /^\d+$/.test(turnAttribute)
                  ? Number(turnAttribute)
                  : undefined
              if (isTurnAggregate && Number.isSafeInteger(renderedTurn)) {
                row.toggleAttribute('data-history-edit-shadowed', !visibleTurns.has(renderedTurn))
                continue
              }
              if (!Number.isSafeInteger(node.data?.seq)) {
                row.removeAttribute('data-history-edit-shadowed')
                continue
              }
              const visible = visibleSeqs.has(node.data.seq)
              row.toggleAttribute('data-history-edit-shadowed', !visible)
            }
            const visibleRows = sessionId ? new Set(document.querySelectorAll(ROW)) : new Set()
            if (editor && (editor.sessionId !== sessionId || !visibleRows.has(editor.row))) closeEditor()
            if (!editor && sessionId) {
              for (const row of visibleRows) {
                const key = row.getAttribute('data-chat-node-key')
                const original = message(ctx, sessionId, key, visibleSeqs)
                if (!original) continue
                const saved = drafts.get(draftKey(sessionId, original.seq))
                if (saved !== undefined) {
                  mountEditor(row, sessionId, key, original, saved)
                  break
                }
              }
            }
            const rows = sessionId && !running ? visibleRows : new Set()
            for (const [row, action] of actions) {
              const toolbar = row.querySelector('[data-slot="conversation.chat.node"] button[aria-label="复制"]')?.parentElement
              if (!rows.has(row) || !message(ctx, sessionId, row.getAttribute('data-chat-node-key'), visibleSeqs) || action.parentElement !== toolbar) {
                action.remove()
                actions.delete(row)
              }
            }
            if (!sessionId || running) return
            for (const row of rows) {
              if (actions.has(row)) continue
              const key = row.getAttribute('data-chat-node-key')
              if (!message(ctx, sessionId, key, visibleSeqs)) continue
              const toolbar = row.querySelector('[data-slot="conversation.chat.node"] button[aria-label="复制"]')?.parentElement
              if (!toolbar) continue
              const button = document.createElement('button')
              button.type = 'button'
              button.className = 'he-action he-inline'
              button.textContent = '✎'
              button.setAttribute('aria-label', '编辑消息')
              button.title = '编辑消息并重新生成'
              button.addEventListener('click', () => openEditor(row, sessionId, key))
              toolbar.append(button)
              actions.set(row, button)
            }
          }

          function schedule() {
            if (!scheduled && !disposed) {
              scheduled = true
              queueMicrotask(scan)
            }
          }

          function openEditor(row, sessionId, key) {
            if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId || ctx.sessions.list.getSnapshot().byId[sessionId]?.running) return
            const original = message(ctx, sessionId, key)
            if (!original) return
            closeEditor()
            mountEditor(row, sessionId, key, original, drafts.get(draftKey(sessionId, original.seq)))
          }

          function slashMatch(input) {
            const caret = Number.isSafeInteger(input.selectionStart) ? input.selectionStart : input.value.length
            const prefix = input.value.slice(0, caret)
            const match = /(?:^|\s)\/([^\s/]*)$/u.exec(prefix)
            if (!match) return null
            const start = match.index + match[0].lastIndexOf('/')
            return {
              start,
              end: caret,
              query: match[1],
              position: input.value.slice(0, start).trim() === '' ? 'leading' : 'inline',
            }
          }

          function actionRegistration(name) {
            const live = ctx.commandUi?.live
            const entry = live?.contributions?.get(name) ?? live?.decorations?.get(name)
            return entry ?? null
          }

          function sourceTitle(name) {
            if (name === 'command') return '指令'
            if (name === 'skill') return '技能'
            return name
          }

          function renderCandidates(target, groups) {
            target.commandList.replaceChildren()
            target.candidates = []
            target.optionElements = []
            for (const group of groups) {
              if (!group.items.length) continue
              if (group.source.showGroupTitle !== false && !group.items.some(candidate => candidate.section !== undefined)) {
                const heading = document.createElement('div')
                heading.className = 'he-command-section'
                heading.textContent = sourceTitle(group.source.name)
                target.commandList.append(heading)
              }
              let section = null
              for (const candidate of group.items) {
                if (candidate.section !== undefined && candidate.section !== section) {
                  section = candidate.section
                  const heading = document.createElement('div')
                  heading.className = 'he-command-section'
                  heading.textContent = section
                  target.commandList.append(heading)
                }
                const option = document.createElement('button')
                option.type = 'button'
                option.className = 'he-command-option'
                option.setAttribute('role', 'option')
                option.setAttribute('aria-selected', 'false')
                const title = document.createElement('span')
                title.className = 'he-command-title'
                title.textContent = candidate.label || candidate.name
                option.append(title)
                if (candidate.label && candidate.name && candidate.label.toLowerCase() !== candidate.name.toLowerCase()) {
                  const name = document.createElement('span')
                  name.className = 'he-command-name'
                  name.textContent = candidate.name
                  option.append(name)
                }
                const description = document.createElement('span')
                description.className = 'he-command-description'
                description.textContent = candidate.description || ''
                if (description.textContent) option.append(description)
                const item = { candidate, source: group.source }
                option.addEventListener('mousedown', event => event.preventDefault())
                option.addEventListener('click', () => { void selectCandidate(target, item) })
                target.commandList.append(option)
                target.candidates.push(item)
                target.optionElements.push(option)
              }
            }
            target.selectedCandidate = target.candidates.length ? 0 : -1
            if (!target.candidates.length) {
              target.commandList.hidden = true
              return
            }
            target.commandList.hidden = false
            target.optionElements[0].setAttribute('aria-selected', 'true')
          }

          async function refreshCandidates(target) {
            const match = slashMatch(target.input)
            closeCommandList(target)
            const inputTriggers = ctx.inputTriggers
            const listed = ctx.sessions.list.getSnapshot().byId[target.sessionId]
            const session = listed && { ...listed, sessionId: target.sessionId }
            if (!match || !session) {
              closeCommandList(target)
              return
            }
            const controller = new AbortController()
            target.commandAbort = controller
            const request = ++target.commandRequest
            try {
              const sources = inputTriggers?.live?.sources
                ?.filter(source => source.trigger === '/')
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) ?? []
              const groups = sources.length
                ? await Promise.all(sources.map(async source => {
                    try {
                      const items = await source.candidates({ sessionId: target.sessionId }, {
                        query: match.query,
                        quoted: false,
                        position: match.position,
                        drilled: false,
                        signal: controller.signal,
                      })
                      return { source, items: Array.isArray(items) ? items : [] }
                    } catch (reason) {
                      if (!controller.signal.aborted) console.warn('history-edit: slash source failed', source.name, reason)
                      return { source, items: [] }
                    }
                  }))
                : typeof ctx.commandUi?.candidates === 'function'
                  ? [{ source: { name: 'command' }, items: await ctx.commandUi.candidates(session, {
                      query: match.query,
                      position: match.position,
                      signal: controller.signal,
                    }) }]
                  : []
              if (controller.signal.aborted || editor !== target || request !== target.commandRequest) return
              const current = slashMatch(target.input)
              if (!current || current.start !== match.start || current.end !== match.end || current.query !== match.query || current.position !== match.position) return
              target.slash = match
              renderCandidates(target, groups)
            } catch (reason) {
              if (controller.signal.aborted || editor !== target || request !== target.commandRequest) return
              closeCommandList(target)
              target.error.textContent = reason instanceof Error ? reason.message : String(reason)
            }
          }

          function replaceSlashToken(target, replacement) {
            const { start, end } = target.slash
            let remainder = target.input.value.slice(end)
            if (/^[ \t]/u.test(remainder)) remainder = remainder.slice(1)
            target.input.value = target.input.value.slice(0, start) + replacement + remainder
            const caret = start + replacement.length
            target.input.setSelectionRange(caret, caret)
            saveDraft(target)
          }

          async function selectCandidate(target, item) {
            if (editor !== target || target.commandRunning) return
            const { candidate, source } = item
            const entry = source.name === 'command' ? actionRegistration(candidate.name) : null
            const current = slashMatch(target.input)
            if (!target.slash || !target.candidates.includes(item) || !current ||
              current.start !== target.slash.start || current.end !== target.slash.end ||
              current.query !== target.slash.query || current.position !== target.slash.position ||
              ctx.sidebarRight.mounted.getSnapshot() !== target.sessionId) return
            const listed = ctx.sessions.list.getSnapshot().byId[target.sessionId]
            if (!listed) return
            const actionSession = { ...listed, sessionId: target.sessionId }
            if (entry) {
              try {
                if (!entry.available(actionSession)) return
              } catch (reason) {
                target.error.textContent = reason instanceof Error ? reason.message : String(reason)
                return
              }
              if (entry.ui?.kind !== 'action') {
                target.error.textContent = '此命令需要交互面板，请从底部原生输入栏使用。'
                return
              }
            }
            closeCommandList(target)
            target.error.textContent = ''
            target.commandRunning = true
            try {
              if (source.name === 'command' && entry) {
                await entry.ui.run(actionSession)
                replaceSlashToken(target, '')
              } else if (source.name === 'command' && !candidate.hint && typeof ctx.commandUi?.execute === 'function') {
                const outcome = await ctx.commandUi.execute(actionSession, '/' + candidate.name)
                if (outcome?.kind === 'error') throw new Error(outcome.text || '命令执行失败。')
                replaceSlashToken(target, '')
              } else if (source.name === 'command') {
                replaceSlashToken(target, '/' + candidate.name + ' ')
                target.error.textContent = '该命令需要参数或交互，请在底部原生输入栏中使用。'
              } else {
                const outcome = await source.onPick?.({
                  candidate,
                  session: { sessionId: target.sessionId },
                  position: target.slash.position,
                  via: 'menu',
                  action: 'pick',
                  span: { start: target.slash.start, end: target.slash.end, draftRev: 0 },
                })
                if (typeof outcome === 'string' && outcome === 'handled') replaceSlashToken(target, '')
                else if (typeof outcome?.text === 'string') replaceSlashToken(target, outcome.text)
                else if (outcome?.claim?.token) replaceSlashToken(target, outcome.claim.token)
                else throw new Error('此候选项无法在历史消息编辑器中使用。')
              }
              if (editor === target) target.input.focus()
            } catch (reason) {
              if (editor === target) target.error.textContent = reason instanceof Error ? reason.message : String(reason)
            } finally {
              target.commandRunning = false
              if (editor === target) saveDraft(target)
            }
          }

          function mountEditor(row, sessionId, key, original, saved) {
            const initialDraft = saved ?? { text: original.text, files: [], removedOriginalImages: [] }
            const element = document.createElement('div')
            element.className = 'he-editor'
            const input = document.createElement('textarea')
            input.value = initialDraft.text
            input.setAttribute('aria-label', '编辑历史消息')
            if (original.imageCount > 0) input.placeholder = '纯图片消息可留空'
            const attachmentRail = document.createElement('div')
            attachmentRail.className = 'he-attachment-rail'
            const fileInput = document.createElement('input')
            fileInput.type = 'file'
            fileInput.accept = 'image/*'
            fileInput.multiple = true
            fileInput.className = 'he-file-input'
            const pendingImages = initialDraft.files.map(file => ({ file, url: URL.createObjectURL(file) }))
            const removedOriginalImages = new Set(initialDraft.removedOriginalImages)
            const originalPreviewUrls = original.images.map(attachment => ctx.uiConversation.peekImageUrl(sessionId, attachment) ?? null)
            const failedOriginalPreviews = new Set()
            function renderAttachments() {
              attachmentRail.replaceChildren()
              for (const [index] of original.images.entries()) {
                const removed = removedOriginalImages.has(index)
                const item = document.createElement('div')
                item.className = 'he-attachment-item he-original-image'
                if (removed) item.setAttribute('data-removed', 'true')
                const src = originalPreviewUrls[index]
                let preview
                if (src && !failedOriginalPreviews.has(index)) {
                  preview = document.createElement('img')
                  preview.src = src
                  preview.alt = '原图 ' + (index + 1)
                  preview.tabIndex = 0
                  preview.setAttribute('role', 'button')
                  preview.setAttribute('aria-label', '放大查看原图 ' + (index + 1))
                  const openPreview = () => openLightbox(preview.src, '原图 ' + (index + 1), preview)
                  preview.addEventListener('click', openPreview)
                  preview.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    openPreview()
                  })
                  preview.addEventListener('error', () => {
                    if (editor?.element !== element || originalPreviewUrls[index] !== src) return
                    failedOriginalPreviews.add(index)
                    renderAttachments()
                  })
                } else {
                  preview = document.createElement('span')
                  preview.textContent = failedOriginalPreviews.has(index) ? '预览失败' : '加载中…'
                  preview.title = '原图 ' + (index + 1)
                }
                const toggle = document.createElement('button')
                toggle.type = 'button'
                toggle.className = 'he-attachment-remove'
                toggle.textContent = removed ? '↶' : '×'
                toggle.setAttribute('aria-label', removed ? '恢复原图 ' + (index + 1) : '移除原图 ' + (index + 1))
                toggle.title = removed ? '恢复原图' : '移除原图'
                toggle.addEventListener('click', () => {
                  if (removed) removedOriginalImages.delete(index)
                  else removedOriginalImages.add(index)
                  renderAttachments()
                })
                item.append(preview, toggle)
                attachmentRail.append(item)
              }
              for (const image of pendingImages) {
                const item = document.createElement('div')
                item.className = 'he-attachment-item'
                const preview = document.createElement('img')
                preview.src = image.url
                preview.alt = image.file.name || '新增图片'
                preview.tabIndex = 0
                preview.setAttribute('role', 'button')
                preview.setAttribute('aria-label', '放大查看 ' + preview.alt)
                const openPreview = () => openLightbox(preview.src, preview.alt, preview)
                preview.addEventListener('click', openPreview)
                preview.addEventListener('keydown', event => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  openPreview()
                })
                const remove = document.createElement('button')
                remove.type = 'button'
                remove.className = 'he-attachment-remove'
                remove.textContent = '×'
                remove.setAttribute('aria-label', '移除 ' + (image.file.name || '新增图片'))
                remove.addEventListener('click', () => {
                  const index = pendingImages.indexOf(image)
                  if (index >= 0) pendingImages.splice(index, 1)
                  URL.revokeObjectURL(image.url)
                  renderAttachments()
                })
                item.append(preview, remove)
                attachmentRail.append(item)
              }
              attachmentRail.hidden = original.images.length === 0 && pendingImages.length === 0
            }
            function addImages(files) {
              for (const file of files) {
                if (!file.type?.startsWith('image/')) {
                  error.textContent = '只能添加图片文件。'
                  continue
                }
                if (original.imageCount - removedOriginalImages.size + pendingImages.length >= 12) {
                  error.textContent = '单条消息最多包含 12 张图片。'
                  break
                }
                pendingImages.push({ file, url: URL.createObjectURL(file) })
              }
              renderAttachments()
            }
            fileInput.addEventListener('change', () => {
              addImages(fileInput.files ?? [])
              fileInput.value = ''
            })
            const commandList = document.createElement('div')
            commandList.className = 'he-command-list'
            commandList.setAttribute('role', 'listbox')
            commandList.setAttribute('aria-label', '斜杠命令')
            commandList.hidden = true
            const error = document.createElement('div')
            error.className = 'he-error'
            error.setAttribute('role', 'alert')
            const footer = document.createElement('div')
            footer.className = 'he-footer'
            const attach = document.createElement('button')
            attach.type = 'button'
            attach.className = 'he-action he-inline he-add-image'
            attach.textContent = '+'
            attach.setAttribute('aria-label', '添加图片')
            attach.title = '添加图片'
            attach.addEventListener('click', () => fileInput.click())
            const footerActions = document.createElement('div')
            footerActions.className = 'he-footer-actions'
            const cancel = document.createElement('button')
            cancel.type = 'button'
            cancel.className = 'he-action'
            cancel.textContent = '取消'
            cancel.addEventListener('click', () => closeEditor(true))
            const submit = document.createElement('button')
            submit.type = 'button'
            submit.className = 'he-action he-primary'
            submit.textContent = '重新生成'
            footerActions.append(cancel, submit)
            footer.append(attach, footerActions, fileInput)
            element.append(input, attachmentRail, commandList, error, footer)
            row.append(element)
            editor = {
              row, element, input, commandList, error,
              sessionId,
              key: draftKey(sessionId, original.seq),
              candidates: [],
              pendingImages,
              removedOriginalImages,
              selectedCandidate: -1,
              commandRequest: 0,
              commandRunning: false,
            }
            renderAttachments()
            for (const [index, attachment] of original.images.entries()) {
              Promise.resolve().then(() => ctx.uiConversation.imageUrl(sessionId, attachment)).then(url => {
                if (editor?.element !== element) return
                originalPreviewUrls[index] = url
                failedOriginalPreviews.delete(index)
                renderAttachments()
              }, () => {
                if (editor?.element !== element) return
                failedOriginalPreviews.add(index)
                renderAttachments()
              })
            }
            const current = editor
            input.addEventListener('input', () => {
              saveDraft(current)
              error.textContent = ''
              void refreshCandidates(current)
            })
            input.addEventListener('click', () => { void refreshCandidates(current) })
            input.addEventListener('paste', event => {
              const files = [...(event.clipboardData?.items ?? [])]
                .map(item => item.kind === 'file' ? item.getAsFile() : null)
                .filter(Boolean)
              if (files.length) {
                event.preventDefault()
                addImages(files)
              }
            })
            element.addEventListener('dragover', event => event.preventDefault())
            element.addEventListener('drop', event => {
              event.preventDefault()
              addImages([...event.dataTransfer.files])
            })
            input.addEventListener('keyup', event => {
              if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) void refreshCandidates(current)
            })
            input.addEventListener('keydown', event => {
              if (event.isComposing || event.keyCode === 229) return
              if (event.key === 'Escape' && !commandList.hidden) {
                event.preventDefault()
                closeCommandList(current)
                return
              }
              if (commandList.hidden || current.candidates.length === 0) return
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const direction = event.key === 'ArrowDown' ? 1 : -1
                current.selectedCandidate = (current.selectedCandidate + direction + current.candidates.length) % current.candidates.length
                for (const [index, option] of current.optionElements.entries()) option.setAttribute('aria-selected', String(index === current.selectedCandidate))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const candidate = current.candidates[current.selectedCandidate]
                const listed = ctx.sessions.list.getSnapshot().byId[sessionId]
                const session = listed && { ...listed, sessionId }
                if (candidate && session) void selectCandidate(current, candidate, session)
              }
            })
            submit.addEventListener('click', async () => {
              if (submit.disabled) return
              submit.disabled = cancel.disabled = input.disabled = true
              error.textContent = ''
              try {
                await regenerate(
                  sessionId,
                  original,
                  input.value,
                  pendingImages.map(image => image.file),
                  [...removedOriginalImages].sort((a, b) => a - b),
                )
                closeEditor(true)
              } catch (reason) {
                if (editor?.element === element) {
                  error.textContent = reason instanceof Error ? reason.message : String(reason)
                  submit.disabled = cancel.disabled = input.disabled = false
                  saveDraft(current)
                }
              }
            })
            input.focus()
            input.setSelectionRange(input.value.length, input.value.length)
          }

          const observer = new MutationObserver(schedule)
          observer.observe(document.body, { subtree: true, childList: true })
          const unsubMounted = ctx.sidebarRight.mounted.subscribe(schedule)
          const unsubSessions = ctx.sessions.list.subscribe(schedule)
          schedule()
          return () => {
            disposed = true
            observer.disconnect()
            unsubMounted()
            unsubSessions()
            closeEditor(true)
            drafts.clear()
            for (const action of actions.values()) action.remove()
            actions.clear()
            document.querySelectorAll('[data-history-edit-shadowed]').forEach(row => row.removeAttribute('data-history-edit-shadowed'))
            style.remove()
          }
        }, 'history-edit: message editor')
      },
    }
  },
})
