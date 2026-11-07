import { cp, mkdir, realpath, rm } from "node:fs/promises"
import path from "node:path"
// Only the reader loads these local resources. No viewer, maps, Node binaries,
// scripting sandbox or remote CDN is included.
export async function buildPdfAssets() {
  const root = await realpath(process.cwd())
  const source = path.join(root, "node_modules/pdfjs-dist")
  const target = path.join(root, "public/pdf-assets")
  await mkdir(target, { recursive: true })
  if ((await realpath(target)) !== target)
    throw new Error("PDF assets must be a real workspace directory")
  // The resolved absolute directory above is exactly workspace/public/pdf-assets;
  // reject symlinked parents before removing stale files from an older PDF.js.
  if ((await realpath(path.join(root, "public"))) !== path.join(root, "public"))
    throw new Error("Unexpected public directory")
  await rm(target, { recursive: true })
  await mkdir(target, { recursive: true })
  for (const name of ["cmaps", "standard_fonts", "iccs", "wasm"]) {
    await cp(path.join(source, name), path.join(target, name), {
      recursive: true,
      filter: (file) => !path.basename(file).startsWith("quickjs-eval"),
    })
  }
  await cp(path.join(source, "LICENSE"), path.join(target, "LICENSE"))
  await cp(
    path.join(root, "PDF_THIRD_PARTY_NOTICES.md"),
    path.join(target, "THIRD_PARTY_NOTICES.md"),
  )
}
