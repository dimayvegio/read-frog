import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const result = await build({
  root,
  configFile: false,
  logLevel: "error",
  build: {
    write: false,
    minify: true,
    target: "es2020",
    lib: {
      entry: path.join(root, "src/vocabulary-review/standalone.ts"),
      name: "ReadFrogVocabulary",
      formats: ["iife"],
      fileName: "review",
    },
  },
})
const output = Array.isArray(result) ? result.flatMap((r) => r.output) : result.output
const script = output.find((item) => item.type === "chunk")?.code
if (!script) throw new Error("Vocabulary build produced no script")
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><meta name="color-scheme" content="light dark"><title>Ôn từ vựng | Read Frog</title></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const notices = await Promise.all(
  [
    "LICENSE",
    "node_modules/jszip/LICENSE.markdown",
    "node_modules/dexie/LICENSE",
    "node_modules/dexie/NOTICE",
    "node_modules/zod/LICENSE",
    "node_modules/js-sha256/LICENSE.txt",
  ].map(async (name) => `${name}\n${await fs.readFile(path.join(root, name), "utf8")}`),
)
await fs.writeFile(
  path.join(root, "public/vocabulary-review.html"),
  html + `\n<!--\n${notices.join("\n\n").replace(/--/g, "- -")}\n-->`,
)
console.log(`Built standalone vocabulary HTML (${Buffer.byteLength(html)} bytes)`)
