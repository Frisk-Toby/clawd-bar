// Clawd 像素引擎:解码官方精灵表,逐帧找出头顶、手臂、眼睛,
// 让职业服装和道具贴着身体一起动,再画成自带 SMIL 动画的 SVG。不跑脚本、不调模型。

import { SPRITES } from './sprites'

export type RawSprite = { w: number; h: number; palette: string[]; base: string; deltas: string[]; a0: number[] }
type Sprite = { w: number; h: number; palette: string[]; frames: Uint8Array[]; ax: number; ay: number }

const EMPTY = 255
const idx = (c: string) => (c === '.' ? EMPTY : parseInt(c, 36))

const decode = (raw: RawSprite): Sprite => {
  let f = Uint8Array.from(raw.base, idx)
  const frames = [f]
  for (const delta of raw.deltas) {
    f = f.slice()
    for (const ch of delta.split(',')) if (ch.length >= 2) f[parseInt(ch.slice(0, -1), 36)] = idx(ch.slice(-1))
    frames.push(f)
  }
  const [left, top, width, height] = raw.a0
  return { w: raw.w, h: raw.h, palette: raw.palette, frames, ax: left + Math.floor(width / 2), ay: top + height }
}

const sheet = new Map<string, Sprite>()
const sprite = (name: string): Sprite | undefined => {
  if (!sheet.has(name) && SPRITES[name]) sheet.set(name, decode(SPRITES[name]))
  return sheet.get(name)
}

// ---------- 官方动作 ----------
export type Mood = 'calm' | 'busy' | 'soon' | 'cold' | 'hello'
export type Clip = { id: string; name: string; tall?: boolean; slow?: number }

/** 18 段官方动作。tall 的会冒出头顶(灯泡、跳起),只在图鉴里放大看。 */
export const CLIPS: Clip[] = [
  { id: 'Walking', name: '散步' },
  { id: 'Swaying', name: '摇摆' },
  { id: 'LookingAround', name: '张望' },
  { id: 'LookingAroundEyesOnly', name: '转眼珠' },
  { id: 'Turning', name: '转身' },
  { id: 'Waving', name: '挥手' },
  { id: 'Excited', name: '兴奋' },
  { id: 'DancingHappy', name: '跳舞' },
  { id: 'Meditating', name: '打坐', slow: 2 },
  { id: 'Laptop', name: '敲电脑' },
  { id: 'Desktop', name: '写代码' },
  { id: 'Pointing', name: '指路' },
  { id: 'Dizzy', name: '头晕' },
  { id: 'Facepalm', name: '捂脸' },
  { id: 'JumpingHappy', name: '蹦跳', tall: true },
  { id: 'Thinking', name: '思考', tall: true },
  { id: 'Lightbulb', name: '灵光一闪', tall: true },
  { id: 'Spark', name: '火花', tall: true },
]
export const clipById = (q: string): Clip | undefined =>
  CLIPS.find(c => c.id.toLowerCase() === q.toLowerCase() || c.name === q)

// ---------- 皮肤 ----------
export type Skin = { id: string; name: string; body: string; shade: string; eye: string }

/** 官方三色:身体 #d97757、阴影 #be684d、眼睛 #141413;皮肤只替换这三色,道具保持原样。 */
export const SKINS: Skin[] = [
  { id: 'clay', name: '原色', body: '#d97757', shade: '#be684d', eye: '#141413' },
  { id: 'peach', name: '蜜桃', body: '#f2a07b', shade: '#d9845f', eye: '#2a1a14' },
  { id: 'sakura', name: '樱粉', body: '#eaa3b8', shade: '#cf8299', eye: '#2b1820' },
  { id: 'mint', name: '薄荷', body: '#7fc8a9', shade: '#5fa98b', eye: '#10231b' },
  { id: 'gold', name: '鎏金', body: '#e7b64f', shade: '#c4923a', eye: '#22180a' },
  { id: 'lilac', name: '紫藤', body: '#b39ae6', shade: '#9479cc', eye: '#1b1430' },
  { id: 'cream', name: '奶油', body: '#efe6d2', shade: '#d3c7ad', eye: '#2a2620' },
  { id: 'ink', name: '墨', body: '#4a4540', shade: '#38342f', eye: '#f2c46d' },
  { id: 'ghost', name: '幽灵', body: '#e9eef5cc', shade: '#c9d3e0cc', eye: '#3a4660' },
  { id: 'indigo', name: '夜蓝', body: '#5a6fae', shade: '#465a94', eye: '#ffe08a' },
  { id: 'frost', name: '霜冻', body: '#9cc7e4', shade: '#79a7c9', eye: '#13283a' },
]
export const FROST = SKINS.find(s => s.id === 'frost')!
export const skinById = (q: string): Skin | undefined =>
  SKINS.find(s => s.id === q.toLowerCase() || s.name === q)

const BODY = new Set(['#d97757', '#d87656'])
const SHADE = new Set(['#be684d'])
const EYE = new Set(['#141413', '#000000'])
const recolor = (c: string, s: Skin) => {
  const k = c.toLowerCase()
  return BODY.has(k) ? s.body : SHADE.has(k) ? s.shade : EYE.has(k) ? s.eye : c
}

// ---------- 逐帧锚点 ----------
export type Box4 = { x0: number; y0: number; x1: number; y1: number }
/**
 * 一帧里身体的关键位置(画布坐标):头顶行 t、头顶左右 xL..xR、中心 cx,
 * 身体包围盒,左右手(最外侧身体像素),两只眼睛的包围盒(左眼在前)。
 */
export type Anchor = {
  t: number; xL: number; xR: number; cx: number
  xmin: number; xmax: number; ymax: number
  armL: { x: number; y: number }; armR: { x: number; y: number }
  eyes: Box4[]
}

const anchorOf = (sp: Sprite, f: Uint8Array, dx: number, dy: number): Anchor => {
  const isBody = sp.palette.map(c => BODY.has(c.toLowerCase()) || SHADE.has(c.toLowerCase()))
  const isEye = sp.palette.map(c => EYE.has(c.toLowerCase()))
  let t = 99, xmin = 99, xmax = -1, ymax = -1
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++) {
      const c = f[y * sp.w + x]
      if (c === EMPTY || !isBody[c]) continue
      if (y < t) t = y
      if (x < xmin) xmin = x
      if (x > xmax) xmax = x
      if (y > ymax) ymax = y
    }
  if (t === 99) return { t: dy, xL: dx, xR: dx + 15, cx: dx + 8, xmin: dx, xmax: dx + 23, ymax: dy + 15, armL: { x: dx, y: dy + 8 }, armR: { x: dx + 23, y: dy + 8 }, eyes: [] }
  // 头顶:最上面一行"够宽"的身体(连续 ≥13 像素),举起来的手不算(挥手时横着的手臂有 11 像素宽)。
  let xL = 99, xR = -1
  for (let y = t; y < sp.h && xR < 0; y++) {
    let x = 0
    while (x < sp.w) {
      const c = f[y * sp.w + x]
      if (c === EMPTY || !isBody[c]) { x++; continue }
      let n = 1
      while (x + n < sp.w && f[y * sp.w + x + n] !== EMPTY && isBody[f[y * sp.w + x + n]]) n++
      if (n >= 13 && n > xR - xL + 1) { xL = x; xR = x + n - 1; t = y }
      x += n
    }
  }
  if (xR < 0) {
    xL = 99
    for (let x = 0; x < sp.w; x++) {
      const c = f[t * sp.w + x]
      if (c !== EMPTY && isBody[c]) { xL = Math.min(xL, x); xR = Math.max(xR, x) }
    }
  }
  const firstY = (col: number) => {
    for (let y = 0; y < sp.h; y++) {
      const c = f[y * sp.w + col]
      if (c !== EMPTY && isBody[c]) return y
    }
    return t + 8
  }
  const cx = (xL + xR + 1) / 2
  // 眼睛:头部范围(头顶往下 8 行)里的眼色像素,按中线分左右。
  const eyes: Box4[] = []
  for (const side of [0, 1]) {
    let b: Box4 | null = null
    for (let y = t; y < Math.min(sp.h, t + 8); y++)
      for (let x = xL; x <= xR; x++) {
        const c = f[y * sp.w + x]
        if (c === EMPTY || !isEye[c]) continue
        if ((x < cx ? 0 : 1) !== side) continue
        b = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y }
      }
    if (b) eyes.push({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy })
  }
  return {
    t: t + dy, xL: xL + dx, xR: xR + dx, cx: cx + dx,
    xmin: xmin + dx, xmax: xmax + dx, ymax: ymax + dy,
    armL: { x: xmin + dx, y: firstY(xmin) + dy },
    armR: { x: xmax + dx, y: firstY(xmax) + dy },
    eyes,
  }
}

// ---------- 画笔 ----------
/** 按颜色收集像素色段的画笔;art() 吃字符网格,'.' 是透明。 */
/**
 * 一组矩形 -> 一条 path 的 d:先按坐标排序，第一块用绝对 M,之后都用相对 m(z 之后当前点回到这块的起点),
 * 数字短得多。整条窄条所有 Svg 加起来超过桌面版的上限(约 0.5M 字符)时整条不画，所以要省。
 */
export const rectsD = (rs: [number, number, number, number][]): string => {
  rs.sort((p, q) => p[1] - q[1] || p[0] - q[0])
  let d = ''
  let px = 0
  let py = 0
  const n = (v: number) => (Number.isInteger(v) ? v : +v.toFixed(2))
  rs.forEach(([x, y, w, h], i) => {
    d += i === 0 ? `M${n(x)} ${n(y)}` : `m${n(x - px)} ${n(y - py)}`
    d += `h${n(w)}v${n(h)}h-${n(w)}z`
    px = x
    py = y
  })
  return d
}

/** 逐行的横段(x, y, 宽)合并成矩形:同一列起点、同宽、上下紧挨的段并成一块。 */
const mergeRuns = (runs: [number, number, number][]): [number, number, number, number][] => {
  const open = new Map<string, [number, number, number, number]>()
  const out: [number, number, number, number][] = []
  runs.sort((p, q) => p[1] - q[1] || p[0] - q[0])
  for (const [x, y, w] of runs) {
    const k = `${x},${w}`
    const r = open.get(k)
    if (r && r[1] + r[3] === y) r[3]++
    else {
      const nr: [number, number, number, number] = [x, y, w, 1]
      open.set(k, nr)
      out.push(nr)
    }
  }
  return out
}

export class Ink {
  private m = new Map<string, [number, number, number, number][]>()
  private extra = ''
  rect(x: number, y: number, w: number, h: number, c: string) {
    if (w <= 0 || h <= 0) return
    const list = this.m.get(c)
    if (list) list.push([x, y, w, h])
    else this.m.set(c, [[x, y, w, h]])
  }
  art(grid: string[], pal: Record<string, string>, x0: number, y0: number) {
    grid.forEach((row, j) => {
      let i = 0
      while (i < row.length) {
        const ch = row[i]
        if (ch === '.' || ch === ' ' || !pal[ch]) { i++; continue }
        let n = 1
        while (i + n < row.length && row[i + n] === ch) n++
        this.rect(x0 + i, y0 + j, n, 1, pal[ch])
        i += n
      }
    })
  }
  /** 头顶戴的东西:网格最后一行压在头顶行上(dy 再往下挪)。 */
  hat(grid: string[], pal: Record<string, string>, a: Anchor, dy = 0, dx = 0) {
    this.art(grid, pal, Math.round(a.cx - grid[0].length / 2) + dx, a.t - (grid.length - 1) + dy)
  }
  /** 原样插一段 SVG(圆、椭圆这类非像素的东西)。 */
  raw(s: string) { this.extra += s }
  svg(): string {
    let out = ''
    for (const [c, rs] of this.m) out += `<path fill="${c}" d="${rectsD(rs)}"/>`
    return out + this.extra
  }
}

// ---------- 角色 ----------
export type Fx = { under?: string; over?: string }
export type Costume = {
  id: string
  name: string
  /** 平时的动作。 */
  clip: string
  skin?: string
  /** 画布宽度,道具多的角色更宽。 */
  w?: number
  /** 整体上下浮动(飞行、太空)。 */
  bob?: boolean
  /** 每帧调用:back 画在身体后面,front 画在身体前面;k 是第几段帧。 */
  dress?: (a: Anchor, k: number, back: Ink, front: Ink) => void
  /** 以第一帧锚点定位的场景特效:under 在最底层,over 在最上层。 */
  fx?: (a: Anchor, W: number, H: number) => Fx
}

// ---------- 画 SVG ----------
const FPS = 12
/** 角色画布高度:身体 16 行,头顶留 12 行给帽子,脚下留 1 行。 */
export const TILE_H = 29
export const TILE_W = 44
/** 脚底中心的 x:偏左,右边留地方拿道具。 */
const FOOT_X = 17

const framePaths = (sp: Sprite, f: Uint8Array, dx: number, dy: number, skin: Skin): string => {
  const runs = new Map<number, [number, number, number][]>()
  for (let y = 0; y < sp.h; y++) {
    let x = 0
    while (x < sp.w) {
      const c = f[y * sp.w + x]
      if (c === EMPTY) { x++; continue }
      let n = 1
      while (x + n < sp.w && f[y * sp.w + x + n] === c) n++
      const list = runs.get(c)
      if (list) list.push([x + dx, y + dy, n])
      else runs.set(c, [[x + dx, y + dy, n]])
      x += n
    }
  }
  let out = ''
  for (const [c, rs] of runs) out += `<path fill="${recolor(sp.palette[c], skin)}" d="${rectsD(mergeRuns(rs))}"/>`
  return out
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

/** 雪花:冷掉时从头顶飘下的几粒像素。 */
export const snow = (w: number, h: number): string =>
  [[6, 0, 2.6], [15, 3, 3.4], [27, 1, 2.9], [34, 5, 3.8], [21, 6, 3.1]]
    .filter(([x]) => x < w)
    .map(([x, d, t]) =>
      `<rect x="${x}" y="-2" width="1" height="1" fill="#e6f4ff" opacity=".9">` +
      `<animate attributeName="y" values="-2;${h}" dur="${t}s" begin="-${d * 0.4}s" repeatCount="indefinite"/>` +
      `<animate attributeName="x" values="${x};${x + 1};${x};${x - 1};${x}" dur="${t}s" begin="-${d * 0.4}s" repeatCount="indefinite"/></rect>`,
    )
    .join('')

export type DrawOpts = {
  costume?: Costume
  /** 覆盖动作(快过期时换成慌张动作)。 */
  clip?: string
  /** 固定画布;不给时按精灵原尺寸(图鉴原版动作用)。 */
  box?: { w: number; h: number }
  frozen?: boolean
  snow?: boolean
  /** 点一下时演一遍这段动作(打招呼),再回到原动作;只在可交互的 SVG 里生效,悬停不变。快速连点 5 下会晕倒转圈。 */
  greet?: string
  /** 压缩会话:hold = 一直被横着压扁(微微颤),pop = 弹回原样一次。 */
  squash?: 'hold' | 'pop'
  /** 打瞌睡:头顶飘小 z。 */
  sleep?: boolean
  /** 刚被吵醒:头顶闪一个感叹号。 */
  alarm?: boolean
}

/** 打招呼持续多久(秒)。 */
const GREET_S = 2.4

/**
 * 点击效果全部用 SMIL 事件触发(begin="r.click",r 是根 svg 的 id),不用 CSS、不用 tabindex:
 * 桌面版现在会拒收带 <style> 动画或 tabindex 的 SVG,整条窄条都不画。SMIL 的 begin 不是脚本,沙箱里照样能跑。
 * 每次点击都会让这些动画从头重播。
 */
const ON = 'r.click'
const ease = (n: number) => Array(n).fill('.22 1 .36 1').join(';')

/** 点击时从头顶附近飘起的三颗像素星:放大、上浮、淡出。 */
const sparks = (w: number): string => {
  const star = (x: number, y: number, c: string, d: number) =>
    `<g opacity="0">` +
    `<animate attributeName="opacity" values="0;1;0" keyTimes="0;.22;1" dur=".95s" begin="${ON}+${d}s" fill="freeze"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 1;0 -3" dur=".95s" begin="${ON}+${d}s" calcMode="spline" keyTimes="0;1" keySplines="${ease(1)}" fill="freeze"/>` +
    `<rect x="${x}" y="${y - 1}" width="1" height="3" fill="${c}"/><rect x="${x - 1}" y="${y}" width="3" height="1" fill="${c}"/></g>`
  const l = Math.max(3, FOOT_X - 10)
  const r = Math.min(w - 3, FOOT_X + 10)
  // 起点压低:往上飘 3 像素后最高处离顶边还有 1 像素,不会被画框切掉。
  return star(l, 9, '#d97757', 0.04) + star(FOOT_X, 6, '#ffd2bd', 0) + star(r, 8, '#e9a23b', 0.08)
}

/** 脚下荡开的一圈涟漪。 */
const ripple = (H: number) =>
  `<ellipse cx="${FOOT_X}" cy="${H - 1.5}" rx="2" ry=".5" fill="none" stroke="#d97757" stroke-width=".7" opacity="0" shape-rendering="geometricPrecision">` +
  `<animate attributeName="rx" values="2;10" dur=".7s" begin="${ON}" calcMode="spline" keyTimes="0;1" keySplines="${ease(1)}" fill="freeze"/>` +
  `<animate attributeName="ry" values=".5;2.5" dur=".7s" begin="${ON}" calcMode="spline" keyTimes="0;1" keySplines="${ease(1)}" fill="freeze"/>` +
  `<animate attributeName="opacity" values=".6;0" dur=".7s" begin="${ON}" fill="freeze"/></ellipse>`

/** 身体:以脚底为原点先压扁再回弹(带一点过冲),最后落回原样。 */
const bounce = (inner: string, H: number) =>
  `<g transform="translate(${FOOT_X} ${H})"><g>` +
  `<animateTransform attributeName="transform" type="scale" values="1 1;1.08 .88;.95 1.06;1.01 .99;1 1" keyTimes="0;.18;.5;.78;1" ` +
  `calcMode="spline" keySplines="${ease(4)}" dur=".62s" begin="${ON}"/>` +
  `<g transform="translate(${-FOOT_X} ${-H})">${inner}</g></g></g>`

// ---------- 小动作:只用变形和几颗像素,不加新的动作帧(省 Svg 预算) ----------

/** 连点几下算"点烦了"。 */
const TAPS = 5
/** 两次点击最多隔多久还算连点(秒)。 */
const TAP_GAP = 2.5
/** 晕倒转圈演多久(秒)。 */
const DIZZY_S = 2.4

/**
 * 连点计数全靠 SMIL:叠 5 层透明板,第 k 层在第 k-1 层被点后显示 2.5 秒,点击总是落在最上面那层。
 * 点到第 5 层就晕倒;停手超过 2.5 秒,上面的层自己消失,计数从头来。不用脚本,沙箱里照样跑。
 */
const tapLayers = (W: number, H: number): string => {
  let out = `<rect id="o1" width="${W}" height="${H}" fill="#000" opacity="0"/>`
  for (let k = 2; k <= TAPS; k++)
    out += `<rect id="o${k}" width="${W}" height="${H}" fill="#000" opacity="0" visibility="hidden"><set attributeName="visibility" to="visible" begin="o${k - 1}.click" dur="${TAP_GAP}s"/></rect>`
  return out
}

/** 晕倒转圈:缩小一点、转两圈、再左右晃几下站稳。 */
const dizzy = (inner: string, H: number): string => {
  const cy = Math.round(H * 0.6)
  const on = `o${TAPS}.click`
  return (
    `<g transform="translate(${FOOT_X} ${cy})"><g>` +
    `<animateTransform attributeName="transform" type="scale" values="1;.78;.78;1" keyTimes="0;.12;.75;1" dur="${DIZZY_S}s" begin="${on}"/><g>` +
    `<animateTransform attributeName="transform" type="rotate" values="0;720" dur="1s" begin="${on}" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .2 1"/>` +
    `<animateTransform attributeName="transform" type="rotate" values="0;-14;11;-7;4;0" dur="1.4s" begin="${on}+1s"/>` +
    `<g transform="translate(${-FOOT_X} ${-cy})">${inner}</g></g></g></g>`
  )
}

/** 晕的时候头顶转圈的三颗小星。 */
const orbit = (): string => {
  const dot = (a: number, c: string) => {
    const r = (a * Math.PI) / 180
    return `<rect x="${(Math.cos(r) * 5 - 0.5).toFixed(1)}" y="${(Math.sin(r) * 1.8 - 0.5).toFixed(1)}" width="1" height="1" fill="${c}"/>`
  }
  return (
    `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="o${TAPS}.click+.6s" dur="${DIZZY_S - 0.6}s"/>` +
    `<g transform="translate(${FOOT_X} 5)"><g>` +
    `<animateTransform attributeName="transform" type="rotate" values="0;360" dur=".7s" repeatCount="indefinite"/>` +
    dot(0, '#ffd166') + dot(120, '#ffd2bd') + dot(240, '#e9a23b') +
    `</g></g></g>`
  )
}

/** 压扁:以脚底为原点横着拉宽、竖着压低;hold 一直压着并微微颤,pop 带过冲地弹回来。 */
const squashed = (inner: string, H: number, mode: 'hold' | 'pop'): string => {
  const anim =
    mode === 'hold'
      ? `<animateTransform attributeName="transform" type="scale" values="1.3 .55;1.36 .5;1.3 .55" dur=".5s" repeatCount="indefinite"/>`
      : `<animateTransform attributeName="transform" type="scale" values="1.3 .55;.86 1.18;1.07 .93;.98 1.02;1 1" keyTimes="0;.3;.55;.8;1" ` +
        `calcMode="spline" keySplines="${ease(4)}" dur=".9s" fill="freeze"/>`
  return `<g transform="translate(${FOOT_X} ${H})"><g transform="scale(1.3 .55)">${anim}<g transform="translate(${-FOOT_X} ${-H})">${inner}</g></g></g>`
}

/** 打瞌睡:三个像素 z 从头顶右边错开往上飘、越飘越淡。 */
const zzz = (): string => {
  const z = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="3" height="1"/><rect x="${x + 1}" y="${y + 1}" width="1" height="1"/><rect x="${x}" y="${y + 2}" width="3" height="1"/>`
  return [0, 1, 2]
    .map(k =>
      `<g fill="#cfd8ff" opacity="0">` +
      `<animate attributeName="opacity" values="0;.9;0" dur="3s" begin="${-k}s" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;4 -7" dur="3s" begin="${-k}s" repeatCount="indefinite"/>` +
      z(FOOT_X + 6, 8) + `</g>`)
    .join('')
}

/** 被吵醒:头顶一个闪烁的感叹号。 */
const bang = (): string =>
  `<g fill="#e9a23b"><animate attributeName="opacity" values="1;.2;1" dur=".45s" repeatCount="indefinite"/>` +
  `<rect x="${FOOT_X + 7}" y="1" width="1" height="3"/><rect x="${FOOT_X + 7}" y="5" width="1" height="1"/></g>`

const memo = new Map<string, string>()

/**
 * 一段动作的 SVG:每个(去重后的)帧是一个 <g>,用离散 opacity 动画按 12fps 轮流显示。
 * 穿了服装的角色:每帧先画背后的披风/发带,再画身体,再画帽子、眼镜、道具。
 * 给了 greet 时,再叠一段招呼动作(脚底对齐到同一位置),点一下切过去演一遍。
 */
export const drawSvg = (clipId: string, skin: Skin, o: DrawOpts = {}): string => {
  const c = o.costume
  const key = `${clipId}|${skin.id}|${c?.id ?? '-'}|${o.box ? `${o.box.w}x${o.box.h}` : 'raw'}|${o.frozen ? 1 : 0}|${o.snow ? 1 : 0}|${o.greet ?? ''}|${o.squash ?? ''}|${o.sleep ? 1 : 0}|${o.alarm ? 1 : 0}`
  const hit = memo.get(key)
  if (hit) return hit
  const sp = sprite(clipId)
  if (!sp) return ''
  const W = o.box?.w ?? sp.w
  const H = o.box?.h ?? sp.h
  const dx = o.box ? (c ? FOOT_X : Math.floor(W / 2)) - sp.ax : 0
  const dy = o.box ? H - 1 - sp.ay : 0

  /** 一段动作的全部帧;别的动作按它自己的脚底对齐到同一位置。 */
  const strip = (id: string): string => {
    const s2 = sprite(id)
    if (!s2) return ''
    const ox = dx + sp.ax - s2.ax
    const oy = dy + sp.ay - s2.ay
    const ticks = clipById(id)?.slow ?? 1
    const spans: { f: Uint8Array; n: number }[] = []
    for (const f of o.frozen ? [s2.frames[0]] : s2.frames) {
      const last = spans[spans.length - 1]
      if (last && same(last.f, f)) last.n += ticks
      else spans.push({ f, n: ticks })
    }
    const total = spans.reduce((a, x) => a + x.n, 0)
    const dur = (total / FPS).toFixed(3)
    const paint = (f: Uint8Array, k: number) => {
      if (!c?.dress) return framePaths(s2, f, ox, oy, skin)
      const back = new Ink()
      const front = new Ink()
      c.dress(anchorOf(s2, f, ox, oy), k, back, front)
      return back.svg() + framePaths(s2, f, ox, oy, skin) + front.svg()
    }
    if (spans.length === 1) return `<g>${paint(spans[0].f, 0)}</g>`
    let out = ''
    let at = 0
    spans.forEach((x, k) => {
      const a = at / total
      const b = (at + x.n) / total
      at += x.n
      const q = (v: number) => v.toFixed(4)
      const anim =
        a === 0 ? `values="1;0" keyTimes="0;${q(b)}"`
          : b >= 1 ? `values="0;1" keyTimes="0;${q(a)}"`
            : `values="0;1;0" keyTimes="0;${q(a)};${q(b)}"`
      out +=
        `<g opacity="${a === 0 ? 1 : 0}">` +
        `<animate attributeName="opacity" calcMode="discrete" ${anim} dur="${dur}s" repeatCount="indefinite"/>` +
        paint(x.f, k) + `</g>`
    })
    return out
  }

  let body = strip(clipId)
  const greet = o.greet && !o.frozen && sprite(o.greet) ? o.greet : null
  if (greet) {
    const T = `${GREET_S}s`
    // 原动作在点击后藏 2.4s,招呼动作只在这 2.4s 里出现。
    body =
      `<g>${body}<set attributeName="visibility" to="hidden" begin="${ON}" dur="${T}"/></g>` +
      `<g visibility="hidden">${strip(greet)}<set attributeName="visibility" to="visible" begin="${ON}" dur="${T}"/></g>`
  }

  const fx = c?.fx ? c.fx(anchorOf(sp, sp.frames[0], dx, dy), W, H) : {}
  if (c?.bob)
    body = `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.8s" repeatCount="indefinite"/>${body}</g>`
  let inner = (fx.under ?? '') + body + (fx.over ?? '')
  if (o.squash) inner = squashed(inner, H, o.squash)
  if (o.sleep) inner += zzz()
  if (o.alarm) inner += bang()
  // 可点的角色:招呼动作 + 连点 5 下晕倒转圈;最上面的透明板接点击,点在身边空白处也算。
  if (greet) inner = dizzy(ripple(H) + bounce(inner, H) + sparks(W), H) + orbit() + tapLayers(W, H)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges"${greet ? ' id="r"' : ''}>` +
    inner + (o.snow ? snow(W, H) : '') +
    `</svg>`
  memo.set(key, svg)
  return svg
}
