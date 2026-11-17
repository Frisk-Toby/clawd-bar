// 续缓存:缓存剩几分钟时插件自动发一条 1,模型只回 1,低成本续上 prompt 缓存。
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { CacheMark, Ctx } from '../types'
import { EMPTY_CALIB, fmtPct, nextCost, writeMult } from './cost'
import { DEFAULT_PREFS, KEEP_OFF, SOON_MIN, turns, viewOf } from './state'

// 引擎要求 read/update 的 atom 在本文件里声明;key 和 shape 与 state.ts 相同,是同一份状态。
const cache = atom({ plugin: 'clawd-bar', key: 'cache' } as const, null as CacheMark | null, { shape: 'cache-1' })
const calib = atom({ plugin: 'clawd-bar', key: 'calib' } as const, EMPTY_CALIB, { shape: 'calib-1' })
const ctx = atom({ plugin: 'clawd-bar', key: 'ctx' } as const, null as Ctx | null, { shape: 'ctx-2' })
const keep = atom({ plugin: 'clawd-bar', key: 'keep' } as const, KEEP_OFF, { shape: 'keep-1' })
const prefs = atom({ plugin: 'clawd-bar', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-7' })

// ---------- 续缓存 ----------
// 开着时,缓存剩 SOON_MIN 分钟就以插件的名义自动发一条 1;模型按对话开头的规矩只回 1,
// 不思考不调工具。这一轮只按约 0.1 倍价读一遍缓存,TTL 从头算,比过期后整段重写便宜得多。
// 不用 asUser:"1"太常见(用户回"选 1"也是它),必须让模型看得出这条是插件发的、不是用户本人打的。
export const KEEP_TEXT = '1'
export const KEEP_RULE =
  '当 clawd-bar 插件发来一条内容恰好是"1"的消息(以"The clawd-bar plugin sent a message"开头)时,那是缓存保活消息,唯一目的是续上 prompt 缓存:' +
  '只回复"1",不思考、不调用任何工具、不读文件、不接着做之前的任务、不说别的。' +
  '用户本人打的"1"(比如回答你给的选项)是正常消息,照常处理。'
export const isKeep = (text: string | undefined) => (text ?? '').trim() === KEEP_TEXT

/** 按下「续」:开关,并用一条提示讲清楚这个模式会做什么、大概花多少。 */
/** 一次开启最多续几次。 */
export const KEEP_MAX = 8
/** 上下文小于这个数时重写本来就便宜,续的意义不大。 */
export const KEEP_SMALL = 50_000
/**
 * 一次开启最多续几次:默认 8 次;再不超过"续的累计花费 = 重写一次的一半"
 * (每次读缓存 0.1 倍,重写 writeMult 倍:60 分钟 TTL 是 10 次,5 分钟 TTL 是 6 次)。
 */
export const keepLimit = (ttlMin: number) => Math.max(1, Math.min(KEEP_MAX, Math.floor(writeMult(ttlMin) / 0.1 / 2)))

export async function keepToggle($: EngineInterface) {
  // 每次开启从头计数,上限按这一次算。
  const k = await update($, keep, cur => (cur.on ? { ...cur, on: false } : { ...cur, on: true, count: 0 }))
  const ttl = (await read($, prefs)).ttl
  const limit = keepLimit(ttl)
  if (!k.on) {
    $.ui.toast(`Clawd 续缓存:已关(这次续了 ${k.count} 次)。缓存按 ${ttl} 分钟正常过期。`)
  } else {
    const cx = await read($, ctx)
    const cb = await read($, calib)
    const warm = cx ? nextCost(cb, cx.tokens, false, ttl) : null
    const cold = cx ? nextCost(cb, cx.tokens, true, ttl) : null
    const ratio = Math.round(writeMult(ttl) / 0.1)
    $.ui.toast(
      `Clawd 续缓存:已开。缓存剩 ${SOON_MIN} 分钟时自动发 ${KEEP_TEXT},模型只回 ${KEEP_TEXT}(不思考、不调工具;你自己打的 1 不受影响),缓存重新计满 ${ttl} 分钟。` +
        (warm !== null && cold !== null
          ? `每次约耗 5h ${fmtPct(warm)},过期后重写约 ${fmtPct(cold)}。`
          : `每次只按约 0.1 倍价读一遍缓存,比过期后重写便宜约 ${ratio} 倍。`) +
        (cx && cx.tokens < KEEP_SMALL ? `现在上下文才 ${Math.round(cx.tokens / 1000)}K,过期重写也不贵,续的意义不大。` : '') +
        `最多续 ${limit} 次(约 ${Math.round((limit * ttl) / 60)} 小时)后自动关,也可随时再点「续」关掉;只在本会话、电脑和会话都开着时生效。`,
    )
  }
  $.ui.invalidate('ui.render')
}

/** 每个节拍看一眼:开着、空闲、缓存进入最后几分钟、这段缓存还没续过,就发 1。 */
export async function keepTick($: EngineInterface) {
  const k = await read($, keep)
  if (!k.on || turns.main) return
  const c = await read($, cache)
  if (!c || c.lastAt <= 0 || k.sentFor === c.lastAt) return
  const ttl = (await read($, prefs)).ttl
  const v = viewOf(c, await $.clock.now(), ttl, false)
  // 已经过期就不发了:那时发什么都要整段重写,续不回来。
  if (v.mood !== 'soon') return
  const limit = keepLimit(ttl)
  if (k.count >= limit) {
    // 续满了:关掉,这段缓存按正常时间过期。
    await update($, keep, cur => ({ ...cur, on: false }))
    $.ui.toast(`Clawd 续缓存:已续满 ${limit} 次,自动关了。缓存约 ${Math.ceil(v.leftMs / 60_000)} 分钟后过期;还要续就再点「续」。`)
    $.ui.invalidate('ui.render')
    return
  }
  const n = await update($, keep, cur => ({ ...cur, sentFor: c.lastAt, count: cur.count + 1 }))
  $.ui.toast(`Clawd 续缓存:还剩 ${Math.ceil(v.leftMs / 60_000)} 分钟,已自动发 ${KEEP_TEXT} 续上(第 ${n.count}/${limit} 次)`)
  try {
    // 以插件名义发(不加 asUser),模型才分得清这是保活、不是用户回答"选 1"。
    turns.keepSent = true
    void Promise.resolve($.prompt.submit({ text: KEEP_TEXT })).catch(() => { turns.keepSent = false })
  } catch {
    // 发不出去就算了,下个节拍不会重复(sentFor 已记下)。
  }
  $.ui.invalidate('ui.render')
}
