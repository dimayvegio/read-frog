import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Mp3Encoder } from "@breezystack/lamejs"
import JSZip from "jszip"

// Real built HTML and browser UI; synthetic data, no keys, network or paid API.
const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const scratch = path.resolve(`.codex/vocabulary-scale-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = {
  checks: [],
  timingsMs: {},
  physicalPhone: false,
  liveOpenAI: false,
  syntheticAudio: true,
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const now = Date.now(),
  notebook = { id: randomUUID(), name: "Sổ thử 1.000 từ", createdAt: now, updatedAt: now }
const state = (reviews) => ({
  dueAt: 0,
  intervalDays: reviews ? 1 : 0,
  reviews,
  lapses: 0,
  updatedAt: reviews ? now - 86400000 : 0,
})
const encoder = new Mp3Encoder(1, 24000, 64),
  chunks = []
for (let offset = 0; offset < 24000; offset += 1152) {
  const pcm = Int16Array.from({ length: Math.min(1152, 24000 - offset) }, (_, i) =>
    Math.round(Math.sin((i + offset) / 12) * 3000),
  )
  chunks.push(Buffer.from(encoder.encodeBuffer(pcm)))
}
chunks.push(Buffer.from(encoder.flush()))
const sample = Buffer.concat(chunks),
  audioBase = Buffer.concat([sample, sample, sample])
const audioVariant = (index) => {
  const bytes = Buffer.from(audioBase)
  // MPEG private header bits do not change audio decoding. Vary these to give
  // 2,000 distinct valid content hashes/buffers rather than two shared assets.
  let offset = 0
  for (let bit = 0; bit < 16; bit++) {
    bytes[offset + 2] = (bytes[offset + 2] & 254) | ((index >> bit) & 1)
    const b = bytes[offset + 1],
      c = bytes[offset + 2],
      version = (b >> 3) & 3
    const rate = [44100, 48000, 32000][(c >> 2) & 3] / (version === 3 ? 1 : version === 2 ? 2 : 4)
    const kbps = (
      version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    )[c >> 4]
    offset += Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + ((c >> 1) & 1)
  }
  return bytes
}
const zip = new JSZip(),
  cards = [],
  progress = [],
  events = [],
  sessionId = randomUUID()
for (let i = 0; i < 1000; i++) {
  const word = `word${String(i).padStart(4, "0")}`,
    id = hash(word),
    refs = []
  for (let j = 0; j < 2; j++) {
    const bytes = audioVariant(i * 2 + j),
      audioId = hash(bytes)
    zip.file(`audio/${audioId}.mp3`, bytes, { createFolders: false })
    refs.push(audioId)
  }
  const card = {
    id,
    captureKey: hash(`capture:${word}`),
    word,
    language: "en-US",
    ipa: "/wɜːd/",
    partOfSpeech: "Danh từ",
    meaning: `nghĩa mẫu số ${i}`,
    definition: "Định nghĩa dùng để kiểm thử sổ lớn.",
    pronunciationTip: "Nghe giọng đọc đã lưu.",
    originalTranslation: "Câu dịch mẫu.",
    context: `They use ${word} every day.`,
    example: { sentence: `They use ${word} every day.`, translation: "Họ dùng từ này mỗi ngày." },
    distractors: ["nghĩa khác một", "nghĩa khác hai", "nghĩa khác ba"],
    acceptedAnswers: [word],
    tags: [i % 2 ? "Nhóm lẻ" : "Nhóm chẵn"],
    createdAt: now,
    updatedAt: now,
    sourceTitle: "Scale fixture",
    sourceUrl: "",
    audio: { word: refs[0], example: refs[1] },
    speech: { model: "fixture", voice: "fixture", speed: 1 },
  }
  cards.push(card)
  progress.push({ cardId: id, flash: state(0), choice: state(0), type: state(i < 900 ? 10 : 0) })
  if (i < 900)
    for (let j = 0; j < 10; j++) {
      const result = j < 9 || i % 3 === 1 ? "correct" : i % 3 === 0 ? "incorrect" : "revealed"
      events.push({
        id: randomUUID(),
        sessionId,
        cardId: id,
        occurredAt: now - 100000 + i * 10 + j,
        mode: "type",
        result,
        word,
        language: "en-US",
        meaning: card.meaning,
        answer: result === "correct" ? word : result === "incorrect" ? "wrong-word" : "",
        elapsedMs: 1200,
        grade: "good",
        gradedAt: now - 10000 + i * 10 + j,
      })
    }
}
zip.file(
  "manifest.json",
  JSON.stringify({
    format: "read-frog-vocabulary",
    version: 5,
    title: notebook.name,
    notebook,
    cardCount: 1000,
    reviewCount: events.length,
    exportedAt: now,
  }),
)
zip.file("vocabulary.json", JSON.stringify(cards))
zip.file("progress.json", JSON.stringify(progress))
zip.file("reviews.json", JSON.stringify(events))
const fixturePath = path.join(scratch, "1000-words.zip"),
  bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  })
await fs.writeFile(fixturePath, bytes)
evidence.fixture = {
  words: 1000,
  distinctAudioAssets: 2000,
  audioBytes: audioBase.length * 2000,
  answers: events.length,
  zipBytes: bytes.length,
  sha256: hash(bytes),
}
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  defaultViewport: { width: 1280, height: 940 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
evidence.browser = await browser.version()
const page = await browser.newPage(),
  errors = [],
  requests = [],
  downloads = path.join(scratch, "downloads")
await fs.mkdir(downloads)
const cdp = await page.createCDPSession()
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads })
page.setDefaultTimeout(30000)
page.on("pageerror", (e) => errors.push(e.message))
page.on("request", (r) => {
  if (/^https?:/.test(r.url())) requests.push(r.url())
})
await page.evaluateOnNewDocument(() => {
  const NativeAudio = window.Audio
  window.__scaleAudio = []
  window.Audio = function (...args) {
    const audio = new NativeAudio(...args)
    window.__scaleAudio.push(audio)
    return audio
  }
  window.Audio.prototype = NativeAudio.prototype
  window.__scaleLongTasks = []
  new PerformanceObserver((list) =>
    window.__scaleLongTasks.push(...list.getEntries().map((e) => e.duration)),
  ).observe({ type: "longtask", buffered: true })
})
const readStore = (storeName) =>
  page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("read-frog-vocabulary")
        open.onerror = reject
        open.onsuccess = () => {
          const db = open.result,
            req = db.transaction(name).objectStore(name).getAll()
          req.onsuccess = () => {
            resolve(
              name === "audio"
                ? req.result.map((a) => ({ id: a.id, size: a.bytes.byteLength }))
                : req.result,
            )
            db.close()
          }
          req.onerror = reject
        }
      }),
    storeName,
  )
const run = async () => (await readStore("learningRuns"))[0]
const ready = () =>
  page.waitForFunction(() => {
    const button = document.querySelector("[data-learn-action=exit]")
    return button && !button.disabled
  })
const submit = async (value) => {
  await page.type("#learning-answer", value)
  await page.click('#learning-answer-form button[type="submit"]')
  await ready()
}
const download = async (action, extension) => {
  const directory = path.join(downloads, `${action}-${randomUUID()}`)
  await fs.mkdir(directory)
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: directory })
  const start = performance.now()
  await page.click(`[data-action="${action}"]`)
  let file
  for (let i = 0; i < 600; i++) {
    file = (await fs.readdir(directory)).find((f) => f.endsWith(extension))
    if (file) break
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.ok(file, `download ${action}`)
  evidence.timingsMs[action] = Math.round(performance.now() - start)
  return path.join(directory, file)
}
try {
  const html = path.resolve(".output/edge-mv3/vocabulary-review.html")
  evidence.htmlSha256 = hash(await fs.readFile(html))
  await page.goto(pathToFileURL(html).href)
  await page.waitForSelector("#import-file")
  await page.setOfflineMode(true)
  const start = performance.now()
  await (await page.$("#import-file")).uploadFile(fixturePath)
  await page.waitForFunction(
    () => document.querySelector(".numbers .number strong")?.textContent === "1000",
    { timeout: 120000 },
  )
  evidence.timingsMs.import = Math.round(performance.now() - start)
  check(
    "UI imports 1,000 words, 2,000 distinct MP3 assets and 9,000 answers atomically",
    (await readStore("notebookCards")).length === 1000 &&
      (await readStore("reviewEvents")).length === 9000 &&
      (await readStore("audio")).length === 2000,
  )
  check("Scale import completes within 30 seconds", evidence.timingsMs.import < 30000)
  await page.click('.nav [data-tab="library"]')
  await page.waitForSelector(".entry")
  check("Large notebook renders only the first 40 entries", (await page.$$(".entry")).length === 40)
  const searchStart = performance.now()
  await page.type("#search", "word0999")
  await page.waitForFunction(() => document.querySelectorAll(".entry").length === 1)
  evidence.timingsMs.search = Math.round(performance.now() - searchStart)
  check(
    "Search finds the final word without rendering 1,000 entries",
    await page.$eval(".entry h3", (n) => n.textContent.includes("word0999")),
  )
  await page.$eval("#search", (n) => {
    n.value = ""
    n.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await page.click('.nav [data-tab="history"]')
  await page.waitForSelector("#review-summary")
  const reportFile = await download("export-chatgpt-report", ".md"),
    markdown = await fs.readFile(reportFile, "utf8")
  evidence.reportBytes = Buffer.byteLength(markdown)
  check(
    "Compact ChatGPT report includes all 1,000 words, individual counts, errors and separate untested words",
    cards.every((c) => markdown.includes(c.word)) &&
      markdown.includes("wrong-word") &&
      markdown.includes("Chưa đủ dữ liệu") &&
      markdown.includes("Tiến trình từng từ"),
  )
  check(
    "Compact report stays under 110 KB despite 9,000 raw answer logs",
    evidence.reportBytes < 110000,
  )
  const json = JSON.parse(await fs.readFile(await download("export-report", ".json"), "utf8"))
  check(
    "Full JSON retains all 9,000 event IDs without inflating compact report",
    json.events.length === 9000 &&
      new Set(json.events.map((e) => e.id)).size === 9000 &&
      json.assessment.notAssessed.length === 100,
  )
  await cdp.send("HeapProfiler.collectGarbage")
  const before = await page.metrics()
  for (let i = 0; i < 12; i++) {
    await page.click('.nav [data-tab="library"]')
    await page.click('.nav [data-tab="history"]')
  }
  await cdp.send("HeapProfiler.collectGarbage")
  const after = await page.metrics()
  evidence.heap = {
    before: before.JSHeapUsedSize,
    after: after.JSHeapUsedSize,
    delta: after.JSHeapUsedSize - before.JSHeapUsedSize,
  }
  check(
    "Repeated library/history navigation has bounded post-GC heap growth",
    evidence.heap.delta < 20 * 1024 * 1024,
  )
  await page.click('.nav [data-tab="study"]')
  await page.click('[data-learning-mode="today"]')
  await ready()
  const firstRun = await run(),
    firstTask = firstRun.queue[0]
  check(
    "Today limits 1,000 cards to ten words and five fresh words",
    firstRun.queue.length === 30 &&
      new Set(firstRun.queue.map((t) => t.cardId)).size === 10 &&
      firstRun.phase === "question",
  )
  await submit("wrong")
  check("First wrong answer is stored before correction", (await run()).phase === "correction")
  await page.reload()
  await page.waitForSelector('[data-action="learn-open"]')
  await page.click('[data-action="learn-open"]:not([data-learning-mode])')
  await ready()
  check(
    "Closing/reopening resumes the exact correction step and first answer",
    (await run()).id === firstRun.id &&
      (await run()).feedback.answer === "wrong" &&
      (await page.$eval("#content", (n) => n.textContent.includes("Gõ sửa"))),
  )
  await submit(firstTask.expected)
  check(
    "Correction is logged as assisted and cannot replace the original miss",
    (await readStore("reviewEvents")).some(
      (e) => e.exercise?.kind === "correction" && e.exercise.parentAttemptId === firstTask.id,
    ),
  )
  await page.click('[data-learn-action="next"]')
  await ready()
  const hintTask = (await run()).queue[(await run()).cursor]
  await page.click('[data-learn-action="hint"]')
  await ready()
  await page.reload()
  await page.waitForSelector('[data-action="learn-open"]')
  await page.click('[data-action="learn-open"]:not([data-learning-mode])')
  await ready()
  check("Hint assistance survives page reload", (await run()).hint === "first-letter")
  await submit(hintTask.expected)
  await page.click('[data-learn-action="next"]')
  await ready()
  await page.$eval("#learning-answer", (n) =>
    n.dispatchEvent(new Event("paste", { bubbles: true })),
  )
  await ready()
  const pasteRun = await run()
  await submit(pasteRun.queue[pasteRun.cursor].expected)
  check(
    "Pasted answers remain assisted in persistent logs",
    (await readStore("reviewEvents")).some(
      (e) => e.id === pasteRun.queue[pasteRun.cursor].id && e.exercise.assisted,
    ),
  )
  await page.click('[data-learn-action="next"]')
  await ready()
  let heard = false,
    sawCloze = false,
    checkedReplay = false
  for (let step = 0; step < 60; step++) {
    let current = await run()
    if (current.phase === "done") break
    if (current.phase === "study") {
      await page.click('[data-learn-action="intro"]')
      await ready()
      current = await run()
    }
    if (current.phase === "feedback") {
      await page.click('[data-learn-action="next"]')
      await ready()
      continue
    }
    const task = current.queue[current.cursor]
    if (task.kind === "dictation" && !heard) {
      check(
        "Dictation hides word and IPA before checking",
        await page.$eval(
          ".learning-study",
          (n, word) => !n.textContent.includes(word) && !n.querySelector(".phonetic"),
          task.expected,
        ),
      )
      await page.select("#learning-speed", "0.75")
      await page.click('[data-learn-action="audio"]')
      await ready()
      await page.waitForFunction(() =>
        window.__scaleAudio.some((a) => a.readyState >= 2 && a.duration > 0),
      )
      heard = true
      checkedReplay = (await run()).replays === 1
    }
    if (task.kind === "cloze")
      sawCloze = await page.$eval(
        ".learning-cue",
        (n, word) => n.textContent.includes("_____") && !n.textContent.includes(word),
        task.expected,
      )
    await submit(task.expected)
  }
  check(
    "Three interleaved rounds finish with capped retries and valid cloze prompts",
    (await run()).phase === "done" && sawCloze && heard && checkedReplay,
  )
  const learned = (await readStore("reviewEvents")).filter(
      (e) => e.exercise?.runId === firstRun.id,
    ),
    finalJson = JSON.parse(
      await fs.readFile(
        await (async () => {
          await page.click('.nav [data-tab="history"]')
          return download("export-report", ".json")
        })(),
        "utf8",
      ),
    )
  check(
    "First misses, hints, paste and corrections never inflate unassisted counts",
    learned.filter((e) => e.exercise.kind === "correction").length === 1 &&
      finalJson.summary.correctionAttempts === 1 &&
      finalJson.summary.assistedAttempts === 2,
  )
  const schedules = await readStore("notebookProgress")
  check(
    "Repeated rounds add at most one SRS review per word",
    firstRun.queue
      .slice(0, 10)
      .every(
        (t) =>
          schedules.find((p) => p.cardId === t.cardId).type.reviews ===
          progress.find((p) => p.cardId === t.cardId).type.reviews + 1,
      ),
  )
  const exported = await JSZip.loadAsync(await fs.readFile(await download("export", ".zip")))
  const exportedEvents = JSON.parse(await exported.file("reviews.json").async("string"))
  check(
    "ZIP v5 exports every word, audio file, schedule and immutable attempt",
    JSON.parse(await exported.file("vocabulary.json").async("string")).length === 1000 &&
      Object.keys(exported.files).filter((f) => f.endsWith(".mp3")).length === 2000 &&
      exportedEvents.length === 9000 + learned.length,
  )
  const exportedPath = path.join(scratch, "roundtrip.zip")
  await fs.writeFile(exportedPath, await exported.generateAsync({ type: "nodebuffer" }))
  await (await page.$("#import-file")).uploadFile(exportedPath)
  await page.waitForFunction(
    () =>
      document.querySelector("#notice").textContent.startsWith("Đã nhập") &&
      !document.querySelector("#notebook-select").disabled,
  )
  check(
    "Reimporting the 1,000-word ZIP merges stable event IDs without double counting",
    (await readStore("reviewEvents")).length === exportedEvents.length,
  )
  evidence.longTasksMs = await page.evaluate(() => window.__scaleLongTasks)
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true })
    await page.waitForFunction(
      () =>
        document.querySelector("#notebook-select")?.value &&
        document.querySelector("#content")?.textContent.length > 500,
    )
    await page.click('.nav [data-tab="history"]')
    await page.waitForSelector("#review-summary")
    check(
      `1,000-word notebook has no page overflow at ${width}px`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await page.screenshot({ path: path.join(scratch, "phone-1000-history.png"), fullPage: true })
  await page.click('.nav [data-tab="study"]')
  await page.click('[data-learning-mode="today"]')
  await ready()
  await page.screenshot({ path: path.join(scratch, "phone-guided.png"), fullPage: true })
  check(
    "Entire 1,000-word study flow runs offline without JavaScript errors",
    requests.length === 0 && errors.length === 0,
  )
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  evidence.failure = String(error)
  evidence.failureUI = await page.evaluate(() => document.body.innerText).catch(() => "")
  await page.screenshot({ path: path.join(scratch, "failure.png"), fullPage: true }).catch(() => {})
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
}
