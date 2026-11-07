import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/pronunciation-${Date.now()}`),
  downloads = path.join(scratch, "downloads")
await fs.mkdir(downloads, { recursive: true })
const wav = Buffer.alloc(44 + 16000 * 2 * 5)
wav.write("RIFF")
wav.writeUInt32LE(wav.length - 8, 4)
wav.write("WAVEfmt ", 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(16000, 24)
wav.writeUInt32LE(32000, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write("data", 36)
wav.writeUInt32LE(wav.length - 44, 40)
for (let i = 0; i < 16000 * 5; i++)
  wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 6000), 44 + i * 2)
const audioFile = path.join(scratch, "synthetic-microphone.wav")
await fs.writeFile(audioFile, wav)
const evidence = {
    checks: [],
    screenshots: [],
    liveOpenAI: false,
    microphoneFixture: "synthetic tone; mocked coaching; not a pronunciation calibration",
  },
  errors = []
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1000, height: 1000 },
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${audioFile}`,
  ],
})
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  evidence.browser = await browser.version()
  evidence.manifest = JSON.parse(
    await fs.readFile(".output/edge-mv3/manifest.json", "utf8"),
  ).version
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(() => {
    const original = globalThis.fetch
    globalThis.__pronunciationCalls = []
    globalThis.__pronunciationDelay = 0
    globalThis.__pronunciationBad = false
    globalThis.__pronunciationWordLegacy = false
    globalThis.__pronunciationQualityLow = false
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (request.url !== "https://api.openai.com/v1/chat/completions") return original(request)
      const body = await request.json()
      __pronunciationCalls.push({
        body,
        authorized: request.headers.get("authorization") === "Bearer pdf-reading-test-sentinel",
        credentials: request.credentials,
        redirect: request.redirect,
      })
      const delay = __pronunciationDelay,
        bad = __pronunciationBad
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      const ref = JSON.parse(body.messages[1].content[0].text),
        word = ref.words.length === 1
      const score = __pronunciationCalls.length === 1 ? 6.5 : 8
      const feedback = {
        verdict: "assessed",
        reason: "ok",
        confidence: "medium",
        heardText: ref.reference,
        overview:
          "Phần lớn từ nghe rõ. Hãy giữ âm cuối và nối từ tự nhiên hơn ở lần thu tiếp theo.",
        strengths: ["Nhịp đọc khá đều; phần đầu câu nghe rõ."],
        criteria: Object.fromEntries(
          ["sounds", "stress", "rhythm", "fluency", "accuracy"].map((key) => [
            key,
            {
              score:
                word && ["rhythm", "fluency"].includes(key) ? null : key === "sounds" ? score : 8,
              feedback:
                word && ["rhythm", "fluency"].includes(key)
                  ? "Không áp dụng cho từ đơn."
                  : "Nhận xét mô phỏng để kiểm tra giao diện; chưa chấm âm thanh thật.",
            },
          ]),
        ),
        findings: [
          {
            wordStart: 0,
            wordEnd: bad ? 9999 : 0,
            category: "ending",
            heard: "Âm cuối /d/ chưa rõ",
            expected: "read /ɹiːd/ — giọng Mỹ",
            explanation:
              "Giữ đầu lưỡi ở lợi trên cho /d/; không cần bật mạnh. Đây là nhận xét mô phỏng.",
            practice: "Đọc read → read it → read it again, ba lần chậm rồi tốc độ thường.",
            confidence: "medium",
          },
        ],
        nextPractice: [
          "Giữ âm cuối /d/ trong read.",
          "Nối read it nhẹ nhàng, không thêm nguyên âm sau /d/.",
        ],
      }
      if (word && __pronunciationWordLegacy) {
        feedback.criteria.rhythm = { score: 8, feedback: "Tiêu chí câu thừa do model trả thêm." }
        feedback.criteria.fluency = { score: 8, feedback: "Tiêu chí câu thừa do model trả thêm." }
        feedback.criteria.sounds.score = "8.2/10"
        feedback.criteria.stress.score = null
        feedback.findings[0].wordStart = 1
        feedback.findings[0].wordEnd = 1
      }
      if (__pronunciationQualityLow) feedback.confidence = "low"
      const content =
        word && __pronunciationWordLegacy
          ? "```json\n" + JSON.stringify(feedback) + "\n```"
          : JSON.stringify(feedback)
      return new Response(
        JSON.stringify({
          model: "gpt-audio-1.5",
          choices: [{ finish_reason: "stop", message: { content } }],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 300,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
  })
  const source = await browser.newPage()
  await source.setRequestInterception(true)
  source.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === source.mainFrame())
      void request.respond({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><title>Pronunciation fixture</title><body style="font:24px/2 Arial;padding:80px"><p>When I ask you to read, <span id="term">read it again</span> in a clear voice.</p></body></html>',
      })
    else if (/^chrome-extension:|^data:|^blob:/.test(request.url())) void request.continue()
    else void request.abort()
  })
  await source.goto("https://example.com/pronunciation-fixture")
  await source.bringToFront()
  await source.waitForSelector("read-frog-selection")
  const selectTerm = async () => {
    await source.$eval("#term", (node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event("selectionchange"))
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    })
  }
  await selectTerm()
  await source.waitForSelector('body >>> [aria-label="Translation"]', { visible: true })
  await source.click('body >>> [aria-label="Translation"]')
  await source.waitForSelector("body >>> [data-pronunciation]", { visible: true })
  check("Web Translate exposes the American pronunciation action beside source TTS", true)
  check(
    "The source action uses the concise Phát âm label",
    await source.$eval(
      "body >>> [data-pronunciation]",
      (node) => node.textContent.trim() === "Phát âm",
    ),
  )
  await source.$eval("body >>> [data-pronunciation]", (node) => node.click())
  const target = await browser.waitForTarget((t) =>
      t.url().startsWith(base + "pronunciation.html?"),
    ),
    practice = await target.asPage()
  practice.on("pageerror", (e) => errors.push(e.message))
  await practice.bringToFront()
  await practice.waitForSelector("#practice-text:not([disabled])")
  check(
    "Practice opens through the real source button with opaque one-use capture",
    (await practice.$eval("#practice-text", (node) => node.value === "read it again")) &&
      !target.url().includes("read%20"),
  )
  check(
    "Dictionary/Translate context is available for American heteronym reading",
    await practice.$eval('[aria-label="Ngữ cảnh"]', (node) => node.value.includes("ask you")),
  )
  check(
    "Opening practice never uploads audio",
    await worker.evaluate(() => __pronunciationCalls.length === 0),
  )
  await practice.evaluate(() => {
    globalThis.__micCalls = 0
    globalThis.__tracks = []
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      __micCalls++
      const stream = await original(constraints)
      __tracks.push(...stream.getTracks())
      return stream
    }
  })
  check(
    "Microphone is requested only on explicit record",
    await practice.evaluate(() => __micCalls === 0),
  )
  const record = async (duration = 1200) => {
    await practice.click("#record-practice")
    await practice.waitForFunction(() =>
      document.querySelector("#record-practice").textContent.includes("Dừng thu"),
    )
    await pause(duration)
    await practice.click("#record-practice")
    await practice.waitForSelector("#assess-practice:not([disabled])")
  }
  const rowCount = () =>
    practice.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("read-frog-pronunciation")
          request.onerror = reject
          request.onsuccess = () => {
            const db = request.result,
              count = db.transaction("attempts").objectStore("attempts").count()
            count.onsuccess = () => {
              db.close()
              resolve(count.result)
            }
            count.onerror = reject
          }
        }),
    )
  const clickText = async (page, text) =>
    page.$$eval(
      "button",
      (buttons, targetText) => buttons.find((b) => b.textContent.trim() === targetText).click(),
      text,
    )
  await record()
  check(
    "Recorded WebM is decoded/resampled locally; no API call before Submit",
    await worker.evaluate(() => __pronunciationCalls.length === 0),
  )
  check(
    "All microphone tracks stop after recording",
    await practice.evaluate(() => __tracks.every((track) => track.readyState === "ended")),
  )
  await practice.click("#assess-practice")
  await practice.waitForSelector("#practice-feedback")
  check(
    "Fixed rubric produces a 0.5-step weighted score and detailed correction goals",
    await practice.$eval(
      "#practice-feedback",
      (node) =>
        node.textContent.includes("7.5") &&
        node.textContent.includes("Lỗi nghe được") &&
        node.textContent.includes("Mục tiêu lần thu tiếp"),
    ),
  )
  check("One explicit Submit creates one persisted attempt", (await rowCount()) === 1)
  const request = await worker.evaluate(() => __pronunciationCalls[0])
  check(
    "Audio request uses private credential, exact audio model, text-only output and no storage",
    request.authorized &&
      request.credentials === "omit" &&
      request.redirect === "error" &&
      request.body.model === "gpt-audio-1.5" &&
      request.body.store === false &&
      request.body.modalities.join() === "text" &&
      request.body.messages[1].content[1].input_audio.format === "wav",
  )
  check(
    "Provider payload contains no page URL or file path",
    !JSON.stringify(request.body).includes("example.com") &&
      !JSON.stringify(request.body).includes("C:\\"),
  )
  await practice.click("#assess-practice")
  await practice.waitForFunction(() => document.body.textContent.includes("Dùng lại kết quả"))
  check(
    "Identical recording reuses feedback without tokens or duplicate attempt",
    (await worker.evaluate(() => __pronunciationCalls.length === 1)) && (await rowCount()) === 1,
  )
  await record(2100)
  await practice.click("#assess-practice")
  await practice.waitForSelector("#practice-feedback")
  check(
    "A new recording creates a second attempt with comparable previous score",
    (await rowCount()) === 2 &&
      (await practice.$eval("#practice-feedback", (node) =>
        node.textContent.includes("Lần trước cùng đoạn và model"),
      )),
  )
  await practice.screenshot({ path: path.join(scratch, "desktop.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "desktop.png"))
  const cdp = await practice.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
    eventsEnabled: true,
  })
  await clickText(practice, "Xuất báo cáo ChatGPT")
  await clickText(practice, "Xuất JSON")
  for (
    let i = 0;
    i < 80 && (await fs.readdir(downloads)).filter((name) => /\.(md|json)$/.test(name)).length < 2;
    i++
  )
    await pause(100)
  const report = await fs.readFile(path.join(downloads, "ReadFrog-PhatAmMy-ChatGPT.md"), "utf8"),
    json = JSON.parse(await fs.readFile(path.join(downloads, "ReadFrog-PhatAmMy.json"), "utf8"))
  check(
    "Actual Markdown and JSON downloads include per-attempt word feedback without audio/key",
    json.attempts.length === 2 &&
      json.attempts[0].feedback.findings[0].wordStart === 0 &&
      report.includes("7.5/10") &&
      !JSON.stringify(json).includes("pdf-reading-test-sentinel") &&
      !JSON.stringify(json).includes("UklGR"),
  )
  await practice.setViewport({ width: 390, height: 844 })
  evidence.phoneGeometry = await practice.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    main: document.querySelector("main").getBoundingClientRect().toJSON(),
    section: document.querySelector("section").getBoundingClientRect().toJSON(),
    link: document.querySelector("header a").getBoundingClientRect().toJSON(),
  }))
  check(
    "Phone header and cards remain within the visible content width",
    evidence.phoneGeometry.section.right <= evidence.phoneGeometry.clientWidth &&
      evidence.phoneGeometry.link.right <= evidence.phoneGeometry.clientWidth,
  )
  await practice.screenshot({ path: path.join(scratch, "phone.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "phone.png"))
  check(
    "Practice and report controls fit a 390px phone viewport",
    await practice.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  )
  await practice.setViewport({ width: 1000, height: 1000 })
  await record(1700)
  await worker.evaluate(() => {
    __pronunciationDelay = 1800
  })
  await practice.click("#assess-practice")
  await practice.waitForFunction(() =>
    document.querySelector("#assess-practice").textContent.includes("Đang nghe"),
  )
  await pause(250)
  await clickText(practice, "Hủy")
  await pause(2100)
  check(
    "Cancel ignores late provider feedback and never logs it",
    (await rowCount()) === 2 && !(await practice.$("#practice-feedback")),
  )
  await worker.evaluate(() => {
    __pronunciationDelay = 0
    __pronunciationBad = true
  })
  await practice.click("#assess-practice")
  await practice.waitForFunction(() => document.body.textContent.includes("PA-WORD"))
  check(
    "Invalid AI word indices yield no grade or fabricated history",
    (await rowCount()) === 2 && !(await practice.$("#practice-feedback")),
  )
  await worker.evaluate(() => {
    __pronunciationBad = false
  })
  await clickText(practice, "Xóa lịch sử phát âm…")
  await clickText(practice, "Xác nhận xóa")
  await practice.waitForFunction(() => document.body.textContent.includes("0 lần chấm duy nhất"))
  check("Explicit history clearing removes attempts and cached feedback", (await rowCount()) === 0)
  await practice.focus("#practice-text")
  await practice.keyboard.down("Control")
  await practice.keyboard.press("A")
  await practice.keyboard.up("Control")
  await practice.keyboard.type("read")
  await worker.evaluate(() => {
    __pronunciationWordLegacy = true
  })
  const beforeWord = await worker.evaluate(() => __pronunciationCalls.length)
  await record(1100)
  await practice.click("#assess-practice")
  await practice.waitForSelector("#practice-feedback")
  check(
    "An isolated word survives fenced JSON, numeric-string scores, one-based word index and redundant sentence criteria",
    (await practice.$eval("#practice-feedback", (node) =>
      node.querySelector(".score").textContent.includes("8.0"),
    )) && (await rowCount()) === 1,
  )
  check(
    "Word-only feedback shows sentence rhythm/fluency as N/A and retains actual word correction",
    (await practice.$eval("#practice-feedback", (node) =>
      [...node.querySelectorAll(".criteria article")]
        .filter((a) => /Nhịp và ngữ điệu|Độ trôi chảy/.test(a.textContent))
        .every((a) => a.textContent.includes("N/A")),
    )) &&
      (await practice.$eval("#practice-feedback .finding h4", (node) =>
        node.textContent.startsWith("read"),
      )),
  )
  check(
    "Word normalization does not trigger an automatic paid repair call",
    await worker.evaluate((before) => __pronunciationCalls.length === before + 1, beforeWord),
  )
  await practice.screenshot({ path: path.join(scratch, "single-word.png"), fullPage: true })
  evidence.screenshots.push(path.join(scratch, "single-word.png"))
  await worker.evaluate(() => {
    __pronunciationQualityLow = true
  })
  await record(1900)
  await practice.click("#assess-practice")
  await practice.waitForSelector("#practice-feedback")
  check(
    "Low-confidence word audio yields a visible recording retry with no grade rather than a format error",
    (await practice.$eval(
      "#practice-feedback",
      (node) =>
        node.textContent.includes("Cần thu lại để chấm") &&
        node.querySelector(".score").textContent.includes("—"),
    )) && (await rowCount()) === 2,
  )
  await worker.evaluate(() => {
    __pronunciationWordLegacy = false
    __pronunciationQualityLow = false
  })
  await practice.close()
  await source.bringToFront()
  await source.reload()
  await source.waitForSelector("read-frog-selection")
  await selectTerm()
  await source.waitForSelector('body >>> [aria-label="Dictionary"]', { visible: true })
  await source.click('body >>> [aria-label="Dictionary"]')
  await source.waitForSelector("body >>> [data-pronunciation]", { visible: true })
  await source.$eval("body >>> [data-pronunciation]", (node) => node.click())
  const dictionary = await (
    await browser.waitForTarget(
      (t) => t.url().startsWith(base + "pronunciation.html?") && t !== target,
    )
  ).asPage()
  dictionary.on("pageerror", (e) => errors.push(e.message))
  await dictionary.waitForSelector("#practice-text:not([disabled])")
  check(
    "Built-in Dictionary opens the same practice UI with original selected text/context",
    (await dictionary.$eval("#practice-text", (node) => node.value === "read it again")) &&
      (await dictionary.$eval('[aria-label="Ngữ cảnh"]', (node) => node.value.includes("ask you"))),
  )
  check("No React/runtime errors occurred in practice windows", errors.length === 0)
  await source.bringToFront()
  await source.reload()
  await source.waitForSelector("read-frog-selection")
  await source.$eval("#term", (node) => {
    node.textContent = "你好，这是中文。"
  })
  await selectTerm()
  await source.waitForSelector('body >>> [aria-label="Translation"]', { visible: true })
  await source.click('body >>> [aria-label="Translation"]')
  await source.waitForFunction(() =>
    [...document.querySelectorAll("read-frog-selection")].some((node) =>
      node.shadowRoot?.textContent.includes("你好，这是中文。"),
    ),
  )
  check(
    "A Chinese selection in an English page hides the pronunciation action",
    !(await source.$("body >>> [data-pronunciation]")),
  )
  evidence.errors = errors
} catch (error) {
  evidence.failure = String(error)
  for (const page of await browser.pages()) {
    if (page.url().includes("pronunciation.html")) {
      await fs.writeFile(
        path.join(scratch, "failure-ui.txt"),
        await page.$eval("body", (node) => node.textContent),
      )
      await page.screenshot({ path: path.join(scratch, "failure.png"), fullPage: true })
    }
  }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log(scratch)
}
