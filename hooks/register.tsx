import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { CacheMark, Calib, Ctx, Prefs } from '../types'
import { BAR_H, BAR_SVG_W, SPARK_PX, barSvg, sparkSvg, textBar } from './bar'
import { CLIPS, FROST, SKINS, TILE_H, TILE_W, drawSvg, skinById } from './clawd'
import { EMPTY_CALIB, addTurn, fmtPct, nextCost, settle } from './cost'
import { COSTUMES, costumeById } from './costumes'
import { SVG_BUDGET, WAKE_MS, actorSvg, applyAntics, fitCrew, lineup, showW, sleepersAt } from './crew'
import type { Antics } from './crew'
import { KEEP_RULE, isKeep, keepLimit, keepTick, keepToggle } from './keep'
import { DOTS_W, NIGHT_MODES, clockText, nightCap, nightHit, nightSet, nightSpend, nightTick, skyCells, weekDots, weekOf } from './night'
import { SKY_CELL_W, SKY_PX_H, pixelSky } from './nightsky'
import { AMBER, CLAY, DEFAULT_PREFS, KEEP_OFF, NIGHT_OFF, CTX_LIMIT, CTX_SOON, ICE, MOON, MUTED, PANE, RED, RIGHT_PX, SHOW_H, TICK_MS, checkAlerts, ctxPct, ctxTier, fmtAgo, savePrefs, stamp, takeContext, turns, viewOf, week } from './state'
import type { Limit } from './state'
export { viewOf, CTX_LIMIT, ctxPct, ctxTier } from './state'
export { fitCrew, lineup, SVG_BUDGET } from './crew'
export { barSvg } from './bar'
export { nightCap, DOTS_W, weekDots, clockText } from './night'
export { KEEP_TEXT, KEEP_RULE, isKeep, keepLimit } from './keep'
export type { CtxTier } from './state'
export type { Actor } from './crew'

// 引擎要求 read/update 的 atom 在本文件里声明;key 和 shape 与 state.ts 相同,是同一份状态。
const cache = atom({ plugin: 'clawd-bar', key: 'cache' } as const, null as CacheMark | null, { shape: 'cache-1' })
const calib = atom({ plugin: 'clawd-bar', key: 'calib' } as const, EMPTY_CALIB, { shape: 'calib-1' })
const ctx = atom({ plugin: 'clawd-bar', key: 'ctx' } as const, null as Ctx | null, { shape: 'ctx-2' })
const keep = atom({ plugin: 'clawd-bar', key: 'keep' } as const, KEEP_OFF, { shape: 'keep-1' })
const night = atom({ plugin: 'clawd-bar', key: 'night' } as const, NIGHT_OFF, { shape: 'night-2' })
const panel = atom({ plugin: 'clawd-bar', key: 'panel' } as const, false, { shape: 'panel-1' })
const prefs = atom({ plugin: 'clawd-bar', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-7' })

// ---------- 小动作的状态(只活在这个会话进程里,不用存) ----------
const antics = { lastUserAt: 0, lastDoneAt: 0, compacting: false, popUntil: 0, wakeUntil: 0 }
/** 压完弹回的动画演多久;到点重画一次换回原样。 */
const POP_MS = 1000
const redrawAfter = ($: EngineInterface, ms: number) => $.clock.after(ms, () => $.ui.invalidate('ui.render'))

// 输入框上方一条窄带:左边铺满一队职业 Clawd,右边是缓存倒计时进度条 + 剩余分钟。
// 主线程每次请求都会续上 prompt 缓存;闲置超过 TTL(默认 60 分钟)缓存失效,
// 下一条消息要把整段上下文重新写入缓存,额度消耗大。快到期和已过期都会提醒。

async function togglePanel($: EngineInterface) {
  await update($, panel, open => !open)
  $.ui.invalidate('ui.render')
}

/** 读到新的 5h 百分比就结算校准,并把系数存下来(跨会话保留)。 */
async function takeLimits($: EngineInterface, list: readonly Limit[]) {
  const w = weekOf(list)
  if (w) week.now = { used: w.percentUsed, resetsAt: w.resetsAt ? Date.parse(w.resetsAt) : null }
  await nightSpend($, list)
  const five = list.find(w => w.kind === 'five_hour')
  if (!five) return
  const c = await update($, calib, cur => settle(cur, five.percentUsed))
  await $.store.set('calib', { k: c.k, out: c.out, model: c.model })
}

async function measureNow($: EngineInterface) {
  try {
    const u = await $.session.usage()
    await takeContext($, u.context)
    await takeLimits($, u.rateLimits)
  } catch {
    // 读不到用量时只是不显示上下文和代价。
  }
}


const USAGE = '用法:/clawd [图鉴] | 角色 <名|自动> | 皮肤 <名|自动> | 数量 <数字|填满> | 时长 <分钟>'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('prefs')) as Partial<Prefs> | undefined
    if (saved && typeof saved === 'object') {
      const s: Partial<Prefs> = {}
      if (typeof saved.lead === 'string') s.lead = saved.lead
      if (typeof saved.skin === 'string') s.skin = saved.skin
      if (typeof saved.ttl === 'number') s.ttl = saved.ttl
      if (typeof saved.count === 'number' && saved.lead !== undefined) s.count = saved.count
      await update($, prefs, () => ({ ...DEFAULT_PREFS, ...s }))
    }
    const kept = (await $.store.get('calib')) as Partial<Calib> | undefined
    if (kept && typeof kept === 'object' && kept.k && typeof kept.k === 'object')
      await update($, calib, () => ({ ...EMPTY_CALIB, k: kept.k as Record<string, number>, out: Number(kept.out) || 0, model: typeof kept.model === 'string' ? kept.model : null }))
    await measureNow($)
    // 打瞌睡从会话打开那一刻开始算闲着多久。
    antics.lastUserAt = await $.clock.now()
    await $.command.register({ name: 'clawd', description: 'Clawd 缓存条:图鉴 / 角色 <名> / 皮肤 <名> / 数量 <n|填满> / 时长 <分钟>' })
    $.clock.every(TICK_MS, () => {
      $.ui.invalidate('ui.render')
      void checkAlerts($)
      void nightTick($)
      void keepTick($)
    })
    return next(e)
  })

  // 恢复或分叉的会话知道离开了多久;clear / compact 后缓存重新开始。
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear' || e.source === 'compact') {
      await update($, cache, () => null)
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      await stamp($, (await $.clock.now()) - e.seconds_since_last_response * 1000)
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turns.main = e.turnId
      // 只有插件刚发出去的那条 1 算续缓存;用户自己打的 1 是正常一轮。
      turns.keep = turns.keepSent && isKeep(e.text) ? e.turnId : null
      turns.keepSent = false
    }
    return next(e)
  })

  // 压缩会话:全员被横着压扁,压完弹回来。后台预先算的压缩(precompute)不演。
  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute') return next(e)
    antics.compacting = true
    $.ui.invalidate('ui.render')
    try {
      return await next(e)
    } finally {
      antics.compacting = false
      antics.popUntil = (await $.clock.now()) + POP_MS
      $.ui.invalidate('ui.render')
      redrawAfter($, POP_MS + 100)
    }
  })

  // 规矩写进对话开头的上下文:每个对话只算一次、随缓存前缀走,不多耗 token,也不打断已有会话的缓存
  // (已经开着的会话要等压缩或 /clear 后才带上)。插件自己发的 1 不经过自己的 prompt.submit 钩子,靠的就是这条。
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    return { ...r, blocks: [...r.blocks, { name: 'clawd-bar:keepalive', text: KEEP_RULE }] }
  })

  // 你一开口:正在打瞌睡的全员吓一跳醒过来。
  on('prompt.submit', async ($, e, next) => {
    if ((e as { origin?: { kind?: string } }).origin?.kind === 'composer') {
      const now = await $.clock.now()
      if (sleepersAt(now - Math.max(antics.lastUserAt, antics.lastDoneAt)) > 0) {
        antics.wakeUntil = now + WAKE_MS
        $.ui.invalidate('ui.render')
        redrawAfter($, WAKE_MS + 100)
      }
      antics.lastUserAt = now
    }
    return next(e)
  })

  // 一轮因为接口报错停下;是限额的话交给深夜模式。
  on('classic.StopFailure', async ($, e, next) => {
    const r = await next(e)
    if (e.error === 'rate_limit') await nightHit($)
    return r
  }).catch(($, e, next) => next(e))

  // 主线程的每次请求都会读写缓存,TTL 从请求开始重新计时;子代理不算。
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) await stamp($, await $.clock.now())
    yield* next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await takeContext($, e.context)
    if (e.changed.includes('rateLimits')) await takeLimits($, e.rateLimits)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // 子代理的轮次也占 5h 额度,一起记进校准;缓存计时只看主线程。
    if (e.usage) {
      const ttl = (await read($, prefs)).ttl
      const u = e.usage
      await update($, calib, c => addTurn(c, u, u.model, ttl, !e.agentId && e.turnId !== turns.keep))
    }
    await measureNow($)
    if (e.agentId) return r
    const now = await $.clock.now()
    // 续缓存那一轮不算"有动静",不然每次自动续都会把打瞌睡的叫醒。
    if (e.turnId !== turns.keep) antics.lastDoneAt = now
    const c = await read($, cache)
    if (!c || now - c.lastAt > e.durationMs) await stamp($, now)
    turns.main = null
    turns.keep = null
    if (e.reason === 'error') {
      // 有的限额打断不走 StopFailure:这一轮出错且有额度窗口用满,也按被打断处理。
      try {
        if ((await $.session.usage()).rateLimits.some(w => w.percentUsed >= 99.5)) await nightHit($)
      } catch {
        // 读不到用量就不判断。
      }
    } else if (e.reason === 'answer' && !e.isAborted) {
      await update($, night, n => (n.waitUntil ? { ...n, waitUntil: null } : n))
    }
    $.ui.invalidate('ui.render')
    return r
  })

  // ---------- /clawd ----------
  on('command.run', { command: 'clawd' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ')
    const isAuto = arg === '' || arg === '自动' || arg === 'auto' || arg === '随机'
    if (verb === '' || verb === '图鉴' || verb === 'gallery') {
      await $.ui.open({ id: PANE, title: 'Clawd 图鉴' })
      return { text: `Clawd 图鉴已打开:${COSTUMES.length} 个职业角色 + ${CLIPS.length} 段官方原版动作。` }
    }
    if (verb === '角色' || verb === 'lead') {
      if (isAuto) {
        await savePrefs($, p => ({ ...p, lead: 'auto' }))
        return { text: '不再固定领衔角色,全员轮换上场。' }
      }
      const c = costumeById(arg)
      if (!c) return { text: `没有这个角色。可选:${COSTUMES.map(x => x.name).join(' / ')} / 自动` }
      await savePrefs($, p => ({ ...p, lead: c.id }))
      return { text: `「${c.name}」固定站在进度条旁边领衔。` }
    }
    if (verb === '皮肤' || verb === 'skin') {
      if (isAuto) {
        await savePrefs($, p => ({ ...p, skin: 'auto' }))
        return { text: '皮肤恢复为各角色自己的配色。' }
      }
      const s = skinById(arg)
      if (!s || s.id === 'frost') return { text: `没有这套皮肤。可选:${SKINS.filter(x => x.id !== 'frost').map(x => x.name).join(' / ')} / 自动` }
      await savePrefs($, p => ({ ...p, skin: s.id }))
      return { text: `全员换成「${s.name}」皮肤。` }
    }
    if (verb === '数量' || verb === 'count') {
      if (arg === '填满' || arg === '0' || arg === 'fill') {
        await savePrefs($, p => ({ ...p, count: 0 }))
        return { text: '角色铺满窄条左侧。' }
      }
      const n = Number(arg)
      if (!(n >= 1 && n <= COSTUMES.length)) return { text: `数量填 1~${COSTUMES.length},或「填满」。` }
      await savePrefs($, p => ({ ...p, count: Math.round(n) }))
      return { text: `同台最多 ${Math.round(n)} 个角色。` }
    }
    if (verb === '时长' || verb === 'ttl') {
      const m = Number(arg)
      if (!(m >= 1 && m <= 240)) return { text: '缓存时长填 1~240 之间的分钟数,默认 60(超额后可能降到 5)。' }
      await savePrefs($, p => ({ ...p, ttl: Math.round(m) }))
      return { text: `缓存时长按 ${Math.round(m)} 分钟计算。` }
    }
    return { text: USAGE }
  })

  // ---------- 窄条 ----------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const p = await read($, prefs)
    const now = await $.clock.now()
    const v = viewOf(await read($, cache), now, p.ttl, e.props.isWorking)
    const columns = e.props.bodyColumns ?? 100
    const roomy = columns >= 72
    const mins = Math.ceil(v.leftMs / 60_000)

    const cx = await read($, ctx)
    const cb = await read($, calib)
    const isOpen = await read($, panel)
    const nt = await read($, night)
    const kp = await read($, keep)
    const tail = (n: number) => (columns >= n)
    const tier = cx ? ctxTier(cx.tokens) : null
    // 桌面上缓存和上下文用小字,叠在进度条下面,不左右铺开占地方。
    const cap = Svg ? ('caption' as const) : undefined
    const ctxText = cx && tier
      ? [
          <Text size={cap} key="ctx" color={tier.color} bold={tier.bold}>{` · 上下文 ${ctxPct(cx.tokens)}%`}</Text>,
          tier.hint && tail(96) ? <Text size={cap} key="ctxh" color={tier.color}>{` ${tier.hint}`}</Text> : null,
        ]
      : null
    const costOf = (cold: boolean) => (cx ? nextCost(cb, cx.tokens, cold, p.ttl) : null)
    let words
    if (v.mood === 'hello') words = [<Text size={cap} key="t" color={MUTED}>缓存 · 等待首次回复</Text>]
    else if (v.mood === 'busy') words = [<Text size={cap} key="t" color={MUTED}>缓存 </Text>, <Text size={cap} key="n" color={CLAY} bold>续期中</Text>]
    else if (v.mood === 'calm') words = [<Text size={cap} key="t" color={MUTED}>缓存 </Text>, <Text size={cap} key="n" color={CLAY} bold>{`${mins} 分钟`}</Text>]
    else if (v.mood === 'soon')
      words = [
        <Text size={cap} key="t" color={v.leftMs <= 60_000 ? RED : AMBER} bold>{v.leftMs <= 60_000 ? '缓存不足 1 分钟' : `缓存仅剩 ${mins} 分钟`}</Text>,
        (() => {
          if (kp.on) return <Text size={cap} key="h" color={CLAY}> · 即将自动续</Text>
          const c = costOf(true)
          return tail(78) ? <Text size={cap} key="h" color={MUTED}>{c !== null ? ` · 过期后下条约耗 5h ${fmtPct(c)}` : ' · 尽快发送'}</Text> : null
        })(),
      ]
    else
      words = [
        <Text size={cap} key="t" color={ICE} bold>{`缓存已过期 ${fmtAgo(-v.leftMs)}`}</Text>,
        (() => {
          const c = costOf(true)
          return c !== null
            ? <Text size={cap} key="h" color={ICE}>{` · 下条约耗 5h ${fmtPct(c)}`}</Text>
            : roomy ? <Text size={cap} key="h" color={MUTED} wrap="truncate-end"> · 下条将整段重写缓存(额度校准中)</Text> : null
        })(),
      ]
    // 快到上限时窄屏也要显示;平时窄屏省掉。
    if (v.mood !== 'hello' && ctxText && (tail(66) || (cx && cx.tokens >= CTX_LIMIT * CTX_SOON))) words.push(...ctxText)
    if (nt.mode !== 'off' && tail(60))
      words.push(
        nt.waitUntil
          ? <Text size={cap} key="night" color={MOON}>{` · ☾ 等额度 ${clockText(nt.waitUntil, now)}`}</Text>
          : <Text size={cap} key="night" color={MOON}> · ☾ 夜班中</Text>,
      )
    if (kp.on && v.mood !== 'soon' && tail(60))
      words.push(<Text size={cap} key="keep" color={CLAY}>{` · 自动续 ${kp.count}/${keepLimit(p.ttl)}`}</Text>)

    const capNow = nightCap(nt)
    const allow = capNow === null ? 0 : Math.max(0, +(capNow - nt.spent).toFixed(1))
    const wk = week.now
    const wkLeft = wk ? Math.max(0, Math.round(100 - wk.used)) : null
    // 展开开关和面板里的控件全用原生按钮(桌面版不收 Markdown 链接)。
    const toggle = (
      <Box key="more-box" flexShrink={0} marginLeft={1}>
        <Button key="more" label={isOpen ? '︿' : '☾'} onPress={() => togglePanel($)} />
      </Box>
    )
    // 展开后只有一行:关/50%/100% · 圆点条 · 剩多少 · 夜空。
    const info = []
    if (wkLeft !== null) {
      info.push(<Text key="i-k" size={cap} color={MUTED}>周额度 </Text>)
      info.push(<Text key="i-p" color={nt.mode === 'off' ? CLAY : MOON} bold>{`${wkLeft}%`}</Text>)
    }
    if (nt.mode !== 'off')
      info.push(
        <Text key="i-n" size={cap} color={MOON}>
          {(capNow !== null ? ` · 夜班最多再花 ${allow}%` : ' · 夜班中') + (nt.resumes > 0 ? ` · 已续 ${nt.resumes} 次` : '') + (nt.waitUntil ? ` · ${clockText(nt.waitUntil, now)} 继续` : '')}
        </Text>,
      )
    else if (wkLeft === null) info.push(<Text key="i-o" size={cap} color={MUTED}>额度打断后自动接着干</Text>)
    const controls = (
      <Box key="night-ctl" flexDirection="row" alignItems="center" gap="sm" flexShrink={0}>
        <Button key="keep" label={kp.on ? `续 ${kp.count}/${keepLimit(p.ttl)}` : '续'} variant={kp.on ? 'primary' : undefined} onPress={() => keepToggle($)} />
        <Text key="night-label" size={cap} color={MUTED}>  夜班</Text>
        {NIGHT_MODES.map(([m, name]) => (
          <Button key={`night-${m}`} label={name} variant={nt.mode === m ? 'primary' : undefined} onPress={() => nightSet($, m)} />
        ))}
        {Svg && wk ? <Box key="dots" flexShrink={0} marginLeft={1}><Svg source={weekDots(wk.used, allow)} alt="周额度剩余" width={DOTS_W} height={8} isInteractive /></Box> : null}
        <Box key="info" flexDirection="row" alignItems="center" flexShrink={0}>{info}</Box>
      </Box>
    )

    if (!Svg) {
      const col = v.mood === 'cold' ? ICE : v.mood === 'soon' ? AMBER : CLAY
      const line = (
        <Box key="band" flexDirection="row" paddingX={1}>
          <Box flexGrow={1} />
          <Text color={col}>{textBar(v)} </Text>
          {words}
          {toggle}
        </Box>
      )
      if (!isOpen) return line
      return (
        <Box flexDirection="column">
          {line}
          <Box key="night-panel" paddingX={1}>{controls}</Box>
        </Box>
      )
    }

    const right = (v.mood === 'cold' || v.mood === 'soon' ? RIGHT_PX + 60 : RIGHT_PX) + 50 + (nt.mode === 'off' ? 0 : nt.waitUntil ? 80 : 40)
    const sky = skyCells(columns)
    // 固定部件先算好,从总预算里扣掉,剩下的给角色。
    const barS = barSvg(v)
    const sparkS = sparkSvg()
    const skyS = isOpen ? pixelSky(sky, nt.waitUntil !== null) : ''
    const dotsLen = isOpen && wk ? weekDots(wk.used, allow).length : 0
    const fixed = barS.length + sparkS.length + skyS.length + dotsLen
    // 小动作:压缩中压扁 / 刚压完弹回,你一开口全员惊醒,闲久了从左往右一只只打瞌睡(只在缓存温热、没在干活时)。
    const x: Antics = {
      squash: antics.compacting ? 'hold' : now < antics.popUntil ? 'pop' : undefined,
      wake: now < antics.wakeUntil,
      sleepers: v.mood === 'calm' && !e.props.isWorking ? sleepersAt(now - Math.max(antics.lastUserAt, antics.lastDoneAt)) : 0,
    }
    // 先挑出能上场的,再叠小动作(打瞌睡从上场的最左边一只开始);动作换了图,按预算再复核一遍,超了从左边少站一只。
    const crew = applyAntics(fitCrew(lineup(v, p, now, p.count > 0 ? p.count : COSTUMES.length), columns, right, a => actorSvg(a).length, SVG_BUDGET - fixed), x)
    while (crew.length > 1 && crew.reduce((n, a) => n + actorSvg(a).length, 0) > SVG_BUDGET - fixed) crew.shift()
    const row = (
      <Box key="band" flexDirection="row" alignItems="flex-end" paddingX={1}>
        <Box key="stage" flexGrow={1} flexShrink={1} flexDirection="row" justifyContent="space-evenly" alignItems="flex-end" overflow="hidden">
          {crew.map((a, i) => (
            <Box key={`a-${i}-${a.costume.id}`} flexShrink={0}>
              <Svg
                source={actorSvg(a)}
                alt={`Clawd · ${a.costume.name}`}
                width={showW(a.costume)}
                height={SHOW_H}
                isInteractive
              />
            </Box>
          ))}
        </Box>
        <Box key="meter" flexShrink={0} flexDirection="column" alignItems="center" marginLeft={1}>
          <Svg key="bar" source={barS} alt="缓存剩余进度" width={BAR_SVG_W} height={BAR_H} isInteractive />
          <Box key="meter-t" flexDirection="row">{words}</Box>
        </Box>
        {/* 星芒和月亮按钮放一起垂直居中,两者中线对齐。 */}
        <Box key="end" flexShrink={0} flexDirection="row" alignItems="center" marginLeft={2}>
          <Svg key="spark-svg" source={sparkS} alt="Claude" width={SPARK_PX} height={SPARK_PX} isInteractive />
          {toggle}
        </Box>
      </Box>
    )
    if (!isOpen) return row
    // 展开:左边夜班三档 + 周额度,右边像素夜景。
    return (
      <Box flexDirection="column">
        {row}
        <Box key="night-panel" flexDirection="row" alignItems="center" paddingX={1} marginTop="xs" gap="sm">
          {controls}
          <Box key="sky-gap" flexGrow={1} />
          <Box key="sky-box" flexShrink={1} flexDirection="row" justifyContent="flex-end" overflow="hidden">
            <Svg key="sky" source={skyS} alt="深夜模式" width={sky * SKY_CELL_W} height={SKY_PX_H} isInteractive />
          </Box>
        </Box>
      </Box>
    )
  })

  // ---------- 图鉴 ----------
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const p = await read($, prefs)
    const fixed = p.skin !== 'auto' ? skinById(p.skin) : undefined
    const BIG = 3

    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>领衔角色 <Text color={MUTED}>(固定站在进度条旁边)</Text></Text>
        <Box flexDirection="row" flexWrap="wrap">
          <Button key="lead-auto" label="轮换" variant={p.lead === 'auto' ? 'primary' : undefined} onPress={() => savePrefs($, q => ({ ...q, lead: 'auto' }))} />
          {COSTUMES.map(c => (
            <Button key={`lead-${c.id}`} label={c.name} variant={p.lead === c.id ? 'primary' : undefined} onPress={() => savePrefs($, q => ({ ...q, lead: c.id }))} />
          ))}
        </Box>
        <Text> </Text>
        <Text bold>皮肤 <Text color={MUTED}>(自动 = 各角色自己的配色)</Text></Text>
        <Box flexDirection="row" flexWrap="wrap">
          <Button key="skin-auto" label="自动" variant={p.skin === 'auto' ? 'primary' : undefined} onPress={() => savePrefs($, q => ({ ...q, skin: 'auto' }))} />
          {SKINS.filter(s => s.id !== 'frost').map(s => (
            <Button key={`skin-${s.id}`} label={s.name} variant={p.skin === s.id ? 'primary' : undefined} onPress={() => savePrefs($, q => ({ ...q, skin: s.id }))} />
          ))}
        </Box>
        <Text> </Text>
        <Text bold>同台数量</Text>
        <Box flexDirection="row" flexWrap="wrap">
          {[0, 3, 5, 8, 12].map(n => (
            <Button key={`count-${n}`} label={n === 0 ? '填满' : `${n} 个`} variant={p.count === n ? 'primary' : undefined} onPress={() => savePrefs($, q => ({ ...q, count: n }))} />
          ))}
        </Box>
        <Text> </Text>
        {Svg ? (
          <Box flexDirection="column">
            <Text bold>职业角色 · {COSTUMES.length}</Text>
            <Box flexDirection="row" flexWrap="wrap">
              {COSTUMES.map(c => {
                const w = c.w ?? TILE_W
                return (
                  <Box key={`g-${c.id}`} flexDirection="column" alignItems="center" marginRight={2} marginBottom={1}>
                    <Svg source={drawSvg(c.clip, fixed ?? skinById(c.skin ?? 'clay') ?? SKINS[0], { costume: c, box: { w, h: TILE_H } })} alt={`Clawd · ${c.name}`} width={w * BIG} height={TILE_H * BIG} isInteractive />
                    <Text>{c.name}</Text>
                  </Box>
                )
              })}
              <Box key="g-frost" flexDirection="column" alignItems="center" marginRight={2} marginBottom={1}>
                <Svg source={drawSvg(COSTUMES[0].clip, FROST, { costume: COSTUMES[0], box: { w: COSTUMES[0].w ?? TILE_W, h: TILE_H }, frozen: true, snow: true })} alt="Clawd · 过期冻住" width={(COSTUMES[0].w ?? TILE_W) * BIG} height={TILE_H * BIG} isInteractive />
                <Text color={ICE}>缓存过期 · 冻住</Text>
              </Box>
            </Box>
            <Text> </Text>
            <Text bold>官方原版动作 · {CLIPS.length}</Text>
            <Box flexDirection="row" flexWrap="wrap">
              {CLIPS.map(c => (
                <Box key={`o-${c.id}`} flexDirection="column" alignItems="center" marginRight={2} marginBottom={1}>
                  <Svg source={drawSvg(c.id, SKINS[0], { box: { w: 40, h: 34 } })} alt={`Clawd · ${c.name}`} width={80} height={68} isInteractive />
                  <Text color={MUTED}>{c.name}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Text color={MUTED}>终端里看不到动画,去桌面版打开图鉴。</Text>
        )}
      </Box>
    )
  })
}
