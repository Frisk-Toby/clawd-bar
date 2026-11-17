import { expect, mock, test } from 'claude-code/testing'

import { CLIPS, FROST, SKINS, TILE_H, TILE_W, drawSvg } from '../hooks/clawd'
import { COSTUMES, PANIC } from '../hooks/costumes'
import { EMPTY_CALIB, addTurn, nextCost, settle } from '../hooks/cost'
import * as REG from '../hooks/register'
import * as CREW from '../hooks/crew'

const NOW = Date.parse('2098-12-31T22:00:00Z')
const PROPS = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const

let limits: any[] = []
const boot = async ($: any, on: any, idleSec: number | null) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: limits } }))
  on('session.measure', (_: unknown, e: any) => e)
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
  if (idleSec !== null) await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleSec })
}

const mount = ($: any, props: object = PROPS, surface = 'desktop') =>
  $.ui.mount({ plugin: 'clawd-bar', surface, component: 'AbovePrompt', props })
const texts = async (band: any) => (await band.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
const svgs = async (band: any) => (await band.findAll({ type: 'Svg' })).filter((s: any) => s.props.alt !== 'Claude' && s.props.alt !== '深夜模式')

test('还没有回复时:等待首次回复', async ($, on) => {
  await boot($, on, null)
  const band = await mount($)
  expect(await texts(band)).toContain('等待首次回复')
  await band.unmount()
})

test('缓存温热:一排各不相同的职业角色铺满左侧,最右是进度条', async ($, on) => {
  await boot($, on, 18 * 60)
  const band = await mount($)
  expect(await texts(band)).toContain('42 分钟')
  const alts = (await svgs(band)).map((s: any) => s.props.alt)
  expect(alts[alts.length - 1]).toBe('缓存剩余进度')
  const actors = alts.slice(0, -1)
  expect(actors.length >= 6).toBe(true)
  expect(new Set(actors).size).toBe(actors.length)
  await band.unmount()
})

test('窄条只放完整角色:宽度按角色实际宽度累加,不超出可用空间', async ($, on) => {
  await boot($, on, 18 * 60)
  for (const cols of [60, 100, 160]) {
    const band = await mount($, { ...PROPS, bodyColumns: cols })
    const actors = (await svgs(band)).slice(0, -1)
    const used = actors.reduce((s: number, a: any) => s + a.props.width, 0)
    expect(actors.length >= 1).toBe(true)
    if (actors.length > 1) expect(used <= cols * 8.2 - 270).toBe(true)
    expect(actors.every((a: any) => a.props.height === 36)).toBe(true)
    await band.unmount()
  }
})

test('窄屏少站几个', async ($, on) => {
  await boot($, on, 18 * 60)
  const wide = await mount($)
  const slim = await mount($, { ...PROPS, bodyColumns: 50 })
  expect((await svgs(slim)).length < (await svgs(wide)).length).toBe(true)
  await wide.unmount()
  await slim.unmount()
})

test('快过期:仅剩几分钟并提醒尽快发送', async ($, on) => {
  await boot($, on, 57 * 60)
  const band = await mount($)
  const t = await texts(band)
  expect(t).toContain('缓存仅剩 3 分钟')
  expect(t).toContain('尽快发送')
  await band.unmount()
})

test('已过期:全员冻成冰蓝,提示下一条会重写缓存', async ($, on) => {
  await boot($, on, 2 * 3600)
  const band = await mount($)
  const t = await texts(band)
  expect(t).toContain('缓存已过期 1 小时')
  expect(t).toContain('重写缓存')
  const first = (await svgs(band))[0]
  expect(first.props.source).toContain(FROST.body)
  await band.unmount()
})

test('终端:纯文字进度条', async ($, on) => {
  await boot($, on, 30 * 60)
  const band = await mount($, PROPS, 'terminal')
  const t = await texts(band)
  expect(t).toContain('▰▰▰▰▰▱▱▱▱▱')
  expect(t).toContain('30 分钟')
  expect((await svgs(band)).length).toBe(0)
  await band.unmount()
})

test('/clawd 数量 3 和 角色 侦探', async ($, on) => {
  await boot($, on, 10 * 60)
  await $.command.run({ command: 'clawd', args: '数量 3' })
  const r = await $.command.run({ command: 'clawd', args: '角色 侦探' })
  expect(JSON.stringify(r)).toContain('侦探')
  const band = await mount($)
  const alts = (await svgs(band)).map((s: any) => s.props.alt)
  expect(alts.length).toBe(4)
  expect(alts[2]).toBe('Clawd · 侦探')
  await band.unmount()
})

test('每个角色的每种状态 SVG 都在 131072 字符以内', () => {
  let biggest = 0
  for (const c of COSTUMES) {
    const box = { w: c.w ?? TILE_W, h: TILE_H }
    for (const clip of [c.clip, ...PANIC]) {
      const s = drawSvg(clip, SKINS[0], { costume: c, box }).length
      expect(s > 200).toBe(true)
      biggest = Math.max(biggest, s)
    }
    biggest = Math.max(biggest, drawSvg(c.clip, FROST, { costume: c, box, frozen: true, snow: true }).length)
  }
  for (const c of CLIPS) biggest = Math.max(biggest, drawSvg(c.id, SKINS[0], { box: { w: 40, h: 34 } }).length)
  expect(biggest < 131072).toBe(true)
})

test('额度校准:5h 涨了就算出系数,过期的下一条比温热贵得多', () => {
  let c = settle(EMPTY_CALIB, 10)
  const u = { input_tokens: 2000, output_tokens: 3000, cache_read_input_tokens: 200000, cache_creation_input_tokens: 5000 }
  c = addTurn(c, u, 'claude-opus-5-5', 60, true)
  c = addTurn(c, u, 'claude-opus-5-5', 60, false)
  c = settle(c, 12)
  expect(c.k['claude-opus-5-5'] > 0).toBe(true)
  const cold = nextCost(c, 300000, true, 60)!
  const warm = nextCost(c, 300000, false, 60)!
  expect(cold > warm * 3).toBe(true)
  expect(settle(c, 3).pending).toEqual({})
})

test('上下文占用和过期代价显示在右侧', async ($, on) => {
  await boot($, on, 2 * 3600)
  await $.session.measure({ changed: ['context'], context: { tokens: 620000, window: 1000000, percent: 62 }, rateLimits: [] })
  const band = await mount($, { ...PROPS, bodyColumns: 140 })
  const t = await texts(band)
  expect(t).toContain('上下文 93%')
  expect(t).toContain('快到上限')
  expect(t).toContain('缓存已过期')
  await band.unmount()
})

test('上下文只看 670K 一道上限:按 670K 算百分比,90% 起提醒', () => {
  const { ctxTier, ctxPct } = REG
  expect(ctxPct(335_000)).toBe(50)
  expect(ctxTier(400_000).hint).toBe('')
  expect(ctxTier(620_000).hint).toBe('快到上限')
  expect(ctxTier(700_000).hint).toContain('请换会话')
  expect(ctxTier(700_000).bold).toBe(true)
})


test('☾ 展开夜班面板:一行 = 夜空 + 关/50%/100% + 周额度圆点条,全是原生按钮', async ($, on) => {
  await boot($, on, 10 * 60)
  limits = [{ kind: 'seven_day', percentUsed: 30, resetsAt: new Date(NOW + 3 * 86400_000).toISOString() }]
  await $.session.measure({ changed: ['rateLimits'], context: { window: 1000000 }, rateLimits: [{ kind: 'seven_day', percentUsed: 30, resetsAt: new Date(NOW + 3 * 86400_000).toISOString() }] })
  let band = await mount($)
  expect(await band.find({ key: 'night-panel' })).toBeUndefined()
  await band.press({ key: 'more' })
  await band.unmount()
  band = await mount($)
  expect((await band.find({ key: 'more' }))?.props.label).toBe('︿')
  expect((await band.find({ key: 'night-normal' }))?.props.label).toBe('50%')
  expect((await band.find({ key: 'night-off' }))?.props.variant).toBe('primary')
  expect(await texts(band)).toContain('周额度 70%')
  await band.press({ key: 'night-normal' })
  await band.unmount()
  band = await mount($)
  expect((await band.find({ key: 'night-normal' }))?.props.variant).toBe('primary')
  expect(await texts(band)).toContain('夜班最多再花 35%')
  const dots = (await band.findAll({ type: 'Svg' })).filter((s: any) => s.props.alt === '周额度剩余')
  expect(dots.length).toBe(1)
  expect((await band.findAll({ type: 'Markdown' })).length).toBe(0)
  await band.unmount()
  limits = []
})

test('夜班圆点条:还剩的实心,用掉的变小点,允许花的那段换月光色', () => {
  const svg = REG.weekDots(30, 35)
  expect((svg.match(/r="2"/g) ?? []).length).toBe(14)
  expect((svg.match(/r=".8"/g) ?? []).length).toBe(6)
  expect((svg.match(/#e8d9b0/g) ?? []).length).toBe(7)
  expect(REG.nightCap({ mode: 'normal', base: 70, spent: 0, lastWeek: 30, waitUntil: null, resumes: 0 })).toBe(35)
  expect(REG.nightCap({ mode: 'free', base: 70, spent: 0, lastWeek: 30, waitUntil: null, resumes: 0 })).toBe(70)
})

test('续:按下开启并提示模式;缓存剩 5 分钟以插件名义自动发 1,同一段缓存只发一次', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const toasts: string[] = []
  const sent: any[] = []
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('session.measure', (_: unknown, e: any) => e)
  on('ui.toast', (_: unknown, e: any) => { toasts.push(JSON.stringify(e)); return { value: undefined } })
  on('prompt.submit', (_: unknown, e: any) => { sent.push(e); return { text: e.text, context: e.context } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 50 * 60 })
  let band = await mount($)
  await band.press({ key: 'more' })
  await band.unmount()
  band = await mount($)
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('续')
  await band.press({ key: 'keep' })
  await band.unmount()
  expect(toasts.some(t => t.includes('已开') && t.includes('发 1'))).toBe(true)
  band = await mount($)
  expect((await band.find({ key: 'keep' }))?.props.variant).toBe('primary')
  expect(await texts(band)).toContain('自动续')
  await band.unmount()
  await clock.advance(6 * 60_000)
  const keeps = sent.filter(s => s.text === '1')
  expect(keeps.length).toBe(1)
  // 以插件名义发(不是 asUser),模型才分得清这不是用户回答"选 1";说明靠对话开头的 prompt.context 规矩。
  expect(keeps[0].origin?.kind).toBe('plugin')
  expect(keeps[0].origin?.asUser).toBeUndefined()
  await clock.advance(60_000)
  expect(sent.filter(s => s.text === '1').length).toBe(1)
  expect(toasts.some(t => t.includes('第 1/8 次'))).toBe(true)
})

test('用户自己打的 1 是正常消息,不附任何说明', async ($, on) => {
  const seen: any[] = []
  on('prompt.submit', (_: unknown, e: any) => { seen.push(e); return { text: e.text } })
  await $.prompt.submit({ text: '1' })
  expect(seen[0].context).toBeUndefined()
  expect(REG.isKeep(' 1 ')).toBe(true)
})

test('对话开头的上下文带上保活规矩:只认插件发的 1', async ($, on) => {
  on('prompt.context', (_: unknown, e: any) => ({ blocks: e.blocks }))
  const r: any = await $.prompt.context({ blocks: [] })
  expect(r.blocks.some((b: any) => b.name === 'clawd-bar:keepalive' && b.text.includes('clawd-bar plugin sent a message') && b.text.includes('用户本人打的'))).toBe(true)
})

test('续的上限:60 分钟 TTL 最多 8 次、5 分钟 TTL 最多 6 次;续满自动关,重新开从头计', async ($, on) => {
  expect(REG.keepLimit(60)).toBe(8)
  expect(REG.keepLimit(5)).toBe(6)
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const toasts: string[] = []
  const sent: any[] = []
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('session.measure', (_: unknown, e: any) => e)
  on('ui.toast', (_: unknown, e: any) => { toasts.push(JSON.stringify(e)); return { value: undefined } })
  on('prompt.submit', (_: unknown, e: any) => { sent.push(e); return { text: e.text } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 50 * 60 })
  let band = await mount($)
  await band.press({ key: 'more' })
  await band.unmount()
  band = await mount($)
  await band.press({ key: 'keep' })
  await band.unmount()
  // 每轮:把缓存起点挪到 56 分钟前(剩 4 分钟),等一个节拍,看它续不续。
  for (let i = 0; i < 9; i++) {
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 56 * 60 })
    await clock.advance(20_000)
  }
  expect(sent.filter(s => s.text === '1').length).toBe(8)
  expect(toasts.some(t => t.includes('已续满 8 次'))).toBe(true)
  band = await mount($)
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('续')
  await band.press({ key: 'keep' })
  await band.unmount()
  band = await mount($)
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('续 0/8')
  await band.unmount()
})

test('小动作规则:闲 10 分钟起一只只睡着;压扁 > 惊醒 > 打瞌睡;冻住的不受影响', () => {
  const { sleepersAt, applyAntics } = CREW
  expect(sleepersAt(9 * 60_000)).toBe(0)
  expect(sleepersAt(10 * 60_000)).toBe(1)
  expect(sleepersAt(13 * 60_000)).toBe(3)
  const a = { costume: COSTUMES[0], clip: 'Walking', skin: SKINS[0], frozen: false }
  const crew = [a, { ...a }, { ...a }]
  expect(applyAntics(crew, { wake: false, sleepers: 2 }).map((x: any) => !!x.sleep)).toEqual([true, true, false])
  expect(applyAntics(crew, { wake: true, sleepers: 2 }).every((x: any) => x.alarm && x.clip === 'Excited')).toBe(true)
  expect(applyAntics(crew, { squash: 'hold', wake: true, sleepers: 2 }).every((x: any) => x.squash === 'hold' && !x.alarm)).toBe(true)
  expect(applyAntics([{ ...a, frozen: true }], { squash: 'hold', wake: false, sleepers: 1 })[0].squash).toBeUndefined()
})

test('画出来的样子:压扁/弹回、小 z、感叹号、连点 5 层透明板和晕倒转圈', () => {
  const c = COSTUMES[0]
  const box = { w: c.w ?? TILE_W, h: TILE_H }
  expect(drawSvg('Walking', SKINS[0], { costume: c, box, squash: 'hold' })).toContain('scale(1.3 .55)')
  expect(drawSvg('Walking', SKINS[0], { costume: c, box, squash: 'pop' })).toContain('fill="freeze"')
  expect(drawSvg('Meditating', SKINS[0], { costume: c, box, sleep: true })).toContain('#cfd8ff')
  expect(drawSvg('Excited', SKINS[0], { costume: c, box, alarm: true })).toContain('#e9a23b')
  const tap = drawSvg('Walking', SKINS[0], { costume: c, box, greet: 'Waving' })
  for (const k of [1, 2, 3, 4, 5]) expect(tap).toContain(`id="o${k}"`)
  expect(tap).toContain('begin="o5.click"')
  expect(tap).toContain('values="0;720"')
})

test('闲久了队员一只只打瞌睡(头顶冒 z)', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
  await clock.advance(13 * 60_000)
  // 缓存还热(5 分钟前刚回过)。
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 5 * 60 })
  const band = await mount($)
  const zs = (await svgs(band)).filter((s: any) => String(s.props.source).includes('#cfd8ff'))
  expect(zs.length).toBe(3)
  await band.unmount()
})
