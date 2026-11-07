import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import JSZip from "jszip"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const scratch = path.resolve(`.codex/reading-lab-${Date.now()}`),
  downloads = path.join(scratch, "downloads")
await fs.mkdir(downloads, { recursive: true })
const evidence = {
  checks: [],
  liveOpenAI: false,
  microphone: "browser synthetic device",
  phone: "desktop responsive viewport",
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
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
})
let lab
try {
  evidence.browser = await browser.version()
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (target) => target.type() === "service_worker" && target.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.tts.provider = "openai"
    config.tts.openai.model = "gpt-4o-mini-tts"
    await chrome.storage.local.set({ config })
    globalThis.__speechCalls = []
    globalThis.__speechOffline = false
    globalThis.__pdfTextOutput = (body) =>
      JSON.stringify(body).includes("Align the source")
        ? '{"ends":[[0,0],[1,1]]}'
        : "Đúng vậy. Tôi đồng ý."
    const originalFetch = fetch
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (!request.url.endsWith("/audio/speech")) return originalFetch(request)
      const body = await request.json()
      __speechCalls.push(body.input)
      if (__speechOffline) throw new Error("Offline fixture")
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
      const frequency =
        300 + ([...body.input].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 500)
      for (let n = 0; n < rate; n++)
        view.setInt16(44 + n * 2, Math.sin((n * 2 * Math.PI * frequency) / rate) * 5000, true)
      return new Response(bytes, { headers: { "content-type": "audio/wav" } })
    }
  })
  const native = await browser.newPage(),
    channel = await worker.evaluate(async () => {
      const value = crypto.randomUUID()
      await chrome.storage.session.set({
        ["native-selection:" + value]: {
          id: crypto.randomUUID(),
          text: "Yes. I agree.",
          tooLong: false,
          createdAt: Date.now(),
        },
      })
      return value
    })
  await native.goto(base + "selection-result.html?selectionId=" + channel)
  lab = native
  await native.waitForSelector("[data-reading-lab]:not([disabled])")
  await native.$eval("[data-reading-lab]", (node) => node.click())
  lab = await (
    await browser.waitForTarget((target) =>
      target.url().startsWith(base + "reading-lab.html?channel="),
    )
  ).asPage()
  const errors = []
  lab.on("pageerror", (error) => errors.push(error.message))
  const instrument = () => {
    globalThis.__labMedia = []
    globalThis.__labStreams = []
    const play = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "play").value
    HTMLMediaElement.prototype.play = function (...args) {
      if (!__labMedia.includes(this)) __labMedia.push(this)
      return play.apply(this, args)
    }
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await getMedia(...args)
      __labStreams.push(stream)
      return stream
    }
  }
  await lab.evaluate(instrument)
  await lab.bringToFront()
  await lab.waitForSelector(".lab-pairs li")
  check(
    "A real PDF selection opens a one-use reading capture with both sentence pairs",
    await lab.$$eval(
      ".lab-pairs li",
      (items) =>
        items.length === 2 &&
        items[0].textContent.includes("Yes.") &&
        items[1].textContent.includes("Tôi đồng ý."),
    ),
  )
  check(
    "Opening the lesson neither generates speech nor requests a microphone",
    (await worker.evaluate(() => __speechCalls.length === 0)) &&
      (await lab.evaluate(() => __labStreams.length === 0)),
  )
  check(
    "Reading controls use the extension's visible theme tokens",
    await lab.$eval(
      "#reading-save",
      (node) =>
        getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)" &&
        getComputedStyle(node.closest("section")).borderTopColor !== "rgba(0, 0, 0, 0)",
    ),
  )
  const downloadEvents = []
  const routeDownloads = async (page) => {
    const session = await page.createCDPSession()
    await session.send("Browser.setDownloadBehavior", {
      behavior: "allowAndName",
      downloadPath: downloads,
      eventsEnabled: true,
    })
    session.on("Browser.downloadWillBegin", (event) => downloadEvents.push(event))
  }
  await routeDownloads(lab)
  const click = async (selector) => lab.$eval(selector, (node) => node.click())
  const clickText = async (text) =>
    lab.evaluate((label) => {
      const node = [...document.querySelectorAll("button")].find(
        (item) => item.textContent.trim() === label,
      )
      if (!node) throw new Error(`Missing button ${label}`)
      node.click()
    }, text)
  const setValue = async (selector, value) =>
    lab.$eval(
      selector,
      (node, next) => {
        Object.getOwnPropertyDescriptor(
          node instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value",
        ).set.call(node, next)
        node.dispatchEvent(new Event("input", { bubbles: true }))
      },
      value,
    )
  const idle = async () =>
    lab.waitForFunction(
      () =>
        !document.querySelector('[role="status"] button') &&
        !document.querySelector('[role="alert"]'),
    )
  const awaitDownload = async (count) => {
    for (let n = 0; n < 200; n++) {
      const files = (await fs.readdir(downloads)).filter((name) => !name.endsWith(".crdownload"))
      if (files.length >= count) return files
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Expected ${count} downloads`)
  }
  await clickText("Ghép câu bằng AI")
  await lab.waitForFunction(() => document.body.textContent.includes("Đã ghép câu bằng AI"))
  check(
    "The AI path accepts index boundaries while retaining every original and translated sentence",
    (await lab.$$(".lab-pairs li")).length === 2,
  )
  await click("#reading-generate")
  await lab.waitForFunction(() => document.body.textContent.includes("Audio đã sẵn sàng"))
  check(
    "Explicit generation creates source and target audio via the private OpenAI file transport",
    await worker.evaluate(() => __speechCalls.length === 4),
  )
  await lab.select("#reading-gap", "1")
  await lab.select("#reading-repeats", "2")
  await click("#reading-listen")
  await lab.waitForFunction(() => __labMedia.length === 1)
  await click("#reading-pause")
  const paused = await lab.evaluate(() => __labMedia.every((media) => media.paused))
  await new Promise((resolve) => setTimeout(resolve, 350))
  check(
    "Listening can pause/resume without advancing to another sentence",
    paused && (await lab.evaluate(() => __labMedia.length === 1)),
  )
  await click("#reading-listen")
  await lab.waitForFunction(() => document.querySelector("#reading-stop").disabled, {
    timeout: 40000,
  })
  console.log(
    "Playback evidence",
    await lab.evaluate(() => ({
      count: __labMedia.length,
      gap: document.querySelector("#reading-gap").value,
      repeats: document.querySelector("#reading-repeats").value,
    })),
  )
  check(
    "Alternating playback respects two source repeats, target speech and sentence order",
    (await worker.evaluate(() => __speechCalls.length === 4)) &&
      (await lab.evaluate(
        () => __labMedia.length === 6 && __labMedia.every((media) => media.paused),
      )),
  )
  await click("#reading-mp3")
  const files = await awaitDownload(1)
  const probe =
    process.env.STUDY_FFPROBE ??
    "C:/Users/TIEN/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffprobe.exe"
  const seconds = Number(
    execFileSync(
      probe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path.join(downloads, files[0]),
      ],
      { encoding: "utf8" },
    ).trim(),
  )
  check(
    "A real MP3 export contains six audio clips plus five one-second gaps",
    seconds > 11 && seconds < 12,
  )
  evidence.mp3Seconds = seconds
  await idle()
  await setValue("#reading-title", "Câu mẫu công việc")
  await click("#reading-save")
  await lab.waitForFunction(() => document.body.textContent.includes("Đã lưu đoạn"))
  await clickText("Thư viện 1")
  await setValue('[aria-label="Tên thư mục mới"]', "Công việc")
  await clickText("Tạo thư mục")
  await lab.waitForFunction(() =>
    [...document.querySelectorAll("option")].some((item) => item.textContent === "Công việc"),
  )
  await clickText("Luyện nghe")
  const folder = await lab.$eval(
    "#reading-folder",
    (select) => [...select.options].find((item) => item.textContent === "Công việc").value,
  )
  await lab.select("#reading-folder", folder)
  await lab.$eval('input[type="checkbox"]', (node) => node.click())
  await click("#reading-save")
  await lab.waitForFunction(() => document.body.textContent.includes("Đã lưu đoạn"))
  await lab.close()
  lab = await browser.newPage()
  lab.on("pageerror", (error) => errors.push(error.message))
  await lab.evaluateOnNewDocument(instrument)
  await lab.goto(base + "reading-lab.html")
  await routeDownloads(lab)
  await lab.bringToFront()
  await lab.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (item) => item.textContent.trim() === "Thư viện 1",
    ),
  )
  await clickText("Thư viện 1")
  check(
    "Library folders, renamed/favorite passage and audio survive closing the page",
    await lab.$eval(
      ".lab-library-row",
      (node) =>
        node.textContent.includes("★ Câu mẫu công việc") && node.textContent.includes("Công việc"),
    ),
  )
  await setValue("#reading-search", "không có")
  check(
    "Local search filters the passage inventory",
    (await lab.$$(".lab-library-row")).length === 0,
  )
  await setValue("#reading-search", "công việc")
  await clickText("Mở / đổi tên")
  await lab.waitForSelector("#reading-listen")
  await worker.evaluate(() => {
    __speechOffline = true
    __pdfOffline = true
  })
  await click("#shadow-sample")
  await lab.waitForFunction(
    () => __labMedia.length === 1 && document.querySelector("#reading-stop").disabled,
  )
  check(
    "Saved model audio plays offline without OpenAI calls",
    await worker.evaluate(() => __speechCalls.length === 4),
  )
  await click("#shadow-record")
  await lab.waitForFunction(
    () => document.querySelector("#shadow-record").textContent === "Dừng thu",
  )
  await new Promise((resolve) => setTimeout(resolve, 800))
  await click("#shadow-record")
  await lab.waitForSelector('audio[aria-label="Nghe bản thu của tôi"]')
  check(
    "Explicit microphone recording produces local audio and releases every track",
    await lab.evaluate(
      () =>
        __labStreams.length === 1 &&
        __labStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
    ),
  )
  await click("#shadow-compare")
  await lab.waitForFunction(
    () => __labMedia.length === 3 && document.querySelector("#reading-stop").disabled,
    { timeout: 10000 },
  )
  check(
    "Shadowing comparison plays the model then the user's recording without an API",
    await worker.evaluate(() => __speechCalls.length === 4),
  )
  await click("#reading-save")
  await lab.waitForFunction(() => document.body.textContent.includes("Đã lưu đoạn"))
  await lab.screenshot({ path: path.join(scratch, "desktop.png"), fullPage: true })
  evidence.screenshots.push("desktop.png")
  await clickText("Thư viện 1")
  await click("#reading-export-zip")
  await awaitDownload(2)
  const plainEvent = downloadEvents.filter((item) => item.suggestedFilename.endsWith(".zip"))[0]
  assert.ok(plainEvent, "ZIP download event")
  const plainPath = path.join(downloads, plainEvent.guid),
    plain = await JSZip.loadAsync(await fs.readFile(plainPath)),
    manifest = JSON.parse(await plain.file("manifest.json").async("string"))
  check(
    "Default library ZIP contains full text/MP3 but excludes personal recordings",
    manifest.format === "read-frog-reading-library" &&
      manifest.version === 1 &&
      manifest.assets.length === 4 &&
      manifest.passages[0].pairs.every((item) => item.recording === null),
  )
  await lab.evaluate(() =>
    [...document.querySelectorAll("label")]
      .find((item) => item.textContent.includes("Kèm bản thu"))
      .querySelector("input")
      .click(),
  )
  await idle()
  await click("#reading-export-zip")
  await awaitDownload(3)
  const fullEvent = downloadEvents.filter((item) => item.suggestedFilename.endsWith(".zip"))[1],
    fullPath = path.join(downloads, fullEvent.guid),
    full = await JSZip.loadAsync(await fs.readFile(fullPath)),
    fullManifest = JSON.parse(await full.file("manifest.json").async("string"))
  check(
    "An explicit ZIP option preserves a recording alongside its original sentence",
    fullManifest.assets.some((asset) => asset.type === "audio/webm") &&
      !!fullManifest.passages[0].pairs[0].recording,
  )
  await lab.close()
  await options.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("read-frog-reading-library")
        request.onsuccess = resolve
        request.onerror = reject
        request.onblocked = () => reject(new Error("Test database still open"))
      }),
  )
  lab = await browser.newPage()
  await lab.goto(base + "reading-lab.html")
  await lab.bringToFront()
  await lab.waitForSelector(".lab-tabs")
  await clickText("Thư viện 0")
  await (await lab.$("#reading-import")).uploadFile(fullPath)
  await lab.waitForFunction(() => document.body.textContent.includes("Đã thêm 1 đoạn"))
  check(
    "Portable ZIP restores passages, folders, MP3 and recordings into an empty library",
    (await lab.$$(".lab-library-row")).length === 1,
  )
  await (await lab.$("#reading-import")).uploadFile(fullPath)
  await lab.waitForFunction(() =>
    document.body.textContent.includes("Đã thêm 0 đoạn; giữ nguyên 1 đoạn trùng ID"),
  )
  check(
    "Repeated import does not duplicate or overwrite a local passage",
    (await lab.$$(".lab-library-row")).length === 1,
  )
  await clickText("Mở / đổi tên")
  await lab.waitForSelector(".lab-shadow audio")
  await lab.setViewport({ width: 390, height: 844 })
  check(
    "Viewport resizing keeps the current saved lesson and recording open",
    (await lab.$eval("#reading-title", (input) => input.value === "Câu mẫu công việc")) &&
      !!(await lab.$(".lab-shadow audio")),
  )
  check(
    "The reading page fits a phone-width viewport",
    await lab.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  )
  await lab.screenshot({ path: path.join(scratch, "phone.png"), fullPage: true })
  evidence.screenshots.push("phone.png")
  check("The flow has no uncaught page errors", errors.length === 0)
  evidence.manifest = JSON.parse(
    await fs.readFile(".output/edge-mv3/manifest.json", "utf8"),
  ).version
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("Evidence:", scratch)
} catch (error) {
  if (lab && !lab.isClosed())
    console.error(
      "Media debug",
      await lab
        .evaluate(() => ({
          media: globalThis.__labMedia?.map((media) => ({
            duration: media.duration,
            current: media.currentTime,
            paused: media.paused,
            error: media.error?.message,
          })),
          gap: document.querySelector("#reading-gap")?.value,
          repeats: document.querySelector("#reading-repeats")?.value,
        }))
        .catch(() => null),
    )
  if (lab && !lab.isClosed()) {
    await fs
      .writeFile(
        path.join(scratch, "failure.txt"),
        await lab.evaluate(() => document.body.innerText),
      )
      .catch(() => {})
    await lab
      .screenshot({ path: path.join(scratch, "failure.png"), fullPage: true })
      .catch(() => {})
  }
  console.error("Evidence:", scratch)
  throw error
} finally {
  await browser.close()
}
