import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const root = path.resolve(process.argv[2] ?? ".output/edge-mv3")
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"))
assert.equal(manifest.manifest_version, 3)
assert.equal(manifest.version, "1.59.3.7")
assert.equal(manifest.version_name, "1.59.3A")
assert.equal(manifest.key, undefined, "No injected publisher/development identity")
assert.deepEqual(
  [...manifest.permissions].toSorted((a, b) => a.localeCompare(b)),
  [
    "downloads",
    "activeTab",
    "storage",
    "unlimitedStorage",
    "tabs",
    "alarms",
    "contextMenus",
    "scripting",
    "webNavigation",
    "offscreen",
    "sidePanel",
    "tabCapture",
  ].toSorted((a, b) => a.localeCompare(b)),
)
assert.equal(
  manifest.content_security_policy.extension_pages,
  "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
)
assert.equal(manifest.homepage_url, "https://github.com/dimayvegio/read-frog")
const files = []
async function walk(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    assert.ok(!item.isSymbolicLink(), "No linked assets")
    const file = path.join(dir, item.name)
    if (item.isDirectory()) await walk(file)
    else files.push(file)
  }
}
await walk(root)
let scripts = 0
for (const file of files) {
  assert.ok(!/\.(?:pem|map|env|crx)$/i.test(file), "No secrets/maps/development packaging")
  if (!/\.(?:js|html)$/.test(file)) continue
  const source = await fs.readFile(file, "utf8")
  if (file.endsWith(".js")) {
    scripts++
    assert.ok(!/\bnew\s+Function\s*\(|\beval\s*\(/.test(source), `No JS evaluation: ${file}`)
    assert.ok(!source.includes("cdn.jsdelivr.net"), `No executable OCR CDN fallback: ${file}`)
    assert.ok(!/sk-(?:proj-)?[A-Za-z0-9_-]{32,}/.test(source), `No API key-like literal: ${file}`)
  } else {
    for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)/g))
      assert.ok(!/^(?:https?:)?\/\//.test(match[1]), "No remote HTML scripts")
  }
}
assert.ok((await fs.readFile(path.join(root, "privacy.html"), "utf8")).includes("admin@4dv.top"))
assert.ok(
  (await fs.readFile(path.join(root, "LICENSE"), "utf8")).includes("GNU GENERAL PUBLIC LICENSE"),
)
const locales = await fs.readdir(path.join(root, "_locales"))
assert.ok(!locales.includes("az"), "Runtime az retained, unsupported Chromium manifest az omitted")
const localized = JSON.parse(await fs.readFile("store/listings/localized.json", "utf8"))
for (const locale of locales) {
  const messages = JSON.parse(
    await fs.readFile(path.join(root, "_locales", locale, "messages.json"), "utf8"),
  )
  assert.equal(messages.extName.message, "FlowRead")
  const listing = ["en", "vi"].includes(locale)
    ? await fs.readFile(`store/listings/${locale}.md`, "utf8")
    : localized[locale]?.description
  assert.ok(listing && listing.length >= 250 && listing.length <= 10000, `Listing ${locale}`)
}
const dimensions = async (file, width, height) => {
  const png = await fs.readFile(file)
  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a")
  assert.equal(png.readUInt32BE(16), width)
  assert.equal(png.readUInt32BE(20), height)
}
await dimensions("store/media/icon-128.png", 128, 128)
await dimensions("store/media/icon-300.png", 300, 300)
await dimensions("store/media/promo-small.png", 440, 280)
await dimensions("store/media/promo-marquee.png", 1400, 560)
const shots = (await fs.readdir("store/media")).filter((f) => /^screenshot-.*\.png$/.test(f))
if (process.env.STORE_REQUIRE_SCREENSHOTS === "true") assert.ok(shots.length >= 1)
for (const shot of shots) await dimensions(path.join("store/media", shot), 1280, 800)
console.log(
  JSON.stringify(
    {
      manifest: manifest.version,
      display: manifest.version_name,
      files: files.length,
      scripts,
      locales,
      screenshots: shots,
      result: "passed",
      limits:
        "Static audit complements production tests; no store approval or live AI quality claim.",
    },
    null,
    2,
  ),
)
