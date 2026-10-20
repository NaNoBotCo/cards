// draw.mjs — a 1200×630 share card from a spec, as SVG, drawn to PNG by resvg (NaN 2026-10-20: "add a
// card-drawing library and some kind of user input interface on card design"). The words are measured
// with the fonts' own advance widths and broken only between words (Thai between dictionary words), at
// the largest size that fits; resvg shapes them. No browser.
//
// A spec:
//   layout   photo · band · split · plain (no picture)            default photo, or plain without image
//   title    the page's name                    sub     one line under it
//   kicker   the site's name, top left          url     the address at the foot
//   image    { bytes: Uint8Array (JPEG or PNG) }  focus  [fx, fy], 0–1, the part of the picture to keep
//   accent   #rrggbb                            bg, ink  colours of the panel and the words
//   font     prompt · chonburi · sriracha · anton · serif   (the title's typeface)
//   avatar   { bytes } a round picture top left  gold    true: a gilt frame and the Gold mark
//   credit   a borrowed picture's credit and licence, small at the foot
//   lang     th · my · km … (line height and the word breaker)

import { parse } from 'opentype.js/dist/opentype.mjs'

export const W = 1200, H = 630
export const LAYOUTS = ['photo', 'band', 'split', 'plain']
export const FONTS = ['prompt', 'chonburi', 'sriracha', 'anton', 'serif']

// file → family and weight; the bytes are handed in by the caller (worker: bundled data; node: read from disk)
export const FACES = {
  'Prompt-ExtraBold.ttf': ['Prompt', 800], 'Prompt-SemiBold.ttf': ['Prompt', 600], 'Prompt-Regular.ttf': ['Prompt', 400],
  'Chonburi-Regular.ttf': ['Chonburi', 400], 'Sriracha-Regular.ttf': ['Sriracha', 400], 'Anton-Regular.ttf': ['Anton', 400],
  'DMSerifDisplay-Regular.ttf': ['DM Serif Display', 400], 'Padauk-Bold.ttf': ['Padauk', 700], 'Battambang-Bold.ttf': ['Battambang', 700],
}
const TITLE = { prompt: 'Prompt-ExtraBold.ttf', chonburi: 'Chonburi-Regular.ttf', sriracha: 'Sriracha-Regular.ttf', anton: 'Anton-Regular.ttf', serif: 'DMSerifDisplay-Regular.ttf' }
// a glyph the title's face lacks comes from the first of these that has it
const FALLBACK = ['Prompt-ExtraBold.ttf', 'Padauk-Bold.ttf', 'Battambang-Bold.ttf']

let parsed = null
/** Parse the fonts once per isolate. bytes: { file: ArrayBuffer|Uint8Array } */
export function fonts(bytes) {
  if (parsed) return parsed
  parsed = {}
  for (const [f, b] of Object.entries(bytes)) {
    const ab = b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
    parsed[f] = parse(ab)
  }
  return parsed
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const hex = (c, d) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : d
function lum(h) {
  const v = parseInt(h.slice(1), 16)
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255
}

// ---- words ----------------------------------------------------------------------------------------

const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null
const THAI = /[฀-๿]/
const TALL = /[က-႟ក-៿ꩠ-ꩿ]/ // Myanmar, Khmer: taller lines

/**
 * The text as unbreakable pieces, each with whether a space goes before it. A separator ( · | — ) stays
 * with the word before it. Thai with no spaces splits between dictionary words.
 */
export function pieces(text) {
  const out = []
  const words = String(text || '').trim().replace(/\s+([·|—–:])\s+/g, ' $1 ').split(/ +/).filter(Boolean)
  for (const w of words) {
    if (SEG && THAI.test(w) && w.length > 6) {
      let first = true
      for (const s of SEG.segment(w)) { out.push({ t: s.segment, sp: first && out.length > 0 }); first = false }
      // a mark or a short piece never starts a line: glue pieces under two letters to the one before
      for (let i = out.length - 1; i > 0; i--) if (!out[i].sp && [...out[i].t].length < 2) { out[i - 1].t += out[i].t; out.splice(i, 1) }
    } else out.push({ t: w, sp: out.length > 0 })
  }
  return out
}

/** Width of text at size fs: each character from the first face that has it. */
function width(F, face, text, fs) {
  let w = 0, run = '', runFace = null
  // advance widths glyph by glyph (opentype.js's own layout trips on some fonts' substitution tables);
  // no kerning, so 2% more for safety
  const flush = () => { if (run) { const f = F[runFace]; let u = 0; for (const c of run) u += f.charToGlyph(c).advanceWidth || 0; w += u * fs / f.unitsPerEm * 1.02 } run = '' }
  for (const ch of text) {
    const f = [face, ...FALLBACK].find((x) => F[x] && F[x].charToGlyphIndex(ch) > 0) || face
    if (f !== runFace) { flush(); runFace = f }
    run += ch
  }
  flush()
  return w
}

/** Lines of `text` in `face` that fit `box` ({ w, h }), at the largest size from big down; null if none fits. */
export function fit(F, face, text, box, { big = 128, small = 40, max = 4, lh = 1.06 } = {}) {
  const ps = pieces(text)
  if (!ps.length) return { fs: big, lines: [], lh }
  const wrap = (list, fs, w) => {
    const lines = []
    let cur = ''
    for (const p of list) {
      const t = cur ? cur + (p.sp ? ' ' : '') + p.t : p.t
      if (cur && width(F, face, t, fs) > w) { lines.push(cur); cur = p.t } else cur = t
    }
    if (cur) lines.push(cur)
    return lines
  }
  // the same number of lines, as even as they go: narrow the measure while the count holds
  const balanced = (list, fs) => {
    let lines = wrap(list, fs, box.w)
    if (lines.length < 2) return lines
    for (let w = box.w - 8; w > box.w * 0.4; w -= 8) {
      const l = wrap(list, fs, w)
      if (l.length !== lines.length || list.some((p) => width(F, face, p.t, fs) > w)) break
      lines = l
    }
    return lines
  }
  // a separator ( · | — ) is the first place to break: each side wrapped on its own
  const cut = ps.findIndex((p, i) => i > 0 && /\u00a0[·|—–:]$/.test(ps[i - 1].t))
  for (let fs = big; fs >= small; fs -= 4) {
    if (ps.some((p) => width(F, face, p.t, fs) > box.w)) continue
    let lines = balanced(ps, fs)
    if (lines.length > 1 && cut > 0) {
      const at = [...balanced(ps.slice(0, cut), fs), ...balanced(ps.slice(cut).map((p, i) => (i ? p : { ...p, sp: false })), fs)]
      if (at.length <= lines.length + 1 && at.length <= max) lines = at
    }
    if (lines.length <= max && lines.length * fs * lh <= box.h) return { fs, lines, lh }
  }
  return null
}

// ---- pictures ------------------------------------------------------------------------------------

/** Width and height of a JPEG or PNG, from its header. */
export function dims(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0, type: 'png' }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8], type: 'jpeg' }
      i += 2 + len
    }
  }
  return null
}

const b64 = (u8) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64')
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(s)
}

/** An <image> filling x,y,w,h, cropped around focus, clipped to the box. */
function picture(img, box, focus = [0.5, 0.5], id = 'p', fit = 'cover') {
  const d = dims(img.bytes)
  if (!d) return ''
  const r = (fit === 'contain' ? Math.min : Math.max)(box.w / d.w, box.h / d.h), iw = d.w * r, ih = d.h * r
  const fx = Math.min(1, Math.max(0, Number(focus[0]) || 0.5)), fy = Math.min(1, Math.max(0, Number(focus[1]) || 0.5))
  const x = fit === 'contain' ? box.x + (box.w - iw) / 2 : box.x + Math.min(0, Math.max(box.w - iw, box.w / 2 - fx * iw))
  const y = fit === 'contain' ? box.y + (box.h - ih) / 2 : box.y + Math.min(0, Math.max(box.h - ih, box.h / 2 - fy * ih))
  return `<clipPath id="${id}c"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath>` +
    `<image clip-path="url(#${id}c)" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="none" href="data:image/${d.type};base64,${b64(img.bytes)}"/>`
}

// ---- the card ------------------------------------------------------------------------------------

/** The SVG of a card. F: parsed fonts. */
export function svg(F, spec) {
  const s = spec || {}
  const has = !!(s.image && s.image.bytes && dims(s.image.bytes))
  let layout = LAYOUTS.includes(s.layout) ? (s.layout === 'plain' || has ? s.layout : 'plain') : has ? 'photo' : 'plain'
  // a tall picture behind the words keeps only its middle band: beside them it shows whole
  const pd = has ? dims(s.image.bytes) : null
  if (layout === 'photo' && pd && pd.h > pd.w * 1.05) layout = 'split'
  const accent = hex(s.accent, '#d7261e')
  const bg = hex(s.bg, layout === 'band' || layout === 'split' ? accent : '#16120e')
  const panelDark = lum(bg) < 0.5
  const ink = hex(s.ink, layout === 'photo' ? '#fff8ec' : panelDark ? '#fff8ec' : '#17130f')
  const face = TITLE[FONTS.includes(s.font) ? s.font : 'prompt']
  const fam = (f) => `${FACES[f][0]}, Prompt, Padauk, Battambang`
  const tall = TALL.test(s.title || '') || /^(my|km|shn)/.test(s.lang || '')
  const lh = tall ? 1.45 : THAI.test(s.title || '') ? 1.14 : 1.04
  const out = []
  const P = 64
  const top = s.avatar || s.gold ? 196 : s.kicker ? 140 : 96

  // the picture and the panel
  let box
  if (layout === 'photo') {
    out.push(picture(s.image, { x: 0, y: 0, w: W, h: H }, s.focus))
    out.push(`<linearGradient id="sl" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#080604" stop-opacity=".82"/><stop offset=".55" stop-color="#080604" stop-opacity=".45"/><stop offset=".85" stop-color="#080604" stop-opacity="0"/></linearGradient>`,
      `<linearGradient id="sb" x1="0" x2="0" y1="0" y2="1"><stop offset=".5" stop-color="#080604" stop-opacity="0"/><stop offset="1" stop-color="#080604" stop-opacity=".72"/></linearGradient>`,
      `<rect width="${W}" height="${H}" fill="url(#sl)"/><rect width="${W}" height="${H}" fill="url(#sb)"/>`)
    box = { x: P, y: top, w: W - P - 300, h: H - 132 - top }
  } else if (layout === 'band') {
    const by = 352
    out.push(picture(s.image, { x: 0, y: 0, w: W, h: by }, s.focus), `<rect y="${by}" width="${W}" height="${H - by}" fill="${bg}"/><rect y="${by}" width="${W}" height="10" fill="${accent}"/>`)
    box = { x: P, y: by + 34, w: W - 2 * P, h: H - by - 34 - 96 }
  } else if (layout === 'split') {
    const sx = 640
    // a tall picture sits whole on a dark ground; a wide one fills the half
    const whole = pd && pd.h > pd.w * 1.05
    out.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`, whole ? `<rect x="${sx}" width="${W - sx}" height="${H}" fill="#0b0906"/>` : '',
      picture(s.image, { x: sx, y: 0, w: W - sx, h: H }, s.focus, 'p', whole ? 'contain' : 'cover'), `<rect x="${sx - 5}" width="10" height="${H}" fill="${accent}"/>`)
    box = { x: P, y: top, w: sx - P - 44, h: H - 132 - top }
  } else {
    out.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`,
      `<radialGradient id="gl" cx=".84" cy=".26" r=".62"><stop offset="0" stop-color="${accent}" stop-opacity=".42"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#gl)"/>`)
    const g = [...String(s.glyph || s.title || '').trim()][0]
    if (g) out.push(`<text x="${W + 30}" y="${H - 10}" text-anchor="end" font-family="${fam(face)}" font-size="700" fill="${accent}" fill-opacity=".16">${esc(g)}</text>`)
    box = { x: P, y: top, w: 880, h: H - 132 - top }
  }

  // avatar, Gold mark, kicker
  let kx = P
  if (s.avatar && s.avatar.bytes && dims(s.avatar.bytes)) {
    out.push(`<clipPath id="av"><circle cx="${P + 56}" cy="${P + 56}" r="56"/></clipPath>`, picture(s.avatar, { x: P, y: P, w: 112, h: 112 }, [0.5, 0.5], 'a').replace('clip-path="url(#ac)"', 'clip-path="url(#av)"'),
      `<circle cx="${P + 56}" cy="${P + 56}" r="54" fill="none" stroke="${s.gold ? '#e9b43b' : '#fff8ec'}" stroke-width="5"/>`)
    kx += 134
  }
  if (s.gold) {
    const gy = s.avatar ? P + 38 : P
    out.push(`<linearGradient id="gm" x1="0" x2="1"><stop offset="0" stop-color="#9c6a1c"/><stop offset=".45" stop-color="#f8dd8e"/><stop offset="1" stop-color="#d9a441"/></linearGradient>`,
      `<rect x="${kx}" y="${gy}" width="132" height="40" rx="20" fill="url(#gm)"/>${star(kx + 28, gy + 20, 10, '#2a1a04')}<text x="${kx + 46}" y="${gy + 27}" font-family="Prompt" font-weight="800" font-size="20" fill="#2a1a04">GOLD</text>`)
    kx += 152
  }
  const onPanel = layout === 'photo' ? '#fff8ec' : ink
  if (s.kicker && layout !== 'band') {
    const ky = s.avatar || s.gold ? (s.avatar ? P + 66 : P + 28) : P + 24
    if (!s.avatar && !s.gold) out.push(`<rect x="${P}" y="${ky - 15}" width="56" height="10" rx="5" fill="${layout === 'split' ? ink : accent}"/>`)
    const kxx = !s.avatar && !s.gold ? P + 72 : kx
    out.push(`<text x="${kxx}" y="${ky}" font-family="Prompt, Padauk, Battambang" font-weight="600" font-size="28" fill="${layout === 'split' || layout === 'plain' ? ink : '#fff8ec'}">${esc(clip(F, s.kicker, 'Prompt-SemiBold.ttf', 28, (layout === 'split' ? 600 : W - 80) - kxx))}</text>`)
  }

  // title and line
  const subFs = 32
  const sub = String(s.sub || '').trim()
  const subLines = sub ? (fit(F, 'Prompt-Regular.ttf', sub, { w: box.w, h: subFs * 1.4 * 2 }, { big: subFs, small: 22, max: 2, lh: 1.4 }) || { fs: 22, lines: [clip(F, sub, 'Prompt-Regular.ttf', 22, box.w)], lh: 1.4 }) : null
  // the gap under the title: Thai and Myanmar marks hang below the line
  const gapOf = (fs) => Math.max(18, Math.round(fs * (tall ? 0.42 : THAI.test(s.title || '') ? 0.24 : 0.18)))
  const subH = subLines ? subLines.lines.length * subLines.fs * 1.4 + 18 : 0
  const maxLines = layout === 'band' ? 2 : 4
  const big = tall ? 100 : layout === 'band' ? 96 : String(s.title || '').length < 14 ? 150 : 128
  const fitT = (b, o) => { for (let fs = o.big; fs >= o.small; fs -= 4) { const r = fit(F, face, s.title || '', { w: b.w, h: b.h - (subH ? gapOf(fs) - 18 : 0) }, { ...o, big: fs, small: fs }); if (r) return r } return null }
  const t = fitT({ w: box.w, h: box.h - subH }, { big, small: 36, max: maxLines, lh }) ||
    fit(F, face, s.title || '', { w: box.w, h: box.h }, { big: 60, small: 24, max: maxLines + 2, lh }) || { fs: 24, lines: [clip(F, s.title, face, 24, box.w)], lh }
  const asc = (f) => F[f].ascender / F[f].unitsPerEm
  const blockH = t.lines.length * t.fs * t.lh + subH + (subH ? gapOf(t.fs) - 18 : 0)
  let y = layout === 'band' ? box.y : box.y + box.h - blockH
  const shadow = layout === 'photo' ? ' filter="url(#ts)"' : ''
  if (shadow) out.push(`<filter id="ts" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="12"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)
  const tw = FACES[face][1]
  out.push(`<g${shadow} fill="${onPanel}" font-family="${fam(face)}" font-weight="${tw}" font-size="${t.fs}">`)
  for (const l of t.lines) {
    out.push(`<text x="${box.x}" y="${(y + t.fs * (t.lh - 1) / 2 + t.fs * asc(face) * 0.94).toFixed(1)}">${esc(l)}</text>`)
    y += t.fs * t.lh
  }
  out.push('</g>')
  if (subLines) {
    y += gapOf(t.fs)
    for (const l of subLines.lines) {
      out.push(`<text x="${box.x}" y="${(y + subLines.fs).toFixed(1)}" font-family="Prompt, Padauk, Battambang" font-size="${subLines.fs}" fill="${onPanel}" fill-opacity=".9">${esc(l)}</text>`)
      y += subLines.fs * 1.4
    }
  }

  // the address, the credit
  const footInk = layout === 'band' || layout === 'split' || layout === 'plain' ? ink : '#fff8ec'
  if (s.url) {
    const u = String(s.url).replace(/^https?:\/\//, '').replace(/\/$/, '')
    const fy = H - 54
    out.push(`<rect x="${P}" y="${fy - 34}" width="44" height="44" rx="12" fill="${layout === 'band' || layout === 'split' ? footInk : accent}"${layout === 'band' || layout === 'split' ? ' fill-opacity=".9"' : ''}/>`,
      `<text x="${P + 60}" y="${fy}" font-family="Prompt" font-weight="600" font-size="28" fill="${footInk}">${esc(clip(F, u, 'Prompt-SemiBold.ttf', 28, (layout === 'split' ? 640 : W) - P - 60 - 40))}</text>`)
  }
  if (s.credit && has && layout !== 'plain') {
    const c = String(s.credit).slice(0, 90), cw = width(F, 'Prompt-Regular.ttf', c, 16)
    out.push(`<rect x="${W - 36 - cw}" y="${H - 44}" width="${cw + 20}" height="28" rx="14" fill="#000" fill-opacity=".55"/>`,
      `<text x="${W - 26}" y="${H - 24}" text-anchor="end" font-family="Prompt" font-size="16" fill="#fff" fill-opacity=".9">${esc(c)}</text>`)
  }
  if (s.gold) out.push(`<linearGradient id="gf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9c6a1c"/><stop offset=".3" stop-color="#f8dd8e"/><stop offset=".5" stop-color="#d9a441"/><stop offset=".8" stop-color="#f3c552"/><stop offset="1" stop-color="#9c6a1c"/></linearGradient>`,
    `<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="url(#gf)" stroke-width="6"/><rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="url(#gf)" stroke-width="1.5"/>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`
}

/** a five-pointed star centred at cx, cy */
function star(cx, cy, r, fill) {
  const pts = []
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; pts.push(`${(cx + q * Math.cos(a)).toFixed(1)},${(cy + q * Math.sin(a)).toFixed(1)}`) }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`
}

/** text cut at a word so it fits w, with an ellipsis */
function clip(F, text, face, fs, w) {
  let t = String(text || '').trim()
  if (width(F, face, t, fs) <= w) return t
  const ws = t.split(' ')
  while (ws.length > 1 && width(F, face, ws.join(' ') + '…', fs) > w) ws.pop()
  t = ws.join(' ')
  while (t.length > 1 && width(F, face, t + '…', fs) > w) t = t.slice(0, -1)
  return t + '…'
}
