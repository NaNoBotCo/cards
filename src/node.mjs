// node.mjs — the library in Node: fonts from fonts/, resvg from node_modules. For tests and the sheet.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { fonts, svg, FACES } from './draw.mjs'

const dir = new URL('../fonts/', import.meta.url)
const bytes = Object.fromEntries(readdirSync(dir).filter((f) => FACES[f]).map((f) => [f, readFileSync(new URL(f, dir))]))
const require = createRequire(import.meta.url)
let ready = null

export async function png(spec) {
  ready = ready || initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
  await ready
  const F = fonts(bytes)
  const s = svg(F, spec)
  const r = new Resvg(s, { font: { fontBuffers: Object.values(bytes).map((b) => new Uint8Array(b)), loadSystemFonts: false, defaultFontFamily: 'Prompt' } })
  return { png: r.render().asPng(), svg: s }
}
