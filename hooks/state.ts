// 公用的常量、颜色、各个 atom,缓存计时和上下文占用。
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { CacheMark, Ctx, Keep, Night, Prefs } from '../types'
import type { Mood } from './clawd'
import { EMPTY_CALIB } from './cost'

export const PANE = 'clawd-gallery'
export const TICK_MS = 20_000
/** 队伍每隔多久整体挪一格,换一个新角色上场。 */
export const ENTER_MS = 60_000
export const SOON_MIN = 5

export const CLAY = '#d97757'
export const AMBER = '#e9a23b'
export const RED = '#e5534b'
export const ICE = '#7fb4d6'
export const MUTED = '#8a857a'
/** 月光色:深夜模式开着时的强调色。 */
export const MOON = '#e8d9b0'

export const DEFAULT_PREFS: Prefs = { lead: 'auto', skin: 'auto', ttl: 60, count: 0 }
/** 窄条里每个角色的显示高度(像素)。 */
export const SHOW_H = 36
/** 估算:桌面版一列约多少像素,右侧进度条和文字占多宽。 */
export const PX_PER_COL = 8.2
export const RIGHT_PX = 260

// 用到 read/update 的文件要自己再写一遍 atom(...) 声明(引擎静态扫描要求),key 和 shape 跟这里保持一致。
export const cache = atom({ plugin: 'clawd-bar', key: 'cache' } as const, null as CacheMark | null, { shape: 'cache-1' })
export const prefs = atom({ plugin: 'clawd-bar', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-7' })
export const ctx = atom({ plugin: 'clawd-bar', key: 'ctx' } as const, null as Ctx | null, { shape: 'ctx-2' })
export const calib = atom({ plugin: 'clawd-bar', key: 'calib' } as const, EMPTY_CALIB, { shape: 'calib-1' })
export const NIGHT_OFF: Night = { mode: 'off', base: null, spent: 0, lastWeek: null, waitUntil: null, resumes: 0 }
export const night = atom({ plugin: 'clawd-bar', key: 'night' } as const, NIGHT_OFF, { shape: 'night-2' })
export const panel = atom({ plugin: 'clawd-bar', key: 'panel' } as const, false, { shape: 'panel-1' })
export const KEEP_OFF: Keep = { on: false, sentFor: 0, count: 0 }
export const keep = atom({ plugin: 'clawd-bar', key: 'keep' } as const, KEEP_OFF, { shape: 'keep-1' })
/** 主线程正在跑的那一轮(深夜模式花完预算时用它停下)和其中的续缓存轮次(它的输出不计进平均输出)。 */
export const turns = { main: null as string | null, keep: null as string | null, keepSent: false }


export type View = { mood: Mood; leftMs: number; ttlMs: number }

export const viewOf = (c: CacheMark | null, now: number, ttlMin: number, isWorking: boolean): View => {
  const ttlMs = ttlMin * 60_000
  if (!c || c.lastAt <= 0) return { mood: 'hello', leftMs: 0, ttlMs }
  if (isWorking) return { mood: 'busy', leftMs: ttlMs, ttlMs }
  const leftMs = c.lastAt + ttlMs - now
  if (leftMs <= 0) return { mood: 'cold', leftMs, ttlMs }
  if (leftMs <= SOON_MIN * 60_000) return { mood: 'soon', leftMs, ttlMs }
  return { mood: 'calm', leftMs, ttlMs }
}

export const fmtAgo = (ms: number): string => {
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${Math.max(1, m)} 分钟`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时${m % 60 ? ` ${m % 60} 分` : ''}`
  return `${Math.floor(h / 24)} 天`
}

// ---------- 缓存计时 ----------
export async function stamp($: EngineInterface, at: number) {
  await update($, cache, () => ({ lastAt: at }))
}

/** 每次请求只提醒一次:快过期一次、过期一次。 */
export const warnedFor = { soon: 0, cold: 0 }

export async function checkAlerts($: EngineInterface) {
  const c = await read($, cache)
  if (!c || c.lastAt <= 0) return
  const p = await read($, prefs)
  const v = viewOf(c, await $.clock.now(), p.ttl, false)
  // 开着续缓存时不提醒"快过期",由 keepTick 自己续并提示。
  if (v.mood === 'soon' && warnedFor.soon !== c.lastAt && !(await read($, keep)).on) {
    warnedFor.soon = c.lastAt
    $.ui.toast(`Clawd:缓存还有 ${Math.ceil(v.leftMs / 60_000)} 分钟过期,有话趁现在说`)
  }
  if (v.mood === 'cold' && warnedFor.cold !== c.lastAt) {
    warnedFor.cold = c.lastAt
    $.ui.toast('Clawd:缓存已过期,下一条消息会把整段上下文重新写入缓存,额度消耗大')
  }
}

export async function savePrefs($: EngineInterface, fn: (p: Prefs) => Prefs) {
  const p = await update($, prefs, fn)
  await $.store.set('prefs', p)
  $.ui.invalidate('ui.render')
  return p
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string | null }
/** 最近读到的周额度,深夜面板的圆点条用。 */
export const week = { now: null as { used: number; resetsAt: number | null } | null }
export type CtxUsage = { tokens?: number }

/**
 * 上下文只看一道上限:670K。显示成相对 670K 的百分比。
 * 缓存命中也要按约 0.1 倍重读整段,670K 每条≈6.7 万全价 token,过期重写≈134 万。
 */
export const CTX_LIMIT = 670_000
export const CTX_SOON = 0.9
export const ctxPct = (tokens: number) => Math.round((tokens / CTX_LIMIT) * 100)
export type CtxTier = { color: string; hint: string; bold: boolean }
export const ctxTier = (tokens: number): CtxTier =>
  tokens >= CTX_LIMIT ? { color: RED, hint: '已到上限,请换会话', bold: true }
    : tokens >= CTX_LIMIT * CTX_SOON ? { color: AMBER, hint: '快到上限', bold: false }
      : { color: MUTED, hint: '', bold: false }

/** 快到(90%)和到达(100%)各弹一次;降回去后重新计。 */
export const ctxWarned = { soon: false, full: false }

export async function takeContext($: EngineInterface, c: CtxUsage) {
  if (!c.tokens || c.tokens <= 0) return
  const tokens = c.tokens
  await update($, ctx, () => ({ tokens }))
  if (tokens >= CTX_LIMIT && !ctxWarned.full) {
    ctxWarned.full = true
    $.ui.toast('Clawd:上下文已到 670K 上限,请换会话或点「压缩会话」')
  } else if (tokens >= CTX_LIMIT * CTX_SOON && !ctxWarned.soon) {
    ctxWarned.soon = true
    $.ui.toast(`Clawd:上下文已用到 670K 的 ${ctxPct(tokens)}%,准备换会话或压缩`)
  }
  if (tokens < CTX_LIMIT * CTX_SOON) {
    ctxWarned.soon = false
    ctxWarned.full = false
  }
}
