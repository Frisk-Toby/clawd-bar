// 职业 Clawd:每个角色 = 一段官方动作 + 逐帧贴身的服装道具 + 场景特效。
// 网格里 '.' 是透明;帽子用 Ink.hat() 压在头顶,道具用手臂锚点定位。

import { Ink } from './clawd'
import type { Anchor, Costume } from './clawd'

// ---------- 特效小件 ----------
const pix = (grid: string[], pal: Record<string, string>, x: number, y: number) => {
  const k = new Ink()
  k.art(grid, pal, x, y)
  return k.svg()
}
/** 一闪一闪的十字星。 */
const twinkle = (x: number, y: number, c: string, begin: number, dur = 1.6) =>
  `<g opacity="0"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
  `<rect x="${x}" y="${y - 1}" width="1" height="3" fill="${c}"/><rect x="${x - 1}" y="${y}" width="3" height="1" fill="${c}"/></g>`
/** 往上飘并淡出(音符、热气、光点)。 */
const rise = (inner: string, dy: number, dur: number, begin: number) =>
  `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.2;.7;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${dy}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>${inner}</g>`
/** 沿路径飘落(花瓣)。 */
const drift = (x: number, c: string, dur: number, begin: number, h: number) =>
  `<rect x="0" y="0" width="2" height="1" fill="${c}"><animateMotion path="M${x} -2 C ${x + 4} ${h * 0.3}, ${x - 4} ${h * 0.6}, ${x + 2} ${h}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" rotate="auto"/></rect>`
/** 往下滴(水、雨)。 */
const drop = (x: number, y0: number, y1: number, c: string, dur: number, begin: number) =>
  `<rect x="${x}" y="${y0}" width="1" height="1" fill="${c}"><animate attributeName="y" values="${y0};${y1}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
  `<animate attributeName="opacity" values="1;1;0" keyTimes="0;.85;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></rect>`

/** 眼镜:每只眼外面一圈框,中间一道鼻梁。 */
/** 眼镜框;pad = 镜框离眼睛几个像素(1 = 贴着眼睛,2 = 大一圈像戴着)。 */
const glasses = (front: Ink, a: Anchor, c: string, pad = 1) => {
  for (const e of a.eyes) {
    front.rect(e.x0 - pad, e.y0 - pad, e.x1 - e.x0 + 1 + pad * 2, 1, c)
    front.rect(e.x0 - pad, e.y1 + pad, e.x1 - e.x0 + 1 + pad * 2, 1, c)
    front.rect(e.x0 - pad, e.y0 - pad + 1, 1, e.y1 - e.y0 + pad * 2 - 1, c)
    front.rect(e.x1 + pad, e.y0 - pad + 1, 1, e.y1 - e.y0 + pad * 2 - 1, c)
  }
  if (a.eyes.length === 2) {
    const [l, r] = a.eyes
    const gap = r.x0 - pad - (l.x1 + pad) - 1
    if (gap > 0) front.rect(l.x1 + pad + 1, l.y0, gap, 1, c)
  }
}

// ---------- 角色们 ----------
export const COSTUMES: Costume[] = [
  {
    id: 'detective', name: '侦探', clip: 'LookingAround', w: 46,
    dress: (a, _k, _b, f) => {
      f.hat(['.......kk.........', '....kKkkKkkKk.....', '...kkkkkkkkkkk....', '..kKkkKkkKkkKkk...', 'KKkkkkkkkkkkkkkkKK', '.KK............KK.'],
        { k: '#9c7a52', K: '#6b5034' }, a, 1)
      f.art(['..ggg.', '.gwwwg', '.gwWwg', '.gwwwg', '..ggg.', '.h....', 'h.....'],
        { g: '#c9a227', w: '#cfe8ff', W: '#ffffff', h: '#b08457' }, a.armR.x + 1, a.armR.y - 6)
    },
    fx: a => ({
      over: `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.55;.62;.9;1" dur="4s" repeatCount="indefinite"/>` +
        pix(['.qq.', 'q..q', '...q', '..q.', '....', '..q.'], { q: '#ffd65a' }, Math.round(a.cx) - 2, a.t - 10) + '</g>',
    }),
  },
  {
    id: 'chef', name: '厨师', clip: 'Swaying', w: 48,
    dress: (a, k, _b, f) => {
      f.hat(['...ww.wwww.ww...', '..wwwwwwwwwwww..', '..wwwwwwwwwwww..', '...wwwwwwwwww...', '...wwwwwwwwww...', '..ssssssssssss..'],
        { w: '#f6f3ec', s: '#d8d0bf' }, a)
      f.art(['....kkkkkk', 'hhhkkkkkkk', '....kkkkk.'], { k: '#55555e', h: '#b08457' }, a.armR.x + 1, a.armR.y - 1)
      // 煎饼跟着锅逐帧往上抛,翻面时变厚。
      const arc = [0, 2, 4, 6, 7, 6, 4, 2]
      const j = k % arc.length
      f.rect(a.armR.x + 6, a.armR.y - 2 - arc[j], 4, j === 3 || j === 5 ? 2 : 1, '#e2b26a')
    },
    fx: a => ({ over: rise(pix(['s', '.s', 's'], { s: '#cfcfcf' }, a.armR.x + 9, a.armR.y - 6), 5, 2.2, 0.4) }),
  },
  {
    id: 'cowboy', name: '牛仔', clip: 'Walking', w: 48,
    dress: (a, _k, _b, f) => {
      f.hat(['.......bbbbbb.......', '......bbbbbbbb......', '......BBBBBBBB......', '.b...bbbbbbbbbb...b.', '..bbbbbbbbbbbbbbbb..'],
        { b: '#a8743f', B: '#5b3a1e' }, a)
      f.rect(a.xL + 2, a.t + 6, a.xR - a.xL - 3, 1, '#c8323c')
    },
    fx: a => {
      const x = a.armR.x + 4, y = a.t - 3
      return {
        over: `<line x1="${a.armR.x}" y1="${a.armR.y}" x2="${x}" y2="${y + 1}" stroke="#d9b77a" stroke-width="1"/>` +
          `<ellipse cx="${x}" cy="${y}" rx="6" ry="1.6" fill="none" stroke="#d9b77a" stroke-width="1">` +
          `<animate attributeName="rx" values="6;2.5;6" dur=".7s" repeatCount="indefinite"/></ellipse>`,
      }
    },
  },
  {
    id: 'teacher', name: '老师', clip: 'Pointing', w: 58,
    dress: (a, _k, _b, f) => {
      f.hat(['.......dd.......', '..dddddddddddd..', 'dddddddddddddddy', '..dddddddddddd.y', '....dddddddd...y'],
        { d: '#2b2b33', y: '#e3b341' }, a)
      glasses(f, a, '#ffffff', 2)
      f.art(['.....w', '....h.', '...h..', '..h...'], { w: '#ffffff', h: '#b08457' }, a.armR.x + 1, a.armR.y - 3)
    },
    fx: (_a, W, H) => {
      const x = W - 15, y = H - 18
      return {
        under: `<rect x="${x}" y="${y}" width="14" height="10" fill="#8b5a2b"/><rect x="${x + 1}" y="${y + 1}" width="12" height="8" fill="#2e4a3b"/>` +
          pix(['w.w.www', '.w..w.w', 'w.w.www'], { w: '#e8efe9' }, x + 3, y + 2) +
          `<rect x="${x + 3}" y="${y + 6}" width="0" height="1" fill="#e8efe9"><animate attributeName="width" values="0;8;8;0" keyTimes="0;.4;.9;1" dur="3s" repeatCount="indefinite"/></rect>` +
          `<rect x="${x + 4}" y="${y + 10}" width="1" height="${H - y - 10}" fill="#8b5a2b"/><rect x="${x + 9}" y="${y + 10}" width="1" height="${H - y - 10}" fill="#8b5a2b"/>`,
      }
    },
  },
  {
    id: 'wizard', name: '魔法师', clip: 'Waving', w: 48,
    dress: (a, _k, _b, f) => {
      f.hat(['...........pp...', '..........pp....', '.........ppp....', '........pppp....', '.......ppypp....', '......pppppp....',
        '.....pppppppp...', '...pppppppypppp.', 'PPPPPPPPPPPPPPPP'], { p: '#5b4bb7', P: '#41358a', y: '#ffd65a' }, a)
      f.art(['...y.', '..yyy', '...y.', '..h..', '.h...', 'h....'], { y: '#ffd65a', h: '#b08457' }, a.armR.x + 1, a.armR.y - 5)
    },
    fx: a => {
      const x = a.armR.x + 4, y = a.armR.y - 6
      return {
        over: twinkle(x + 4, y - 2, '#ffe680', 0) + twinkle(x - 1, y - 6, '#c9b8ff', 0.5) + twinkle(x + 7, y + 4, '#ffe680', 1.0) + twinkle(x - 6, y - 2, '#ffffff', 1.3, 2.2),
      }
    },
  },
  {
    id: 'photo', name: '摄影师', clip: 'Excited', w: 48,
    dress: (a, k, _b, f) => {
      // 反戴鸭舌帽(帽檐朝左),右手举相机,每隔几帧闪光一次。
      f.hat(['....cccccccc....', '..cccccccccccc..', 'CCCCcccccccccccc'], { c: '#2f7d78', C: '#245f5b' }, a, 0, -2)
      const x = a.armR.x - 4, y = a.armR.y - 4
      f.art(['.gg.....', 'kkkkkkkk', 'kkLLLLkk', 'kkLwWLkk', 'kkLWWLkk', 'kkLLLLkk', 'kkkkkkkk'],
        { k: '#2b2b31', g: '#9aa0ad', L: '#70757f', w: '#e8f6ff', W: '#6fb8f0' }, x, y)
      if (k % 6 === 0) f.art(['...w...', '...w...', '..www..', 'wwwwwww', '..www..', '...w...', '...w...'], { w: '#fffbe6' }, x - 3, y - 6)
    },
  },
  {
    id: 'dj', name: '耳机', clip: 'DancingHappy', w: 48,
    dress: (a, _k, _b, f) => {
      f.hat(['.....hhhhhhhhhh.....', '...hh..........hh...', '..h..............h..', '.cC..............Cc.', '.cc..............cc.', '.cc..............cc.'],
        { h: '#9aa0ad', c: '#e85d75', C: '#ff9fb0' }, a, 3)
    },
    fx: a => {
      const note = (c: string) => pix(['.nn', '.n.', 'nn.'], { n: c }, 0, 0)
      const at = (x: number, y: number, c: string, d: number, b: number) =>
        rise(`<g transform="translate(${x} ${y})">${note(c)}</g>`, 9, d, b)
      return { over: at(a.xR + 4, a.t + 2, '#ffd65a', 2.2, 0) + at(a.xL - 6, a.t + 4, '#7fd1ff', 2.6, 1.1) + at(a.xR + 8, a.t + 6, '#ff9fb0', 2.4, 1.7) }
    },
  },
  {
    id: 'monk', name: '冥想', clip: 'Meditating',
    dress: (a, _k, _b, f) => {
      f.art(['p.pp.pp.pp.pp.p', '.ppppppppppppp.', '..ggggggggggg..'], { p: '#e98bb0', g: '#5f9c6a' }, Math.round(a.cx) - 7, a.ymax - 1)
    },
    fx: (a, W, H) => ({
      under: `<circle cx="${a.cx}" cy="${a.t + 7}" r="11" fill="#ffd88a" opacity=".12"><animate attributeName="opacity" values=".06;.2;.06" dur="4s" repeatCount="indefinite"/></circle>`,
      over: `<ellipse cx="${a.cx}" cy="${a.t - 3}" rx="6" ry="1.5" fill="none" stroke="#ffd88a" stroke-width="1"><animate attributeName="opacity" values=".5;1;.5" dur="3s" repeatCount="indefinite"/></ellipse>` +
        [4, W - 6, 9, W - 11].map((x, i) => rise(`<rect x="${x}" y="${H - 6}" width="1" height="1" fill="#ffe9b0"/>`, 14, 3.4, i * 0.85)).join(''),
    }),
  },
  {
    id: 'fairy', name: '花仙', clip: 'Swaying', skin: 'peach',
    dress: (a, _k, _b, f) => {
      f.hat(['.p...y...p...y..', 'pyp.yry.pyp.yry.', '.gggggggggggggg.'], { p: '#ff8fb8', y: '#ffe066', r: '#ff6f61', g: '#6fbf73' }, a, 1)
    },
    fx: (_a, W, H) => ({
      over: [[4, '#ffb3cf', 3.4, 0], [14, '#ffd1e0', 4.1, 1.2], [26, '#ffb3cf', 3.7, 2.1], [36, '#ffe3ec', 4.4, 0.6], [20, '#ffc2d6', 3.9, 2.9]]
        .filter(([x]) => (x as number) < W).map(([x, c, d, b]) => drift(x as number, c as string, d as number, b as number, H)).join(''),
    }),
  },
  {
    id: 'astronaut', name: '宇航员', clip: 'LookingAround', skin: 'cream', bob: true,
    dress: (a, _k, _b, f) => {
      f.raw(`<circle cx="${a.cx}" cy="${a.t + 4}" r="10.5" fill="#9fd0ff" fill-opacity=".14" stroke="#e6eef7" stroke-width="1.2"/>`)
      f.rect(Math.round(a.cx) - 6, a.t - 3, 3, 1, '#ffffff')
      f.rect(Math.round(a.cx) + 5, a.t - 9, 1, 3, '#b9c0c8')
      f.rect(a.xL + 3, a.t + 9, a.xR - a.xL - 5, 3, '#c9cfd8')
      f.rect(a.xL + 5, a.t + 10, 2, 1, '#e5534b')
      f.rect(a.xL + 8, a.t + 10, 2, 1, '#4a8fe7')
    },
    fx: (a, W) => ({
      under: [[3, 4, 0], [W - 4, 6, 0.7], [8, 16, 1.4], [W - 9, 2, 2.1], [W - 3, 18, 0.4]].map(([x, y, b]) =>
        `<rect x="${x}" y="${y}" width="1" height="1" fill="#ffffff"><animate attributeName="opacity" values=".2;1;.2" dur="2.4s" begin="${b}s" repeatCount="indefinite"/></rect>`).join(''),
      over: `<rect x="${Math.round(a.cx) + 5}" y="${a.t - 10}" width="1" height="1" fill="#ff5a5a"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>`,
    }),
  },
  {
    id: 'pirate', name: '海盗', clip: 'Walking', w: 48,
    dress: (a, _k, _b, f) => {
      f.hat(['.kk..........kk.', 'kkkkkkkkkkkkkkkk', 'kkkkkkkwwkkkkkkk', '.kkkkkkkkkkkkkk.', '..yyyyyyyyyyyy..'], { k: '#26262b', w: '#f2f2f2', y: '#c9a227' }, a, 1)
      const e = a.eyes[0]
      if (e) {
        f.rect(a.xL, e.y0 - 2, a.xR - a.xL + 1, 1, '#1b1b1f')
        f.rect(e.x0 - 1, e.y0 - 1, e.x1 - e.x0 + 3, e.y1 - e.y0 + 3, '#1b1b1f')
      }
      f.art(['.....s', '....s.', '...s..', '..s...', 'yyy...', '.b....'], { s: '#d5dbe2', y: '#e3b341', b: '#b08457' }, a.armR.x + 1, a.armR.y - 4)
    },
    fx: (_a, W, H) => ({
      under: `<rect x="${W - 5}" y="2" width="1" height="${H - 3}" fill="#b08457"/>` +
        `<g>${pix(['gggg', 'gwwg', 'gggg'], { g: '#26262b', w: '#f2f2f2' }, W - 4, 2)}` +
        `<animateTransform attributeName="transform" type="skewY" values="0;-8;0;6;0" dur="1.6s" repeatCount="indefinite"/></g>`,
    }),
  },
  {
    id: 'painter', name: '画家', clip: 'Swaying', w: 48,
    dress: (a, _k, _b, f) => {
      f.hat(['..........r....', '..rrrrrrrrrr...', '.rrrrrrrrrrrrr.'], { r: '#c8323c' }, a, 0, -1)
      f.art(['.wwwww.', 'wRwYwBw', 'wwwGwww', '.www...'], { w: '#e9d3a7', R: '#e5534b', Y: '#ffd65a', B: '#4a8fe7', G: '#5fbf6f' }, a.armR.x, a.armR.y - 1)
      f.art(['...p', '..b.', '.b..', 'b...'], { b: '#8a5a3b', p: '#4a8fe7' }, a.armL.x - 4, a.armL.y - 3)
    },
    fx: (a, W) => ({
      over: [['#e5534b', 3, a.t - 2, 0], ['#ffd65a', W - 6, a.t, 0.8], ['#4a8fe7', 6, a.t + 12, 1.6], ['#5fbf6f', W - 9, a.t + 13, 2.4]].map(([c, x, y, b]) =>
        `<rect x="${x}" y="${y}" width="2" height="2" fill="${c}" opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.6;1" dur="3.2s" begin="${b}s" repeatCount="indefinite"/></rect>`).join(''),
    }),
  },
  {
    id: 'king', name: '国王', clip: 'Turning',
    dress: (a, _k, b, f) => {
      b.rect(a.xmin - 1, a.t + 3, a.xmax - a.xmin + 3, a.ymax - a.t - 4, '#6b2d8f')
      b.rect(a.xmin - 1, a.ymax - 2, a.xmax - a.xmin + 3, 1, '#f4f1ea')
      f.hat(['y....y....y', 'yy..yyy..yy', 'yyyyyyyyyyy', 'yyryybyyryy'], { y: '#f2c14e', r: '#d64545', b: '#4a7fd6' }, a, 1)
    },
    fx: a => ({ over: twinkle(Math.round(a.cx) + 4, a.t - 3, '#ffffff', 0, 2.2) + twinkle(Math.round(a.cx) - 5, a.t - 2, '#fff2b0', 1.1, 2.2) }),
  },
  {
    id: 'gardener', name: '园丁', clip: 'Swaying', w: 50,
    dress: (a, _k, _b, f) => {
      f.hat(['......ssssssss......', '.....ssssssssss.....', '.....sGGGGGGGGs.....', 'ssssssssssssssssssss'], { s: '#e2c47a', G: '#6fa35a' }, a)
      f.art(['......c', '.....c.', '.cccc..', 'ccccc..', '.cccc..'], { c: '#6aa9c9' }, a.armR.x + 1, a.armR.y - 3)
    },
    fx: (a, _W, H) => {
      const x = a.armR.x + 8, y = a.armR.y - 3
      return {
        over: [0, 0.35, 0.7].map(b => drop(x, y, H - 3, '#7fc8ff', 1.05, b)).join('') +
          `<g transform="translate(${x - 1} ${H - 4})">${pix(['g.g', '.g.', '.g.'], { g: '#6fbf73' }, 0, 0)}</g>`,
      }
    },
  },
  {
    id: 'coder', name: '程序员', clip: 'Laptop',
    dress: (a, _k, _b, f) => {
      glasses(f, a, '#26262b')
      f.hat(['....hhhhhhhh....', '..hhhhhhhhhhhh..', '.hh..........hh.'], { h: '#4a5568' }, a, 2)
    },
    fx: (_a, _W, H) => ({
      under: pix(['mmmh', 'mmmh', 'mmm.'], { m: '#e9e4d8', h: '#e9e4d8' }, 1, H - 4) + `<rect x="1" y="${H - 4}" width="3" height="1" fill="#6b4a2b"/>` +
        rise(pix(['s.', '.s', 's.'], { s: '#cfcfcf' }, 2, H - 8), 5, 2, 0) + rise(pix(['.s', 's.', '.s'], { s: '#cfcfcf' }, 2, H - 8), 5, 2, 1),
    }),
  },
  {
    id: 'santa', name: '圣诞老人', clip: 'Excited',
    dress: (a, _k, _b, f) => {
      f.hat(['........rrrr.ww.', '......rrrrrrrrww', '....rrrrrrrrrr..', '..rrrrrrrrrrrr..', 'wwwwwwwwwwwwwwww'], { r: '#d23c3c', w: '#f6f3ec' }, a)
      // 胡子只盖嘴巴一块,两只眼睛都看得见(正脸)时才画,转身的帧不画,免得飘出去。
      if (a.eyes.length === 2) {
        const [l, r] = a.eyes
        const mid = Math.round((l.x0 + r.x1 + 1) / 2)
        f.art(['.wwwwwwww.', 'wwwwwwwwww', '.wwwwwwww.', '...wwww...'], { w: '#f6f3ec' }, mid - 5, Math.max(l.y1, r.y1) + 2)
      }
    },
    fx: (_a, W, H) => ({
      over: [[4, 0, 3.2], [13, 1.1, 3.8], [24, 0.5, 3.4], [33, 1.7, 4], [W - 4, 2.4, 3.6]].map(([x, b, d]) =>
        `<rect x="${x}" y="-1" width="1" height="1" fill="#ffffff"><animate attributeName="y" values="-1;${H}" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></rect>`).join(''),
    }),
  },
  {
    id: 'rocker', name: '摇滚', clip: 'DancingHappy', w: 50,
    dress: (a, _k, _b, f) => {
      f.hat(['..k..k...k..k...', '.kkk.kk.kkk.kk..', 'kkkkkkkkkkkkkkkk'], { k: '#2a2730' }, a)
      for (const e of a.eyes) f.rect(e.x0 - 1, e.y0, e.x1 - e.x0 + 3, e.y1 - e.y0 + 1, '#111114')
      if (a.eyes.length === 2) f.rect(a.eyes[0].x1 + 2, a.eyes[0].y0, a.eyes[1].x0 - a.eyes[0].x1 - 3, 1, '#111114')
      f.art(['..........nn', '.........n..', '..rr....n...', '.rrrr.nn....', 'rrrrrnn.....', 'rrrrr.......', '.rrr........'],
        { r: '#e85d3c', n: '#5a3e2b' }, a.armR.x - 6, a.armR.y - 3)
    },
    fx: a => ({
      over: twinkle(a.xR + 6, a.t, '#ff9be9', 0, 0.9) + twinkle(a.xL - 4, a.t + 3, '#7fe0ff', 0.45, 0.9),
    }),
  },
]

export const costumeById = (q: string): Costume | undefined =>
  COSTUMES.find(c => c.id === q.toLowerCase() || c.name === q)

/** 快过期时各角色轮着用的慌张动作(都不冒头顶,帽子不出界)。 */
export const PANIC = ['Dizzy', 'Facepalm', 'LookingAround', 'Pointing']
