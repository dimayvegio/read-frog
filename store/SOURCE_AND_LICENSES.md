# Corresponding source and licenses

GPL-3.0 derivative of Read Frog: retain LICENSE, upstream copyright and third-party notices. Corresponding source is the complete repository at tag **v1.59.3A.12**, including lockfile, build scripts, local public assets and horse master/provenance. GitHub supplies source archives for the exact tag. Verify public source/tag access before distributing binaries. Minified ZIP alone is not corresponding source.

Rebuild on Node 26 and the packageManager pnpm version:

```sh
pnpm install --frozen-lockfile
SKIP_FREE_API=true NX_DAEMON=false pnpm test
pnpm lint
pnpm fmt:check
pnpm zip:edge
node scripts/debug/audit-runtime-network.mjs
node scripts/debug/audit-store.mjs
```

PowerShell: set `$env:SKIP_FREE_API='true'` and `$env:NX_DAEMON='false'` first. No publisher key, Google client ID, telemetry token or unpublished local packages required. Local-package builds cannot ZIP. Browser regressions additionally need Chrome/Edge, ffmpeg and the Puppeteer harness; see scripts/debug. Rebuild byte hashes can vary by platform/toolchain.

PDF.js/Tesseract notices ship in pdf-assets/ocr-assets; PDF_OCR_NOTICES.md documents Apache-2.0 changes. Worker v7 fingerprint is pinned: remote defaults fail closed, only packaged OCR assets load, dynamic Function global detection replaced with globalThis. Upgrades must pass fingerprint checks and real offline OCR tests. LameJS MP3 and other bundled notices remain. Horse provenance: assets/brand/PROVENANCE.md; resizing: scripts/build-store-assets.mjs.

No ownership of upstream/site trademarks, video content or creator voices is claimed. No DRM removal, media-download bypass or voice clone. API output is never evaluated code. Store availability does not replace GPL obligations.

Bundled remark-gfm 4.0.1 and newly bundled parser helpers use MIT notices reproduced in public/licenses/remark-gfm-notices.txt (included in the extension ZIP). No runtime remote code or image loading is added.
