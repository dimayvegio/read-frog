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
  await native.waitForFunction(
    () => !document.querySelector("[data-slot=save-vocabulary] button").disabled,
  )
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
  await web.locator("::-p-aria(Lưu để học)").click()
  await web.waitForSelector("::-p-aria(Đã lưu)")
  check(
    "A normal web selection exposes the save action inside the actual shadow-DOM translation popover",
    true,
  )
  await web.close()
  page = manager
  const extensionFirstNotebook = await page.$eval("#notebook-select", (select) => select.value)
  await page.click('#notebook-bar [data-action="new-library"]')
  await page.click('#notebook-form button[type="submit"]')
  await page.waitForFunction(
    () =>
      document.querySelector("#notebook-select").options.length === 2 &&
      !document.querySelector("#dialog").open,
  )
  const extensionSecondNotebook = await page.$eval("#notebook-select", (select) => select.value)
  const anotherChannel = await worker.evaluate(async () => {
    const channel = crypto.randomUUID()
    await chrome.storage.session.set({
      ["native-selection:" + channel]: {
        id: crypto.randomUUID(),
        text: "reverse",
        createdAt: Date.now(),
        tooLong: false,
      },
    })
    return channel
  })
  const chooseNotebookPage = await browser.newPage()
  await chooseNotebookPage.goto(
    `chrome-extension://${id}/selection-result.html?selectionId=${anotherChannel}`,
  )
  await chooseNotebookPage.waitForFunction(
    () => document.querySelector('[aria-label="Lưu vào sổ"]')?.options.length === 2,
  )
  await chooseNotebookPage.select('[aria-label="Lưu vào sổ"]', extensionFirstNotebook)
  await chooseNotebookPage.select('[aria-label="Lưu vào sổ"]', extensionSecondNotebook)
  await chooseNotebookPage.waitForFunction(
    () => !document.querySelector("[data-slot=save-vocabulary] button").disabled,
  )
  await chooseNotebookPage.click("[data-slot=save-vocabulary] button")
  await chooseNotebookPage.waitForFunction(() =>
    document.querySelector("[data-slot=save-vocabulary]").textContent.includes("Đã lưu từ"),
  )
  check(
    "The save popup selects a named notebook and stores the word separately in that notebook",
    await worker.evaluate(
      async (expected) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("read-frog-vocabulary")
          open.onerror = reject
          open.onsuccess = () => {
            const db = open.result,
              request = db.transaction("notebookCards").objectStore("notebookCards").getAll()
            request.onsuccess = () => {
              resolve(
                request.result.length === 2 &&
                  request.result.some((row) => row.notebookId === expected),
              )
              db.close()
            }
          }
        }),
      extensionSecondNotebook,
    ),
  )
  await chooseNotebookPage.select('[aria-label="Lưu vào sổ"]', extensionFirstNotebook)
  await chooseNotebookPage.waitForFunction(
    () => !document.querySelector("[data-slot=save-vocabulary] button").disabled,
  )
  await chooseNotebookPage.click("[data-slot=save-vocabulary] button")
  await chooseNotebookPage.waitForFunction(() =>
    document.querySelector("[data-slot=save-vocabulary]").textContent.includes("Từ này đã có"),
  )
  check(
    "After saving, the popup can choose another notebook and save without reselecting the word",
    true,
  )
  await chooseNotebookPage.close()
  await page.select("#notebook-select", extensionFirstNotebook)
  await page.waitForFunction(
    (bookId) =>
      document.querySelector("#notebook-select").value === bookId &&
      !document.querySelector("#notebook-select").disabled,
    {},
    extensionFirstNotebook,
  )
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
  const legacyArchive = await JSZip.loadAsync(bundleBytes)
  const legacyManifest = JSON.parse(await legacyArchive.file("manifest.json").async("string"))
  delete legacyManifest.notebook
  legacyManifest.version = 1
  legacyManifest.title = "Từ vựng của tôi"
  legacyArchive.file("manifest.json", JSON.stringify(legacyManifest))
  const legacyPath = path.join(scratch, "legacy-v1.zip")
  await fs.writeFile(legacyPath, await legacyArchive.generateAsync({ type: "nodebuffer" }))
  check(
    "ZIP carries a named notebook v2 plus WAV assets and no API credential",
    JSON.parse(await zip.file("manifest.json").async("string")).version === 2 &&
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
              tx = db.transaction("notebookProgress"),
              req = tx.objectStore("notebookProgress").getAll()
            req.onsuccess = () => {
              const selectedNotebook = document.querySelector("#notebook-select").value
              resolve(
                req.result
                  .filter((row) => row.notebookId === selectedNotebook)
                  .map(({ notebookId: _notebookId, ...progress }) => progress),
              )
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
  const firstNotebook = await page.$eval("#notebook-select", (select) => select.value)
  await page.click('#notebook-bar [data-action="new-library"]')
  await page.click('#notebook-form button[type="submit"]')
  await page.waitForFunction(
    () =>
      document.querySelector("#notebook-select").options.length === 2 &&
      !document.querySelector("#dialog").open,
  )
  const secondNotebook = await page.$eval("#notebook-select", (select) => select.value)
  check(
    "Creating Sổ 2 preserves Sổ 1 and starts with an empty word list",
    secondNotebook !== firstNotebook &&
      (await page.evaluate(() => document.querySelectorAll(".entry").length === 0)),
  )
  await page.click('[data-action="rename-notebook"]')
  await page.click("#notebook-name")
  await page.keyboard.down("Control")
  await page.keyboard.press("A")
  await page.keyboard.up("Control")
  await page.type("#notebook-name", "Sổ 2 - Công việc")
  await page.click('#notebook-form button[type="submit"]')
  await page.waitForFunction(
    () =>
      !document.querySelector("#dialog").open &&
      document.querySelector("#notebook-select").selectedOptions[0].textContent ===
        "Sổ 2 - Công việc",
  )
  check("Notebooks can be renamed with Vietnamese names", true)
  await page.select("#notebook-select", firstNotebook)
  await page.waitForSelector(".entry")
  await page.click('.entry [data-action="move"]')
  await page.select("#move-target", secondNotebook)
  await page.click('[data-action="confirm-move"]')
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("Đã chuyển"),
  )
  check(
    "Moving a word removes it from the source notebook",
    await page.evaluate(() => document.querySelectorAll(".entry").length === 0),
  )
  await page.select("#notebook-select", secondNotebook)
  await page.waitForSelector(".entry")
  check(
    "The target notebook keeps the word's three review histories",
    JSON.stringify(await readProgress()) === JSON.stringify(before),
  )
  const filesBefore = new Set(await fs.readdir(reviewedDir))
  await page.click('[data-action="export"]')
  const secondFile = await wait(async () => {
    const names = await fs.readdir(reviewedDir)
    return names.find((n) => n.endsWith(".zip") && !filesBefore.has(n))
  })
  const secondZip = await JSZip.loadAsync(await fs.readFile(path.join(reviewedDir, secondFile)))
  const secondManifest = JSON.parse(await secondZip.file("manifest.json").async("string"))
  check(
    "Each ZIP carries only the selected notebook and its user-chosen name",
    secondManifest.notebook.id === secondNotebook &&
      secondManifest.notebook.name === "Sổ 2 - Công việc" &&
      secondFile.includes("Công việc"),
  )
  await (await page.$("#import-file")).uploadFile(path.join(reviewedDir, secondFile))
  await page.waitForFunction(
    () =>
      document.querySelector("#notice").textContent.includes("Đã nhập") &&
      !document.querySelector("#notebook-select").disabled,
  )
  check(
    "Importing the same notebook ZIP again updates it without duplicating its words or notebook",
    (await page.evaluate(
      () =>
        document.querySelector("#notebook-select").options.length === 2 &&
        document.querySelectorAll(".entry").length === 1,
    )) && JSON.stringify(await readProgress()) === JSON.stringify(before),
  )
  await (await page.$("#import-file")).uploadFile(path.join(scratch, zipFile))
  await page.waitForFunction(
    (bookId) =>
      document.querySelector("#notebook-select").value === bookId &&
      !document.querySelector("#notebook-select").disabled,
    {},
    firstNotebook,
  )
  check(
    "Importing Sổ 1 keeps the separate Sổ 2 and does not create a duplicate notebook",
    await page.$eval("#notebook-select", (select) => select.options.length === 2),
  )
  await page.select("#notebook-select", secondNotebook)
  await page.waitForSelector(".entry")
  check(
    "Importing another notebook does not reset this notebook's progress",
    JSON.stringify(await readProgress()) === JSON.stringify(before),
  )
  await page.click('#notebook-bar [data-action="new-library"]')
  await page.click('#notebook-form button[type="submit"]')
  await page.waitForFunction(
    () =>
      document.querySelector("#notebook-select").options.length === 3 &&
      !document.querySelector("#dialog").open,
  )
  const thirdNotebook = await page.$eval("#notebook-select", (select) => select.value)
  await (await page.$("#import-file")).uploadFile(legacyPath)
  await page.waitForFunction(
    () =>
      document.querySelector("#notice").textContent.includes("Đã nhập") &&
      !document.querySelector("#notebook-select").disabled,
  )
  check(
    "A legacy ZIP v1 imports into the selected notebook without replacing other notebooks",
    await page.$eval(
      "#notebook-select",
      (select, bookId) => select.value === bookId && select.options.length === 3,
      thirdNotebook,
    ),
  )
  await page.reload()
  await page.waitForFunction(() => document.querySelector("#notebook-select")?.options.length === 3)
  check(
    "Notebooks, selected notebook and words survive reopening HTML without importing again",
    (await page.$eval(
      "#notebook-select",
      (select, bookId) => select.value === bookId,
      thirdNotebook,
    )) && (await page.$eval(".word", (word) => word.textContent === "reverse")),
  )
  await page.screenshot({ path: path.join(scratch, "phone-notebooks.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "phone-notebooks.png"))

  // Real Edge upgrade: use the previously shipped standalone HTML at the SAME
  // file URL, keeping its own browser context and IndexedDB between versions.
  const baseline = await JSZip.loadAsync(
    await fs.readFile(
      process.env.VOCAB_BASELINE_ZIP ?? ".output/read-frogextension-1.58.0-a.4-edge.zip",
    ),
  )
  const upgradePath = path.join(scratch, "upgrade-review.html")
  await fs.writeFile(upgradePath, await baseline.file("vocabulary-review.html").async("nodebuffer"))
  const upgradeContext = await browser.createBrowserContext(),
    oldPage = await upgradeContext.newPage()
  await oldPage.goto(pathToFileURL(upgradePath).href)
  await oldPage.waitForSelector("#import-file")
  await (await oldPage.$("#import-file")).uploadFile(legacyPath)
  await oldPage.waitForSelector(".word")
  await oldPage.click('[data-action="reveal"]')
  await oldPage.click('[data-grade="good"]')
  await oldPage.waitForSelector('[data-action="check-due"]')
  const rawStore = (target, storeName) =>
    target.evaluate(
      (store) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("read-frog-vocabulary")
          open.onerror = reject
          open.onsuccess = () => {
            const db = open.result,
              request = db.transaction(store).objectStore(store).getAll()
            request.onsuccess = () => {
              resolve(request.result)
              db.close()
            }
            request.onerror = reject
          }
        }),
      storeName,
    )
  const oldProgress = await rawStore(oldPage, "progress"),
    oldCards = await rawStore(oldPage, "cards")
  await oldPage.close()
  await fs.writeFile(upgradePath, await fs.readFile(standalonePath))
  const upgraded = await upgradeContext.newPage()
  await upgraded.goto(pathToFileURL(upgradePath).href)
  await upgraded.waitForSelector("#notebook-select")
  await upgraded.click('[data-tab="library"]')
  await upgraded.waitForSelector(".entry")
  const migratedCards = (await rawStore(upgraded, "notebookCards")).map(
    ({ notebookId: _notebookId, ...card }) => card,
  )
  const migratedProgress = (await rawStore(upgraded, "notebookProgress")).map(
    ({ notebookId: _notebookId, ...progress }) => progress,
  )
  check(
    "Replacing the old HTML at the same path migrates its real Edge v1 words and histories",
    JSON.stringify(migratedCards) === JSON.stringify(oldCards) &&
      JSON.stringify(migratedProgress) === JSON.stringify(oldProgress),
  )
  check(
    "Legacy data appears in Sổ 1 after the HTML upgrade",
    await upgraded.$eval(
      "#notebook-select",
      (select) => select.options.length === 1 && select.selectedOptions[0].textContent === "Sổ 1",
    ),
  )
  await upgraded.reload()
  await upgraded.waitForSelector("#notebook-select")
  check(
    "A second reload does not duplicate the migrated notebook",
    await upgraded.$eval("#notebook-select", (select) => select.options.length === 1),
  )
  await upgradeContext.close()
  const persistentProfile = path.join(scratch, "normal-html-profile")
  const launchPersistent = () =>
    puppeteer.launch({
      executablePath:
        process.env.VOCAB_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      userDataDir: persistentProfile,
      headless: false,
      pipe: true,
      defaultViewport: { width: 1000, height: 800 },
      args: ["--no-first-run", "--no-default-browser-check"],
    })
  let persistentBrowser
  try {
    persistentBrowser = await launchPersistent()
    let persistentPage = await persistentBrowser.newPage()
    await persistentPage.goto(pathToFileURL(standalonePath).href)
    await persistentPage.waitForSelector("#import-file")
    await (await persistentPage.$("#import-file")).uploadFile(path.join(reviewedDir, secondFile))
    await persistentPage.waitForFunction(() =>
      document.querySelector("#notice").textContent.includes("Đã nhập"),
    )
    await persistentBrowser.close()
    persistentBrowser = await launchPersistent()
    persistentPage = await persistentBrowser.newPage()
    await persistentPage.goto(pathToFileURL(standalonePath).href)
    await persistentPage.waitForSelector("#notebook-select")
    await persistentPage.click('[data-tab="library"]')
    await persistentPage.waitForSelector(".entry")
    check(
      "Closing and restarting normal Edge preserves the imported notebook without importing ZIP again",
      await persistentPage.$eval(
        "#notebook-select",
        (select, bookId) =>
          select.value === bookId && select.selectedOptions[0].textContent === "Sổ 2 - Công việc",
        secondNotebook,
      ),
    )
    const reopenedProgress = await rawStore(persistentPage, "notebookProgress")
    check(
      "All three review schedules survive a full browser restart",
      reopenedProgress.length === 1 &&
        reopenedProgress[0].flash.reviews === 1 &&
        reopenedProgress[0].choice.reviews === 1 &&
        reopenedProgress[0].type.reviews === 1,
    )
  } finally {
    await persistentBrowser?.close()
  }
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
