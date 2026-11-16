// 窄条左边的一队职业 Clawd:每天洗牌、每分钟挪一格,按宽度和 Svg 预算决定站几只。
import type { Prefs } from '../types'
import { FROST, SKINS, TILE_H, TILE_W, drawSvg, skinById } from './clawd'
import type { Costume, Skin } from './clawd'
import { COSTUMES, PANIC, costumeById } from './costumes'
import { ENTER_MS, PX_PER_COL, RIGHT_PX, SHOW_H } from './state'
import type { View } from './state'

export const hash = (n: number) => (Math.imul(n | 0, 2654435761) >>> 0)
/** 按种子洗牌。 */
export const shuffle = <T,>(list: T[], seed: number): T[] => {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = hash(seed * 31 + i) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 角色队伍 ----------
export type Actor = {
  costume: Costume
  clip: string
  skin: Skin
  frozen: boolean
  /** 压缩会话时被压扁 / 弹回。 */
  squash?: 'hold' | 'pop'
  /** 在打瞌睡(头顶冒 z)。 */
  sleep?: boolean
  /** 刚被吵醒(头顶感叹号)。 */
  alarm?: boolean
}

export const showW = (c: Costume) => Math.round(((c.w ?? TILE_W) * SHOW_H) / TILE_H)

/**
 * 整条窄条(角色 + 进度条 + 星芒 + 展开面板的圆点条和夜景)所有 Svg 加起来最多多少字符。
 * 桌面版对一次绘制的总量有上限(实测 47 万能画、81 万整条不画，而且不报错、还会熔断),
 * 所以按字符数封顶：先扣掉固定部件，剩下的给角色，宁可少站几只。
 */
export const SVG_BUDGET = 260_000

/**
 * 从最右边(挨着进度条)往左数,按实际宽度能完整站下的角色;放不下的整个不画,不露半个身子。
 * 同时按 Svg 字符总量封顶(size 给出每只的字符数,budget 是留给角色的字符数)。
 */
export const fitCrew = (all: Actor[], columns: number, right = RIGHT_PX, size?: (a: Actor) => number, budget = SVG_BUDGET): Actor[] => {
  let room = columns * PX_PER_COL - right
  let chars = budget
  const out: Actor[] = []
  for (let i = all.length - 1; i >= 0; i--) {
    room -= showW(all[i].costume)
    if (size) chars -= size(all[i])
    if ((room < 0 || chars < 0) && out.length > 0) break
    out.unshift(all[i])
  }
  return out
}

/**
 * 一队角色,从左到右;最右边一个挨着进度条。顺序每天洗一次,
 * 每 ENTER_MS 整队挪一格,新角色从左边进场。领衔角色固定站在最右。
 */
export const lineup = (v: View, p: Prefs, now: number, n: number): Actor[] => {
  const lead = p.lead !== 'auto' ? costumeById(p.lead) : undefined
  const order = shuffle(COSTUMES, Math.floor(now / 86_400_000)).filter(c => c !== lead)
  const step = Math.floor(now / ENTER_MS)
  const take = Math.min(n, COSTUMES.length) - (lead ? 1 : 0)
  const crew: Costume[] = []
  for (let i = 0; i < take; i++) crew.push(order[(((i - step) % order.length) + order.length) % order.length])
  if (lead) crew.push(lead)
  const fixed = p.skin !== 'auto' ? skinById(p.skin) : undefined
  return crew.map((c, i) => ({
    costume: c,
    // 快过期:全员换成慌张动作;已过期:全员冻住、变冰蓝。
    clip: v.mood === 'soon' ? PANIC[(i + step) % PANIC.length] : c.clip,
    skin: v.mood === 'cold' ? FROST : (fixed ?? skinById(c.skin ?? 'clay') ?? SKINS[0]),
    frozen: v.mood === 'cold',
  }))
}

/** 点一下角色时演的招呼动作:挥手(本来就在挥手的换成兴奋);冻住的不理人。 */
export const greetClip = (a: Actor) => (a.frozen ? undefined : a.clip === 'Waving' ? 'Excited' : 'Waving')

export const actorSvg = (a: Actor) =>
  drawSvg(a.clip, a.skin, {
    costume: a.costume, box: { w: a.costume.w ?? TILE_W, h: TILE_H }, frozen: a.frozen, snow: a.frozen, greet: greetClip(a),
    squash: a.squash, sleep: a.sleep, alarm: a.alarm,
  })

// ---------- 小动作:压扁、打瞌睡、惊醒 ----------
/** 你多久没说话(且没在干活)开始有人打瞌睡。 */
export const SLEEP_AFTER = 10 * 60_000
/** 之后每隔多久再多睡着一只。 */
export const SLEEP_STEP = 90_000
/** 被吵醒的样子维持多久。 */
export const WAKE_MS = 3_000

/** 闲了这么久,该有几只在打瞌睡。 */
export const sleepersAt = (idleMs: number) => (idleMs < SLEEP_AFTER ? 0 : 1 + Math.floor((idleMs - SLEEP_AFTER) / SLEEP_STEP))

export type Antics = { squash?: 'hold' | 'pop'; wake: boolean; sleepers: number }

/**
 * 把此刻的小动作叠到队伍上。优先级:冻住(缓存过期)> 压扁(压缩中)> 惊醒 > 打瞌睡(从左往右一只只睡着,
 * 睡的换成打坐动作 + 头顶小 z)。
 */
export const applyAntics = (crew: Actor[], x: Antics): Actor[] =>
  crew.map((a, i) => {
    if (a.frozen) return a
    if (x.squash) return { ...a, squash: x.squash }
    if (x.wake) return { ...a, clip: 'Excited', alarm: true }
    if (i < x.sleepers) return { ...a, clip: 'Meditating', sleep: true }
    return a
  })

