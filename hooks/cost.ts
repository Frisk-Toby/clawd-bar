// 额度估算:不查价目表,用你自己的实际消耗校准。
// 每轮结束记下加权 token(按相对输入价:输入 1、输出 5、缓存读 0.1、缓存写 2 或 1.25),
// 5h 额度百分比每涨一次,就用"涨了多少 ÷ 期间加权 token"更新这个模型的系数。
// 所以模型价格、订阅档位、思考深度(体现在输出量上)都自动算进去了。

import type { Calib } from '../types'

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const OUT = 5
const READ = 0.1
/** 1 小时缓存写入是输入价的 2 倍,5 分钟缓存是 1.25 倍。 */
export const writeMult = (ttlMin: number) => (ttlMin >= 60 ? 2 : 1.25)

export const weightOf = (u: Usage, ttlMin: number): number =>
  u.input_tokens + OUT * u.output_tokens + READ * u.cache_read_input_tokens + writeMult(ttlMin) * u.cache_creation_input_tokens

export const EMPTY_CALIB: Calib = { k: {}, out: 0, model: null, lastPct: null, pending: {} }

const ALPHA = 0.35

/** 一轮结束:把它的加权 token 记到这个模型的待结算里;主线程的轮次还更新平均输出量和当前模型。 */
export const addTurn = (c: Calib, u: Usage, model: string, ttlMin: number, isMain: boolean): Calib => {
  const pending = { ...c.pending, [model]: (c.pending[model] ?? 0) + weightOf(u, ttlMin) }
  if (!isMain) return { ...c, pending }
  const out = c.out > 0 ? c.out * (1 - ALPHA) + u.output_tokens * ALPHA : u.output_tokens
  return { ...c, pending, out, model }
}

/**
 * 读到新的 5h 百分比:涨了就结算,算出每加权 token 值多少百分点;
 * 跌了(窗口重置)就清空待结算重新开始;没变就继续攒。
 */
export const settle = (c: Calib, pct: number): Calib => {
  if (c.lastPct === null || pct < c.lastPct) return { ...c, lastPct: pct, pending: {} }
  const delta = pct - c.lastPct
  if (delta <= 0) return c
  const models = Object.keys(c.pending).filter(m => c.pending[m] > 0)
  const total = models.reduce((s, m) => s + c.pending[m], 0)
  if (total <= 0) return { ...c, lastPct: pct }
  const k = { ...c.k }
  if (models.length === 1) {
    const m = models[0]
    const fresh = delta / total
    k[m] = k[m] ? k[m] * (1 - ALPHA) + fresh * ALPHA : fresh
  } else if (models.every(m => k[m])) {
    // 几个模型混着用:按已知系数分摊,整体按比例修正。
    const expected = models.reduce((s, m) => s + k[m] * c.pending[m], 0)
    const r = delta / expected
    for (const m of models) k[m] = k[m] * (1 - ALPHA) + k[m] * r * ALPHA
  }
  return { ...c, k, lastPct: pct, pending: {} }
}

/**
 * 下一条消息约占 5h 额度的百分之几:整段上下文(过期要重写缓存,温热只读缓存)
 * 加上平时一轮的输出量。还没校准过当前模型时返回 null。
 */
export const nextCost = (c: Calib, ctxTokens: number, cold: boolean, ttlMin: number): number | null => {
  const m = c.model
  if (!m || !c.k[m] || ctxTokens <= 0) return null
  const w = (cold ? writeMult(ttlMin) : READ) * ctxTokens + OUT * c.out
  return c.k[m] * w
}

export const fmtPct = (p: number): string => (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)) + '%'
