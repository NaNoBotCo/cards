// worker.mjs — the card library as a Worker (NaN 2026-10-20). No public address: other Workers reach it
// through a service binding (CARDS) and POST a spec to /draw; the answer is a 1200×630 JPEG.
//
//   POST /draw  { ...spec (draw.mjs), image: { url } | { b64 }, avatar: { url } | { b64 } }  →  image/jpeg
//
// Pictures are turned into JPEG first by the Images binding, so any format a page holds can be drawn.

import { initWasm, Resvg } from '@resvg/resvg-wasm'
import wasm from '@resvg/resvg-wasm/index_bg.wasm'
import { fonts, svg, FACES } from './draw.mjs'
import f1 from '../fonts/Prompt-ExtraBold.ttf'
import f2 from '../fonts/Prompt-SemiBold.ttf'
import f3 from '../fonts/Prompt-Regular.ttf'
import f4 from '../fonts/Chonburi-Regular.ttf'
import f5 from '../fonts/Sriracha-Regular.ttf'
import f6 from '../fonts/Anton-Regular.ttf'
import f7 from '../fonts/DMSerifDisplay-Regular.ttf'
import f8 from '../fonts/Padauk-Bold.ttf'
import f9 from '../fonts/Battambang-Bold.ttf'

const BYTES = { 'Prompt-ExtraBold.ttf': f1, 'Prompt-SemiBold.ttf': f2, 'Prompt-Regular.ttf': f3, 'Chonburi-Regular.ttf': f4, 'Sriracha-Regular.ttf': f5,
  'Anton-Regular.ttf': f6, 'DMSerifDisplay-Regular.ttf': f7, 'Padauk-Bold.ttf': f8, 'Battambang-Bold.ttf': f9 }
const BUFFERS = Object.values(BYTES).map((b) => new Uint8Array(b))
let ready = null
const MAX = 15e6 // a picture's bytes, at most

/** A picture as JPEG bytes no wider than `w`, or null. */
async function pic(env, p, w) {
  if (!p) return null
  let bytes = null
  if (typeof p.b64 === 'string') {
    if (p.b64.length > MAX * 4 / 3 + 4) return null
    bytes = Uint8Array.from(atob(p.b64), (c) => c.charCodeAt(0))
  } else if (/^https:\/\//.test(p.url || '')) {
    const r = await fetch(p.url, { cf: { cacheTtl: 3600 } })
    if (!r.ok || !r.body || Number(r.headers.get('content-length') || 0) > MAX) return null
    // read no more than MAX, whatever the header said
    const parts = [], reader = r.body.getReader()
    let n = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      n += value.length
      if (n > MAX) { await reader.cancel(); return null }
      parts.push(value)
    }
    bytes = new Uint8Array(n)
    let at = 0
    for (const v of parts) { bytes.set(v, at); at += v.length }
  }
  if (!bytes || !bytes.length) return null
  if (!env.IMAGES) return { bytes }
  const out = await env.IMAGES.input(new Response(bytes).body).transform({ width: w, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 88 })
  return { bytes: new Uint8Array(await out.response().arrayBuffer()) }
}

export async function draw(env, spec) {
  ready = ready || initWasm(wasm)
  await ready
  const [image, avatar] = await Promise.all([pic(env, spec.image, 1400).catch(() => null), pic(env, spec.avatar, 240).catch(() => null)])
  const s = svg(fonts(BYTES), { ...spec, image, avatar })
  const png = new Resvg(s, { font: { fontBuffers: BUFFERS, loadSystemFonts: false, defaultFontFamily: 'Prompt' } }).render().asPng()
  if (!env.IMAGES) return { bytes: png, type: 'image/png' }
  const jpg = await env.IMAGES.input(new Response(png).body).output({ format: 'image/jpeg', quality: 86 })
  return { bytes: new Uint8Array(await jpg.response().arrayBuffer()), type: 'image/jpeg' }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/draw') return new Response('', { status: 404 })
    let spec
    try { spec = await request.json() } catch { return new Response('spec', { status: 400 }) }
    try {
      const r = await draw(env, spec || {})
      return new Response(r.bytes, { headers: { 'content-type': r.type } })
    } catch (e) {
      console.error('draw', String(e?.stack || e))
      return new Response('draw', { status: 500 })
    }
  },
}
