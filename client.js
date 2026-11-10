/**
 * dsh-archive-manager — Client half.
 *
 * One Settings page ("Archived chats") for batch management: the page is
 * reachable from the sidebar account menu through Settings, which is the only
 * additive seat this shell offers for feature-owned management UI. Every
 * operation is a Host call: this half holds no archive state of its own, and
 * the Host route is the same authenticated carrier the rest of the app uses.
 */
window.__ModuleLoader__.load({
  id: 'dsh-archive-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-archive-manager'
    const ROUTE = 'api/archive-manager'
    const SLOT = 'settings.section'

    /** English is the fallback dictionary; Simplified Chinese mirrors it. */
    const en = {
      badge: 'Archived chats',
      title: 'Archived chats',
      subtitle: '{count} archived',
      subtitleEmpty: 'Nothing archived',
      search: 'Search title or folder',
      selectAll: 'Select all',
      selected: '{count} selected',
      restore: 'Restore',
      delete: 'Delete',
      refresh: 'Refresh',
      loading: 'Reading archived chats…',
      empty: 'No archived chats.',
      noMatch: 'Nothing matches this search.',
      unavailable: 'The archived chat list is unavailable.',
      failed: 'Operation failed',
      restored: 'Restored {count} chat(s).',
      deleted: 'Deleted {count} chat(s).',
      partial: '{done} done, {failed} failed.',
      unnamed: 'Untitled chat',
      running: 'Running',
      missingLog: 'Log missing',
      updated: 'Updated {time}',
      confirmTitle: 'Delete {count} archived chat(s)?',
      confirmBody:
        'They leave the app and the archive list. Session logs move to the trash folder unless you choose permanent deletion.',
      permanent: 'Delete log files permanently (cannot be undone)',
      trashHint: 'Trash folder: {path}',
      cancel: 'Cancel',
      selectHint: 'Select at least one chat first.',
      reasonNotArchived: 'not archived',
      reasonLive: 'still live',
      reasonMissingLog: 'log file missing',
      reasonFailed: 'failed',
    }

    const zh = {
      badge: '归档管理',
      title: '归档会话管理',
      subtitle: '共 {count} 个已归档会话',
      subtitleEmpty: '暂无归档会话',
      search: '搜索标题或目录',
      selectAll: '全选',
      selected: '已选 {count} 个',
      restore: '恢复',
      delete: '删除',
      refresh: '刷新',
      loading: '正在读取归档会话…',
      empty: '没有已归档的会话。',
      noMatch: '没有匹配的会话。',
      unavailable: '无法读取归档会话列表。',
      failed: '操作失败',
      restored: '已恢复 {count} 个会话。',
      deleted: '已删除 {count} 个会话。',
      partial: '成功 {done} 个，失败 {failed} 个。',
      unnamed: '未命名会话',
      running: '运行中',
      missingLog: '日志缺失',
      updated: '更新于 {time}',
      confirmTitle: '确认删除 {count} 个已归档会话？',
      confirmBody: '会话将从应用内和归档列表中移除；日志文件会移到回收目录，除非选择彻底删除。',
      permanent: '彻底删除日志文件（不可恢复）',
      trashHint: '回收目录：{path}',
      cancel: '取消',
      selectHint: '请先选择会话。',
      reasonNotArchived: '未归档',
      reasonLive: '仍在运行',
      reasonMissingLog: '日志文件缺失',
      reasonFailed: '失败',
    }

    const CSS = `
      .amgr-section{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;
        color:var(--dsw-alias-label-primary);font-size:14px}
      .amgr-icon{flex:none;display:block}

      .amgr-head{display:flex;align-items:flex-start;gap:12px}
      .amgr-headText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
      .amgr-headTitle{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:500;line-height:22px;margin:0}
      .amgr-headSub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}

      .amgr-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 0 10px;
        border-bottom:0.5px solid var(--dsw-alias-border-l2)}
      .amgr-search{flex:1 1 200px;min-width:0;box-sizing:border-box;height:32px;padding:0 10px;
        border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-base);
        color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
      .amgr-search:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}
      .amgr-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;
        color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
      .amgr-check input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
      .amgr-selected{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
      .amgr-spacer{flex:1}

      .amgr-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;
        border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:0 0;color:var(--dsw-alias-label-primary);
        font:inherit;font-size:13px;line-height:18px;cursor:pointer;white-space:nowrap}
      .amgr-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .amgr-button:disabled{opacity:.45;cursor:default}
      .amgr-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .amgr-button[data-variant=primary]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);
        color:var(--dsw-alias-label-primary-foreground);font-weight:500}
      .amgr-button[data-variant=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
      .amgr-button[data-variant=danger]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-border-l3)}
      .amgr-button[data-variant=danger]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .amgr-button[data-variant=quiet]{border-color:transparent;color:var(--dsw-alias-label-secondary)}

      .amgr-status{padding:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .amgr-status[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
      .amgr-status[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}
      .amgr-status[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}

      .amgr-list{min-height:0;max-height:min(56vh,560px);overflow-y:auto;padding:4px;margin:0;list-style:none;
        border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px}
      .amgr-row{display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:10px}
      .amgr-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .amgr-row[data-selected=true]{background:var(--dsw-alias-bg-layer-2)}
      .amgr-rowCheck{flex:none;width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
      .amgr-rowMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
      .amgr-rowTitle{font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .amgr-rowTitle[data-empty=true]{color:var(--dsw-alias-label-tertiary);font-style:italic}
      .amgr-rowMeta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:11px;line-height:16px;
        color:var(--dsw-alias-label-tertiary)}
      .amgr-rowMeta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:32ch}
      .amgr-tag{flex:none;padding:0 6px;border-radius:999px;font-size:10px;line-height:16px;
        color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
      .amgr-tag[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
      .amgr-tag[data-tone=busy]{color:var(--dsw-alias-state-business-primary)}
      .amgr-rowActions{flex:none;display:flex;align-items:center;gap:4px}
      .amgr-empty{padding:36px 16px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}

      .amgr-confirm{margin:0;padding:12px;border:0.5px solid var(--dsw-alias-border-l3);
        border-radius:10px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:8px}
      .amgr-confirmTitle{font-size:13px;line-height:20px;font-weight:500}
      .amgr-confirmBody{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .amgr-confirmFoot{display:flex;align-items:center;gap:8px}
      .amgr-foot{display:flex;align-items:center;gap:8px;padding:10px 0 0;
        border-top:0.5px solid var(--dsw-alias-border-l2);font-size:11px;line-height:16px;
        color:var(--dsw-alias-label-tertiary)}
      .amgr-footPath{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
    `

    function routeUrl() {
      const base = typeof document === 'undefined' ? undefined : document.baseURI
      if (typeof base !== 'string' || base.length === 0) return `/${ROUTE}`
      try {
        const url = new URL(base)
        if (!url.pathname.endsWith('/')) url.pathname += '/'
        return new URL(ROUTE, url.href).href
      } catch {
        return `/${ROUTE}`
      }
    }

    async function callHost(body) {
      let response
      try {
        response = await fetch(routeUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (error) {
        return { ok: false, message: String(error?.message ?? error) }
      }
      try {
        return await response.json()
      } catch {
        return { ok: false, message: `HTTP ${response.status}` }
      }
    }

    /** Filled by `apply`: the locale service plus the bound translator. */
    let service = null

    function interpolate(template, params) {
      if (params === undefined) return template
      return String(template).replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      )
    }

    function formatBytes(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
      const units = ['B', 'KB', 'MB', 'GB']
      let size = value
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
      }
      const rounded = size >= 10 || unit === 0 ? Math.round(size) : Math.round(size * 10) / 10
      return `${rounded} ${units[unit]}`
    }

    function formatTime(value, localeTag) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
      try {
        return new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
      } catch {
        return new Date(value).toISOString()
      }
    }

    function basename(value) {
      if (typeof value !== 'string' || value.length === 0) return ''
      const parts = value.split(/[\\/]+/).filter((part) => part.length > 0)
      return parts.length === 0 ? value : parts[parts.length - 1]
    }

    function IconArchive({ size = 16 }) {
      return h(
        'svg',
        {
          className: 'amgr-icon',
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('rect', { x: 1.9, y: 2.6, width: 12.2, height: 3.1, rx: 1 }),
        h('path', { d: 'M3.1 5.7v7.1a1 1 0 0 0 1 1h7.8a1 1 0 0 0 1-1V5.7' }),
        h('path', { d: 'M6.4 8.6h3.2' }),
      )
    }

    function Button({ variant, children, ...rest }) {
      return h('button', { type: 'button', className: 'amgr-button', 'data-variant': variant, ...rest }, children)
    }

    /** Re-render on locale switches so `t` resolves against the active language. */
    function useLocaleRevision() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const locale = service?.locale
        if (locale === undefined || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => bump((value) => value + 1))
      }, [])
    }

    function Section() {
      const t = service.t
      useLocaleRevision()
      const [rows, setRows] = React.useState([])
      const [status, setStatus] = React.useState('loading')
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [selected, setSelected] = React.useState(() => new Set())
      const [busy, setBusy] = React.useState('')
      const [pending, setPending] = React.useState(null)
      const [permanent, setPermanent] = React.useState(false)
      const [trashRoot, setTrashRoot] = React.useState('')
      const searchRef = React.useRef(null)

      const localeTag = React.useMemo(() => {
        try {
          return service?.locale?.getLocale?.()?.active ?? navigator.language
        } catch {
          return 'en'
        }
      }, [])

      const applySnapshot = React.useCallback((answer) => {
        const sessions = Array.isArray(answer?.sessions) ? answer.sessions : []
        setRows(sessions)
        if (typeof answer?.trashRoot === 'string') setTrashRoot(answer.trashRoot)
      }, [])

      const load = React.useCallback(async () => {
        setStatus('loading')
        setError('')
        const answer = await callHost({ action: 'list' })
        if (answer?.ok) {
          applySnapshot(answer)
          setStatus('ready')
        } else {
          setError(answer?.message ?? t('unavailable'))
          setStatus('error')
        }
      }, [applySnapshot, t])

      React.useEffect(() => {
        load().catch(() => void 0)
      }, [load])

      React.useEffect(() => {
        if (status === 'ready') searchRef.current?.focus()
      }, [status])

      const filtered = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (needle.length === 0) return rows
        return rows.filter((row) => {
          const title = String(row.title ?? '').toLowerCase()
          const cwd = String(row.cwd ?? '').toLowerCase()
          return title.includes(needle) || cwd.includes(needle)
        })
      }, [query, rows])

      const allSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.id))

      const toggle = (id) => {
        setSelected((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const toggleAll = () => {
        setSelected((current) => {
          if (allSelected) {
            const next = new Set(current)
            for (const row of filtered) next.delete(row.id)
            return next
          }
          return new Set([...current, ...filtered.map((row) => row.id)])
        })
      }

      const run = async (action, ids, extra) => {
        if (ids.length === 0) {
          setNotice({ tone: 'warn', text: t('selectHint') })
          return
        }
        setBusy(action)
        setNotice(null)
        setError('')
        const answer = await callHost({ action, ids, ...extra })
        setBusy('')
        if (!answer?.ok) {
          setNotice({ tone: 'error', text: `${t('failed')}: ${answer?.message ?? ''}`.trim() })
          return
        }
        applySnapshot(answer)
        setSelected(new Set())
        const results = Array.isArray(answer.results) ? answer.results : []
        const failed = results.filter((result) => !result?.ok)
        if (failed.length > 0) {
          const reasons = [...new Set(failed.map((result) => reasonText(t, result?.reason)))]
          setNotice({
            tone: 'warn',
            text: `${interpolate(t('partial'), { done: results.length - failed.length, failed: failed.length })} ${reasons.join(' · ')}`,
          })
        } else if (action === 'restore') {
          setNotice({ tone: 'ok', text: interpolate(t('restored'), { count: ids.length }) })
        } else {
          setNotice({ tone: 'ok', text: interpolate(t('deleted'), { count: ids.length }) })
        }
      }

      const requestDelete = () => {
        if (selected.size === 0) {
          setNotice({ tone: 'warn', text: t('selectHint') })
          return
        }
        setPermanent(false)
        setPending([...selected])
      }

      const confirmDelete = async () => {
        const ids = pending ?? []
        setPending(null)
        await run('delete', ids, { permanent })
      }

      const subtitle = rows.length === 0 ? t('subtitleEmpty') : interpolate(t('subtitle'), { count: rows.length })

      return h(
        'section',
        {
          className: 'amgr-section',
          'aria-label': t('title'),
          'data-plugin': NS,
        },
        h(
          'header',
          { className: 'amgr-head' },
          h(
            'div',
            { className: 'amgr-headText' },
            h('h2', { className: 'amgr-headTitle' }, h(IconArchive, { size: 15 }), t('title')),
            h('span', { className: 'amgr-headSub' }, subtitle),
          ),
        ),

        h(
          'div',
          { className: 'amgr-toolbar' },
          h('input', {
            ref: searchRef,
            className: 'amgr-search',
            type: 'search',
            value: query,
            placeholder: t('search'),
            'aria-label': t('search'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h(
            'label',
            { className: 'amgr-check' },
            h('input', {
              type: 'checkbox',
              checked: allSelected,
              disabled: filtered.length === 0,
              onChange: toggleAll,
            }),
            h('span', {}, t('selectAll')),
          ),
          h('span', { className: 'amgr-selected' }, interpolate(t('selected'), { count: selected.size })),
          h('span', { className: 'amgr-spacer' }),
          h(
            Button,
            {
              variant: 'primary',
              disabled: busy !== '' || selected.size === 0,
              onClick: () => {
                run('restore', [...selected]).catch(() => void 0)
              },
            },
            t('restore'),
          ),
          h(
            Button,
            {
              variant: 'danger',
              disabled: busy !== '' || selected.size === 0,
              onClick: requestDelete,
            },
            t('delete'),
          ),
        ),

        notice !== null
          ? h('div', { className: 'amgr-status', 'data-tone': notice.tone, role: 'status' }, notice.text)
          : null,
        status === 'error' ? h('div', { className: 'amgr-status', 'data-tone': 'error', role: 'alert' }, error) : null,

        h(
          'ul',
          { className: 'amgr-list' },
          status === 'loading'
            ? h('li', { className: 'amgr-empty', role: 'status' }, t('loading'))
            : null,
          status === 'ready' && rows.length === 0 ? h('li', { className: 'amgr-empty' }, t('empty')) : null,
          status === 'ready' && rows.length > 0 && filtered.length === 0
            ? h('li', { className: 'amgr-empty' }, t('noMatch'))
            : null,
          ...filtered.map((row) => {
            const meta = []
            const folder = basename(row.cwd)
            if (folder.length > 0) meta.push(h('span', { key: 'folder', title: row.cwd }, folder))
            const time = formatTime(row.updatedAt, localeTag)
            if (time.length > 0) meta.push(h('span', { key: 'time' }, interpolate(t('updated'), { time })))
            const size = formatBytes(row.sizeBytes)
            if (size.length > 0) meta.push(h('span', { key: 'size' }, size))
            if (row.live === true) meta.push(h('span', { key: 'live', className: 'amgr-tag', 'data-tone': 'busy' }, t('running')))
            if (row.logPresent === false) {
              meta.push(h('span', { key: 'log', className: 'amgr-tag', 'data-tone': 'warn' }, t('missingLog')))
            }
            const title = String(row.title ?? '').trim()
            return h(
              'li',
              { key: row.id, className: 'amgr-row', 'data-selected': selected.has(row.id) },
              h('input', {
                className: 'amgr-rowCheck',
                type: 'checkbox',
                checked: selected.has(row.id),
                'aria-label': title.length > 0 ? title : t('unnamed'),
                onChange: () => toggle(row.id),
              }),
              h(
                'div',
                { className: 'amgr-rowMain' },
                h(
                  'span',
                  { className: 'amgr-rowTitle', 'data-empty': title.length === 0, title: title || row.id },
                  title.length > 0 ? title : t('unnamed'),
                ),
                h('div', { className: 'amgr-rowMeta' }, ...meta),
              ),
              h(
                'div',
                { className: 'amgr-rowActions' },
                h(
                  Button,
                  {
                    variant: 'quiet',
                    disabled: busy !== '',
                    onClick: () => {
                      run('restore', [row.id]).catch(() => void 0)
                    },
                  },
                  t('restore'),
                ),
                h(
                  Button,
                  {
                    variant: 'danger',
                    disabled: busy !== '',
                    onClick: () => {
                      setPermanent(false)
                      setPending([row.id])
                    },
                  },
                  t('delete'),
                ),
              ),
            )
          }),
        ),

        pending !== null
          ? h(
            'div',
            { className: 'amgr-confirm', role: 'group', 'aria-label': interpolate(t('confirmTitle'), { count: pending.length }) },
            h('span', { className: 'amgr-confirmTitle' }, interpolate(t('confirmTitle'), { count: pending.length })),
            h('span', { className: 'amgr-confirmBody' }, t('confirmBody')),
            h(
              'label',
              { className: 'amgr-check' },
              h('input', {
                type: 'checkbox',
                checked: permanent,
                onChange: (event) => setPermanent(event.target.checked),
              }),
              h('span', {}, t('permanent')),
            ),
            h(
              'div',
              { className: 'amgr-confirmFoot' },
              h(
                Button,
                { variant: 'quiet', onClick: () => setPending(null) },
                t('cancel'),
              ),
              h('span', { className: 'amgr-spacer' }),
              h(
                Button,
                {
                  variant: 'danger',
                  disabled: busy !== '',
                  onClick: () => {
                    confirmDelete().catch(() => void 0)
                  },
                },
                t('delete'),
              ),
            ),
          )
        : null,

        h(
          'footer',
          { className: 'amgr-foot' },
          trashRoot.length > 0 ? h('span', { className: 'amgr-footPath', title: trashRoot }, interpolate(t('trashHint'), { path: trashRoot })) : null,
          h('span', { className: 'amgr-spacer' }),
          h(
            Button,
            {
              variant: 'quiet',
              disabled: busy !== '' || status === 'loading',
              onClick: () => {
                load().catch(() => void 0)
              },
            },
            t('refresh'),
          ),
        ),
      )
    }

    function reasonText(t, reason) {
      switch (reason) {
    case 'not-archived':
      return t('reasonNotArchived')
    case 'live':
      return t('reasonLive')
    case 'missing-log':
      return t('reasonMissingLog')
    default:
      return t('reasonFailed')
      }
    }

    function apply(ctx) {
      const locale = ctx.get('locale')
      let t = (key) => (Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : key)

      if (locale !== undefined) {
    try {
      ctx.effect(() => locale.register(NS, { en, zh }), 'dsh-archive-manager: locale dictionaries')
    } catch {
      /* a previous run's dictionaries stay usable through `bind` */
    }
    try {
      t = locale.bind(NS)
    } catch {
      /* keep the embedded fallback */
    }
      }

      service = {
    locale,
    t: (key, params) => interpolate(t(key), params),
      }

      const styles = {
    insert(css) {
      if (typeof document === 'undefined') return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-archive-manager'
      tag.dataset.pluginCss = 'dsh-archive-manager/manager.css'
      tag.textContent = css
      document.head.appendChild(tag)
      return () => tag.remove()
    },
      }
      ctx.effect(() => styles.insert(CSS), 'dsh-archive-manager: styles')

      ctx.slots.inject(SLOT, () =>
    ctx.slots.register(
      {
        name: SLOT,
        id: 'archive-manager',
        order: 30,
        locale: NS,
        label: () => t('badge'),
      },
      Section,
    ),
      )
    }

    return { inject: ['slots'], apply }
  },
})
