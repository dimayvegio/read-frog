import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { createServer } from "node:http"
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
const readEvents = (target) =>
  target.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("read-frog-vocabulary")
        open.onerror = reject
        open.onsuccess = () => {
          const db = open.result,
            request = db.transaction("reviewEvents").objectStore("reviewEvents").getAll(),
            bookId = document.querySelector("#notebook-select").value
          request.onsuccess = () => {
            resolve(
              request.result
                .filter((row) => row.notebookId === bookId)
                .map(({ notebookId: _notebookId, ...event }) => event),
            )
            db.close()
          }
          request.onerror = reject
        }
      }),
  )
let page, reviewServer
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
  let wav = new Uint8Array(24044)
  const view = new DataView(wav.buffer)
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
  if (process.env.VOCAB_WAV_FIXTURE)
    wav = new Uint8Array(await fs.readFile(process.env.VOCAB_WAV_FIXTURE))
  evidence.fixtureAudio = process.env.VOCAB_WAV_FIXTURE
    ? "local system speech fixture, not OpenAI"
    : "synthetic tone"
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
        const properties = body.text?.format?.schema?.properties ?? {}
        const dictionary = structured && Object.keys(properties).length > 0 && !properties.word
        const output = dictionary
          ? JSON.stringify(
              Object.fromEntries(
                Object.keys(properties).map((key) => [
                  key,
                  /phonetic/i.test(key) ? "/rɪˈvɝːs/" : /term/i.test(key) ? "reverse" : "đảo ngược",
                ]),
              ),
            )
          : structured
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
  await native.bringToFront()
  await native.waitForFunction(() =>
    [...document.querySelectorAll("[data-slot=save-vocabulary] button")].some((button) =>
      button.textContent.includes("Thêm câu vào từ đã có"),
    ),
  )
  const beforeNativeSave = await worker.evaluate(() => __vocabCalls.length)
  await native.evaluate(() =>
    [...document.querySelectorAll("[data-slot=save-vocabulary] button")]
      .find((button) => button.textContent.includes("Thêm câu vào từ đã có"))
      .click(),
  )
  await native.waitForFunction(() => {
    const text = document.querySelector("[data-slot=save-vocabulary]").textContent
    return text.includes("Đã thêm câu nguồn") || text.includes("Câu nguồn này đã có")
  })
  check(
    "The native PDF result adds a source to the existing sense without another OpenAI or TTS call",
    (await worker.evaluate(() => __vocabCalls.length)) === beforeNativeSave,
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
  await web.bringToFront()
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
  await web.waitForSelector("::-p-aria(Tạo thẻ cho nghĩa khác)")
  await web.$eval('body >>> [data-slot="save-vocabulary"]', (node) =>
    [...node.querySelectorAll("button")]
      .find((button) => button.textContent.includes("Tạo thẻ cho nghĩa khác"))
      .click(),
  )
  await web.waitForSelector("::-p-aria(Đã lưu)")
  check(
    "A normal web selection exposes the save action inside the actual shadow-DOM translation popover",
    true,
  )
  await web.reload()
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
  await web.waitForSelector('body >>> [aria-label="Dictionary"]', { visible: true })
  await web.click('body >>> [aria-label="Dictionary"]')
  await web.waitForSelector('body >>> [data-slot="dictionary-save-vocabulary"]', { visible: true })
  await web.waitForSelector("::-p-aria(Tạo thẻ cho nghĩa khác)")
  await web.$eval('body >>> [data-slot="save-vocabulary"]', (node) =>
    [...node.querySelectorAll("button")]
      .find((button) => button.textContent.includes("Tạo thẻ cho nghĩa khác"))
      .click(),
  )
  await web.waitForSelector("::-p-aria(Đã lưu)")
  check(
    "Built-in dictionary results save through the same private vocabulary port and notebook picker",
    true,
  )
  await web.close()
  page = manager
  await manager.bringToFront()
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
  await chooseNotebookPage.waitForFunction(() =>
    [...document.querySelectorAll("[data-slot=save-vocabulary] button")].some(
      (button) => button.textContent.includes("Thêm câu vào từ đã có") && !button.disabled,
    ),
  )
  await chooseNotebookPage.$eval("[data-slot=save-vocabulary]", (node) =>
    [...node.querySelectorAll("button")]
      .find((button) => button.textContent.includes("Thêm câu vào từ đã có"))
      .click(),
  )
  await chooseNotebookPage.waitForFunction(() =>
    /Đã thêm câu nguồn|Câu nguồn này đã có/.test(
      document.querySelector("[data-slot=save-vocabulary]").textContent,
    ),
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
  const legacyArchive = new JSZip()
  const legacyManifest = JSON.parse(await zip.file("manifest.json").async("string"))
  const notebookMetadata = legacyManifest.notebook
  delete legacyManifest.reviewCount
  delete legacyManifest.sourceCount
  delete legacyManifest.notebook
  legacyManifest.version = 1
  legacyManifest.title = "Từ vựng của tôi"
  legacyArchive.file("manifest.json", JSON.stringify(legacyManifest))
  const legacyCards = structuredClone(cards),
    wavHash = createHash("sha256").update(wav).digest("hex")
  for (const card of legacyCards) card.audio = { word: wavHash, example: wavHash }
  legacyArchive.file("vocabulary.json", JSON.stringify(legacyCards))
  legacyArchive.file("progress.json", await zip.file("progress.json").async("string"))
  legacyArchive.file(`audio/${wavHash}.wav`, wav, { createFolders: false })
  const legacyPath = path.join(scratch, "legacy-v1.zip")
  await fs.writeFile(legacyPath, await legacyArchive.generateAsync({ type: "nodebuffer" }))
  legacyArchive.file(
    "manifest.json",
    JSON.stringify({
      ...legacyManifest,
      version: 2,
      notebook: notebookMetadata,
      title: notebookMetadata.name,
    }),
  )
  const legacyV2Path = path.join(scratch, "legacy-v2.zip"),
    legacyV2Bytes = await legacyArchive.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 3 },
    })
  await fs.writeFile(legacyV2Path, legacyV2Bytes)
  check(
    "ZIP carries a named notebook v6 plus compressed MP3 assets and no API credential",
    JSON.parse(await zip.file("manifest.json").async("string")).version === 6 &&
      Object.keys(zip.files).filter((n) => n.endsWith(".mp3")).length >= 1 &&
      !(await zip.file("vocabulary.json").async("string")).includes("vocabulary-test-sentinel"),
  )
  evidence.compression = {
    sourceAudioBytes: wav.length,
    exportedAudioBytes: (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => name.startsWith("audio/"))
          .map((name) => zip.file(name).async("nodebuffer")),
      )
    ).reduce((size, bytes) => size + bytes.length, 0),
    legacyZipBytes: legacyV2Bytes.length,
    optimizedZipBytes: bundleBytes.length,
  }
  check(
    "Compressed notebook ZIP is smaller than the legacy WAV ZIP for the same fixture",
    bundleBytes.length < legacyV2Bytes.length,
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
  const sourceRows = JSON.parse(await zip.file("sources.json").async("string"))
  check("ZIP6 carries the saved source separately from answer logs", sourceRows.length > 0)
  await page.click('[data-tab="library"]')
  await page.click('[data-action="view"]')
  await page.waitForSelector(".source-passages")
  check(
    "The offline mobile HTML displays source passages imported from ZIP6",
    await page.$eval(".source-passages", (node) => node.textContent.includes("Những câu đã gặp")),
  )
  await page.click('[data-action="close"]')
  await page.click('[data-tab="study"]')
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
  await page.waitForSelector(".feedback.correct")
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
  await page.waitForSelector(".feedback.wrong")
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
  await page.waitForSelector(".feedback.correct")
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
  const logged = await readEvents(page)
  check(
    "Every first checked answer is logged even if a wrong attempt is abandoned without grading",
    logged.length === 4 &&
      logged.some(
        (event) =>
          event.answer === "not-the-answer" && event.result === "incorrect" && event.grade === null,
      ),
  )
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
  await page.click('.nav [data-tab="history"]')
  await page.waitForSelector("#review-summary")
  check(
    "Review history distinguishes one word, four attempts, two correct answers and one wrong answer",
    await page.$eval("#review-summary", (summary) => {
      const values = [...summary.querySelectorAll("strong")].map((node) => node.textContent)
      return JSON.stringify(values) === JSON.stringify(["1", "4", "2", "1", "0", "66.7%"])
    }),
  )
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true })
    check(
      `Review history has no page overflow at ${width}px`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await page.screenshot({ path: path.join(scratch, "phone-history.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "phone-history.png"))
  await page.click('[data-action="export-report"]')
  const reportFile = await wait(async () =>
    (await fs.readdir(reviewedDir)).find((name) => name.endsWith(".json")),
  )
  const learningReport = JSON.parse(await fs.readFile(path.join(reviewedDir, reportFile), "utf8"))
  check(
    "The JSON report puts reverse in the review-first list with its real mistake and expected answer",
    learningReport.version === 3 &&
      learningReport.assessment.needsReview[0].word === "reverse" &&
      learningReport.assessment.needsReview[0].recentMistakes[0].answer === "not-the-answer" &&
      learningReport.assessment.needsReview[0].recentMistakes[0].expectedAnswer === "reverse",
  )
  check(
    "The history page explains why a word still needs review after one correct retry",
    await page.$eval(
      "#words-needing-review",
      (node) =>
        node.textContent.includes("reverse") && node.textContent.includes("mới đúng liên tiếp 1"),
    ),
  )
  await page.click('[data-action="export-chatgpt-report"]')
  const markdownFile = await wait(async () =>
    (await fs.readdir(reviewedDir)).find((name) => name.endsWith(".md")),
  )
  const readableReport = await fs.readFile(path.join(reviewedDir, markdownFile), "utf8")
  check(
    "The actual downloaded ChatGPT report lists weak words first with reasons and mistakes",
    readableReport.includes("not-the-answer") &&
      readableReport.indexOf("reverse") > readableReport.indexOf("### Cần ôn lại") &&
      readableReport.indexOf("reverse") < readableReport.indexOf("### Đang củng cố") &&
      !/apiKey|sourceUrl|vocabulary-test-sentinel/.test(readableReport),
  )
  check(
    "The actual downloaded JSON report includes summaries, daily stats, weak words and raw attempts",
    learningReport.format === "read-frog-review-report" &&
      learningReport.summary.attempts === 4 &&
      learningReport.summary.uniqueWords === 1 &&
      learningReport.daily.length >= 1 &&
      learningReport.words[0].incorrect === 1 &&
      learningReport.events.length === 4,
  )
  check(
    "Flashcard self-ratings do not inflate objective accuracy and the report carries no source URL or API key",
    learningReport.summary.selfRated === 1 &&
      learningReport.byMode.flash.accuracyPercent === null &&
      learningReport.summary.accuracyPercent === 66.7 &&
      !/sourceUrl|apiKey|vocabulary-test-sentinel/.test(JSON.stringify(learningReport)),
  )
  await page.select("#log-days", "7")
  check(
    "The seven-day review filter retains today's attempts",
    await page.$eval(
      "#review-summary",
      (node) => node.querySelectorAll("strong")[1].textContent === "4",
    ),
  )
  await page.click('.nav [data-tab="study"]')
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
  check(
    "ZIP v4 includes exactly the four recorded review attempts",
    JSON.stringify(JSON.parse(await progressZip.file("reviews.json").async("string"))) ===
      JSON.stringify(logged),
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
  check(
    "Reloading and importing an older ZIP do not reset review logs",
    JSON.stringify(await readEvents(page)) === JSON.stringify(logged),
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
  check(
    "Moving a word carries its checked-answer logs into the target notebook",
    JSON.stringify(await readEvents(page)) === JSON.stringify(logged),
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
      "Review attempt logs survive a full Edge restart and ZIP transfer",
      (await readEvents(persistentPage)).length === 4,
    )
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
  // Serve exactly the downloaded HTML, without an application backend/CDN.
  // Disable SubtleCrypto as on an insecure HTTP origin; portable hashes remain.
  const hostedHtml = await fs.readFile(standalonePath)
  reviewServer = createServer((req, res) => {
    if (req.url === "/favicon.ico") {
      res.writeHead(204)
      res.end()
      return
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
    res.end(hostedHtml)
  })
  await new Promise((resolve) => reviewServer.listen(0, "127.0.0.1", resolve))
  const hostedContext = await browser.createBrowserContext(),
    hosted = await hostedContext.newPage(),
    hostedRequests = [],
    hostedErrors = []
  await hosted.evaluateOnNewDocument(() => {
    Object.defineProperty(crypto, "subtle", { value: undefined })
    const NativeAudio = window.Audio
    window.__vocabAudio = []
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args)
      window.__vocabAudio.push(audio)
      return audio
    }
    window.Audio.prototype = NativeAudio.prototype
  })
  hosted.on("pageerror", (error) => hostedErrors.push(error.message))
  await hosted.goto(`http://127.0.0.1:${reviewServer.address().port}/review.html`)
  await hosted.waitForSelector("#import-file")
  hosted.on("request", (req) => {
    if (/^https?:/.test(req.url()) && !req.url().endsWith("/favicon.ico"))
      hostedRequests.push(req.url())
  })
  await hosted.setOfflineMode(true)
  await (await hosted.$("#import-file")).uploadFile(legacyV2Path)
  await hosted.waitForSelector(".word")
  check(
    "HTTP-hosted HTML imports ZIP v2 offline with no SubtleCrypto",
    await hosted.evaluate(
      () => !crypto.subtle && document.querySelector(".word").textContent === "reverse",
    ),
  )
  const hostedDir = path.join(scratch, "hosted-export")
  await fs.mkdir(hostedDir, { recursive: true })
  const hostedSession = await hosted.createCDPSession()
  await hostedSession.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: hostedDir,
  })
  await hosted.click('[data-action="export"]')
  const hostedFile = await wait(async () =>
    (await fs.readdir(hostedDir)).find((name) => name.endsWith(".zip")),
  )
  const hostedZip = await JSZip.loadAsync(await fs.readFile(path.join(hostedDir, hostedFile)))
  check(
    "Hosted HTML transcodes legacy WAV to MP3 ZIP v4 using only bundled JavaScript",
    JSON.parse(await hostedZip.file("manifest.json").async("string")).version === 6 &&
      Object.keys(hostedZip.files).some((name) => name.endsWith(".mp3")),
  )
  check(
    "Hosted export preserves notebook identity and all three schedules",
    JSON.stringify(JSON.parse(await hostedZip.file("manifest.json").async("string")).notebook) ===
      JSON.stringify(notebookMetadata) &&
      (await hostedZip.file("progress.json").async("string")) ===
        (await zip.file("progress.json").async("string")),
  )
  for (const name of Object.keys(hostedZip.files).filter((entryName) => entryName.endsWith(".mp3")))
    assert.equal(
      createHash("sha256")
        .update(await hostedZip.file(name).async("nodebuffer"))
        .digest("hex"),
      path.basename(name, ".mp3"),
    )
  check(
    "Hosted export uses content-addressed MP3 assets with valid SHA-256",
    Object.keys(hostedZip.files).some((name) => name.endsWith(".mp3")),
  )
  // A fresh hosted origin context imports the new ZIP, so playback is MP3.
  await hostedContext.close()
  const mp3Context = await browser.createBrowserContext(),
    hostedMp3 = await mp3Context.newPage()
  await hostedMp3.evaluateOnNewDocument(() => {
    const NativeAudio = window.Audio
    window.__vocabAudio = []
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args)
      window.__vocabAudio.push(audio)
      return audio
    }
    window.Audio.prototype = NativeAudio.prototype
  })
  hostedMp3.on("pageerror", (error) => hostedErrors.push(error.message))
  await hostedMp3.goto(`http://127.0.0.1:${reviewServer.address().port}/review.html`)
  await hostedMp3.waitForSelector("#import-file")
  hostedMp3.on("request", (req) => {
    if (/^https?:/.test(req.url()) && !req.url().endsWith("/favicon.ico"))
      hostedRequests.push(req.url())
  })
  await hostedMp3.setOfflineMode(true)
  await (await hostedMp3.$("#import-file")).uploadFile(path.join(hostedDir, hostedFile))
  await hostedMp3.waitForSelector(".word")
  await hostedMp3.click('[data-action="audio"]')
  await hostedMp3.waitForFunction(() =>
    window.__vocabAudio.some(
      (audio) =>
        audio.readyState >= 2 && audio.duration > 0 && audio.currentSrc.startsWith("blob:"),
    ),
  )
  check(
    "HTTP-hosted HTML imports and plays MP3 ZIP v4 offline",
    await hostedMp3.evaluate(() => window.__vocabAudio.some((audio) => audio.duration > 0)),
  )
  await hostedMp3.click('[data-mode="choice"]')
  const hostAnswer = await hostedMp3.evaluate(() =>
    [...document.querySelectorAll("[data-choice]")].findIndex((button) =>
      button.textContent.includes("đảo ngược"),
    ),
  )
  await hostedMp3.click(`[data-choice="${hostAnswer}"]`)
  await hostedMp3.waitForSelector(".feedback.correct")
  await hostedMp3.click('[data-grade="good"]')
  await hostedMp3.waitForSelector('[data-action="check-due"]')
  await hostedMp3.click('.nav [data-tab="history"]')
  await hostedMp3.waitForSelector("#review-summary")
  check(
    "HTTP-hosted HTML records study logs fully offline without a server API",
    (await readEvents(hostedMp3)).length === 1,
  )
  await hostedMp3.click('[data-action="clear-logs"]')
  await hostedMp3.click('[data-action="confirm-clear-logs"]')
  await hostedMp3.waitForFunction(() => !document.querySelector("#dialog").open)
  check(
    "Clearing logs through the UI keeps vocabulary and review schedules",
    (await readEvents(hostedMp3)).length === 0 &&
      (await hostedMp3.evaluate(
        () =>
          new Promise((resolve) => {
            const open = indexedDB.open("read-frog-vocabulary")
            open.onsuccess = () => {
              const db = open.result,
                tx = db.transaction(["notebookCards", "notebookProgress"]),
                storedCards = tx.objectStore("notebookCards").getAll(),
                progress = tx.objectStore("notebookProgress").getAll()
              tx.oncomplete = () => {
                resolve(storedCards.result.length === 1 && progress.result[0].choice.reviews === 1)
                db.close()
              }
            }
          }),
      )),
  )
  check(
    "Hosted study, compression and audio need no server API or CDN requests",
    hostedRequests.length === 0 && hostedErrors.length === 0,
  )
  await mp3Context.close()
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
  if (page) await page.bringToFront().catch(() => {})
  if (page)
    await page
      .screenshot({ path: path.join(scratch, "failure.png"), fullPage: false })
      .catch(() => {})
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  if (reviewServer) await new Promise((resolve) => reviewServer.close(resolve))
}
