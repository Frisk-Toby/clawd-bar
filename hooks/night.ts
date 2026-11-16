// 深夜模式(夜班):额度打断后到点自动接着干,按周额度设上限;展开面板的圆点条和夜景尺寸。
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Night } from '../types'
import { ART_W, SKY_CELL_W } from './nightsky'
import { CLAY, MOON, MUTED, NIGHT_OFF, PX_PER_COL, turns } from './state'
import type { Limit } from './state'

// 引擎要求 read/update 的 atom 在本文件里声明;key 和 shape 与 state.ts 相同,是同一份状态。
const night = atom({ plugin: 'clawd-bar', key: 'night' } as const, NIGHT_OFF, { shape: 'night-2' })

// ---------- 深夜模式的小夜空 ----------
export const NIGHT_MODES: [Night['mode'], string][] = [['off', '关'], ['normal', '50%'], ['free', '100%']]
/** 本次夜班最多能花多少周额度(百分点):开启时剩余的 50% 或 100%。 */
export const nightCap = (n: Night): number | null =>
  n.mode === 'off' || n.base === null ? null : +(n.base * (n.mode === 'normal' ? 0.5 : 1)).toFixed(1)

export const DOTS = 20
export const DOT_GAP = 5.4
export const DOTS_W = Math.round(6 + (DOTS - 1) * DOT_GAP)
/**
 * 学 ribbon 的圆点条:一颗 = 周额度 5%。还剩的是陶土色实心点,用掉的缩成小灰点;
 * 夜班开着时,这次夜班允许花掉的那段换成月光色、慢慢呼吸。
 */
export const weekDots = (used: number, allow: number): string => {
  const left = Math.max(0, 100 - used)
  let out = ''
  for (let i = 0; i < DOTS; i++) {
    const mid = i * 5 + 2.5
    const x = +(3 + i * DOT_GAP).toFixed(1)
    if (mid >= left) out += `<circle cx="${x}" cy="4" r=".8" fill="${MUTED}" opacity=".6"/>`
    else if (allow > 0 && mid >= left - allow)
      out += `<circle cx="${x}" cy="4" r="2" fill="${MOON}"><animate attributeName="opacity" values="1;.45;1" dur="2.4s" begin="${(i * 0.12).toFixed(2)}s" repeatCount="indefinite"/></circle>`
    else out += `<circle cx="${x}" cy="4" r="2" fill="${CLAY}"/>`
  }
  const w = DOTS_W
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 8" width="${w}" height="8">${out}</svg>`
}
/** 面板左边按钮 + 圆点条 + 文字大约占多宽(像素),剩下的给像素夜景。 */
export const PANEL_CTL_PX = 600
export const skyCells = (columns: number) => Math.max(ART_W, Math.min(240, Math.floor((columns * PX_PER_COL - PANEL_CTL_PX) / SKY_CELL_W)))

// ---------- 深夜模式 ----------
// 5 小时额度用完、任务被打断时,等到额度恢复的时间点自动发一条消息让它接着干。
// 只按周额度管:普通档有预算(本次开启后最多花多少周额度),花到就停;无限制档不设上限。
export const RESUME_TEXT = '继续刚才被额度打断的任务。如果任务其实已经全部完成,只回复"已完成",不要做别的。'
export const weekOf = (list: readonly Limit[]) => list.find(w => w.kind === 'seven_day')

export const two = (n: number) => String(n).padStart(2, '0')
/** 几点几分;不是今天就带上日期。 */
export const clockText = (at: number, now: number): string => {
  const d = new Date(at)
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`
  return at - now > 20 * 3600_000 ? `${d.getMonth() + 1}月${d.getDate()}日 ${hm}` : hm
}

export async function nightSet($: EngineInterface, mode: Night['mode']) {
  let lastWeek: number | null = null
  try {
    lastWeek = weekOf((await $.session.usage()).rateLimits)?.percentUsed ?? null
  } catch {
    // 读不到周额度时先不记基准,下次读到再开始算。
  }
  // 在两档之间切换不清零,已经花掉的照算;"剩余"按开启那一刻算。
  const base = lastWeek === null ? null : +(100 - lastWeek).toFixed(1)
  const n = await update($, night, cur => (mode === 'off' ? NIGHT_OFF : cur.mode === 'off' ? { ...NIGHT_OFF, mode, lastWeek, base } : { ...cur, mode }))
  const cap = nightCap(n)
  $.ui.toast(
    mode === 'off' ? 'Clawd 夜班:已关'
      : `Clawd 夜班(${mode === 'normal' ? '剩余的 50%' : '剩余的 100%'}):额度恢复后自动继续` + (cap !== null ? `,本次最多花周额度 ${cap}%` : ''),
  )
  $.ui.invalidate('ui.render')
}

/** 预算花完:关掉深夜模式,正在跑的那一轮也停下。 */
export async function nightStop($: EngineInterface, why: string) {
  await update($, night, () => NIGHT_OFF)
  $.ui.toast(`Clawd 深夜模式已停:${why}`)
  $.ui.invalidate('ui.render')
  if (!turns.main) return
  try {
    await $.turn.abort({ turnId: turns.main })
  } catch {
    // 这一轮已经结束了,不用停。
  }
}

/** 周额度每涨一点就记到"本次已花"里;普通档花到预算就停。 */
export async function nightSpend($: EngineInterface, list: readonly Limit[]) {
  const w = weekOf(list)
  const n = await read($, night)
  if (!w || n.mode === 'off') return
  const delta = n.lastWeek !== null && w.percentUsed > n.lastWeek ? w.percentUsed - n.lastWeek : 0
  const cur = await update($, night, x => ({ ...x, base: x.base ?? +(100 - w.percentUsed).toFixed(1), spent: +(x.spent + delta).toFixed(1), lastWeek: w.percentUsed }))
  const cap = nightCap(cur)
  if (cap !== null && cur.spent >= cap) await nightStop($, `本次已花周额度 ${cur.spent}%,到了上限 ${cap}%`)
}

/** 任务被限额打断:记下额度恢复的时间,到点再续。 */
export async function nightHit($: EngineInterface) {
  const n = await read($, night)
  if (n.mode === 'off') return
  const now = await $.clock.now()
  if (n.waitUntil && n.waitUntil > now) return
  const cap = nightCap(n)
  if (cap !== null && n.spent >= cap) {
    await nightStop($, `本次已花周额度 ${n.spent}%,到了上限 ${cap}%`)
    return
  }
  // 读不到恢复时间(或者只是临时限流)就五分钟后再试。
  let until = now + 5 * 60_000
  try {
    const times = (await $.session.usage()).rateLimits
      .filter(w => w.percentUsed >= 99 && w.resetsAt)
      .map(w => Date.parse(w.resetsAt as string))
      .filter(t => t > now)
    if (times.length > 0) until = Math.max(...times) + 60_000
  } catch {
    // 用上面的五分钟。
  }
  await update($, night, cur => ({ ...cur, waitUntil: until }))
  $.ui.toast(`Clawd 深夜模式:额度用完了,${clockText(until, now)} 恢复后自动继续`)
  $.ui.invalidate('ui.render')
}

/** 每个节拍看一眼:到了恢复时间就发消息续上。 */
export async function nightTick($: EngineInterface) {
  const n = await read($, night)
  if (n.mode === 'off' || !n.waitUntil) return
  if ((await $.clock.now()) < n.waitUntil) return
  await update($, night, cur => ({ ...cur, waitUntil: null, resumes: cur.resumes + 1 }))
  $.ui.toast('Clawd 深夜模式:额度恢复了,接着干活')
  try {
    // 只排队不等待:消息要等会话空闲才真正发出。
    void Promise.resolve($.prompt.submit({ text: RESUME_TEXT })).catch(() => {})
  } catch {
    // 发不出去就算了,下次被打断会重新排。
  }
  $.ui.invalidate('ui.render')
}
