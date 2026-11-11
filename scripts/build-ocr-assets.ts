import { cp, mkdir, readdir, realpath, rm } from "node:fs/promises"
import path from "node:path"

// All executable code and language data stay inside the extension. LSTM-only
// mode uses three CPU variants; include all three so non-SIMD devices work too.
export async function buildOcrAssets() {
  const root = await realpath(process.cwd())
  const target = path.join(root, "public/ocr-assets")
  await mkdir(target, { recursive: true })
  if (
    (await realpath(target)) !== target ||
    (await realpath(path.join(root, "public"))) !== path.join(root, "public")
  )
    throw new Error("OCR assets must stay inside the workspace")
  // v7 .wasm.js builds embed their WASM payload. Separate .wasm files are not
  // requested; discard only these known stale generated files from earlier builds.
  for (const name of await readdir(target))
    if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm$/.test(name))
      await rm(path.join(target, name))
  await cp(
    path.join(root, "node_modules/tesseract.js/dist/worker.min.js"),
    path.join(target, "worker.min.js"),
  )
  const core = path.join(root, "node_modules/tesseract.js-core")
  for (const name of await readdir(core))
    if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(name))
      await cp(path.join(core, name), path.join(target, name))
  for (const lang of ["eng", "vie", "chi_sim", "jpn"])
    await cp(
      path.join(
        root,
        `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
      ),
      path.join(target, `${lang}.traineddata.gz`),
    )
  for (const name of ["tesseract.js", "tesseract.js-core", "pdf-lib"])
    await cp(
      path.join(
        root,
        `node_modules/${name}/${name === "tesseract.js-core" ? "LICENSE" : "LICENSE.md"}`,
      ),
      path.join(target, `${name}.LICENSE`),
    )
  await cp(path.join(root, "PDF_OCR_NOTICES.md"), path.join(target, "NOTICES.md"))
}
