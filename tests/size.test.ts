import { expect, mock, test } from 'claude-code/testing'

import { SVG_BUDGET } from '../hooks/register'

const NOW = Date.parse('2098-12-31T22:00:00Z')

// 桌面版对一次绘制的 Svg 总量有上限，超了整条窄条不画(不报错，还会熔断)。
// 整条(角色 + 进度条 + 星芒 + 展开面板的圆点条和夜景)都要压在 SVG_BUDGET 以内，宽屏、展开也一样。
test('整条窄条所有 Svg 加起来不超过 SVG_BUDGET(宽屏、展开面板也一样)', async ($: any, on: any) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('classic.SessionStart', () => ({}))
  on('ui.toast', () => ({ value: undefined }))
  const week = [{ kind: 'seven_day', percentUsed: 30, resetsAt: new Date(NOW + 3 * 86400_000).toISOString() }]
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: week } }))
  on('session.measure', (_: unknown, e: any) => e)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600 })
  await $.session.measure({ changed: ['rateLimits'], context: { window: 1000000 }, rateLimits: week })
  const props = (cols: number) => ({ hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: cols, scroll: { offset: 0, bodyRows: 12 }, view: {} })
  const mount = (cols: number) => $.ui.mount({ plugin: 'clawd-bar', surface: 'desktop', component: 'AbovePrompt', props: props(cols) })
  for (const open of [false, true]) {
    if (open) {
      const b = await mount(100)
      await b.press({ key: 'more' })
      await b.unmount()
    }
    for (const cols of [100, 160, 260]) {
      const band = await mount(cols)
      const svgs = await band.findAll({ type: 'Svg' })
      const total = svgs.reduce((n: number, s: any) => n + String(s.props.source).length, 0)
      console.log(`@@SIZE@@ open=${open} cols=${cols} svgs=${svgs.length} total=${total}`)
      expect(total <= SVG_BUDGET).toBe(true)
      await band.unmount()
    }
  }
})
