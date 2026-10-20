// sheet.mjs — every layout with every kind of title, drawn, on one page at phone width, to look at side by side.
//   node tools/sheet.mjs [photo.jpg]   → out/sheet.html
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { png } from '../src/node.mjs'

const photo = process.argv[2] ? { bytes: readFileSync(process.argv[2]) } : null
const tall = process.argv[3] ? { bytes: readFileSync(process.argv[3]) } : null
const titles = [
  { title: 'Khao Soi Mae Sai', sub: 'Noodles in curry broth since 1987, Nimman soi 7', kicker: 'Mot Dang', lang: 'en' },
  { title: 'ข้าวซอยแม่สายสูตรดั้งเดิมจากเชียงราย', sub: 'ก๋วยเตี๋ยวน้ำแกง ซอยนิมมาน 7', kicker: 'มดแดง', lang: 'th' },
  { title: 'Incomprehensibilities of Quantum Computing', sub: 'Qubits, gates and error correction', kicker: 'NaNoBotCo', lang: 'en' },
  { title: 'ဘာသာပြန် ဝန်ဆောင်မှု', sub: 'Translation for Myanmar workers', kicker: 'Visa Desk', lang: 'my' },
]
const out = new URL('../out/', import.meta.url)
mkdirSync(out, { recursive: true })
const cells = []
for (const layout of ['photo', 'band', 'split', 'plain']) for (const [i, t] of titles.entries()) {
  const font = ['chonburi', 'prompt', 'serif', 'prompt'][i]
  const spec = { ...t, layout, font, url: 'sites.motdang.net/khaosoi-mae-sai', accent: ['#d7261e', '#1f6feb', '#7c3aed', '#0f766e'][i], image: i === 3 && tall ? tall : photo, gold: i === 0, credit: photo ? 'Photo · CC BY 4.0' : '' }
  const name = `${layout}-${i}-${font}.png`
  const t0 = Date.now()
  const r = await png(spec)
  writeFileSync(new URL(name, out), r.png)
  cells.push(`<figure><img src="${name}"><figcaption>${layout} · ${font} · ${Date.now() - t0} ms</figcaption></figure>`)
}
writeFileSync(new URL('sheet.html', out), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:16px;background:#e9e4dc;font:14px system-ui}main{display:grid;grid-template-columns:repeat(auto-fill,390px);gap:14px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}img{width:390px;display:block}figcaption{padding:6px 10px;color:#555}</style><main>${cells.join('')}</main>`)
console.log(cells.length, 'cards')
