// 缓存进度条(光条、高光、火星)、终端的纯文字进度条,和右上角呼吸发光的 Claude 星芒。
import { AMBER, CLAY, ICE, MUTED, RED } from './state'
import type { View } from './state'

// ---------- 进度条 ----------
export const BAR_W = 120
export const BAR_H = 15
/** 左右留白:光头在两端时光晕和光环也是完整的圆,不被画框切掉。 */
export const BAR_PAD = 7
export const BAR_SVG_W = BAR_W + BAR_PAD * 2

/** 光头上冒的几颗像素火星:从光头往上飘、渐隐,错开出发。 */
export const embers = (col: string) =>
  [[-1, 0], [1.5, 0.8], [0, 1.6]]
    .map(([dx, d]) =>
      `<rect x="${dx - 0.5}" y="6" width="1" height="1" fill="${col}" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${d}s" repeatCount="indefinite"/>` +
      `<animate attributeName="y" values="6;1" dur="2.4s" begin="${d}s" repeatCount="indefinite"/></rect>`)
    .join('')

/**
 * 缓存进度条:3 像素渐变光条(左暗右亮),每 3.2 秒一道高光从左扫到光头,
 * 扫到时光头闪一下;光头有呼吸光晕,往上冒像素火星。忙碌时整条满格,两道彗星来回扫。
 */
export const barSvg = (v: View): string => {
  const W = BAR_W
  const cy = 7.5
  let g = `<rect x="0" y="${cy - 1}" width="${W}" height="2" rx="1" fill="${MUTED}" opacity=".22"/>`
  const sheen =
    `<linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset=".7" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  if (v.mood === 'busy') {
    g +=
      `<defs>${sheen}<linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="${CLAY}" stop-opacity=".55"/><stop offset="1" stop-color="${CLAY}"/></linearGradient></defs>` +
      `<rect x="0" y="${cy - 1.5}" width="${W}" height="3" rx="1.5" fill="url(#f)"/>` +
      `<rect y="${cy - 2}" width="30" height="4" rx="2" fill="url(#sh)"><animate attributeName="x" values="0;${W - 30}" dur="1.3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.75;1" dur="1.3s" repeatCount="indefinite"/></rect>` +
      `<rect y="${cy - 1}" width="16" height="2" rx="1" fill="url(#sh)" opacity="0"><animate attributeName="x" values="0;${W - 16}" dur="1.3s" begin=".65s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.5;.5;0" keyTimes="0;.15;.75;1" dur="1.3s" begin=".65s" repeatCount="indefinite"/></rect>` +
      `<g transform="translate(${W - 2} 0)">${embers('#ffd2bd')}</g>`
  } else if (v.mood === 'calm' || v.mood === 'soon') {
    const frac = Math.max(0, Math.min(1, v.leftMs / v.ttlMs))
    const cur = +(frac * W).toFixed(2)
    const sec = Math.max(1, v.leftMs / 1000).toFixed(0)
    const col = v.mood === 'calm' ? CLAY : v.leftMs <= 60_000 ? RED : AMBER
    const pulse = v.mood === 'soon' ? `<animate attributeName="opacity" values="1;.4;1" dur="1.1s" repeatCount="indefinite"/>` : ''
    // 宽度在两次重绘之间也会实时缩短:动画直接跑到 0,时长 = 剩余秒数。
    const shrink = `<animate attributeName="width" from="${cur}" to="0" dur="${sec}s" fill="freeze"/>`
    const follow = `<animateTransform attributeName="transform" type="translate" from="${cur} 0" to="0 0" dur="${sec}s" fill="freeze"/>`
    g +=
      `<defs>${sheen}<linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}"/></linearGradient>` +
      `</defs>` +
      `<rect x="0" y="${cy - 1.5}" width="${cur}" height="3" rx="1.5" fill="url(#f)">${shrink}${pulse}</rect>` +
      // 高光:0.8 处正好扫到光头(右缘藏进光头的光晕里),然后淡出。不用裁剪路径(桌面版疑似不收)。
      `<rect y="${cy - 2}" width="28" height="4" rx="2" fill="url(#sh)">` +
      `<animate attributeName="x" values="0;${Math.max(0, cur - 24).toFixed(2)};${Math.max(0, cur - 24).toFixed(2)}" keyTimes="0;.8;1" dur="3.2s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.12;.68;.8;1" dur="3.2s" repeatCount="indefinite"/></rect>` +
      `<g>${follow}` +
      `<circle cx="0" cy="${cy}" r="4.5" fill="${col}" opacity=".32"><animate attributeName="r" values="3.6;5.8;3.6" dur="2.4s" repeatCount="indefinite"/></circle>` +
      `<circle cx="0" cy="${cy}" r="2.2" fill="${col}">${pulse}</circle>` +
      // 高光扫到时光头闪一下:白芯 + 一圈外扩的光环。
      `<circle cx="0" cy="${cy}" r="1.4" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.78;.84;1" dur="3.2s" repeatCount="indefinite"/></circle>` +
      `<circle cx="0" cy="${cy}" r="2" fill="none" stroke="#fff" stroke-width=".6" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;.8;0" keyTimes="0;.8;.84;1" dur="3.2s" repeatCount="indefinite"/>` +
      `<animate attributeName="r" values="2;2;6" keyTimes="0;.8;1" dur="3.2s" repeatCount="indefinite"/></circle>` +
      embers(col === CLAY ? '#ffd2bd' : col) +
      `</g>`
  } else if (v.mood === 'cold') {
    let dots = ''
    for (let x = 2; x <= W - 2; x += 6) dots += `<circle cx="${x}" cy="${cy}" r="1" fill="${ICE}"/>`
    g = `<g opacity=".8">${dots}<animate attributeName="opacity" values=".85;.35;.85" dur="3.2s" repeatCount="indefinite"/></g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-BAR_PAD} 0 ${BAR_SVG_W} ${BAR_H}" width="${BAR_SVG_W}" height="${BAR_H}">${g}</svg>`
}

export const textBar = (v: View, cells = 10): string => {
  if (v.mood === 'cold') return '·'.repeat(cells)
  const n = v.mood === 'busy' ? cells : Math.round(Math.max(0, Math.min(1, v.leftMs / v.ttlMs)) * cells)
  return '▰'.repeat(n) + '▱'.repeat(cells - n)
}

// ---------- 右上角的 Claude 星芒 ----------
/** Claude 官方星芒(viewBox 0 0 100 100),官方陶土色。 */
export const SPARK_D = 'm19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z'
/** 星芒本体 18px;画框四周各留 30% 给光晕,整张图 = 18 × 1.6。 */
export const SPARK_PAD = 30
export const SPARK_PX = Math.round(18 * (100 + SPARK_PAD * 2) / 100)
/** 呼吸:4.8 秒一次,缓入缓出。 */
export const BREATH = `dur="4.8s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"`
/**
 * 静态星芒 + 贴着枝干的外发光(像抠图后加外发光):同一条轮廓叠 7 层描边,越宽越淡,
 * 叠起来就是顺着枝干的柔光;整组透明度呼吸,本体颜色在陶土色和亮一档之间呼吸。
 * 不用 filter/clipPath(桌面版对 clipPath 会整条拒收,模糊滤镜未验证)。
 */
export const GLOW: [number, number][] = [[34, 0.035], [28, 0.05], [22, 0.07], [17, 0.1], [12, 0.14], [8, 0.2], [4, 0.28]]
export const sparkSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-SPARK_PAD} ${-SPARK_PAD} ${100 + SPARK_PAD * 2} ${100 + SPARK_PAD * 2}" width="${SPARK_PX}" height="${SPARK_PX}">` +
  `<g opacity=".1"><animate attributeName="opacity" values=".08;.5;.08" ${BREATH}/>` +
  GLOW.map(([w, o]) => `<path d="${SPARK_D}" fill="none" stroke="#e0835f" stroke-width="${w}" stroke-linejoin="round" opacity="${o}"/>`).join('') +
  `</g><path fill="#c96c4f" d="${SPARK_D}"/></svg>`
