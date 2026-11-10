/**
 * dsh-archive-manager — Host half.
 *
 * Batch management of archived Sessions: list, restore, and delete. The
 * durable archive set, pin set, and Workspace accounting are owned by
 * `ctx.workspaceRegistry`; Session logs are owned by the composed
 * `sessionPersistence` backend, which exposes no delete operation, so removal
 * relocates the on-disk log directory of one non-live Session into a
 * plugin-owned trash root (or removes it when the caller asks for a
 * permanent delete). No Session event is appended and no log is rewritten.
 *
 * Every operation is idempotent per Session and reports a per-Session result,
 * so a partial batch never hides which Session failed and why.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Hard dependency: the authenticated browser route carrier and the archive owner. */
export const inject = ['connection', 'workspaceRegistry']

const ROUTE = '/api/archive-manager'
const ROUTE_METHODS = ['POST']
const MAX_BATCH = 500
/** A stored Session log generation (`session.v4.jsonl`, `.zstd`, `.gz`, …). */
const LOG_FILE_PATTERN = /^session\.v\d+\.jsonl(?:\.[A-Za-z0-9]+)*$/
/** One Session id must be usable as a single path segment. */
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.length > 0) return configured
  return path.join(os.homedir(), '.dsh')
}

function resolveConfigured(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  const expanded = text.startsWith('~/') ? path.join(os.homedir(), text.slice(2)) : text
  return path.resolve(expanded.length > 0 ? expanded : fallback)
}

/** Unique trash entry name: sortable timestamp plus the Session id. */
function trashEntryName(id) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${stamp}-${id}`
}

class ArchiveManager {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config ?? {}
    this.sessionsRoot = resolveConfigured(this.config.sessionsRoot, path.join(dshHome(), 'sessions'))
    this.trashRoot = resolveConfigured(this.config.trashRoot, path.join(dshHome(), 'archived-sessions-trash'))
    this.projectionCacheRoot = resolveConfigured(
      this.config.projectionCacheRoot,
      path.join(dshHome(), 'storages', 'session_projcache', 'sessions'),
    )
  }

  registry() {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) throw new Error('the workspace registry is unavailable')
    return registry
  }

  archivedIds() {
    const archived = this.registry().archivedSessionIds
    return Array.isArray(archived) ? archived.map(String) : []
  }

  /**
   * Index every stored Session directory once per operation, keyed by Session
   * id. A project directory holds one directory per Session; the log file
   * inside it is what proves the directory is a Session log rather than an
   * unrelated directory that happens to share the id.
   */
  async indexLogs() {
    const index = new Map()
    let projects
    try {
      projects = await fs.readdir(this.sessionsRoot, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return index
      throw error
    }
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const projectDir = path.join(this.sessionsRoot, project.name)
      let sessions
      try {
        sessions = await fs.readdir(projectDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const session of sessions) {
        if (!session.isDirectory()) continue
        const dir = path.join(projectDir, session.name)
        let files
        try {
          files = await fs.readdir(dir)
        } catch {
          continue
        }
        const log = files.find((name) => LOG_FILE_PATTERN.test(name))
        if (log === undefined) continue
        let sizeBytes = 0
        try {
          sizeBytes = (await fs.stat(path.join(dir, log))).size
        } catch {
          sizeBytes = 0
        }
        index.set(session.name, { dir, log, sizeBytes })
      }
    }
    return index
  }

  /** Session rows the Client may display, without activating an Agent. */
  async summaries() {
    const controller = this.ctx.get('sessionController')
    if (controller === undefined) return { rows: new Map(), available: false }
    const value = await controller.list({}, AbortSignal.timeout(15_000))
    const rows = new Map()
    for (const item of value?.items ?? []) rows.set(String(item.sessionId), item)
    return { rows, available: true }
  }

  /** Latest log-backed title per Session, folded by the query service. */
  async titles(ids) {
    const titles = new Map()
    const query = this.ctx.get('sessionQuery')
    if (query?.readTitleSnapshots !== undefined && ids.length > 0) {
      try {
        const results = await query.readTitleSnapshots(ids)
        for (const result of results ?? []) {
          if (result?.status === 'fulfilled') {
            const title = result.value?.title?.title
            if (typeof title === 'string' && title.trim().length > 0) titles.set(String(result.sessionId), title.trim())
          }
        }
      } catch {
        /* a title failure never blocks the listing */
      }
    }
    return titles
  }

  /**
   * The complete archived view: archive order, Session metadata, title, log
   * location, and whether the Session is currently live or running.
   */
  async snapshot() {
    const archived = this.archivedIds()
    const [index, summaries, titles] = await Promise.all([
      this.indexLogs(),
      this.summaries(),
      this.titles(archived),
    ])
    const live = this.ctx.get('sessions')
    const sessions = archived.map((id, position) => {
      const row = summaries.rows.get(id)
      const entry = index.get(id)
      const projectionTitle = row?.projections?.values?.title
      return {
        id,
        position,
        title: titles.get(id) ?? (typeof projectionTitle === 'string' ? projectionTitle.trim() : ''),
        cwd: typeof row?.cwd === 'string' ? row.cwd : undefined,
        updatedAt: typeof row?.updatedAt === 'number' ? row.updatedAt : undefined,
        running: row?.running === true,
        live: live?.get(id) !== undefined || row?.running === true,
        logPresent: entry !== undefined,
        sizeBytes: entry?.sizeBytes ?? 0,
      }
    })
    return {
      sessions,
      counts: {
        archived: sessions.length,
        missingLogs: sessions.filter((session) => !session.logPresent).length,
        live: sessions.filter((session) => session.live).length,
      },
      sessionsRoot: this.sessionsRoot,
      trashRoot: this.trashRoot,
      summariesAvailable: summaries.available,
    }
  }

  /** Validate a requested id batch into normalized, de-duplicated ids. */
  static normalizeIds(input) {
    if (!Array.isArray(input)) throw new Error('ids must be an array')
    const ids = []
    for (const value of input) {
      if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value) || value === '.' || value === '..') {
        throw new Error(`invalid session id: ${String(value)}`)
      }
      if (!ids.includes(value)) ids.push(value)
    }
    if (ids.length === 0) throw new Error('ids must name at least one session')
    if (ids.length > MAX_BATCH) throw new Error(`at most ${MAX_BATCH} sessions per request`)
    return ids
  }

  /** Drop one id from the durable archive set; an id that is not archived is a no-op. */
  async unarchive(id) {
    await this.registry().unarchiveSession(id)
  }

  /**
   * Tell every connected client that one Session left the Host registry.
   *
   * A removal this plugin performs out of band never produces the
   * `session/disposed` event the session controller relays as
   * `api-session/removed`, so without this frame a client keeps the row (and
   * the workspace browser keeps offering it) after its log is already gone.
   */
  retire(id) {
    if (typeof this.ctx.emit !== 'function') return
    try {
      this.ctx.emit('api-session/removed', id)
    } catch (error) {
      this.ctx.logger?.warn?.(`[dsh-archive-manager] announcing the removal of ${id} failed: ${String(error)}`)
    }
  }

  /** Drop cached projections for a removed Session; a missing cache is not a failure. */
  async dropProjectionCache(id) {
    let names
    try {
      names = await fs.readdir(this.projectionCacheRoot)
    } catch {
      return
    }
    for (const name of names) {
      if (name !== `${id}.json` && !name.startsWith(`${id}.`)) continue
      try {
        await fs.rm(path.join(this.projectionCacheRoot, name), { force: true })
      } catch {
        /* best effort only */
      }
    }
  }

  /** Move one Session directory into the trash root, across devices when needed. */
  async relocateToTrash(dir, id) {
    await fs.mkdir(this.trashRoot, { recursive: true })
    const target = path.join(this.trashRoot, trashEntryName(id))
    try {
      await fs.rename(dir, target)
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error
      await fs.cp(dir, target, { recursive: true, errorOnExist: true, force: false })
      await fs.rm(dir, { recursive: true, force: true })
    }
    return target
  }

  async restore(ids) {
    const archived = new Set(this.archivedIds())
    const results = []
    for (const id of ids) {
      if (!archived.has(id)) {
        results.push({ id, ok: false, reason: 'not-archived' })
        continue
      }
      try {
        await this.unarchive(id)
        archived.delete(id)
        results.push({ id, ok: true })
      } catch (error) {
        results.push({ id, ok: false, reason: 'failed', message: String(error?.message ?? error) })
      }
    }
    return results
  }

  /**
   * Delete archived Sessions.
   *
   * Refuses a Session that is still live or running, or that is not archived —
   * this operation only ever removes what the archive list shows. The log
   * directory leaves the persistence root first; the archive entry and cached
   * projections are cleaned afterwards, and connected clients are told the
   * Session is gone.
   *
   * A Workspace keeps its now-dangling Session id on purpose: the browser
   * groups Sessions that no Workspace accounts for into "Ungrouped", so
   * detaching would move a deleted row there instead of dropping it. A
   * Workspace skips an id it has no Session summary for.
   */
  async delete(ids, permanent) {
    const archived = new Set(this.archivedIds())
    const summaries = await this.summaries()
    const index = await this.indexLogs()
    const live = this.ctx.get('sessions')
    const results = []

    for (const id of ids) {
      if (!archived.has(id)) {
        results.push({ id, ok: false, reason: 'not-archived' })
        continue
      }
      const row = summaries.rows.get(id)
      if (live?.get(id) !== undefined) {
        results.push({ id, ok: false, reason: 'live' })
        continue
      }
      if (row?.running === true) {
        results.push({ id, ok: false, reason: 'live' })
        continue
      }
      const entry = index.get(id)
      if (entry === undefined) {
        if (row !== undefined) {
          results.push({ id, ok: false, reason: 'missing-log' })
          continue
        }
        /*
         * The Session itself is already gone from persistence and only the
         * archive entry survives. Clearing that entry — and telling clients —
         * is the whole job here, so a stale archived row cannot outlive the
         * Session it points at.
         */
        try {
          await this.unarchive(id)
        } catch (error) {
          this.ctx.logger?.warn?.(`[dsh-archive-manager] clearing the archive entry for ${id} failed: ${String(error)}`)
        }
        await this.dropProjectionCache(id)
        this.retire(id)
        archived.delete(id)
        results.push({ id, ok: true, permanent, alreadyGone: true })
        continue
      }

      let trashedTo
      try {
        if (permanent) {
          await fs.rm(entry.dir, { recursive: true, force: true })
        } else {
          trashedTo = await this.relocateToTrash(entry.dir, id)
        }
      } catch (error) {
        results.push({ id, ok: false, reason: 'failed', message: String(error?.message ?? error) })
        continue
      }

      try {
        await this.unarchive(id)
      } catch (error) {
        this.ctx.logger?.warn?.(`[dsh-archive-manager] clearing the archive entry for ${id} failed: ${String(error)}`)
      }
      await this.dropProjectionCache(id)
      this.retire(id)
      archived.delete(id)
      results.push({ id, ok: true, permanent, ...(trashedTo === undefined ? {} : { trashedTo }) })
    }
    return results
  }
}

function jsonFailure(status, code, message) {
  return Response.json({ ok: false, code, message }, { status })
}

async function handle(manager, body) {
  const action = body?.action
  if (action === 'list') return Response.json({ ok: true, ...(await manager.snapshot()) })
  if (action === 'restore') {
    const ids = ArchiveManager.normalizeIds(body?.ids)
    const results = await manager.restore(ids)
    return Response.json({ ok: true, results, ...(await manager.snapshot()) })
  }
  if (action === 'delete') {
    const ids = ArchiveManager.normalizeIds(body?.ids)
    const results = await manager.delete(ids, body?.permanent === true)
    return Response.json({ ok: true, results, ...(await manager.snapshot()) })
  }
  return jsonFailure(400, 'unknown-action', 'Unknown action.')
}

export async function apply(ctx, config = {}) {
  const manager = new ArchiveManager(ctx, config)
  ctx.logger?.info?.(
    `[dsh-archive-manager] sessions root ${manager.sessionsRoot}, trash root ${manager.trashRoot}`,
  )
  await ctx.effect(
    async () => {
      const disposeRoute = ctx.connection.fetch.register({
        path: ROUTE,
        methods: ROUTE_METHODS,
        requestBody: 'buffered',
        fetch: async (request) => {
          let body
          try {
            body = await request.json()
          } catch {
            return jsonFailure(400, 'bad-request', 'The body is not JSON.')
          }
          try {
            return await handle(manager, body)
          } catch (error) {
            return jsonFailure(400, 'failed', error instanceof Error ? error.message : String(error))
          }
        },
      })
      return async () => {
        await disposeRoute()
      }
    },
    'dsh-archive-manager: archived Session management route',
  )
}

/** Exposed for local verification of the filesystem rules. */
export const internals = { ArchiveManager, ROUTE, LOG_FILE_PATTERN, SAFE_ID_PATTERN, trashEntryName }
