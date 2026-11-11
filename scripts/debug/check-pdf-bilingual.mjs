import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

// Production Edge + real local PDF.js rendering. Only the OpenAI network is mocked.
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/pdf-bilingual-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = { checks: [], screenshots: [], liveOpenAI: false },
  errors = []
const check = (name, result) => {
  assert.ok(result, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
function fixture(scan = false) {
  const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ],
    kids = []
  for (let page = 1; page <= 8; page++) {
    const n = objects.length + 1
    kids.push(`${n} 0 R`)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${n + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    const text = scan
      ? ""
      : [
          `BT /F1 22 Tf 50 735 Td (A little every day - page ${page}) Tj ET`,
          "BT /F1 16 Tf 50 650 Td (Learning a little every day is more effective) Tj 0 -23 Td (than studying a lot once a week.) Tj ET",
          "BT /F1 16 Tf 50 540 Td (Regular practice helps us remember new words.) Tj ET",
          "BT /F1 16 Tf 50 430 Td (Read the original paragraph, then compare it) Tj 0 -23 Td (with the translation. Listen and repeat aloud.) Tj ET",
          "BT /F1 16 Tf 50 290 Td (Small steps can make a lasting difference.) Tj ET",
          "BT /F1 16 Tf 50 170 Td (Use the words in a sentence of your own.) Tj ET",
          "BT /F1 16 Tf 50 70 Td (Take a break and return tomorrow.) Tj ET",
        ].join("\n")
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count 8 >>`
  let output = "%PDF-1.4\n",
    offsets = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(output)
  return (
    output +
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  )
}
const file = path.join(scratch, "Private reading fixture.pdf"),
  renamed = path.join(scratch, "Renamed.pdf"),
  scan = path.join(scratch, "Scan.pdf")
await fs.writeFile(file, fixture())
await fs.writeFile(renamed, fixture())
await fs.writeFile(scan, fixture(true))
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1440, height: 960 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  evidence.browser = await browser.version()
  evidence.manifest = JSON.parse(
    await fs.readFile(".output/edge-mv3/manifest.json", "utf8"),
  ).version
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(() => {
    globalThis.__pdfTextOutput = (body) => {
      const input = JSON.stringify(body)
      const pairs = [
        [
          "Learning a little",
          "Học một chút mỗi ngày hiệu quả hơn việc học thật nhiều một lần mỗi tuần.",
        ],
        ["Regular practice", "Luyện tập thường xuyên giúp chúng ta ghi nhớ những từ mới."],
        [
          "Read the original",
          "Đọc đoạn gốc, sau đó đối chiếu với bản dịch. Nghe và đọc lại thành tiếng.",
        ],
        ["Small steps", "Những bước nhỏ có thể tạo nên sự thay đổi lâu dài."],
        ["Use the words", "Hãy dùng những từ này trong một câu do chính bạn viết."],
        ["Take a break", "Hãy nghỉ ngơi và quay lại vào ngày mai."],
      ]
      return (
        pairs.find(([phrase]) => input.includes(phrase))?.[1] ??
        "Một chút mỗi ngày — cách học hiệu quả."
      )
    }
  })
  const calls = () => worker.evaluate(() => __pdfCalls.length),
    reader = await browser.newPage()
  reader.on("pageerror", (error) => errors.push(error.message))
  reader.setDefaultTimeout(15000)
  await reader.goto(base + "pdf-reader.html")
  const load = async (pathname) => {
    await (await reader.$('input[type="file"]')).uploadFile(pathname)
    await reader.waitForSelector('[aria-label="Số trang"]')
    await reader.waitForSelector(".rf-pdf-page[data-rendered=true] .textLayer")
    await pause()
  }
  const clickText = (text) =>
    reader.evaluate(
      (label) =>
        [...document.querySelectorAll("button")]
          .find((n) => n.textContent.trim() === label)
          ?.click(),
      text,
    )
  const ready = async () => {
    await reader.waitForSelector(".rf-bilingual-card")
    await reader.waitForFunction(
      () => !document.body.innerText.includes("Đang nhận diện đoạn trên trang"),
    )
    await pause()
  }
  const navigate = async (pageNumber) => {
    await reader.$eval(
      '[aria-label="Số trang"]',
      (node, n) => {
        node.value = n
        node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      },
      pageNumber,
    )
    await reader.waitForFunction(
      (n) => document.querySelector(".rf-bilingual-controls")?.textContent.includes(`Trang ${n} ·`),
      {},
      pageNumber,
    )
    await ready()
  }
  await load(file)
  await clickText("Song ngữ theo đoạn")
  await ready()
  const count = await reader.$$eval(".rf-bilingual-card", (nodes) => nodes.length)
  check(
    "Opening bilingual mode groups seven paragraphs without paid requests",
    count === 7 && (await calls()) === 0,
  )
  const ids = await reader.$$eval(".rf-bilingual-card", (nodes) =>
    nodes.map((n) => n.dataset.translationId),
  )
  check(
    "Original page badges and translation cards have matching IDs",
    (await reader.$$eval('[data-page="1"] .rf-paragraph-badge', (nodes) =>
      nodes.map((n) => n.dataset.paragraphId).join(),
    )) === ids.join(),
  )
  await reader.$eval(".rf-bilingual-card:nth-child(2) header button:first-child", (node) =>
    node.click(),
  )
  check(
    "Picking a card highlights its original paragraph",
    (await reader.$eval(
      '[data-page="1"] .rf-paragraph-box.active',
      (n) => n.dataset.paragraphId,
    )) === ids[1],
  )
  const selectable = await reader.evaluate(() => {
    const span = document.querySelector('[data-page="1"] .textLayer span'),
      range = document.createRange()
    range.selectNodeContents(span)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    const text = selection.toString()
    selection.removeAllRanges()
    return text
  })
  check(
    "Source text remains natively selectable and copyable",
    selectable.includes("A little every day"),
  )
  await reader.$eval(".rf-bilingual-card:nth-child(2) header button:last-child", (n) => n.click())
  await reader.waitForFunction(
    () =>
      document.querySelectorAll(".rf-bilingual-output").length === 1 &&
      !document.querySelector("#pdf-translate-page").disabled,
  )
  check(
    "Explicit paragraph translate calls the existing provider once",
    (await calls()) === 1 &&
      (await reader.$eval(".rf-bilingual-output", (n) => n.textContent.includes("Học một chút"))),
  )
  await reader.$eval("#pdf-translate-page", (n) => n.click())
  await reader.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll(".rf-bilingual-output").length === expectedCount &&
      !document.querySelector("#pdf-translate-page").disabled,
    {},
    count,
  )
  check("Page queue translates only remaining paragraphs", (await calls()) === count)
  await reader.$eval("#pdf-translate-page", (n) => n.click())
  await pause()
  check("Repeated page translate reuses completed paragraphs", (await calls()) === count)
  const payloads = await worker.evaluate(() => __pdfCalls.map((item) => JSON.stringify(item.body)))
  check(
    "Provider bodies contain text, no PDF bytes or private file paths",
    payloads.every(
      (text) =>
        !text.includes("Private reading fixture") &&
        !text.includes(scratch) &&
        !text.includes("application/pdf") &&
        !text.includes("file://"),
    ),
  )
  check(
    "Finished cards expose copy, speech and reading-library actions",
    (await reader.$$eval(
      ".rf-bilingual-card .rf-bilingual-actions [data-reading-lab]",
      (nodes) => nodes.length,
    )) === count,
  )
  const downloads = path.join(scratch, "downloads")
  await fs.mkdir(downloads)
  const downloadSession = await reader.createCDPSession()
  await downloadSession.send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: downloads,
  })
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.tts.provider = "openai"
    config.tts.openai.model = "gpt-4o-mini-tts"
    await chrome.storage.local.set({ config })
    globalThis.__speechCalls = []
    const originalFetch = fetch,
      api = globalThis.browser?.runtime?.id ? globalThis.browser : chrome,
      download = api.downloads.download.bind(api.downloads)
    api.downloads.download = (args) => download({ ...args, saveAs: false })
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (!request.url.endsWith("/audio/speech")) return originalFetch(request)
      const body = await request.json()
      __speechCalls.push(body.input)
      const rate = 24000,
        bytes = new Uint8Array(44 + rate * 2),
        view = new DataView(bytes.buffer)
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
      view.setUint32(40, rate * 2, true)
      for (let n = 0; n < rate; n++)
        view.setInt16(44 + n * 2, Math.sin((n * 2 * Math.PI * 440) / rate) * 5000, true)
      return new Response(bytes, { headers: { "content-type": "audio/wav" } })
    }
  })
  await reader.waitForSelector(".rf-bilingual-card [data-tts-download]")
  check(
    "OpenAI voice choice exposes MP3 without retranslating paragraphs",
    (await calls()) === count,
  )
  await reader.$eval(".rf-bilingual-card [data-tts-download]", (n) => n.click())
  let audioFile
  for (let n = 0; n < 80; n++) {
    audioFile = (await fs.readdir(downloads)).find((name) => !name.endsWith(".crdownload"))
    if (audioFile) break
    await pause(100)
  }
  assert.ok(audioFile, "MP3 download completes")
  const probe = JSON.parse(
    execFileSync(
      "C:/Users/TIEN/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffprobe.exe",
      ["-v", "error", "-show_streams", "-of", "json", path.join(downloads, audioFile)],
      { encoding: "utf8" },
    ),
  )
  check(
    "Paragraph MP3 download is genuinely decodable audio",
    probe.streams[0].codec_name === "mp3" &&
      (await worker.evaluate(() => __speechCalls.length === 1)),
  )
  const beforeLab = new Set(browser.targets())
  await reader.$eval(".rf-bilingual-card [data-reading-lab]", (n) => n.click())
  const labTarget = await browser.waitForTarget(
      (t) => !beforeLab.has(t) && t.url().includes("reading-lab.html"),
    ),
    lab = await labTarget.page()
  await lab.waitForSelector("textarea")
  await lab.waitForFunction(() =>
    document.querySelector("#reading-original")?.value.includes("A little every day"),
  )
  check(
    "Save/listen action opens Reading Lab with the correct source and translation",
    (await lab.evaluate(() =>
      [...document.querySelectorAll("textarea")].some((n) =>
        n.value.includes("A little every day"),
      ),
    )) && (await calls()) === count,
  )
  await reader.bringToFront()
  await reader.$eval('.rf-paragraph-badge[data-paragraph-id="' + ids[3] + '"]', (n) => n.click())
  await pause()
  check(
    "Source badge selects the matching translation card",
    (await reader.$eval(".rf-bilingual-card.active", (n) => n.dataset.translationId)) === ids[3],
  )
  // Real wheel intent, then right-pane scrolling: programmatic events without user intent are ignored.
  await reader.$eval(".rf-bilingual-scroll", (host) => {
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true }))
    host.scrollTop = 650
  })
  await pause()
  const sourceTop = await reader.$eval(".rf-pdf-scroll", (n) => n.scrollTop)
  check("Right-pane user scroll moves the original source", sourceTop > 150)
  await pause(500)
  check(
    "Linked scrolling settles without a feedback loop",
    Math.abs((await reader.$eval(".rf-pdf-scroll", (n) => n.scrollTop)) - sourceTop) < 2,
  )
  await reader.$eval(".rf-pdf-scroll", (host) => {
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, bubbles: true }))
    host.scrollTop = 240
  })
  await pause()
  check(
    "Source scrolling selects the matching translation without provider calls",
    (await reader.$eval(".rf-bilingual-card.active", (n) => n.dataset.translationId)) ===
      (await reader.$eval(
        '[data-page="1"] .rf-paragraph-box.active',
        (n) => n.dataset.paragraphId,
      )) && (await calls()) === count,
  )
  await reader.$eval('.rf-bilingual-controls input[type="checkbox"]', (n) => n.click())
  const unsyncedTop = await reader.$eval(".rf-pdf-scroll", (node) => node.scrollTop)
  await reader.$eval(".rf-bilingual-scroll", (host) => {
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, bubbles: true }))
    host.scrollTop = 0
  })
  await pause()
  check(
    "Turning linked scrolling off leaves source position unchanged",
    Math.abs((await reader.$eval(".rf-pdf-scroll", (n) => n.scrollTop)) - unsyncedTop) < 2,
  )
  await reader.$eval('.rf-bilingual-controls input[type="checkbox"]', (n) => n.click())
  await pause()
  await reader.$eval(".rf-bilingual-card:first-child header button:first-child", (n) => n.click())
  await pause()
  check(
    "Selecting a paragraph at the top boundary keeps the selected source highlight",
    (await reader.$eval(".rf-paragraph-box.active", (n) => n.dataset.paragraphId)) === ids[0],
  )
  await reader.$eval('[data-page="1"] .rf-paragraph-badge', (n) => n.click())
  await pause()
  check(
    "Picking the source title brings the matching translation card into view",
    await reader.$eval(
      ".rf-bilingual-card:first-child",
      (node) =>
        node.getBoundingClientRect().bottom > node.parentElement.getBoundingClientRect().top + 50,
    ),
  )
  await reader.screenshot({ path: path.join(scratch, "desktop.png") })
  evidence.screenshots.push(path.join(scratch, "desktop.png"))
  const beforeCache = await calls()
  await navigate(3)
  check(
    "Navigating only reads local cache and keeps three canvas leases",
    (await calls()) === beforeCache &&
      (await reader.$$eval(".rf-pdf-page canvas", (nodes) => nodes.length <= 3)),
  )
  await reader.$eval(".rf-bilingual-scroll", (host) => {
    host.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    host.scrollTop = host.scrollHeight
  })
  await pause()
  await reader.$eval(".rf-bilingual-scroll", (host) =>
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true })),
  )
  await reader.waitForFunction(() =>
    document.querySelector(".rf-bilingual-controls").textContent.includes("Trang 4 ·"),
  )
  check("Scrolling past right-pane bottom advances the PDF page", (await calls()) === beforeCache)
  await navigate(1)
  await reader.waitForFunction(
    (expectedCount) => document.querySelectorAll(".rf-bilingual-output").length === expectedCount,
    {},
    count,
  )
  check(
    "Returning to a page restores translations without requests",
    (await calls()) === beforeCache,
  )
  await reader.select('[aria-label="Thu phóng"]', "1.25")
  await ready()
  check(
    "Zoom preserves paragraph identity",
    (await reader.$$eval(".rf-bilingual-card", (nodes) =>
      nodes.map((n) => n.dataset.translationId).join(),
    )) === ids.join(),
  )
  await clickText("Song ngữ theo đoạn")
  await reader.waitForFunction(() => !document.querySelector(".rf-reader-bilingual"))
  check(
    "Closing mode removes overlays while keeping PDF text and canvases",
    (await reader.$(".textLayer span")) && !(await reader.$(".rf-paragraph-overlays")),
  )
  await clickText("Song ngữ theo đoạn")
  await ready()
  await reader.waitForFunction(
    (expectedCount) => document.querySelectorAll(".rf-bilingual-output").length === expectedCount,
    {},
    count,
  )
  check("Reopening mode restores from persistent cache", (await calls()) === beforeCache)
  await reader.reload()
  await load(renamed)
  await clickText("Song ngữ theo đoạn")
  await ready()
  await reader.waitForFunction(
    (expectedCount) => document.querySelectorAll(".rf-bilingual-output").length === expectedCount,
    {},
    count,
  )
  check(
    "Renamed identical content restores paragraph translations after reload",
    (await calls()) === beforeCache,
  )
  await reader.select('[aria-label="Ngôn ngữ PDF song ngữ"]', "en")
  await reader.waitForFunction(() => document.querySelectorAll(".rf-bilingual-output").length === 0)
  await pause()
  check(
    "Changing target clears stale text without translating automatically",
    (await calls()) === beforeCache,
  )
  await reader.select('[aria-label="Ngôn ngữ PDF song ngữ"]', "vi")
  await reader.waitForFunction(
    (expectedCount) => document.querySelectorAll(".rf-bilingual-output").length === expectedCount,
    {},
    count,
  )
  await worker.evaluate(() => {
    __pdfDelay = 1600
    __pdfTextOutput = () => "Late cancelled output must never appear"
  })
  await reader.$eval(".rf-bilingual-card:nth-child(2) header button:last-child", (n) => n.click())
  await reader.waitForFunction(() => document.querySelector("#pdf-translate-page").disabled)
  await navigate(2)
  await pause(1800)
  check(
    "Page navigation aborts pending translation and ignores late output",
    !(await reader.evaluate(() => document.body.innerText.includes("Late cancelled output"))) &&
      !(await reader.$eval("#pdf-translate-page", (n) => n.disabled)),
  )
  await worker.evaluate(() => {
    __pdfDelay = 0
  })
  await navigate(1)
  await reader.setViewport({ width: 390, height: 844 })
  await pause(600)
  check(
    "Narrow layout stacks both panes without horizontal document overflow",
    await reader.evaluate(() => {
      const source = document.querySelector(".rf-reader-original-column").getBoundingClientRect(),
        pane = document.querySelector(".rf-reader-bilingual").getBoundingClientRect()
      return (
        pane.top >= source.bottom - 1 &&
        source.height > 80 &&
        pane.height > 80 &&
        document.documentElement.scrollWidth <= innerWidth
      )
    }),
  )
  await reader.screenshot({ path: path.join(scratch, "mobile.png") })
  evidence.screenshots.push(path.join(scratch, "mobile.png"))
  await reader.setViewport({ width: 1440, height: 960 })
  await worker.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("edge-openai-credentials")
      r.onsuccess = () => resolve(r.result)
      r.onerror = reject
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction("credentialState", "readwrite"),
        store = tx.objectStore("credentialState"),
        r = store.get("openai")
      r.onsuccess = () => store.put({ ...r.result, revision: r.result.revision + 1 })
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    db.close()
  })
  await reader.evaluate(() => window.dispatchEvent(new Event("focus")))
  await reader.waitForFunction(() => document.querySelectorAll(".rf-bilingual-output").length === 0)
  const beforeKey = await calls()
  await pause()
  check(
    "Credential revision invalidates memory and persistent paragraph cache without API",
    (await calls()) === beforeKey,
  )
  await reader.$eval(".rf-bilingual-card:first-child header button:last-child", (n) => n.click())
  await reader.waitForSelector(".rf-bilingual-output")
  await worker.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("read-frog-pdf-reading")
      r.onsuccess = () => resolve(r.result)
      r.onerror = reject
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["documents", "translations", "meta"], "readwrite"),
        docs = tx.objectStore("documents"),
        r = docs.getAll()
      r.onsuccess = () => {
        for (const doc of r.result) docs.put({ ...doc, epoch: doc.epoch + 1 })
        tx.objectStore("translations").clear()
        tx.objectStore("meta").put({ key: "budget", count: 0, bytes: 0 })
      }
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    db.close()
  })
  await reader.evaluate(() => window.dispatchEvent(new Event("focus")))
  await reader.waitForFunction(() => document.querySelectorAll(".rf-bilingual-output").length === 0)
  check("A document history clear removes in-memory results from the open bilingual pane", true)
  await worker.evaluate(() => {
    __pdfDelay = 1400
  })
  const pendingCalls = await calls()
  await reader.$eval(".rf-bilingual-card:first-child header button:last-child", (n) => n.click())
  await reader.waitForFunction(() => document.querySelector("#pdf-translate-page").disabled)
  for (let attempt = 0; attempt < 40 && (await calls()) === pendingCalls; attempt++) await pause(25)
  assert.equal(
    await calls(),
    pendingCalls + 1,
    "Provider request is in flight before switching file",
  )
  const beforeScan = await calls()
  await load(scan)
  await pause(1600)
  await reader.waitForFunction(() => document.body.innerText.includes("Trang không có lớp chữ"))
  check(
    "File switch discards late output; scan pages offer OCR without automatic requests",
    !(await reader.$(".rf-bilingual-card")) &&
      !(await reader.$(".rf-bilingual-output")) &&
      (await calls()) === beforeScan &&
      (await reader.evaluate(() =>
        [...document.querySelectorAll("button")].some((n) =>
          n.textContent.includes("Chụp vùng & dịch ảnh"),
        ),
      )),
  )
  check("No uncaught runtime exceptions", errors.length === 0)
} catch (error) {
  evidence.error = error.stack
  for (const [index, page] of (await browser.pages()).entries()) {
    if (!page.url().endsWith("pdf-reader.html")) continue
    await page.screenshot({ path: path.join(scratch, `failure-${index}.png`) }).catch(() => {})
    evidence.failure = await page.evaluate(() => ({
      text: document.body.innerText,
      scroll: document.querySelector(".rf-pdf-scroll")?.scrollTop,
      input: document.querySelector('[aria-label="Số trang"]')?.value,
    }))
  }
  throw error
} finally {
  evidence.errors = errors
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log(`EVIDENCE ${scratch}`)
  await browser.close()
}
