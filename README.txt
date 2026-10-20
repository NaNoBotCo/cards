cards

A 1200×630 share card from a spec, drawn in a Cloudflare Worker: words measured with the fonts' advance widths and broken only between words (Thai between dictionary words, Intl.Segmenter), at the largest size that fits; the SVG drawn by resvg; pictures turned to JPEG by the Images binding. No browser.

  src/draw.mjs     the card: layouts photo, band, split, plain; spec fields at the top of the file
  src/worker.mjs   POST /draw {spec} → image/jpeg, reached only through a service binding (CARDS)
  src/node.mjs     the same in Node
  tools/sheet.mjs  every layout with Latin, Thai, Myanmar and a long title, side by side at phone width

  node tools/sheet.mjs wide.jpg tall.jpg   → out/sheet.html
  cfdeploy .                               deploy

Fonts in fonts/ are from Google Fonts under the SIL Open Font License 1.1 (fonts/OFL.txt): Prompt, Chonburi, Sriracha, Anton, DM Serif Display, Padauk, Battambang.
