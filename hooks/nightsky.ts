// 深夜面板右侧的像素夜景:取自 Claude Code CLI 首次打开时欢迎画面的深色版背景
// (方块月牙、阶梯云、* 星星),去掉 Clawd、标题和点线;画面按可用宽度往左延长,多铺几朵云和星星。
// 每个字符格画成 CELL_W × CELL_H 像素;░ ▒ ▓ 用棋盘格抖动 / 透明度表示,保持像素味。

const CELL_W = 2
const CELL_H = 4
const ROWS = 9

// 窄带底板是客户端自己画的(浅色主题偏白、深色主题偏黑),插件读不到主题,所以夜景用两边都看得清的配色:
// 云是中灰、比原图密一档(远处那层再淡一些),月牙、光晕和星星都是金色(金色在浅/深底上都看得清,不再加深色描边)。
const FG = '#7f786d'
const DIM = '#7f786d'
const DIM_OP = 0.7
const GOLD = '#e0a83a'

/**
 * 欢迎画面原图的 9 行(58 列):月牙在右上,左上一朵亮云,右下一朵暗云。
 * 小写 d 开头的行整行是暗色(原图 dimColor)。'*' 是星星,'+' 是加粗的亮星。
 */
const ART: [boolean, string][] = [
  [false, '     *                                       █████▓▓░     '],
  [false, '                                 *         ███▓░     ░░   '],
  [false, '            ░░░░░░                        ███▓░           '],
  [false, '    ░░░   ░░░░░░░░░░                      ███▓░           '],
  [false, '   ░░░░░░░░░░░░░░░░░░░    +                ██▓░░      ▓   '],
  [false, '                                             ░▓▓███▓▓░    '],
  [true, ' *                                 ░░░░                   '],
  [true, '                                 ░░░░░░░░                 '],
  [true, '                               ░░░░░░░░░░░░░░░░           '],
]
export const ART_W = 58

/** 往左延长时轮流放的两种云(取自原图):亮云在上,暗云在下。 */
const CLOUD_HI = ART.slice(2, 5).map(([, s]) => s.slice(3, 23))
const CLOUD_LO = ART.slice(6, 9).map(([, s]) => s.slice(31, 47))

const hash = (n: number) => (Math.imul(n | 0, 2654435761) >>> 0)

/** 拼出 cells 列宽的字符网格:原图贴右边,左边按种子铺云和星星。 */
export const skyGrid = (cells: number): { text: string[]; dim: boolean[][] } => {
  const w = Math.max(ART_W, cells)
  const text = Array.from({ length: ROWS }, () => Array<string>(w).fill(' '))
  const dim = Array.from({ length: ROWS }, () => Array<boolean>(w).fill(false))
  const put = (row: number, col: number, s: string, isDim: boolean) => {
    for (let i = 0; i < s.length; i++) {
      const c = col + i
      if (c < 0 || c >= w || s[i] === ' ') continue
      text[row][c] = s[i]
      dim[row][c] = isDim
    }
  }
  const off = w - ART_W
  ART.forEach(([d, s], r) => put(r, off, s, d))
  // 左边延长段:每 ~34 列放一朵云,亮暗交替、上下错开;再撒星星。
  let k = 0
  for (let x = off - 30; x > -20; x -= 34, k++) {
    if (k % 2 === 0) CLOUD_LO.forEach((s, i) => put(6 + i, x, s, true))
    else CLOUD_HI.forEach((s, i) => put(2 + i, x, s, false))
  }
  for (let x = 2; x < off; x += 7) {
    const h = hash(x * 97 + 13)
    if (h % 3 === 0) continue
    const r = h % ROWS
    if (text[r][x] === ' ') {
      text[r][x] = h % 5 === 0 ? '+' : '*'
      dim[r][x] = h % 4 === 0
    }
  }
  return { text: text.map(r => r.join('')), dim }
}

/** 一行里同字符、同明暗的连续格合并成一个 rect,减小体积。 */
const runs = (row: string, dimRow: boolean[]) => {
  const out: { ch: string; dim: boolean; x: number; n: number }[] = []
  for (let x = 0; x < row.length; x++) {
    const ch = row[x]
    if (ch === ' ' || ch === '*' || ch === '+') continue
    const last = out[out.length - 1]
    if (last && last.ch === ch && last.dim === dimRow[x] && last.x + last.n === x) last.n++
    else out.push({ ch, dim: dimRow[x], x, n: 1 })
  }
  return out
}

/** 像素夜景 Svg;cells = 宽多少个字符格,waiting = 等额度时月亮旁边飘 z。 */
export const pixelSky = (cells: number, waiting = false): string => {
  const { text, dim } = skyGrid(cells)
  const w = text[0].length
  const W = w * CELL_W
  const H = ROWS * CELL_H
  const defs =
    `<defs>` +
    // ░ = 稀疏棋盘格,▒ = 半密棋盘格
    `<pattern id="p2" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${FG}"/><rect x="1" y="1" width="1" height="1" fill="${FG}"/></pattern>` +
    `<pattern id="pm" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${GOLD}"/></pattern>` +
    `</defs>`
  // 月牙在原图第 40 列以右、前 6 行;单独一层,不跟着云晃。
  const moonX = w - ART_W + 40
  let hi = ''
  let lo = ''
  let moon = ''
  text.forEach((row, r) => {
    for (const s of runs(row, dim[r])) {
      const isMoon = r <= 5 && s.x >= moonX
      const x = s.x * CELL_W
      const y = r * CELL_H
      const ww = s.n * CELL_W
      let fill = s.dim ? DIM : isMoon ? GOLD : FG
      let op = 1
      if (s.ch === '░') fill = isMoon ? 'url(#pm)' : 'url(#p2)'
      else if (s.ch === '▒') fill = 'url(#p2)'
      else if (s.ch === '▓') op = 0.75
      const rect = `<rect x="${x}" y="${y}" width="${ww}" height="${CELL_H}" fill="${fill}"${op < 1 ? ` opacity="${op}"` : ''}/>`
      if (isMoon) moon += rect
      else if (s.dim) lo += rect
      else hi += rect
    }
  })
  // 云连续往右飘,飘出右边从左边接回来(左边放一份副本,平移一整个画宽正好首尾相接)。
  // 亮云在前、飘得快,暗云在后、飘得慢,有远近视差;云从月亮前面飘过。
  const drift = (layer: string, dur: number) =>
    `<g>${layer}<g transform="translate(${-W} 0)">${layer}</g>` +
    `<animateTransform attributeName="transform" type="translate" from="0 0" to="${W} 0" dur="${dur}s" repeatCount="indefinite"/></g>`
  const cloudLayer = `<g opacity="${DIM_OP}">${drift(lo, Math.round(W * 0.4))}</g>` + drift(hi, Math.round(W * 0.22))
  // 像素流星:亮头 + 一串越来越淡的像素尾巴,从右上斜划到左下,然后藏起来等下一轮。
  const meteor = (x0: number, y0: number, len: number, begin: number, dur: number) => {
    let trail = `<rect x="0" y="0" width="2" height="2" fill="${GOLD}"/>`
    for (let i = 1; i <= 5; i++) trail += `<rect x="${i * 2}" y="${-i}" width="2" height="1" fill="${GOLD}" opacity="${(1 - i * 0.17).toFixed(2)}"/>`
    const k = (0.9 / dur).toFixed(3)
    return (
      `<g opacity="0">${trail}` +
      `<animateTransform attributeName="transform" type="translate" values="${x0} ${y0};${x0 - len} ${y0 + len / 2};${x0 - len} ${y0 + len / 2}" keyTimes="0;${k};1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;${(0.1 / dur).toFixed(3)};${(0.6 / dur).toFixed(3)};${k};1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></g>`
    )
  }
  const meteors = meteor(Math.round(W * 0.62), 3, 26, 1.5, 7) + (W > 160 ? meteor(Math.round(W * 0.3), 5, 20, 5, 9) : '')
  // 星星:小星深呼吸似地眨;'+' 亮星平时是 2×2 的点,亮到顶时伸出十字光芒,像在放光。
  let stars = ''
  text.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch !== '*' && ch !== '+') continue
      const cx = c * CELL_W + 1
      const cy = r * CELL_H + 2
      const big = ch === '+'
      // 金芯;远处(暗行)的星星整体淡一些。
      const far = dim[r][c] ? ' opacity=".6"' : ''
      const d = ((hash(r * 131 + c) % 30) / 10).toFixed(1)
      stars += big
        ? `<g${far}><rect x="${cx - 1}" y="${cy - 1}" width="2" height="2" fill="${GOLD}"/>` +
          `<g opacity="0" fill="${GOLD}"><rect x="${cx - 4}" y="${cy - 0.5}" width="2" height="1"/><rect x="${cx + 2}" y="${cy - 0.5}" width="2" height="1"/><rect x="${cx - 0.5}" y="${cy - 4}" width="1" height="2"/><rect x="${cx - 0.5}" y="${cy + 2}" width="1" height="2"/>` +
          `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;.35;.5;.65;1" dur="2.4s" begin="${d}s" repeatCount="indefinite"/></g></g>`
        : (() => {
            const dur = (2.4 + (hash(c * 7 + r) % 20) / 10).toFixed(1)
            // 金芯呼吸
            return `<g${far}><rect x="${cx - 1}" y="${cy - 1}" width="2" height="2" fill="${GOLD}">` +
              `<animate attributeName="opacity" values="1;.25;1" dur="${dur}s" begin="${d}s" repeatCount="indefinite"/></rect></g>`
          })()
    }
  })
  // 月光:月亮背后两圈棋盘格抖动的光晕(像素味的柔光),一圈慢呼吸、一圈慢慢外扩再收;
  // 月亮本身也微微明暗;月亮四周偶尔亮起一两颗像素光点。
  const mcx = (w - ART_W + 49) * CELL_W + 1
  const mcy = 12
  const glow =
    `<circle cx="${mcx}" cy="${mcy}" r="20" fill="url(#pm)" opacity=".1">` +
    `<animate attributeName="opacity" values=".05;.16;.05" dur="5s" repeatCount="indefinite"/>` +
    `<animate attributeName="r" values="18;22;18" dur="5s" repeatCount="indefinite"/></circle>` +
    `<circle cx="${mcx}" cy="${mcy}" r="14" fill="url(#pm)" opacity=".22">` +
    `<animate attributeName="opacity" values=".14;.3;.14" dur="3.2s" repeatCount="indefinite"/></circle>` +
    [[-15, -6, 0], [13, 9, 1.3], [-11, 11, 2.6], [15, -9, 3.6]]
      .map(([dx, dy, d]) =>
        `<rect x="${mcx + dx}" y="${mcy + dy}" width="1" height="1" fill="${GOLD}" opacity="0">` +
        `<animate attributeName="opacity" values="0;1;0;0" keyTimes="0;.12;.3;1" dur="4.8s" begin="${d}s" repeatCount="indefinite"/></rect>`)
      .join('')
  const moonLayer = `<g>${moon}<animate attributeName="opacity" values="1;.82;1" dur="3.2s" repeatCount="indefinite"/></g>`
  const zz = waiting
    ? [0, 1.2].map(d =>
        `<text x="${W - 6}" y="12" font-size="6" font-family="monospace" fill="${FG}" opacity="0">z` +
        `<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${d}s" repeatCount="indefinite"/>` +
        `<animate attributeName="y" values="14;4" dur="2.4s" begin="${d}s" repeatCount="indefinite"/></text>`).join('')
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">${defs}${stars}${meteors}${glow}${moonLayer}${cloudLayer}${zz}</svg>`
}
export const SKY_CELL_W = CELL_W
export const SKY_PX_H = ROWS * CELL_H
