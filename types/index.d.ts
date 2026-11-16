/** 主线程最近一次请求的时间(毫秒),缓存从这一刻起计 TTL。 */
export type CacheMark = { lastAt: number }

/** 领衔角色 id 或 'auto';统一皮肤 id 或 'auto';缓存时长(分钟);同台数量(0 = 填满)。 */
export type Prefs = { lead: string; skin: string; ttl: number; count: number }

/**
 * 深夜模式:档位(normal = 最多花开启时剩余周额度的 50%,free = 100%)、开启时剩余的周额度(%)、
 * 本次已花周额度、上次读到的周额度、等到几点再续、已自动续了几次。
 */
export type Night = { mode: 'off' | 'normal' | 'free'; base: number | null; spent: number; lastWeek: number | null; waitUntil: number | null; resumes: number }

/** 上下文占用:最近一次请求的输入 token(按 670K 上限算百分比)。 */
export type Ctx = { tokens: number }

/**
 * 额度校准:k = 每个模型"每加权 token 值 5h 额度的多少百分点";out = 主线程平均每轮输出 token;
 * model = 主线程当前模型;lastPct = 上次读到的 5h 百分比;pending = 上次结算后各模型累计的加权 token。
 */
export type Calib = { k: Record<string, number>; out: number; model: string | null; lastPct: number | null; pending: Record<string, number> }

/** 自动续缓存:开没开、上次替哪一次请求(缓存起点 lastAt)续过、本会话已续几次。 */
export type Keep = { on: boolean; sentFor: number; count: number }

declare module 'claude-code' {
  interface PluginState {
    'clawd-bar': { cache: Shaped<CacheMark | null>; prefs: Shaped<Prefs>; ctx: Shaped<Ctx | null>; calib: Shaped<Calib>; night: Shaped<Night>; panel: Shaped<boolean>; keep: Shaped<Keep> }
  }
}
