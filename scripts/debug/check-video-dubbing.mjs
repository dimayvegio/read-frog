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
const youtube = process.env.DUBBING_PLATFORM === "youtube"
const fixtureUrl = youtube
  ? "https://www.youtube.com/watch?v=RFdubTest01"
  : "https://ani.pm/anime/context-fixture"
const scratch = path.resolve(`.codex/video-dubbing-${youtube ? "youtube" : "anipm"}-${Date.now()}`)
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
  "90",
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
  fixture: youtube
    ? "Synthetic YouTube player + production MAIN-world API and JSON3 CC GET; no live video/account"
    : "Synthetic video + real native text track inside exact ani.pm/Settlar origins; no site account or external video",
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
  args: ["--no-first-run", "--no-default-browser-check"],
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
    config.videoSubtitles.autoStart.youtube = false
    config.videoSubtitles.aiSegmentation = false
    config.tts.openai.model = "gpt-realtime-2.1-mini"
    config.tts.openai.voice = "marin"
    await chrome.storage.local.set({ config })
    globalThis.__pdfTextOutput = () => "Thuyền trưởng Luffy sẽ bảo vệ đồng đội."
  })
  await worker.evaluate(() => {
    globalThis.__dubbingCalls = []
    globalThis.__dubbingDelay = 100
    const previous = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const r = new Request(input, init)
      if (r.url === "https://api.openai.com/v1/realtime/client_secrets")
        return new Response(JSON.stringify({ value: "dubbing-fixture-only" }))
      return previous(r)
    }
    const pcm = new Uint8Array(48000),
      view = new DataView(pcm.buffer)
    for (let i = 0; i < 24000; i++)
      view.setInt16(i * 2, Math.sin((i * Math.PI * 2 * 440) / 24000) * 2000, true)
    let raw = ""
    for (let i = 0; i < pcm.length; i += 8192)
      raw += String.fromCharCode(...pcm.subarray(i, i + 8192))
    const delta = btoa(raw)
    globalThis.WebSocket = class extends EventTarget {
      static OPEN = 1
      readyState = 0
      constructor(url) {
        super()
        if (!String(url).startsWith("wss://api.openai.com/v1/realtime?"))
          throw new Error("Unexpected websocket")
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
        __dubbingCalls.push(body)
        setTimeout(() => {
          if (this.readyState !== 1) return
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({ type: "response.output_audio.delta", delta }),
            }),
          )
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({ type: "response.done", response: { status: "completed" } }),
            }),
          )
        }, globalThis.__dubbingDelay)
      }
      close() {
        this.readyState = 3
      }
    }
  })
  const page = await browser.newPage()
  page.on("pageerror", (e) => evidence.errors.push(e.message))
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    if (youtube && r.url() === fixtureUrl)
      return r.respond({
        contentType: "text/html",
        body: `<!doctype html><title>YouTube dubbing fixture</title><style>body{margin:0;background:#111}#movie_player{position:relative;width:1100px;height:720px}video{width:100%;height:100%}.ytp-chrome-bottom{position:absolute;bottom:0;width:100%;height:50px;background:#333}.ytp-right-controls{display:flex;height:40px;float:right}</style><div id="movie_player" class="html5-video-player paused-mode"><video class="html5-main-video" muted></video><div class="ytp-chrome-bottom"><div class="ytp-right-controls"></div></div></div><script>const p=document.getElementById("movie_player");const track={baseUrl:"https://www.youtube.com/api/timedtext?v=RFdubTest01&lang=en&fmt=json3",languageCode:"en",vssId:".en",name:{simpleText:"English"}};p.getPlayerResponse=()=>({videoDetails:{videoId:"RFdubTest01",isLiveContent:false},captions:{playerCaptionsTracklistRenderer:{captionTracks:[track],audioTracks:[{defaultCaptionTrackIndex:0}]}}});p.getVideoData=()=>({video_id:"RFdubTest01"});p.getPlayerState=()=>2;p.getAudioTrack=()=>({captionTracks:[]});p.getOption=()=>track;</script>`,
      })
    if (youtube && r.url().startsWith("https://www.youtube.com/api/timedtext"))
      return r.respond({
        contentType: "application/json",
        body: JSON.stringify({
          events: [
            {
              tStartMs: 0,
              dDurationMs: 4000,
              segs: [{ utf8: "Captain Luffy will protect his crew." }],
            },
          ],
        }),
      })
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
  await page.goto(fixtureUrl)
  await page.bringToFront()
  let frame = youtube
    ? page.mainFrame()
    : await page.waitForFrame((f) => f.url() === "https://embed.settlar.io/embed/v1")
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
    track.addCue(new VTTCue(0, 4, "Captain Luffy will protect his crew."))
    track.addCue(new VTTCue(7, 11, "We will sail together."))
    track.addCue(new VTTCue(14, 18, "Friendship matters."))
    video.volume = 0.8
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
  await clickText("Lồng tiếng OpenAI")
  await frame.waitForSelector("pierce/[data-dubbing-view]")
  check(
    "opening dubbing controls performs zero synthesis/translation requests",
    await worker.evaluate(() => __dubbingCalls.length === 0 && __pdfCalls.length === 0),
  )
  check(
    "original audio defaults to five percent",
    await frame.$eval(
      'pierce/[aria-label="Âm lượng gốc khi lồng tiếng"]',
      (n) => Number(n.value) === 5,
    ),
  )
  await frame.select('pierce/[aria-label="Lời lồng tiếng"]', "original")
  await frame.click("pierce/[data-dubbing-toggle]")
  const status = () => frame.$eval("pierce/[data-dubbing-status]", (n) => n.textContent)
  for (let i = 0; i < 100; i++) {
    if (await worker.evaluate(() => __dubbingCalls.length > 0)) break
    const text = await status()
    if (text.includes("Không") || text.includes("Chưa") || text.includes("đã đổi"))
      throw new Error(text)
    await new Promise((r) => setTimeout(r, 100))
  }
  check(
    "original mode synthesizes native CC through private OpenAI Realtime",
    await worker.evaluate(
      () =>
        __dubbingCalls.some((c) => JSON.stringify(c).includes("Captain Luffy")) &&
        __pdfCalls.length === 0,
    ),
  )
  await frame.evaluate(() => document.querySelector("video").play())
  await frame.waitForFunction(() => document.querySelector("video").volume < 0.7)
  check(
    "real browser audio plays while video is ducked",
    await frame.evaluate(() => !document.querySelector("video").paused),
  )
  await frame.waitForFunction(() => document.querySelector("video").currentTime >= 1.8)
  check(
    "short generated speech does not restore source before its CC sentence ends",
    await frame.evaluate(() => Math.abs(document.querySelector("video").volume - 0.04) < 0.005),
  )
  await frame.evaluate(() => document.querySelector("video").pause())
  await frame.waitForFunction(() => document.querySelector("video").volume > 0.79)
  check(
    "manual pause releases ducking without auto-resuming video",
    await frame.evaluate(() => document.querySelector("video").paused),
  )
  await frame.evaluate(() => document.querySelector("video").play())
  await frame.waitForFunction(() => document.querySelector("video").currentTime >= 5.3)
  check(
    "source returns smoothly after the original sentence and hold interval",
    await frame.evaluate(() => Math.abs(document.querySelector("video").volume - 0.8) < 0.005),
  )
  await frame.evaluate(() => {
    document.querySelector("video").pause()
    document.querySelector("video").currentTime = 0
  })
  await frame.click("pierce/[data-dubbing-toggle]")
  check(
    "Stop restores original player volume",
    await frame.evaluate(() => Math.abs(document.querySelector("video").volume - 0.8) < 0.001),
  )
  await frame.click('pierce/[aria-label="Back to subtitles menu"]')
  await frame.locator('pierce/[role="switch"]').click()
  await waitWorker(() => __pdfCalls.length > 0)
  await frame.waitForFunction(() =>
    [...document.querySelectorAll("*")].some((n) =>
      n.shadowRoot?.textContent.includes("Thuyền trưởng Luffy"),
    ),
  )
  // Enabling subtitles can close the menu; reopen it through the existing logo.
  if (!youtube) await frame.click('pierce/[aria-label="Subtitle Translation Panel"]')
  await clickText("Lồng tiếng OpenAI")
  await frame.select('pierce/[aria-label="Lời lồng tiếng"]', "translated")
  const before = await worker.evaluate(() => __pdfCalls.length)
  await frame.click("pierce/[data-dubbing-toggle]")
  await waitWorker(() =>
    __dubbingCalls.some((c) => JSON.stringify(c).includes("Thuyền trưởng Luffy")),
  )
  check(
    "translated mode speaks the committed translation without another translation call",
    await worker.evaluate((n) => __pdfCalls.length === n, before),
  )
  await frame.evaluate(() => document.querySelector("video").play())
  await frame.click("pierce/[data-dubbing-toggle]")
  const beforeDelayed = await worker.evaluate(() => {
    __dubbingDelay = 1200
    return __dubbingCalls.length
  })
  await frame.click("pierce/[data-dubbing-toggle]")
  await waitWorker((n) => __dubbingCalls.length > n, beforeDelayed)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.tts.openai.voice = "alloy"
    await chrome.storage.local.set({ config })
  })
  await frame.waitForFunction(() => {
    const visit = (root) => {
      const b = root.querySelector("[data-dubbing-toggle]")
      if (b) return b.textContent.includes("Bắt đầu")
      return [...root.querySelectorAll("*")].some((n) => n.shadowRoot && visit(n.shadowRoot))
    }
    return visit(document)
  })
  const afterCancel = await worker.evaluate(() => __dubbingCalls.length)
  await new Promise((r) => setTimeout(r, 1400))
  check(
    "config changes cancel in-flight speech without late playback or paid retry",
    (await worker.evaluate((n) => __dubbingCalls.length === n, afterCancel)) &&
      (await frame.evaluate(() => Math.abs(document.querySelector("video").volume - 0.8) < 0.001)),
  )
  await worker.evaluate(() => {
    __dubbingDelay = 100
  })
  await frame.click("pierce/[data-dubbing-toggle]")
  await waitWorker((n) => __dubbingCalls.length > n, afterCancel)
  await frame.evaluate(() => {
    history.pushState({}, "", "/embed/v2")
    document.querySelector("video").currentTime = 10
  })
  const count = await worker.evaluate(() => __dubbingCalls.length)
  await new Promise((r) => setTimeout(r, 500))
  check(
    "active voice stops on exact route change and ignores stale completion",
    (await worker.evaluate((n) => __dubbingCalls.length === n, count)) &&
      (await frame.evaluate(() => Math.abs(document.querySelector("video").volume - 0.8) < 0.001)),
  )
  await page.screenshot({ path: path.join(scratch, "dubbing.png") })
  check("no production page errors", evidence.errors.length === 0)
} catch (error) {
  evidence.failure = String(error)
  if (fixtureFrame) {
    try {
      evidence.status = await fixtureFrame.$eval(
        "pierce/[data-dubbing-status]",
        (n) => n.textContent,
      )
    } catch {}
  }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log("Evidence:", scratch)
}
