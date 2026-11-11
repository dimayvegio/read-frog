import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/anipm-context-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const mediaPath = path.join(scratch, "synthetic.webm")
await promisify(execFile)("ffmpeg", [
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=0x193d35:s=640x360:r=10",
  "-t",
  "3",
  "-c:v",
  "libvpx",
  "-deadline",
  "realtime",
  mediaPath,
])
const media = await fs.readFile(mediaPath)
const evidence = {
  checks: [],
  errors: [],
  liveOpenAI: false,
  fixture:
    "Synthetic video + real native text track inside exact ani.pm/Settlar origins; no site account or external video",
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1400, height: 1000 },
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
  ],
})
let fixtureFrame
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  evidence.browser = await browser.version()
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  const waitWorker = async (fn, ...args) => {
    for (let i = 0; i < 150; i++) {
      if (await worker.evaluate(fn, ...args)) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error("Worker condition did not become true")
  }
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.language.sourceCode = "en"
    config.language.targetCode = "vi"
    config.pageTranslation.enableAIContentAware = false
    config.videoSubtitles.autoStart.anipm = false
    config.videoSubtitles.aiSegmentation = false
    await chrome.storage.local.set({ config })
    globalThis.__pdfTextOutput = () => "Thuyền trưởng Luffy sẽ bảo vệ đồng đội."
  })
  const page = await browser.newPage()
  page.on("pageerror", (e) => evidence.errors.push(e.message))
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    if (r.url() === "https://ani.pm/anime/context-fixture")
      return r.respond({
        contentType: "text/html",
        body: '<!doctype html><title>ani.pm context fixture</title><iframe src="https://embed.settlar.io/embed/v1" width="1200" height="820" allow="autoplay"></iframe>',
      })
    if (r.url() === "https://embed.settlar.io/embed/v1")
      return r.respond({
        contentType: "text/html",
        body: '<!doctype html><style>body{margin:0;background:#111}.settlar-player{position:relative;width:1100px;height:720px;color:white}.media-controls{display:flex;align-items:center;position:absolute;bottom:0;width:100%;height:50px;background:#333}.media-overflow{display:flex}video{width:100%;height:100%}.vjs-own-caps__win{position:absolute;bottom:60px}</style><div class="settlar-player"><video muted></video><div class="vjs-own-caps__win">Captain!</div><div class="media-controls" data-visible data-interactive="true"><div class="media-overflow"><button class="media-button--captions">CC</button></div></div></div>',
      })
    if (r.url().startsWith("https://") && !r.url().startsWith("https://api.openai.com/"))
      return r.abort()
    return r.continue()
  })
  await page.goto("https://ani.pm/anime/context-fixture")
  await page.bringToFront()
  let frame = await page.waitForFrame((f) => f.url() === "https://embed.settlar.io/embed/v1")
  fixtureFrame = frame
  await frame.evaluate(async (base64) => {
    window.__fixtureBlob = new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], {
      type: "video/webm",
    })
    const video = document.querySelector("video")
    const ready = new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true })
      video.addEventListener(
        "error",
        () => reject(new Error("Fixture video decode failed: " + video.error?.message)),
        { once: true },
      )
      setTimeout(() => reject(new Error("Fixture video metadata timed out")), 10000)
    })
    video.src = URL.createObjectURL(window.__fixtureBlob)
    video.load()
    await ready
    const track = video.addTextTrack("subtitles", "English", "en")
    track.addCue(new VTTCue(0, 60, "Captain Luffy will protect his crew."))
    track.mode = "showing"
  }, media.toString("base64"))
  await frame.waitForSelector('pierce/[aria-label="Subtitle Translation Panel"]')
  const clickText = async (text) => {
    const button = await frame.waitForFunction(
      (label) => {
        const visit = (root) => {
          for (const e of root.querySelectorAll("button"))
            if (e.textContent.trim() === label && e.checkVisibility()) return e
          for (const e of root.querySelectorAll("*"))
            if (e.shadowRoot) {
              const found = visit(e.shadowRoot)
              if (found) return found
            }
          return null
        }
        return visit(document)
      },
      { polling: 100 },
      text,
    )
    await button.asElement().click()
  }
  await frame.click('pierce/[aria-label="Subtitle Translation Panel"]')
  await clickText("Ngữ cảnh anime")
  await frame.waitForSelector('pierce/[aria-label="Ngữ cảnh anime"]')
  check(
    "ani.pm logo exposes optional viewer context without a provider request",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  const text =
    "One Piece. Luffy is captain. Topic: friendship and pirates; use thuyền trưởng for captain."
  await frame.type('pierce/[aria-label="Ngữ cảnh anime"]', text)
  await clickText("Áp dụng ngữ cảnh")
  check(
    "applying context while captions are off stays local",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  await frame.click('pierce/[aria-label="Back to subtitles menu"]')
  await frame.waitForSelector('pierce/[role="switch"]', { visible: true })
  await frame.locator('pierce/[role="switch"]').click()
  await waitWorker(() => __pdfCalls.length > 0)
  check(
    "translation uses exact viewer context as quoted data at the fixed endpoint",
    await worker.evaluate(
      (value) =>
        __pdfCalls.some(
          (c) =>
            c.url === "https://api.openai.com/v1/responses" &&
            JSON.stringify(c.body.input).includes("Viewer-provided anime context") &&
            JSON.stringify(c.body.input).includes(value),
        ),
      text,
    ),
  )
  await frame.waitForFunction(
    () => {
      const roots = [...document.querySelectorAll("*")]
        .filter((n) => n.shadowRoot)
        .map((n) => n.shadowRoot)
      return roots.some((r) => r.textContent.includes("Thuyền trưởng Luffy"))
    },
    { polling: 100 },
  )
  check(
    "ani.pm renders translated native captions without changing the site's track mode",
    await frame.evaluate(() => document.querySelector("video").textTracks[0].mode === "showing"),
  )
  await frame.click('pierce/[aria-label="Subtitle Translation Panel"]')
  await clickText("Ngữ cảnh anime")
  check(
    "reopening the menu retains the context for this source",
    await frame.$eval(
      'pierce/[aria-label="Ngữ cảnh anime"]',
      (n, value) => n.value === value,
      text,
    ),
  )
  const before = await worker.evaluate(() => __pdfCalls.length)
  await clickText("Áp dụng và dịch lại")
  await new Promise((resolve) => setTimeout(resolve, 500))
  check(
    "applying unchanged context makes no repeated request",
    await worker.evaluate((n) => __pdfCalls.length === n, before),
  )
  await frame.$eval('pierce/[aria-label="Ngữ cảnh anime"]', (n) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
    setter.set.call(n, "New anime context: Zoro is the swordsman.")
    n.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await clickText("Áp dụng và dịch lại")
  await waitWorker((n) => __pdfCalls.length > n, before)
  check(
    "changed context starts a new keyed translation rather than reusing the old cache",
    await worker.evaluate(() =>
      JSON.stringify(__pdfCalls.at(-1).body.input).includes("New anime context"),
    ),
  )
  await frame.evaluate(() => {
    const v = document.querySelector("video")
    v.src = URL.createObjectURL(window.__fixtureBlob)
    v.load()
  })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  await frame.click('pierce/[aria-label="Subtitle Translation Panel"]')
  await clickText("Ngữ cảnh anime")
  check(
    "a different video source does not inherit the old anime context",
    await frame.$eval('pierce/[aria-label="Ngữ cảnh anime"]', (n) => n.value === ""),
  )
  check(
    "manual anime context stays outside persistent settings and sync",
    await worker.evaluate(
      async () =>
        !JSON.stringify(await chrome.storage.local.get(null)).includes("New anime context") &&
        !JSON.stringify(await chrome.storage.sync.get(null)).includes("New anime context"),
    ),
  )
  await page.screenshot({ path: path.join(scratch, "anime-context.png") })
  // Reload into a fresh HARD-like source: visible image, no native text track.
  await page.reload({ waitUntil: "domcontentloaded" })
  frame = await page.waitForFrame((f) => f.url() === "https://embed.settlar.io/embed/v1")
  fixtureFrame = frame
  await frame.evaluate(async (base64) => {
    window.__fixtureBlob = new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], {
      type: "video/webm",
    })
    const video = document.querySelector("video")
    const ready = new Promise((resolve) =>
      video.addEventListener("loadedmetadata", resolve, { once: true }),
    )
    video.src = URL.createObjectURL(window.__fixtureBlob)
    video.load()
    await ready
  }, media.toString("base64"))
  const beforeHard = await worker.evaluate(() => __pdfCalls.length)
  await frame.waitForSelector('pierce/[aria-label="Subtitle Translation Panel"]')
  await frame.locator('pierce/[aria-label="Subtitle Translation Panel"]').click()
  await frame.locator('pierce/[role="switch"]').click()
  await frame.waitForFunction(
    () =>
      [...document.querySelectorAll("*")].some((node) =>
        node.shadowRoot?.textContent.includes("Chưa đọc được phụ đề rời (CC)"),
      ),
    { polling: 100 },
  )
  check(
    "a HARD-like source explains SOFT/CC instead of denying visible burned-in text",
    await frame.evaluate(() =>
      [...document.querySelectorAll("*")].some(
        (node) =>
          node.shadowRoot?.textContent.includes("chọn SOFT") &&
          node.shadowRoot.textContent.includes("HARD"),
      ),
    ),
  )
  check(
    "missing native captions never start paid OCR, ASR or translation fallback",
    await worker.evaluate((n) => __pdfCalls.length === n, beforeHard),
  )
  check(
    "long missing-CC guidance wraps inside a narrow player",
    await frame.evaluate(() => {
      const player = document.querySelector(".settlar-player")
      player.style.width = "320px"
      const roots = [...document.querySelectorAll("*")]
        .filter((node) => node.shadowRoot)
        .map((node) => node.shadowRoot)
      const message = roots
        .map((root) => root.querySelector(".read-frog-subtitles-state-message"))
        .find(Boolean)
      const box = message.getBoundingClientRect(),
        playerBounds = player.getBoundingClientRect()
      const fits =
        box.left >= playerBounds.left &&
        box.right <= playerBounds.right &&
        message.scrollWidth <= message.clientWidth + 1
      player.style.width = "1100px"
      return fits
    }),
  )
  await frame.click('pierce/[aria-label="Subtitle Translation Panel"]')
  await frame.waitForSelector('pierce/[role="switch"]', { visible: true })
  await frame.locator('pierce/[role="switch"]').click() // OFF before the user selects CC.
  await frame.evaluate(() => {
    const track = document.querySelector("video").addTextTrack("subtitles", "English", "en")
    track.addCue(new VTTCue(0, 60, "New soft-caption source restored."))
    track.mode = "showing"
  })
  await frame.locator('pierce/[role="switch"]').click()
  await waitWorker((n) => __pdfCalls.length > n, beforeHard)
  check(
    "explicit re-enable translates once native SOFT captions are available",
    await frame.evaluate(() => document.querySelector("video").textTracks[0].mode === "showing"),
  )
  check("no uncaught fixture errors", evidence.errors.length === 0)
} catch (error) {
  evidence.failure = error.stack
  if (fixtureFrame)
    evidence.debug = await fixtureFrame
      .evaluate(() => ({
        videos: [...document.querySelectorAll("video")].map((v) => ({
          ready: v.readyState,
          tracks: v.textTracks.length,
        })),
        roots: [...document.querySelectorAll("*")]
          .filter((n) => n.shadowRoot)
          .map((n) => {
            const clone = document.createElement("div")
            clone.innerHTML = n.shadowRoot.innerHTML
            clone.querySelectorAll("style,script").forEach((s) => s.remove())
            return clone.textContent.trim().slice(-1200)
          }),
        switches: [...document.querySelectorAll("*")]
          .filter((n) => n.shadowRoot)
          .flatMap((n) =>
            [...n.shadowRoot.querySelectorAll("[role=switch]")].map((s) => ({
              checked: s.getAttribute("aria-checked"),
              label: s.getAttribute("aria-label"),
            })),
          ),
      }))
      .catch((e) => ({ diagnosticError: e.message }))
  console.error(JSON.stringify(evidence.debug))
  console.error(error)
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("EVIDENCE", scratch)
  await browser.close()
}
