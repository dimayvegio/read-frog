import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"
import { pathToFileURL } from "node:url"
import JSZip from "jszip"
import { bookFixture } from "./check-auto-pdf-reader.mjs"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const scratch = path.resolve(`.codex/study-flow-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = {
  checks: [],
  timingsMs: {},
  liveOpenAI: false,
  liveYouTube: false,
  syntheticVideo: true,
  screenshots: [],
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const hash = (value) => createHash("sha256").update(value).digest("hex")
const wav = new Uint8Array(2444),
  wavView = new DataView(wav.buffer)
for (const [at, text] of [
  [0, "RIFF"],
  [8, "WAVE"],
  [12, "fmt "],
  [36, "data"],
])
  for (let n = 0; n < text.length; n++) wav[at + n] = text.charCodeAt(n)
wavView.setUint32(4, wav.length - 8, true)
wavView.setUint32(16, 16, true)
wavView.setUint16(20, 1, true)
wavView.setUint16(22, 1, true)
wavView.setUint32(24, 24000, true)
wavView.setUint32(28, 48000, true)
wavView.setUint16(32, 2, true)
wavView.setUint16(34, 16, true)
wavView.setUint32(40, 2400, true)
const notebook = {
  id: randomUUID(),
  name: "Sổ thử luồng học 1.000 từ",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
const state = { dueAt: 0, intervalDays: 0, reviews: 0, lapses: 0, updatedAt: 0 },
  audioId = hash(wav),
  cards = [],
  progress = []
for (let n = 0; n < 1000; n++) {
  const word = n === 999 ? "reverse" : `word${String(n).padStart(4, "0")}`,
    id = hash(word)
  cards.push({
    id,
    captureKey: hash(`capture-${word}`),
    word,
    language: "en",
    ipa: "/test/",
    partOfSpeech: "Danh từ",
    meaning: n === 999 ? "đảo ngược" : `nghĩa mẫu ${n}`,
    definition: "Nghĩa thử nghiệm",
    pronunciationTip: "",
    originalTranslation: "Câu gốc thử nghiệm",
    example: { sentence: `They use ${word} every day.`, translation: "Họ dùng từ này mỗi ngày." },
    distractors: ["sai một", "sai hai", "sai ba"],
    acceptedAnswers: [word],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    context: `They use ${word} every day.`,
    sourceTitle: "Fixture",
    sourceUrl: "",
    audio: { word: audioId, example: audioId },
    speech: { model: "fixture", voice: "fixture", speed: 1 },
  })
  progress.push({ cardId: id, flash: { ...state }, choice: { ...state }, type: { ...state } })
}
const legacy = new JSZip()
legacy.file(
  "manifest.json",
  JSON.stringify({
    format: "read-frog-vocabulary",
    version: 5,
    title: notebook.name,
    notebook,
    cardCount: cards.length,
    reviewCount: 0,
    exportedAt: Date.now(),
  }),
)
legacy.file("vocabulary.json", JSON.stringify(cards))
legacy.file("progress.json", JSON.stringify(progress))
legacy.file("reviews.json", "[]")
legacy.file(`audio/${audioId}.wav`, wav, { createFolders: false })
const fixtureZip = path.join(scratch, "1000-words-v5.zip")
await fs.writeFile(
  fixtureZip,
  await legacy.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
)
const ffmpeg =
  process.env.STUDY_FFMPEG ??
  "C:/Users/TIEN/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe"
const videoPath = path.join(scratch, "fixture.mp4")
execFileSync(
  ffmpeg,
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x19344b:s=640x360:r=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=24000",
    "-t",
    "8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    videoPath,
  ],
  { windowsHide: true, stdio: "ignore" },
)
const videoBytes = await fs.readFile(videoPath)
const fixtureHTML =
  '<!doctype html><meta charset="utf-8"><style>body{font:22px/1.7 Arial;margin:40px;max-width:800px}#target{padding:12px;border:1px solid #ddd}button,input{font:inherit}#long{margin-top:20px}</style><h1>Saved vocabulary fixture</h1><p id="target">Please reverse the decision. We use word0001 and word0002 today.</p><button id="counter">Counter 0</button><input id="typing" value="reverse"><p><a href="#link">reverse</a></p><pre>reverse</pre><div id="editable" contenteditable="true">reverse</div><div id="long"></div><script>let count=0;document.querySelector("#counter").onclick=()=>document.querySelector("#counter").textContent="Counter "+(++count);for(let i=0;i<1000;i++){let p=document.createElement("p");p.textContent="They learn word"+String(i).padStart(4,"0")+" today.";document.querySelector("#long").append(p)}</script>'
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.end(fixtureHTML)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
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
evidence.browser = await browser.version()
const errors = []
let vocab, usage, web, yt
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.providersConfig[0].model.model = "gpt-6-luna"
    config.videoSubtitles.autoStart.youtube = true
    await chrome.storage.local.set({ config })
  })
  const call = async (page, messageType, payload) => {
    const reply = await page.evaluate(
      async ({ type, data }) =>
        chrome.runtime.sendMessage({ id: Date.now(), type, data, timestamp: Date.now() }),
      { type: messageType, data: payload },
    )
    assert.ok(!reply?.err, JSON.stringify(reply?.err))
    return reply?.res
  }
  const counts = () => worker.evaluate(() => __pdfCalls.length)
  vocab = await browser.newPage()
  vocab.on("pageerror", (e) => errors.push(e.message))
  await vocab.goto(base + "vocabulary.html")
  await vocab.bringToFront()
  await vocab.waitForSelector("#import-file")
  await (await vocab.$("#import-file")).uploadFile(fixtureZip)
  await vocab.waitForFunction(
    () => document.body.textContent.includes("1.000") || document.body.textContent.includes("1000"),
  )
  const snapshot = await call(vocab, "getVocabularyStudySnapshot")
  check(
    "Published ZIP5 imports into DB5 with 1,000 unassessed words and no invented recall",
    snapshot.words.length === 1000 && snapshot.words.every((row) => row.status === "notAssessed"),
  )
  const reverse = cards.at(-1),
    capture = {
      word: "reverse",
      context: "They reverse the decision.",
      sourceTitle: "Study video",
      sourceUrl: "https://www.youtube.com/watch?v=RFStudy0001",
      source: { kind: "video", seconds: 1 },
    }
  check(
    "A new source is attached without OpenAI",
    (await call(vocab, "addVocabularySource", {
      notebookId: notebook.id,
      cardId: reverse.id,
      capture,
    })) === true && (await counts()) === 0,
  )
  check(
    "Saving the identical source again deduplicates it",
    (await call(vocab, "addVocabularySource", {
      notebookId: notebook.id,
      cardId: reverse.id,
      capture,
    })) === false,
  )
  await call(vocab, "addVocabularySource", {
    notebookId: notebook.id,
    cardId: reverse.id,
    capture: {
      ...capture,
      context: "We reverse the order tomorrow.",
      sourceTitle: "Another page",
      sourceUrl: "https://example.org/reading",
      source: { kind: "web" },
    },
  })
  await vocab.reload()
  await vocab.bringToFront()
  await vocab.waitForFunction(
    () => document.querySelector(".number strong")?.textContent === "1000",
  )
  await vocab.$eval('[data-tab="library"]', (n) => n.click())
  await vocab.waitForSelector("#search").catch(() => {})
  await vocab.$eval('input[type="search"]', (node) => {
    node.value = "reverse"
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await vocab.waitForSelector(`[data-action="view"][data-id="${reverse.id}"]`)
  await vocab.$eval(`[data-action="view"][data-id="${reverse.id}"]`, (n) => n.click())
  await vocab.waitForSelector(".source-passages")
  await vocab.$eval(".source-passages", (n) => (n.open = true))
  check(
    "The vocabulary UI shows two independent passages and a timestamped source",
    await vocab.$eval(
      ".source-passages",
      (n) =>
        n.textContent.includes("2") &&
        n.textContent.includes("tomorrow") &&
        n.querySelector('a[href*="t=1"]') !== null,
    ),
  )
  await vocab.screenshot({ path: path.join(scratch, "sources-desktop.png"), fullPage: true })
  evidence.screenshots.push("sources-desktop.png")
  const dbBefore = await worker.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("read-frog-vocabulary")
        open.onerror = reject
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction(["reviewEvents", "notebookProgress", "sources"]),
            events = tx.objectStore("reviewEvents").count(),
            progressRows = tx.objectStore("notebookProgress").getAll(),
            sources = tx.objectStore("sources").count()
          tx.oncomplete = () => {
            resolve({
              events: events.result,
              progress: progressRows.result,
              sources: sources.result,
            })
            db.close()
          }
        }
      }),
  )
  check(
    "Attaching passages leaves every progress counter and answer log unchanged",
    dbBefore.events === 0 &&
      dbBefore.sources === 2 &&
      dbBefore.progress.every(
        (row) => row.type.reviews === 0 && row.flash.reviews === 0 && row.choice.reviews === 0,
      ),
  )
  web = await browser.newPage()
  web.on("pageerror", (e) => errors.push(e.message))
  await web.goto(`http://127.0.0.1:${server.address().port}`)
  await web.bringToFront()
  const sourceTab = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url),
    web.url(),
  )
  const inspectHighlights = () =>
    worker.evaluate(
      async (tabId) =>
        (
          await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            func: () => {
              const ranges = [...CSS.highlights]
                .filter(([key]) => key.startsWith("rf-study-"))
                .flatMap(([, value]) => [...value])
              return {
                count: ranges.length,
                text: ranges.map((range) => (range instanceof Range ? range.toString() : "")),
                excluded: ranges.some((range) =>
                  range.startContainer.parentElement?.closest(
                    "a,pre,code,input,button,[contenteditable]",
                  ),
                ),
                rect: ranges
                  .find(
                    (range) =>
                      range instanceof Range && range.toString().toLowerCase() === "reverse",
                  )
                  ?.getBoundingClientRect()
                  .toJSON(),
              }
            },
          })
        )[0].result,
      sourceTab.id,
    )
  const started = performance.now()
  for (let n = 0; n < 100; n++) {
    if ((await inspectHighlights()).count > 0) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const highlights = await inspectHighlights()
  evidence.timingsMs.highlightFirstPaint = Math.round(performance.now() - started)
  check(
    "A real web page highlights active-notebook words with bounded ranges",
    highlights.count > 0 && highlights.count <= 500 && highlights.text.includes("reverse"),
  )
  check("Highlights do not include links, code, controls or editable text", !highlights.excluded)
  check(
    "Decorations preserve original text nodes and page event listeners",
    await web.evaluate(() => {
      document.querySelector("#counter").click()
      return (
        document.querySelector("#target").childNodes.length === 1 &&
        document.querySelector("#counter").textContent === "Counter 1"
      )
    }),
  )
  await web.mouse.click(
    highlights.rect.x + highlights.rect.width / 2,
    highlights.rect.y + highlights.rect.height / 2,
  )
  await web.waitForSelector("[data-rf-study-popup]")
  check(
    "Clicking a highlighted word opens saved meaning and honest status without API",
    (await web.$eval(
      "[data-rf-study-popup]",
      (n) =>
        n.shadowRoot.textContent.includes("đảo ngược") &&
        n.shadowRoot.textContent.includes("Chưa đủ dữ liệu"),
    )) && (await counts()) === 0,
  )
  await web.screenshot({ path: path.join(scratch, "highlights.png") })
  evidence.screenshots.push("highlights.png")
  await worker.evaluate(async () => chrome.storage.local.set({ studyHighlightsEnabled: false }))
  for (let n = 0; n < 40 && (await inspectHighlights()).count; n++)
    await new Promise((resolve) => setTimeout(resolve, 50))
  check(
    "Disabling highlights removes ranges without altering the page",
    (await inspectHighlights()).count === 0 &&
      (await web.$eval("#target", (n) => n.childNodes.length === 1)),
  )
  await worker.evaluate(async () => chrome.storage.local.set({ studyHighlightsEnabled: true }))
  // Seed a trusted native-result channel: the actual production stream and
  // SDK execute, but OpenAI responses are synthetic in this isolated profile.
  const channel = await worker.evaluate(async () => {
    const opaqueChannel = crypto.randomUUID()
    await chrome.storage.session.set({
      ["native-selection:" + opaqueChannel]: {
        id: crypto.randomUUID(),
        text: "A paragraph to measure API usage.",
        tooLong: false,
        createdAt: Date.now(),
        document: { id: "a".repeat(64), title: "Fixture PDF" },
      },
    })
    return opaqueChannel
  })
  const result = await browser.newPage()
  result.on("pageerror", (e) => errors.push(e.message))
  await result.goto(base + "selection-result.html?selectionId=" + channel)
  await result.bringToFront()
  await result.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="native-selection-output"]')
        ?.getAttribute("aria-busy") === "false",
  )
  usage = await browser.newPage()
  usage.on("pageerror", (e) => errors.push(e.message))
  await usage.goto(base + "usage.html")
  await usage.bringToFront()
  await usage.waitForSelector(".rf-usage-stats")
  const metrics = await call(usage, "getUsageSnapshot")
  check(
    "The production Responses stream records API-reported token usage and latency",
    metrics.entries.some(
      (row) =>
        row.task === "pdf" &&
        row.input === 10 &&
        row.output === 30 &&
        row.firstTokenMs !== null &&
        row.status === "complete",
    ),
  )
  check(
    "Usage records contain no prompts, selected text, URLs or credentials",
    !JSON.stringify(metrics.entries).match(/paragraph|Fixture|sentinel|Bearer|https?:|data:image/),
  )
  await call(usage, "recordLocalCacheHit", { task: "pdf" })
  await call(usage, "setUsageBudget", { usd: 0.000001 })
  await usage.reload()
  await usage.waitForSelector(".rf-usage-warning")
  check(
    "Monthly budget warning accounts for known estimates and local cache is separate",
    (await call(usage, "getUsageSnapshot")).entries.some(
      (row) => row.status === "cache" && row.task === "pdf",
    ),
  )
  for (const width of [390, 760, 1280]) {
    await usage.setViewport({ width, height: 940 })
    check(
      `Usage dashboard has no page overflow at ${width}px`,
      await usage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await usage.setViewport({ width: 390, height: 940 })
  await usage.screenshot({ path: path.join(scratch, "usage-390.png"), fullPage: true })
  evidence.screenshots.push("usage-390.png")
  await usage.setViewport({ width: 1280, height: 940 })
  await call(usage, "saveUsagePrice", {
    model: "fixture-model",
    input: 1,
    output: 2,
    cachedInput: 0.1,
    audioMinute: null,
    checkedAt: "fixture",
  })
  check(
    "Explicit model prices persist independently from the numeric event log",
    (await call(usage, "getUsageSnapshot")).prices.some((price) => price.model === "fixture-model"),
  )
  // A controlled YouTube DOM + real local MP4 exercises the shipped adapter,
  // MAIN bridge, subtitle fetcher, sidebar and media controller together.
  await worker.evaluate(async () => {
    globalThis.__pdfTextOutput = (body) => {
      const text =
        typeof body.input === "string"
          ? body.input
          : JSON.stringify(body.input).replace(/\\n/g, "\n")
      return Array.from(
        { length: (text.match(/\n[ \t]*%%[ \t]*\n/g) ?? []).length + 1 },
        () => "Bản dịch câu mẫu để kiểm tra luyện nghe.",
      ).join("\n\n%%\n\n")
    }
    const { config } = await chrome.storage.local.get("config")
    config.videoSubtitles.aiSegmentation = false
    await chrome.storage.local.set({ config })
  })
  yt = await browser.newPage()
  yt.on("pageerror", (e) => errors.push(e.message))
  await yt.setRequestInterception(true)
  const cues = [
    {
      tStartMs: 0,
      dDurationMs: 1000,
      segs: [
        { utf8: "They reverse the decision after carefully checking every detail in the report." },
      ],
    },
    {
      tStartMs: 1200,
      dDurationMs: 1000,
      segs: [{ utf8: "We use word0001 every day when we read interesting stories at home." }],
    },
    {
      tStartMs: 3000,
      dDurationMs: 1000,
      segs: [
        { utf8: "We learn word0002 together while watching this short video on the computer." },
      ],
    },
  ]
  const youtubeHTML = `<!doctype html><meta charset="utf-8"><title>Sentence study fixture</title><style>body{margin:20px;background:#171717;color:white;font:18px Arial}#movie_player{position:relative;width:760px;height:430px;background:#19344b}video{width:100%;height:100%}.ytp-chrome-bottom{position:absolute;bottom:0;right:0;height:48px;display:flex;align-items:center}.ytp-right-controls{height:48px;display:flex;align-items:center}.ytp-caption-window-container{position:absolute;bottom:70px}.ytp-subtitles-button,.ytp-settings-button{height:40px}#movie_player button{color:white;background:#333;border:0;padding:8px}h1{font-size:22px}</style><h1>YouTube sentence practice — synthetic video</h1><div id="movie_player" class="html5-video-player paused-mode"><video class="html5-main-video" src="https://www.youtube.com/rf-study-fixture.mp4" preload="auto"></video><div class="ytp-caption-window-container">Native captions fixture</div><div class="ytp-chrome-bottom"><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="true">CC</button><button class="ytp-settings-button" aria-expanded="false">Settings</button></div></div></div><input id="youtube-input" placeholder="Input guard"><script>const player=document.querySelector('#movie_player'),video=player.querySelector('video');const track={baseUrl:'https://www.youtube.com/api/timedtext?lang=en&fmt=json3&pot=fixture',languageCode:'en',vssId:'.en',name:{simpleText:'English'}};player.getPlayerResponse=()=>({videoDetails:{videoId:new URL(location.href).searchParams.get('v'),isLiveContent:false},captions:{playerCaptionsTracklistRenderer:{captionTracks:[track],audioTracks:[{defaultCaptionTrackIndex:0,captionTrackIndices:[0]}],defaultAudioTrackIndex:0}}});player.getVideoData=()=>({video_id:new URL(location.href).searchParams.get('v')});player.getPlayerState=()=>video.paused?2:1;player.getOption=()=>({languageCode:'en',vss_id:'.en',vssId:'.en'});player.getAudioTrack=()=>({captionTracks:[]});player.getWebPlayerContextConfig=()=>({innertubeContextClientVersion:'fixture'});window.nativeKeyCount=0;document.addEventListener('keydown',event=>{if(['j','k','l'].includes(event.key))window.nativeKeyCount++});</script>`
  yt.on("request", (request) => {
    const url = request.url()
    if (request.isNavigationRequest() && request.frame() === yt.mainFrame())
      void request.respond({ status: 200, contentType: "text/html", body: youtubeHTML })
    else if (url.includes("/rf-study-fixture.mp4")) {
      const range = request.headers().range?.match(/^bytes=(\d+)-(\d*)$/),
        start = range ? Number(range[1]) : 0,
        end = range?.[2]
          ? Math.min(Number(range[2]), videoBytes.length - 1)
          : videoBytes.length - 1,
        body = videoBytes.subarray(start, end + 1)
      void request.respond({
        status: range ? 206 : 200,
        contentType: "video/mp4",
        headers: {
          "accept-ranges": "bytes",
          "content-length": String(body.length),
          ...(range ? { "content-range": `bytes ${start}-${end}/${videoBytes.length}` } : {}),
        },
        body,
      })
    } else if (url.includes("/api/timedtext"))
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: cues }),
      })
    else void request.continue()
  })
  await yt.goto("https://www.youtube.com/watch?v=RFStudy0001")
  await yt.bringToFront()
  await yt.waitForSelector('pierce/button[aria-label="Subtitle Translation Panel"]')
  await yt.$eval('pierce/button[aria-label="Subtitle Translation Panel"]', (n) => n.click())
  await yt.waitForFunction(() =>
    [...document.querySelectorAll("*")].some(
      (host) =>
        host.shadowRoot &&
        [...host.shadowRoot.querySelectorAll("button")].some((button) =>
          button.textContent.includes("Learning"),
        ),
    ),
  )
  await yt.evaluate(() => {
    for (const host of document.querySelectorAll("*")) {
      const button = [...(host.shadowRoot?.querySelectorAll("button") ?? [])].find((node) =>
        node.textContent.includes("Learning"),
      )
      if (button) {
        button.click()
        break
      }
    }
  })
  await yt.waitForSelector('pierce/[data-slot="sentence-study"]')
  check(
    "YouTube sentence study controls ship in the real subtitle sidebar and default off",
    !(await yt.$eval('pierce/[data-slot="sentence-study"] input', (n) => n.checked)),
  )
  await yt.keyboard.press("Escape")
  await yt.click("h1")
  await yt.$eval("video", (video) => video.play())
  await new Promise((resolve) => setTimeout(resolve, 400))
  await yt.$eval("video", (video) => {
    video.pause()
    video.currentTime = 0
  })
  await yt.waitForFunction(() =>
    [...document.querySelectorAll("*")].some((host) =>
      host.shadowRoot?.textContent.includes("Bản dịch câu mẫu để kiểm tra luyện nghe."),
    ),
  )
  await yt.$eval('pierce/[data-slot="sentence-study"] input', (n) => n.click())
  await yt.waitForFunction(() => {
    for (const host of document.querySelectorAll("*")) {
      const root = host.shadowRoot
      const panel = root?.querySelector('[data-slot="sentence-study"]')
      if (
        panel &&
        [...panel.querySelectorAll("button")].some(
          (button) => button.textContent.includes("Nghe lại") && !button.disabled,
        )
      )
        return true
    }
    return false
  })
  for (let attempt = 0; attempt < 30; attempt++) {
    const before = await counts()
    await new Promise((resolve) => setTimeout(resolve, 750))
    if ((await counts()) === before) break
  }
  const beforeStudy = await counts()
  await yt.keyboard.press("Escape")
  await yt.click("h1")
  await yt.evaluate(() => {
    window.studyMediaCalls = []
    const video = document.querySelector("video"),
      nativePlay = video.play.bind(video)
    video.play = () => {
      window.studyMediaCalls.push({ at: video.currentTime, action: "play" })
      return nativePlay().catch((error) => {
        window.studyMediaCalls.push({ error: error.message })
        throw error
      })
    }
  })
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://www.youtube.com/watch*" })
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: () => {
        const video = document.querySelector("video"),
          play = video.play.bind(video),
          pause = video.pause.bind(video)
        video.pause = () => {
          document.documentElement.dataset.studyPause = new Error("pause").stack
          document.documentElement.dataset.studyPauseTime = String(video.currentTime)
          pause()
        }
        for (const type of ["play", "pause", "playing", "seeking", "seeked", "ended"])
          video.addEventListener(
            type,
            () =>
              (document.documentElement.dataset.studyEvents =
                (document.documentElement.dataset.studyEvents ?? "") +
                `${type}@${video.currentTime.toFixed(2)};`),
          )
        video.play = () => {
          document.documentElement.dataset.studyPlay = "called"
          return play().catch((error) => {
            document.documentElement.dataset.studyPlay = error.message
            throw error
          })
        }
      },
    })
  })
  await yt.keyboard.press("k")
  await yt.waitForFunction(() => {
    const video = document.querySelector("video")
    return video.paused && video.currentTime > 0.8 && video.currentTime < 1.1
  })
  check(
    "Opt-in K replay uses real media and auto-pauses inside the cue end",
    await yt.$eval("video", (video) => video.paused && video.currentTime < 1.0),
  )
  await yt.keyboard.press("l")
  await yt.waitForFunction(() => document.querySelector("video").currentTime >= 1.2)
  check(
    "L seeks to and plays the following source cue",
    await yt.$eval("video", (video) => video.currentTime < 2.2),
  )
  await yt.waitForFunction(() => document.querySelector("video").paused)
  const visibleTranslations = () =>
    yt.evaluate(
      () =>
        [...document.querySelectorAll("*")]
          .flatMap((host) => [...(host.shadowRoot?.querySelectorAll("div,p") ?? [])])
          .filter(
            (node) =>
              node.textContent === "Bản dịch câu mẫu để kiểm tra luyện nghe." &&
              node.checkVisibility(),
          ).length,
    )
  check(
    "Sentence mode hides the translation in overlay and transcript",
    (await visibleTranslations()) === 0,
  )
  await yt.$eval('pierce/[data-slot="sentence-study"]', (panel) =>
    [...panel.querySelectorAll("button")]
      .find((button) => button.textContent === "Hiện bản dịch")
      .click(),
  )
  await yt.waitForFunction(() =>
    [...document.querySelectorAll("*")].some((host) =>
      [...(host.shadowRoot?.querySelectorAll("div,p") ?? [])].some(
        (node) =>
          node.textContent === "Bản dịch câu mẫu để kiểm tra luyện nghe." && node.checkVisibility(),
      ),
    ),
  )
  check(
    "Revealing a sentence restores its available translation",
    (await visibleTranslations()) > 0,
  )
  await yt.select('pierce/select[aria-label="Số lượt lặp câu"]', "2")
  await yt.$eval('pierce/[data-slot="sentence-study"] input', (node) => node.focus())
  const twiceAt = performance.now()
  await yt.keyboard.press("k")
  await yt.waitForFunction(() => !document.querySelector("video").paused)
  await yt.waitForFunction(() => document.querySelector("video").paused)
  check(
    "Two real-media passes auto-pause after the second replay, including checkbox focus",
    performance.now() - twiceAt >= 1700,
  )
  await yt.$eval('pierce/[data-slot="subtitle-word"][data-study-status]', (node) => node.click())
  await yt.waitForFunction(() =>
    [...document.querySelectorAll("*")].some((host) =>
      host.shadowRoot?.textContent.includes("Từ trong sổ đang học"),
    ),
  )
  check(
    "Clicking saved subtitle vocabulary opens local study evidence without AI",
    (await counts()) === beforeStudy,
  )
  await yt.keyboard.press("Escape")
  await yt.select('pierce/select[aria-label="Số lượt lặp câu"]', "1")
  await yt.focus("#youtube-input")
  await yt.keyboard.type("jkl")
  check(
    "Study shortcuts leave editable fields untouched",
    (await yt.$eval("#youtube-input", (n) => n.value)) === "jkl",
  )
  check(
    "Replaying cached cues and typing do not make extra paid requests",
    (await counts()) === beforeStudy,
  )
  await yt.evaluate(() => {
    document.querySelector("#youtube-input").blur()
    document.querySelector("#movie_player").classList.add("ad-showing")
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  const beforeAd = await yt.$eval("video", (video) => video.currentTime)
  await yt.keyboard.press("k")
  check(
    "The study controller releases its keys while an ad is showing",
    (await yt.$eval("video", (video) => video.currentTime)) === beforeAd,
  )
  await yt.evaluate(() => document.querySelector("#movie_player").classList.remove("ad-showing"))
  await new Promise((resolve) => setTimeout(resolve, 150))
  await yt.keyboard.press("j")
  await yt.waitForFunction(() => document.querySelector("video").currentTime < 1.1)
  await yt.waitForFunction(() => document.querySelector("video").paused)
  await yt.screenshot({ path: path.join(scratch, "youtube-study.png") })
  evidence.screenshots.push("youtube-study.png")
  await yt.evaluate(() => {
    history.pushState({}, "", "/watch?v=RFStudy0002")
    window.dispatchEvent(new Event("yt-navigate-start"))
    window.dispatchEvent(new Event("yt-navigate-finish"))
  })
  await yt.waitForFunction(() => {
    for (const host of document.querySelectorAll("*")) {
      const input = host.shadowRoot?.querySelector('[data-slot="sentence-study"] input')
      if (input) return !input.checked
    }
    return false
  })
  check("SPA video navigation resets opt-in sentence practice", true)
  const pdfBytes = bookFixture("They reverse the decision.", 5),
    pdfDigest = hash(pdfBytes),
    pdfPath = path.join(scratch, "Study-sources.pdf")
  await fs.writeFile(pdfPath, pdfBytes)
  const reader = await browser.newPage()
  reader.on("pageerror", (error) => errors.push(error.message))
  await reader.goto(base + "pdf-reader.html?study-check=1")
  await reader.bringToFront()
  await reader.waitForSelector('input[type="file"]')
  await (await reader.$('input[type="file"]')).uploadFile(pdfPath)
  await reader.waitForSelector(".textLayer span")
  await reader.waitForFunction(() =>
    [...CSS.highlights.values()].some((highlight) =>
      [...highlight].some((range) => range instanceof Range && range.toString() === "reverse"),
    ),
  )
  evidence.pdfHighlights = await reader.evaluate(() => ({
    canvases: document.querySelectorAll(".rf-pdf-page canvas").length,
    color: getComputedStyle(document.querySelector(".textLayer span")).color,
  }))
  console.log("PDF", evidence.pdfHighlights)
  check(
    "Owned PDF text layers highlight saved vocabulary without adding canvases or visible duplicate glyphs",
    await reader.evaluate(
      () =>
        document.querySelectorAll(".rf-pdf-page canvas").length <= 3 &&
        getComputedStyle(document.querySelector(".textLayer span")).color === "rgba(0, 0, 0, 0)" &&
        /,\s*0\.\d+\)$/.test(
          getComputedStyle(
            document.querySelector(".textLayer span"),
            "::highlight(rf-study-notAssessed)",
          ).backgroundColor,
        ),
    ),
  )
  await call(vocab, "addVocabularySource", {
    notebookId: notebook.id,
    cardId: reverse.id,
    capture: {
      ...capture,
      context: "They reverse the decision. page 3",
      sourceUrl: "",
      sourceTitle: "Study-sources",
      source: { kind: "pdf", documentId: pdfDigest, page: 3 },
    },
  })
  check(
    "PDF source jumps reject a document with a different content hash",
    (await call(vocab, "openVocabularyPdfSource", { documentId: "0".repeat(64), page: 3 })) ===
      false,
  )
  check(
    "A saved PDF source locates its open reader even with URL parameters",
    (await call(vocab, "openVocabularyPdfSource", { documentId: pdfDigest, page: 3 })) === true,
  )
  await reader.waitForFunction(
    () => document.querySelector('[aria-label="Số trang"]').value === "3",
  )
  await reader.waitForFunction(() =>
    [...CSS.highlights.values()].some((highlight) =>
      [...highlight].some(
        (range) =>
          range instanceof Range &&
          range.toString() === "reverse" &&
          range.startContainer.parentElement.closest('[data-page="3"]'),
      ),
    ),
  )
  await reader.screenshot({ path: path.join(scratch, "pdf-saved-word.png") })
  evidence.screenshots.push("pdf-saved-word.png")
  check("The production learning flow has no browser JavaScript errors", errors.length === 0)
  evidence.checkCount = evidence.checks.length
  evidence.apiCalls = await counts()
} catch (error) {
  evidence.failure = String(error)
  console.log("FAIL", evidence.failure)
  for (const [name, page] of [
    ["yt", yt],
    ["usage", usage],
    ["web", web],
    ["vocab", vocab],
  ])
    if (page) {
      evidence[`failure-${name}`] = await page
        .evaluate(() => ({
          text: document.body.innerText.slice(0, 6000),
          video: (() => {
            const node = document.querySelector("video")
            return (
              node && {
                time: node.currentTime,
                paused: node.paused,
                ready: node.readyState,
                error: node.error?.message,
                duration: node.duration,
                seekable: Array.from({ length: node.seekable.length }, (_, n) => [
                  node.seekable.start(n),
                  node.seekable.end(n),
                ]),
              }
            )
          })(),
          active: document.activeElement?.outerHTML.slice(0, 1000),
          keys: window.nativeKeyCount,
          mediaCalls: window.studyMediaCalls,
          studyPlay: document.documentElement.dataset.studyPlay,
          studyPause: document.documentElement.dataset.studyPause,
          studyPauseTime: document.documentElement.dataset.studyPauseTime,
          studyEvents: document.documentElement.dataset.studyEvents,
        }))
        .catch(() => "")
      console.log(name, evidence[`failure-${name}`])
      await page.bringToFront().catch(() => {})
      await page
        .screenshot({ path: path.join(scratch, `failure-${name}.png`), fullPage: false })
        .catch(() => {})
    }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  console.log(JSON.stringify({ scratch, ...evidence }, null, 2))
}
