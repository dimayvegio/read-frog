import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const scratch = path.resolve(`.codex/tts-download-${Date.now()}`),
  downloads = path.join(scratch, "downloads")
await fs.mkdir(downloads, { recursive: true })
const evidence = {
  checks: [],
  liveOpenAI: false,
  realDownloads: true,
  nativeSaveDialogDriven: false,
  screenshots: [],
}
const check = (name, condition) => {
  assert.ok(condition, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1280, height: 940 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
let options
try {
  evidence.browser = await browser.version()
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await options.goto(base + "options.html#/tts")
  await options.bringToFront()
  await options.waitForSelector("#tts-provider-choice")
  check("Microsoft has no MP3 download button", (await options.$("[data-tts-download]")) === null)
  const session = await options.createCDPSession()
  await session.send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: downloads,
  })
  await worker.evaluate(() => {
    globalThis.__speechCalls = []
    globalThis.__speechDownloads = []
    globalThis.__speechDelay = 0
    const rate = 24000,
      pcm = new Uint8Array(rate * 2),
      bytes = new Uint8Array(pcm.length + 44),
      view = new DataView(bytes.buffer)
    for (let n = 0; n < rate; n++)
      new DataView(pcm.buffer).setInt16(
        n * 2,
        Math.sin((n * 2 * Math.PI * 440) / rate) * 5000,
        true,
      )
    for (const [at, tag] of [
      [0, "RIFF"],
      [8, "WAVE"],
      [12, "fmt "],
      [36, "data"],
    ])
      for (let n = 0; n < tag.length; n++) bytes[at + n] = tag.charCodeAt(n)
    view.setUint32(4, bytes.length - 8, true)
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    view.setUint32(40, pcm.length, true)
    bytes.set(pcm, 44)
    const as64 = (value) => {
      let text = ""
      for (let n = 0; n < value.length; n += 8192)
        text += String.fromCharCode(...value.subarray(n, n + 8192))
      return btoa(text)
    }
    const downloadApi = globalThis.browser?.runtime?.id ? globalThis.browser : chrome
    const originalFetch = globalThis.fetch,
      originalDownload = downloadApi.downloads.download.bind(downloadApi.downloads)
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init)
      if (!req.url.startsWith("https://api.openai.com/v1/")) return originalFetch(input, init)
      const body = await req.json()
      if (req.url.endsWith("/audio/speech")) {
        __speechCalls.push({ transport: "speech", body })
        if (__speechDelay)
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, __speechDelay)
            req.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer)
                reject(new DOMException("Aborted", "AbortError"))
              },
              { once: true },
            )
          })
        return new Response(bytes, { headers: { "content-type": "audio/wav" } })
      }
      if (req.url.endsWith("/realtime/client_secrets"))
        return new Response(JSON.stringify({ value: "ephemeral-fixture" }))
      return originalFetch(input, init)
    }
    globalThis.WebSocket = class extends EventTarget {
      static OPEN = 1
      readyState = 0
      constructor() {
        super()
        queueMicrotask(() => {
          this.readyState = 1
          this.dispatchEvent(
            new MessageEvent("message", { data: JSON.stringify({ type: "session.created" }) }),
          )
        })
      }
      send(value) {
        const body = JSON.parse(value)
        if (body.type !== "response.create") return
        __speechCalls.push({ transport: "realtime", body })
        queueMicrotask(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({ type: "response.output_audio.delta", delta: as64(pcm) }),
            }),
          )
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({ type: "response.done", response: { status: "completed" } }),
            }),
          )
        })
      }
      close() {
        this.readyState = 3
      }
    }
    // Only this disposable profile bypasses the native picker; production requests saveAs:true.
    downloadApi.downloads.download = async (args) => {
      __speechDownloads.push({ filename: args.filename, saveAs: args.saveAs })
      return originalDownload({ ...args, saveAs: false })
    }
  })
  const configure = async (update) =>
    worker.evaluate(async (patch) => {
      const { config } = await chrome.storage.local.get("config")
      config.tts.provider = "openai"
      Object.assign(config.tts.openai, patch)
      await chrome.storage.local.set({ config })
    }, update)
  await configure({ model: "gpt-4o-mini-tts", voice: "alloy" })
  await options.waitForSelector("[data-tts-download]")
  check(
    "OpenAI exposes an explicit download button without calling the provider",
    await worker.evaluate(() => __speechCalls.length === 0 && __speechDownloads.length === 0),
  )
  const setText = async (page, selector, text) =>
    page.$eval(
      selector,
      (node, value) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
          node,
          value,
        )
        node.dispatchEvent(new Event("input", { bubbles: true }))
      },
      text,
    )
  const files = async () =>
    (await fs.readdir(downloads)).filter((name) => !name.endsWith(".crdownload"))
  // Poll the filesystem: downloads are native browser writes, not mocked save results.
  const awaitFiles = async (count) => {
    for (let n = 0; n < 150; n++) {
      const names = await files()
      if (names.length >= count) return names
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Expected ${count} MP3 downloads`)
  }
  const clickDownload = async (page) => {
    const before = await worker.evaluate(() => __speechDownloads.length)
    await page.bringToFront()
    await page.waitForSelector('[data-tts-download][data-phase="idle"]:not([disabled])')
    await page.$eval("[data-tts-download]", (node) => node.click())
    for (let attempt = 0; attempt < 150; attempt++) {
      if ((await worker.evaluate(() => __speechDownloads.length)) > before) {
        await page.waitForSelector('[data-tts-download][data-phase="idle"]:not([disabled])')
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(
      `Download did not start: ${await page.evaluate(() => document.body.innerText.slice(-800))}`,
    )
  }
  await setText(options, "#openai-tts-preview", "Read this entire sentence aloud.")
  await clickDownload(options)
  let names = await awaitFiles(1)
  const first = await fs.readFile(path.join(downloads, names[0]))
  check(
    "First click generates speech and writes a genuine MP3 through Edge downloads",
    first[0] === 255 &&
      (first[1] & 224) === 224 &&
      (await worker.evaluate(
        () => __speechCalls.length === 1 && __speechDownloads[0].saveAs === true,
      )),
  )
  await clickDownload(options)
  await awaitFiles(2)
  check(
    "Repeated download reuses completed audio",
    await worker.evaluate(() => __speechCalls.length === 1),
  )
  await options.$eval("#openai-tts-preview-item button:not([data-tts-download])", (node) =>
    node.click(),
  )
  await options.waitForFunction(() =>
    document
      .querySelector("#openai-tts-preview-item button:not([data-tts-download])")
      ?.textContent.includes("Preview"),
  )
  check(
    "Download-generated audio is also reused by normal playback",
    await worker.evaluate(() => __speechCalls.length === 1),
  )

  const hub = await browser.newPage()
  await hub.goto(base + "translation-hub.html")
  await hub.waitForSelector("textarea")
  const longText = "English sentence with Vietnamese tiếng Việt. ".repeat(110)
  const oldNames = await files()
  await setText(hub, "textarea", longText)
  await clickDownload(hub)
  names = await awaitFiles(3)
  const calls = await worker.evaluate(() => __speechCalls)
  const passageCalls = calls.slice(1)
  check(
    "Long multilingual input exports every UTF-8 chunk in order",
    passageCalls.length > 2 &&
      passageCalls.every((row) => new TextEncoder().encode(row.body.input).length <= 1800) &&
      passageCalls.map((row) => row.body.input).join(" ") === longText.trim(),
  )
  const longName = names.find((name) => !oldNames.includes(name))
  const longBytes = await fs.readFile(path.join(downloads, longName))
  const probe = (name) =>
    Number(
      execFileSync(
        process.env.STUDY_FFPROBE ??
          "C:/Users/TIEN/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffprobe.exe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          path.join(downloads, name),
        ],
        { encoding: "utf8" },
      ).trim(),
    )
  const durations = names.map((name) => ({ name, seconds: probe(name) }))
  check(
    "An independent MP3 decoder sees the full multi-chunk duration",
    durations.some((item) => Math.abs(item.seconds - passageCalls.length) < 0.15),
  )
  evidence.durations = durations
  evidence.longMp3Bytes = longBytes.length

  await worker.evaluate(() => {
    __speechDelay = 2000
  })
  await setText(hub, "textarea", "Cancel this new export before the audio finishes.")
  await hub.$eval("[data-tts-download]", (node) => node.click())
  await hub.waitForSelector('[data-tts-download][data-phase="generating"]')
  await hub.$eval("[data-tts-download]", (node) => node.click())
  await hub.waitForSelector('[data-tts-download][data-phase="idle"]')
  await new Promise((resolve) => setTimeout(resolve, 2200))
  check("Canceling an export never saves a late file", (await files()).length === 3)
  await worker.evaluate(() => {
    __speechDelay = 0
  })
  await configure({
    model: "gpt-realtime-2.1-mini",
    voice: "coral",
    speed: 1.1,
    instructions: "Read clearly.",
  })
  await setText(options, "#openai-tts-preview", "Realtime voice MP3 example.")
  await clickDownload(options)
  await awaitFiles(4)
  check(
    "Realtime PCM also becomes a downloadable MP3 using the chosen voice settings",
    await worker.evaluate(() =>
      __speechCalls.some(
        (row) =>
          row.transport === "realtime" &&
          row.body.response.input[0].content[0].text === "Realtime voice MP3 example.",
      ),
    ),
  )
  const selectionChannel = await worker.evaluate(async () => {
    const channel = crypto.randomUUID()
    await chrome.storage.session.set({
      ["native-selection:" + channel]: {
        id: crypto.randomUUID(),
        text: "A selected passage from a local PDF.",
        createdAt: Date.now(),
        tooLong: false,
      },
    })
    return channel
  })
  const panel = await browser.newPage()
  await panel.goto(base + "selection-result.html?selectionId=" + selectionChannel)
  await panel.waitForSelector("[data-tts-download]")
  await panel.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="native-selection-output"]')
        ?.getAttribute("aria-busy") === "false",
  )
  check(
    "PDF selection result exposes source and translation download controls",
    (await panel.$$("[data-tts-download]")).length === 2,
  )
  await panel.$eval("[data-tts-download]", (node) => node.click())
  await awaitFiles(5)
  check(
    "PDF source downloads through the same private Realtime transport",
    await worker.evaluate(() =>
      __speechCalls.some(
        (row) =>
          row.transport === "realtime" &&
          row.body.response.input[0].content[0].text === "A selected passage from a local PDF.",
      ),
    ),
  )
  await options.screenshot({ path: path.join(scratch, "openai-tts-download.png"), fullPage: true })
  evidence.screenshots.push("openai-tts-download.png")
  evidence.manifest = JSON.parse(
    await fs.readFile(".output/edge-mv3/manifest.json", "utf8"),
  ).version
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("Evidence:", scratch)
} catch (error) {
  if (options) {
    await fs
      .writeFile(
        path.join(scratch, "failure.txt"),
        await options.evaluate(() => document.body.innerText),
      )
      .catch(() => {})
    await options
      .screenshot({ path: path.join(scratch, "failure.png"), fullPage: true })
      .catch(() => {})
  }
  console.error("Failure evidence:", scratch)
  throw error
} finally {
  await browser.close()
}
