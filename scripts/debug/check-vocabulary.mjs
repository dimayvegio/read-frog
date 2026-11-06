import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import JSZip from "jszip"

// Install puppeteer-core separately for browser checks; production has no
// browser automation dependency. Every run uses its own disposable profile.
const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const stamp = Date.now(),
  scratch = path.resolve(`.codex/vocabulary-check-${stamp}`)
await fs.mkdir(scratch, { recursive: true })
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
const evidence = {
  browser: await browser.version(),
  liveOpenAI: false,
  physicalPhone: false,
  checks: [],
  screenshots: [],
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const wait = async (fn) => {
  for (let n = 0; n < 100; n++) {
    const value = await fn()
    if (value) return value
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("Timed out waiting for fixture state")
}
let page
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3"))
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === `chrome-extension://${id}/background.js`,
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(`chrome-extension://${id}/options.html#/api-providers`)
  await options.waitForSelector("#openai-key")
  const wav = new Uint8Array(24044),
    view = new DataView(wav.buffer)
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i)
  }
  ascii(0, "RIFF")
  view.setUint32(4, wav.length - 8, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 24000, true)
  view.setUint32(28, 48000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, wav.length - 44, true)
  for (let i = 44; i < wav.length; i += 2)
    view.setInt16(i, Math.round(Math.sin(i / 12) * 1000), true)
  await worker.evaluate(
    async (samples) => {
      const { config } = await chrome.storage.local.get("config")
      config.language.targetCode = "vie"
      config.uiLanguage = "en"
      config.glossary.enabled = false
      config.providersConfig[0].model.model = "gpt-4o-mini"
      config.tts.openai.model = "gpt-4o-mini-tts"
      await chrome.storage.local.set({ config })
      await new Promise((resolve, reject) => {
        const open = indexedDB.open("edge-openai-credentials")
        open.onerror = reject
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("credentialState", "readwrite")
          tx.objectStore("credentialState").put({
            id: "openai",
            state: "active",
            apiKey: "vocabulary-test-sentinel",
            revision: 1000,
            updatedAt: Date.now(),
            legacyImportAllowed: false,
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      })
      globalThis.__vocabCalls = []
      globalThis.__vocabSpeechFails = false
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init),
          body = await req.json()
        globalThis.__vocabCalls.push({
          url: req.url,
          body,
          authorization: req.headers.get("authorization"),
        })
        if (req.url === "https://api.openai.com/v1/audio/speech")
          return __vocabSpeechFails
            ? new Response("fixture speech failure", { status: 500 })
            : new Response(new Uint8Array(samples), { headers: { "content-type": "audio/wav" } })
        if (req.url !== "https://api.openai.com/v1/responses")
          throw new Error("Unexpected fixture URL")
        const structured = body.text?.format?.type === "json_schema"
        const output = structured
          ? JSON.stringify({
              word: "reverse",
              language: "en-US",
              ipa: "/rɪˈvɝːs/",
              partOfSpeech: "Động từ",
              meaning: "đảo ngược",
              definition: "Làm thay đổi một xu hướng theo hướng ngược lại.",
              pronunciationTip: "Nhấn âm tiết thứ hai.",
              originalTranslation: "Cuộc bầu cử khó có thể đảo ngược nhu cầu mang tính cơ cấu.",
              example: {
                sentence: "They hope to reverse the decline.",
                translation: "Họ hy vọng đảo ngược sự suy giảm.",
              },
              distractors: ["tiếp tục duy trì", "đẩy nhanh tiến độ", "đo lường kết quả"],
              acceptedAnswers: ["reverse"],
              tags: ["Kinh tế"],
            })
          : "đảo ngược"
        const response = {
          id: "resp_vocabulary",
          object: "response",
          created_at: 1,
          status: "completed",
          model: body.model,
          output: [
            {
              id: "msg_vocabulary",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: output, annotations: [], logprobs: [] }],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 30,
            total_tokens: 40,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }
        if (!body.stream)
          return new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
          })
        const events = [
          {
            type: "response.created",
            response: { id: response.id, created_at: 1, model: body.model },
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            item: { type: "message", id: "msg_vocabulary" },
          },
          {
            type: "response.output_text.delta",
            item_id: "msg_vocabulary",
            output_index: 0,
            delta: output,
          },
          { type: "response.output_item.done", output_index: 0, item: response.output[0] },
          { type: "response.completed", response },
        ]
        return new Response(events.map((e) => "data: " + JSON.stringify(e) + "\n\n").join(""), {
          headers: { "content-type": "text/event-stream" },
        })
      }
    },
    [...wav],
  )
  page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`chrome-extension://${id}/vocabulary.html`)
  await page.waitForSelector("[data-action=add]")
  await page.click("[data-action=add]")
  await page.type("#new-word", "reverse")
  await page.type("#new-context", "The election is unlikely to reverse the structural demand.")
  await page.click("#generate-form button[type=submit]")
  await page.waitForFunction(() => document.querySelector(".word")?.textContent === "reverse", {
    timeout: 20000,
  })
  check(
    "Extension generates word, example and both audio clips through the production private OpenAI paths",
    await worker.evaluate(
      () =>
        __vocabCalls.length === 3 &&
        __vocabCalls.every((c) => c.authorization === "Bearer vocabulary-test-sentinel"),
    ),
  )
  await page.click("[data-action=reveal]")
  await page.waitForSelector(".answer")
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".answer")).opacity === "1",
  )
  check(
    "Flashcard reveals contextual Vietnamese meaning, IPA, original context and example",
    await page.evaluate(
      () =>
        document.querySelector(".answer").textContent.includes("đảo ngược") &&
        document.querySelector(".phonetic").textContent.includes("rɪ") &&
        document.querySelector(".context").textContent.includes("election"),
    ),
  )
  await page.screenshot({ path: path.join(scratch, "desktop.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "desktop.png"))
  const nativeChannel = await worker.evaluate(async () => {
    const selectionId = crypto.randomUUID()
    await chrome.storage.session.set({
      ["native-selection:" + selectionId]: {
        id: crypto.randomUUID(),
        text: "reverse",
        createdAt: Date.now(),
        tooLong: false,
      },
    })
    return selectionId
  })
  const native = await browser.newPage()
  native.on("pageerror", (e) => errors.push(e.message))
  await native.goto(`chrome-extension://${id}/selection-result.html?selectionId=${nativeChannel}`)
  await native.waitForSelector("[data-slot=save-vocabulary] button")
  await native.click("[data-slot=save-vocabulary] button")
  await native.waitForFunction(() =>
    document.querySelector("[data-slot=save-vocabulary]").textContent.includes("Từ này đã có"),
  )
  check(
    "The native PDF result page saves through the real vocabulary port and deduplicates the same sense",
    true,
  )
  await native.close()
  const manager = page
  const web = await browser.newPage()
  page = web
  web.on("pageerror", (e) => errors.push(e.message))
  await web.setRequestInterception(true)
  web.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === web.mainFrame())
      void request.respond({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><title>Vocabulary source fixture</title><body><p>The election is unlikely to <span id="term">reverse</span> the structural demand.</p></body></html>',
      })
    else if (/^chrome-extension:|^data:|^blob:/.test(request.url())) void request.continue()
    else void request.abort()
  })
  const webUrl = "https://example.com/vocabulary-fixture"
  await web.goto(webUrl)
  await web.waitForSelector("read-frog-selection")
  await web.$eval("#term", (node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
  await web.waitForSelector('body >>> [aria-label="Translation"]', { visible: true })
  await web.click('body >>> [aria-label="Translation"]')
  await web.waitForSelector("::-p-aria(Lưu để học)")
  await web.click("::-p-aria(Lưu để học)")
  await web.waitForSelector("::-p-aria(Đã lưu)")
  check(
    "A normal web selection exposes the save action inside the actual shadow-DOM translation popover",
    true,
  )
  await web.close()
  page = manager
  const cdp = await page.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: scratch })
  await page.click('a[download="ReadFrog-OnTuVung.html"]')
  const standalonePath = path.join(scratch, "ReadFrog-OnTuVung.html")
  await wait(async () => {
    try {
      return (await fs.stat(standalonePath)).size > 0
    } catch {
      return false
    }
  })
  check(
    "The extension downloads a self-contained HTML identical to its packaged standalone page",
    (await fs.readFile(standalonePath, "utf8")) ===
      (await fs.readFile(".output/edge-mv3/vocabulary-review.html", "utf8")),
  )
  await page.click("[data-action=export]")
  const zipFile = await wait(async () => {
    const names = await fs.readdir(scratch)
    return names.find((n) => n.endsWith(".zip"))
  })
  const bundleBytes = await fs.readFile(path.join(scratch, zipFile)),
    zip = await JSZip.loadAsync(bundleBytes)
  const cards = JSON.parse(await zip.file("vocabulary.json").async("string"))
  check(
    "ZIP carries schema v1 plus WAV assets and no API credential",
    JSON.parse(await zip.file("manifest.json").async("string")).version === 1 &&
      Object.keys(zip.files).filter((n) => n.endsWith(".wav")).length >= 1 &&
      !(await zip.file("vocabulary.json").async("string")).includes("vocabulary-test-sentinel"),
  )
  const standaloneContext = await browser.createBrowserContext()
  const standalone = await standaloneContext.newPage()
  page = standalone
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  })
  const standaloneErrors = []
  await page.evaluateOnNewDocument(() => {
    const NativeAudio = window.Audio
    window.__vocabAudio = []
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args)
      window.__vocabAudio.push(audio)
      return audio
    }
    window.Audio.prototype = NativeAudio.prototype
  })
  page.on("pageerror", (e) => standaloneErrors.push(e.message))
  const requests = []
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url())
  })
  await page.goto(pathToFileURL(standalonePath).href)
  await page.waitForSelector("#import-file")
  await page.setOfflineMode(true)
  await (await page.$("#import-file")).uploadFile(path.join(scratch, zipFile))
  await page.waitForFunction(() => document.querySelector(".word")?.textContent === "reverse")
  check(
    "The standalone page runs in a separate context without extension UI",
    await page.evaluate(
      () => !document.querySelector("read-frog-selection") && !document.querySelector("read-frog"),
    ),
  )
  check(
    "Phone study filters start collapsed",
    await page.evaluate(
      () => getComputedStyle(document.querySelector(".filters")).display === "none",
    ),
  )
  await page.click('[data-action="filters"]')
  check(
    "The mobile filter toggle exposes the search fields",
    await page.evaluate(
      () => getComputedStyle(document.querySelector(".filters")).display !== "none",
    ),
  )
  await page.click('[data-action="filters"]')
  check("A standalone local HTML imports the exported ZIP entirely offline", requests.length === 0)
  await page.click("[data-action=reveal]")
  await page.click("[data-action=audio]")
  await page.waitForFunction(() =>
    window.__vocabAudio.some(
      (a) => a.readyState >= 2 && a.duration > 0 && a.currentSrc.startsWith("blob:"),
    ),
  )
  check(
    "Offline word audio uses a local blob",
    await page.evaluate(
      () =>
        performance.getEntriesByType("resource").filter((e) => e.name.startsWith("http")).length ===
        0,
    ),
  )
  await page.click("[data-grade=good]")
  await page.waitForSelector("[data-action=check-due]")
  await page.click("[data-mode=choice]")
  await page.waitForSelector("[data-choice]")
  const answerIndex = await page.evaluate(() =>
    [...document.querySelectorAll("[data-choice]")].findIndex((b) =>
      b.textContent.includes("đảo ngược"),
    ),
  )
  await page.click(`[data-choice="${answerIndex}"]`)
  check(
    "Multiple choice provides four saved options and recognizes the correct contextual meaning",
    await page.evaluate(
      () =>
        document.querySelectorAll("[data-choice]").length === 4 &&
        document.querySelector(".feedback.correct")?.textContent.includes("Đúng"),
    ),
  )
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  })
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".answer")).opacity === "1",
  )
  await page.screenshot({ path: path.join(scratch, "phone-choice.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "phone-choice.png"))
  await page.click("[data-grade=good]")
  await page.waitForSelector("[data-action=check-due]")
  await page.click("[data-mode=type]")
  await page.waitForSelector("#typed-answer")
  await page.type("#typed-answer", "not-the-answer")
  await page.click("#type-form button")
  check(
    "An incorrect typed answer reveals the answer and only permits the lapse grade",
    await page.evaluate(
      () =>
        !!document.querySelector(".feedback.wrong") &&
        document.querySelector('[data-grade="good"]').disabled &&
        document.querySelector('[data-grade="easy"]').disabled &&
        !document.querySelector('[data-grade="again"]').disabled,
    ),
  )
  await page.click("[data-mode=flash]")
  await page.click("[data-mode=type]")
  await page.waitForSelector("#typed-answer")
  await page.type("#typed-answer", " REVERSE ")
  await page.click("#type-form button")
  check(
    "Typed answers normalize case and surrounding whitespace",
    await page.evaluate(() => !!document.querySelector(".feedback.correct")),
  )
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".answer")).opacity === "1",
  )
  await page.screenshot({ path: path.join(scratch, "phone-typed.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "phone-typed.png"))
  await page.click("[data-grade=good]")
  await page.waitForSelector("[data-action=check-due]")
  const readProgress = () =>
    page.evaluate(
      async () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("read-frog-vocabulary")
          open.onerror = reject
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction("progress"),
              req = tx.objectStore("progress").getAll()
            req.onsuccess = () => {
              resolve(req.result)
              db.close()
            }
          }
        }),
    )
  const before = await readProgress()
  check(
    "Each mode persists its own review schedule",
    before[0].flash.reviews === 1 && before[0].choice.reviews === 1 && before[0].type.reviews === 1,
  )
  const reviewedDir = path.join(scratch, "reviewed")
  await fs.mkdir(reviewedDir)
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: reviewedDir,
    browserContextId: standaloneContext.id,
  })
  await page.click("[data-action=export]")
  const progressFile = await wait(async () => {
    const names = await fs.readdir(reviewedDir)
    return names.find((n) => n.endsWith(".zip"))
  })
  const progressZip = await JSZip.loadAsync(await fs.readFile(path.join(reviewedDir, progressFile)))
  check(
    "Export after studying carries all three updated schedules into the ZIP",
    JSON.stringify(JSON.parse(await progressZip.file("progress.json").async("string"))) ===
      JSON.stringify(before),
  )
  await page.reload()
  await page.waitForSelector("#import-file")
  await (await page.$("#import-file")).uploadFile(path.join(scratch, zipFile))
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("Đã nhập"),
  )
  check(
    "Reload and importing an older ZIP preserve newer local progress",
    JSON.stringify(await readProgress()) === JSON.stringify(before),
  )
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true })
    check(
      `No horizontal overflow at ${width}px`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await page.click("[data-action=theme]")
  await page.click("[data-mode=flash]")
  await page.click("[data-action=practice]")
  await page.click("[data-action=reveal]")
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".answer")).opacity === "1",
  )
  await page.screenshot({ path: path.join(scratch, "phone-light.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "phone-light.png"))
  const bad = new JSZip()
  bad.file("evil.html", "<script>alert(1)</script>")
  await fs.writeFile(path.join(scratch, "bad.zip"), await bad.generateAsync({ type: "nodebuffer" }))
  await (await page.$("#import-file")).uploadFile(path.join(scratch, "bad.zip"))
  await page.waitForFunction(() => document.querySelector("#notice").classList.contains("error"))
  check(
    "An unrelated ZIP is rejected without modifying stored schedules",
    JSON.stringify(await readProgress()) === JSON.stringify(before),
  )
  await page.click("[data-tab=library]")
  await page.waitForSelector(".entry")
  await page.type("#search", "đảo")
  check(
    "Library search handles Vietnamese accents",
    await page.evaluate(() => document.querySelectorAll(".entry").length === 1),
  )
  check("Standalone makes no network requests while studying and listening", requests.length === 0)
  check("No browser JavaScript errors", errors.length === 0 && standaloneErrors.length === 0)
  evidence.cardCount = cards.length
  evidence.checkCount = evidence.checks.length
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (page)
    evidence.failureUI = await page
      .evaluate(() => ({
        text: document.body.innerText.slice(0, 2000),
        shadows: [...document.querySelectorAll("*")]
          .filter((n) => n.shadowRoot)
          .map((n) => n.shadowRoot.textContent.slice(-5000)),
      }))
      .catch(() => null)
  if (page)
    await page
      .screenshot({ path: path.join(scratch, "failure.png"), fullPage: true })
      .catch(() => {})
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
}
