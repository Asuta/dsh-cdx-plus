window.__ModuleLoader__.load({
  id: 'dsh-asuta-plugin-folders',
  factory(require) {
    const { createElement: h, useState, useEffect, useLayoutEffect, useRef } = require('react')
    const dragType = 'application/x-dsh-folder-package'
    const api = () => new URL('plugin-folders/api/layout', document.baseURI)
    async function layout(op) {
      const res = await fetch(api(), op ? { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(op) } : {cache:'no-store'})
      const result = await res.json()
      if (!res.ok) throw Error(result.error || 'load')
      return result
    }
    function Artwork({ pkg }) {
      const src = pkg.meta?.icon, [broken, fail] = useState(null)
      return src && src !== broken ? h('img', {src, alt:'', draggable:false, onError:()=>fail(src)}) : h('span', {'aria-hidden':true}, (pkg.title.replace(/^@[^/]+\//,'')[0] || '◇').toUpperCase())
    }
    function makePage(ctx, view, tr) {
      return function FolderPage({ openPackage }) {
        const [lib,setLib] = useState(null), [packages,setPackages] = useState(null), [error,err] = useState('')
        const [dir,setDir] = useState(view.dir), [query,search] = useState(view.query), [edit,setEdit] = useState(null), [name,rename] = useState('')
        const [busy,setBusy] = useState(false), [over,setOver] = useState(undefined)
        const list = useRef(null), restore = useRef(view.scroll), sequence = useRef(0), lock = useRef(false), alive = useRef(false)
        const reading = useRef(null), refreshPending = useRef(false)
        const [reload,refresh] = useState(0)
        async function read(keepSaveError = false) {
          if (!alive.current) return
          if (lock.current) { refreshPending.current = true; return }
          const seq = ++sequence.current
          reading.current = seq
          try {
            const [data,response] = await Promise.all([layout(), ctx.remote.pluginManager.listBundles()])
            if (!response.ok) throw Error('load')
            if (seq !== sequence.current || !alive.current || lock.current) return
            // listBundles returns installation-level packages. Never expand rows or dependencies.
            const cards = response.value.filter(p=>p.installed).map(p=>({...p,title:(p.meta?.title && ctx.locale.resolveText(p.meta.title)) || p.name}))
            setPackages(cards.sort((a,b)=>a.title.localeCompare(b.title))); setLib(data)
            if (!keepSaveError) err('')
          } catch {
            if (seq === sequence.current && alive.current) err(current => keepSaveError && current ? current : 'load')
          } finally { if (reading.current === seq) reading.current = null }
        }
        useEffect(()=>{
          const refreshList = () => { void read() }
          alive.current = true; refreshList()
          const off = ctx.remote.$on('plugin-manager/changed',refreshList), reset = ctx.on('connection/reset',refreshList)
          window.addEventListener('focus',refreshList)
          return ()=>{ alive.current=false; sequence.current++; off(); reset(); window.removeEventListener('focus',refreshList) }
        },[reload])
        useLayoutEffect(()=>{ if (list.current && lib && packages && restore.current !== null) { list.current.scrollTop=restore.current; restore.current=null } },[lib,packages])
        const folder = lib?.folders.find(f=>f.id===dir), term = query.trim().toLowerCase()
        function navigate(id) { setDir(id); view.dir=id; search(''); view.query=''; view.scroll=0; if(list.current) list.current.scrollTop=0; setEdit(null) }
        async function change(op) {
          if(lock.current) return
          // The save invalidates any in-flight read along with requests arriving during it.
          refreshPending.current ||= reading.current !== null
          lock.current=true; setBusy(true); sequence.current++; err('')
          try { const data = await layout(op); if(!alive.current) return; setLib(data); setEdit(null); if(op.type==='remove' && dir===op.id) navigate(null) }
          catch(e) { if(alive.current) err(e.message === 'duplicate' ? 'duplicate' : e.message === 'missing' ? 'missing' : 'save') }
          finally {
            lock.current = false
            const pending = refreshPending.current
            refreshPending.current = false
            if (alive.current) {
              setBusy(false)
              if (pending) void read(true)
            }
          }
        }
        function dropProps(id) { return { 'data-over': over===id ? 'yes':undefined, onDragOver:e=>{ if(e.dataTransfer.types.includes(dragType)) {e.preventDefault(); e.dataTransfer.dropEffect='move'; setOver(id)} }, onDragLeave:e=>{if(!e.currentTarget.contains(e.relatedTarget))setOver(undefined)}, onDrop:e=>{e.preventDefault(); setOver(undefined); const pkg=e.dataTransfer.getData(dragType); if(packages?.some(p=>p.name===pkg)) change({type:'move',pkg,id})} } }
        function editing(type, f) { err(''); rename(f?.name || ''); setEdit({type,id:f?.id}) }
        const button=(title,click,extra={})=>h('button',{type:'button',onClick:click,disabled:busy,...extra},title)
        const groupOf=p=>lib.folders.find(f=>f.id===lib.members[p.name]); const belongs=(p,id)=>(groupOf(p)?.id ?? null)===id
        function card(p) {
          const group = groupOf(p), status=p.error || p.availability==='missing' ? tr('异常','Needs attention') : p.enabled ? tr('已启用','Enabled') : tr('已停用','Disabled')
          return h('article',{key:p.name,className:'pf-card',draggable:!busy,'data-pkg':p.name,onDragStart:e=>{e.dataTransfer.setData(dragType,p.name);e.dataTransfer.effectAllowed='move'},onDragEnd:()=>setOver(undefined)},
            button(h('span',{className:'pf-cardbody'},h('span',{className:'pf-icon'},h(Artwork,{pkg:p})),h('span',{className:'pf-copy'},h('strong',null,p.title),h('small',null,p.name))),()=>{view.scroll=list.current?.scrollTop || 0;openPackage(p.name)},{className:'pf-open',title:p.name}),
            h('footer',null,h('small',null,h('i',{'data-ok':status===tr('已启用','Enabled')}),status),h('select',{'aria-label':tr('移动到','Move')+' · '+p.title,value:'',disabled:busy,onChange:e=>change({type:'move',pkg:p.name,id:e.target.value==='-root'?null:e.target.value})},h('option',{value:'',disabled:true},tr('移动到…','Move to…')),group && h('option',{value:'-root'},tr('未分组','Ungrouped')),lib.folders.filter(f=>f!==group).map(f=>h('option',{key:f.id,value:f.id},f.name)))),term && h('small',{className:'pf-location'},group?.name || tr('未分组','Ungrouped')))
        }
        function tile(f) { const members=packages.filter(p=>belongs(p,f.id));return h('article',{key:f.id,className:'pf-folder',...dropProps(f.id)},button(h('span',null,h('span',{className:'pf-cover'},members.slice(0,4).map(p=>h('span',{key:p.name},h(Artwork,{pkg:p})))),h('strong',null,f.name),h('small',null,members.length+' '+tr('个插件','plugins'))),()=>navigate(f.id),{className:'pf-tile'})) }
        const visible=lib && packages ? packages.filter(p=>term ? (p.title+' '+p.name).toLowerCase().includes(term) : belongs(p,folder?.id ?? null)) : []
        const title = tr('文件夹','Folders'), root=tr('未分组','Ungrouped')
        return h('section',{className:'pf-page',ref:list,onScroll:e=>{view.scroll=e.currentTarget.scrollTop}},h('header',null,h('div',null,h('div',{className:'pf-eyebrow'},tr('插件管理','PLUGIN LIBRARY')),h('h2',null,folder ? button(title,()=>navigate(null)) : title,folder && ' / '+folder.name)),button(tr('＋ 新建文件夹','＋ New folder'),()=>editing('create'),{disabled:busy || !lib})),
          h('div',{className:'pf-tools'},h('input',{type:'search',placeholder:tr('搜索所有文件夹中的插件…','Search plugins in all folders…'),'aria-label':tr('搜索插件','Search plugins'),value:query,onChange:e=>{search(e.target.value);view.query=e.target.value}}),folder && button(tr('重命名','Rename'),()=>editing('rename',folder)),folder && button(tr('删除文件夹','Remove folder'),()=>editing('remove',folder))),
          edit && h('form',{className:'pf-form',onSubmit:e=>{e.preventDefault(); change({...edit,name})}},edit.type==='remove' ? h('span',null,tr('删除此文件夹？其中的插件会移回未分组。','Remove this folder? Its plugins return to Ungrouped.')) : h('input',{autoFocus:true,required:true,maxLength:64,value:name,'aria-label':tr('文件夹名称','Folder name'),placeholder:tr('文件夹名称','Folder name'),onChange:e=>rename(e.target.value)}),h('button',{type:'submit',disabled:busy || (edit.type!=='remove'&&!name.trim())},edit.type==='remove'?tr('删除','Remove'):tr('保存','Save')),button(tr('取消','Cancel'),()=>setEdit(null))),
          error && h('div',{role:'alert'},({load:tr('无法读取插件或分组。','Could not load plugins or folders.'),duplicate:tr('已有同名文件夹。','Folder name already exists.'),missing:tr('文件夹已变更，请刷新。','Folder changed. Refresh to continue.'),save:tr('未保存，请重试。','Could not save. Please retry.')})[error],button(tr('刷新','Refresh'),()=>refresh(v=>v+1))),
          !lib || !packages ? (!error && h('p',null,tr('正在读取…','Loading…'))) : h('div',null,!folder && !term && h('div',{className:'pf-grid pf-tiles'},lib.folders.map(tile)),h('h3',null,term ? tr('搜索结果','Search results') : folder ? tr('插件','Plugins') : root,' · '+visible.length),h('div',{className:'pf-grid pf-packages',...(!term&&!folder?dropProps(null):{})},visible.map(card),!visible.length&&h('p',null,term?tr('没有匹配的插件。','No matching plugins.'):tr('这里还没有插件。','No plugins here yet.')))))
      }
    }
    return { inject:['slots','locale','remote','remote.pluginManager'], apply(ctx) {
      const tr=(zh,en)=>ctx.locale.getSnapshot().active.toLowerCase().startsWith('zh')?zh:en
      const view={dir:null,query:'',scroll:0}
      ctx.slots.inject('plugins.tab',()=>ctx.slots.register({name:'plugins.tab',id:'asuta-plugin-folders',order:100,label:()=>tr('文件夹','Folders')},makePage(ctx,view,tr)))
      ctx.effect(()=>{const style=document.createElement('style');style.dataset.plugin='dsh-asuta-plugin-folders';style.textContent=`.pf-page{--pf-line:var(--dsw-alias-border-l2,#81818a38);--pf-muted:var(--dsw-alias-label-secondary,#888891);--pf-ink:var(--dsw-alias-brand-primary,#8181d9);box-sizing:border-box;width:min(100%,1120px);margin:auto;padding:24px clamp(12px,3vw,40px) 48px;color:inherit;font:inherit;max-height:calc(100dvh - 100px);overflow:auto;scrollbar-gutter:stable}.pf-page *{box-sizing:border-box}.pf-page header,.pf-tools,.pf-form,.pf-card footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pf-page header,.pf-card footer{justify-content:space-between}.pf-page h2,.pf-page h3{margin:6px 0 12px}.pf-page h2{font-size:22px}.pf-page h3{font-size:14px}.pf-eyebrow,.pf-page small{color:var(--pf-muted);font-size:12px}.pf-page button,.pf-page input,.pf-page select{font:inherit;color:inherit;border:1px solid var(--pf-line);background:transparent;border-radius:8px;padding:6px 10px}.pf-page button,.pf-page select{cursor:pointer}.pf-page button:hover,.pf-page select:hover,.pf-page button:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#83839720)}.pf-page button:focus-visible,.pf-page select:focus-visible,.pf-page input:focus-visible{outline:2px solid var(--pf-ink)}.pf-tools{margin:10px 0 20px}.pf-tools input{width:min(360px,100%)}.pf-form{padding:12px;border:1px solid var(--pf-line);border-radius:10px;margin-bottom:14px}.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(208px,100%),1fr));gap:10px}.pf-tiles:not(:empty){margin:16px 0 24px}.pf-card,.pf-folder{min-width:0;border:1px solid var(--pf-line);border-radius:14px;background:color-mix(in srgb,currentColor 3%,transparent)}.pf-card{padding:10px}.pf-card:hover,.pf-folder:hover{border-color:color-mix(in srgb,var(--pf-ink) 65%,var(--pf-line))}.pf-page .pf-open,.pf-page .pf-tile{display:block;border:0;text-align:start;background:none;width:100%}.pf-tile>span{display:grid;gap:5px}.pf-page .pf-tile{padding:16px}.pf-cover{width:75px;height:44px;border-radius:3px 8px 8px 8px;background:color-mix(in srgb,var(--pf-ink) 27%,transparent);position:relative;margin:8px 0;display:grid;grid-template-columns:repeat(2,14px);grid-auto-rows:14px;align-content:center;padding-left:9px;gap:2px}.pf-cover:before{content:'';position:absolute;width:29px;height:6px;top:-5px;left:0;background:inherit;border-radius:5px 6px 0 0}.pf-cover>span,.pf-icon{display:grid;place-items:center;overflow:hidden}.pf-icon{width:34px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--pf-ink) 13%,transparent);flex:none}.pf-page img{width:80%;height:80%;object-fit:contain}.pf-cardbody{display:flex;gap:10px;align-items:center}.pf-copy{display:grid;gap:3px;min-width:0}.pf-page strong,.pf-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pf-card footer{border-top:1px solid var(--pf-line);margin:9px 2px 0;padding-top:8px}.pf-card select{max-width:55%;font-size:12px;padding:3px}.pf-card option{color:CanvasText;background:Canvas}.pf-card i{display:inline-block;width:7px;height:7px;background:var(--pf-muted);border-radius:50%;margin-right:5px}.pf-card i[data-ok=true]{background:#64ae87}.pf-page [data-over=yes]{outline:2px dashed var(--pf-ink);outline-offset:-2px}.pf-location{display:block;margin:5px}.pf-page [role=alert]{color:var(--dsw-alias-label-primary);padding:10px}.pf-page [role=alert] button{margin-inline-start:8px}`;document.head.append(style);return ()=>style.remove()},'plugin-folders: style')
    } }
  }
})
