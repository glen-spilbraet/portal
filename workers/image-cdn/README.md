# image-cdn

`https://img.spilbraet.dk/<r2 key>?w=300|600|1000|1600` — Portal's R2 images
(`portal-images`) as WebP in fixed widths, for the B2B shop and anything else.

- A width is made once with the Images binding, stored in R2 as
  `<key>_<w>.webp` (same naming as Portal's older browser-made variants) and
  served from R2 after that. Cached a year at the edge (keys never change).
- If making a width fails (free quota used up, broken file, > 20 MB), the
  original is served with a 1-hour cache, so images never break.
- Without `?w` the original is served.

Export for the B2B shop's image downloads (not public): the shop calls
`https://export.internal/__export/<r2 key>?w=3000&h=3000&fit=fit|fill` through
its service binding `IMAGE_CDN`. That host never reaches the worker from the
internet, so no key is needed. Returns a w×h JPEG on white: fit pads, fill
crops. Each size/fit/image is a unique transformation (Images quota).

Deploy (from the repo root): `npx wrangler deploy -c workers/image-cdn/wrangler.toml`

Backfill all widths for every image the shop uses: request each URL once, e.g.
the shop repo's `scripts/warm-images.mjs`.

Cost: the Images binding counts unique transformations per month (5,000 free
on the Free plan). Each image/width is transformed once in its lifetime, so
normal use stays far below that.
