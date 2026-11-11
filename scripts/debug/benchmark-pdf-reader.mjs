import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

// Run builds sequentially, with identical pinned fixtures and fresh profiles.
// Windows process working sets include WASM/canvas memory; JS heap alone does not.
const args = Object.fromEntries(
  process.argv.slice(2).map((item) => item.replace(/^--/, "").split("=")),
)
assert.ok(args.extension && args.label, "Use --extension=<unpacked> --label=<label> [--runs=3]")
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const fixtures = path.resolve(".codex/pdf-performance-fixtures-v1"),
  output = path.resolve(`.codex/pdf-performance-${args.label}-${Date.now()}`)
await fs.mkdir(fixtures, { recursive: true })
await fs.mkdir(output, { recursive: true })
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const digest = (data) => createHash("sha256").update(data).digest("hex")
const pdfPath = path.join(fixtures, "Text-1200-pages.pdf"),
  ocrPath = path.join(fixtures, "Scan-8-pages.pdf")
const sampler = String.raw`
param([string]$PidFile,[string]$OutputFile,[string]$StopFile)
$writer = [System.IO.StreamWriter]::new($OutputFile, $false)
$writer.AutoFlush = $true
$deadline = [DateTime]::UtcNow.AddMinutes(8)
try {
 while (!(Test-Path -LiteralPath $StopFile) -and [DateTime]::UtcNow -lt $deadline) {
  try {
   $taskPids = @((Get-Content -LiteralPath $PidFile -Raw | ConvertFrom-Json) | ForEach-Object { [int]$_ })
   $taskProcesses = @(Get-Process -Id $taskPids -ErrorAction SilentlyContinue)
   [long]$taskResident = 0; [long]$taskPrivate = 0
   foreach ($taskProcess in $taskProcesses) { $taskResident += $taskProcess.WorkingSet64; $taskPrivate += $taskProcess.PrivateMemorySize64 }
   $writer.WriteLine((@{ at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); workingSet=$taskResident; privateBytes=$taskPrivate; processes=$taskProcesses.Count } | ConvertTo-Json -Compress))
  } catch {}
  Start-Sleep -Milliseconds 200
 }
} finally { $writer.Dispose() }
`
await fs.writeFile(path.join(output, "sample-memory.ps1"), sampler)
const results = []
for (let run = 0; run < Number(args.runs ?? 3); run++) {
  const folder = path.join(output, `run-${run + 1}`)
  await fs.mkdir(folder)
  const browser = await puppeteer.launch({
    executablePath:
      process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    userDataDir: path.join(folder, "profile"),
    headless: false,
    pipe: true,
    enableExtensions: true,
    defaultViewport: { width: 1440, height: 960 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
    ],
  })
  let sampling,
    updating,
    polling = false
  const record = { run: run + 1, timing: {}, stages: {}, errors: [] }
  try {
    const root = `chrome-extension://${await browser.installExtension(path.resolve(args.extension))}/`
    record.browser = await browser.version()
    const worker = await (
      await browser.waitForTarget(
        (target) => target.type() === "service_worker" && target.url() === root + "background.js",
      )
    ).worker()
    const setup = await browser.newPage()
    await setup.goto(root + "options.html#/api-providers")
    await setup.waitForSelector("#openai-key")
    await worker.evaluate(preparePdfWorker)
    // Preserve the version's canonical language spelling after fixture setup.
    await worker.evaluate(async () => {
      const { config } = await chrome.storage.local.get("config")
      if (config.tts.languageVoices.en) {
        config.language.targetCode = "vi"
        await chrome.storage.local.set({ config })
      }
    })
    const maker = await browser.newPage()
    try {
      await fs.access(pdfPath)
    } catch {
      const doc = await PDFDocument.create(),
        font = await doc.embedFont(StandardFonts.Helvetica)
      for (let n = 1; n <= 1200; n++) {
        const dimensions = n % 17 === 0 ? [792, 612] : n % 11 === 0 ? [540, 740] : [612, 792]
        const page = doc.addPage(dimensions)
        for (let line = 0; line < 24; line++)
          page.drawText(
            `Page ${n}. Reading practice line ${line + 1}. Regular study helps us remember useful words.`,
            { x: 36, y: dimensions[1] - 42 - line * 20, size: 10, font },
          )
        if (n === 1200)
          page.drawText("quasar final destination xyztail", { x: 36, y: 50, size: 12, font })
      }
      await fs.writeFile(pdfPath, await doc.save())
      const png = await maker.evaluate(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 1530
        canvas.height = 1980
        const context = canvas.getContext("2d")
        context.fillStyle = "white"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = "#111"
        context.font = "bold 58px Arial"
        context.fillText("Learning a little every day", 100, 190)
        context.font = "38px Arial"
        for (let line = 0; line < 12; line++)
          context.fillText("Read carefully. Remember the words you learn.", 100, 330 + line * 75)
        return canvas.toDataURL("image/png").split(",")[1]
      })
      const scan = await PDFDocument.create(),
        image = await scan.embedPng(Buffer.from(png, "base64"))
      for (let n = 0; n < 8; n++)
        scan.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 })
      await fs.writeFile(ocrPath, await scan.save())
    }
    await maker.close()
    const reader = await browser.newPage()
    reader.on("pageerror", (error) => record.errors.push(error.message))
    await reader.goto(root + "pdf-reader.html")
    await reader.bringToFront()
    for (const tab of await browser.pages()) if (tab !== reader) await tab.close()
    const cdp = await reader.createCDPSession(),
      browserCdp = await browser.target().createCDPSession()
    await cdp.send("Performance.enable")
    const updatePids = async () => {
      if (polling) return
      polling = true
      try {
        const { processInfo } = await browserCdp.send("SystemInfo.getProcessInfo")
        await fs.writeFile(
          path.join(folder, "pids.json"),
          JSON.stringify(processInfo.map((item) => item.id)),
        )
      } finally {
        polling = false
      }
    }
    await updatePids()
    updating = setInterval(() => void updatePids().catch(() => {}), 300)
    sampling = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        path.join(output, "sample-memory.ps1"),
        "-PidFile",
        path.join(folder, "pids.json"),
        "-OutputFile",
        path.join(folder, "memory.jsonl"),
        "-StopFile",
        path.join(folder, "stop"),
      ],
      { windowsHide: true, stdio: "ignore" },
    )
    await pause(1200)
    await reader.evaluate(() => {
      globalThis.__pdfBench = { active: null, results: {}, busy: false }
      const start = (kind) => {
        __pdfBench.active = kind
        __pdfBench.start = performance.now()
        __pdfBench.busy = false
        delete __pdfBench.results[kind]
      }
      document.addEventListener(
        "change",
        (event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === "file")
            start("open")
        },
        true,
      )
      document.addEventListener(
        "submit",
        (event) => {
          if (event.target.closest(".rf-study-panel")) start("search")
        },
        true,
      )
      document.addEventListener(
        "click",
        (event) => {
          if (event.target.closest("#pdf-local-ocr")) start("ocr")
        },
        true,
      )
      new MutationObserver(() => {
        const state = __pdfBench
        if (!state.active) return
        let done
        if (state.active === "open")
          done =
            !!document.querySelector(".rf-pdf-page[data-rendered=true]") &&
            !!document.querySelector('[aria-label="Số trang"]')
        else {
          const button = document.querySelector(
            state.active === "ocr" ? "#pdf-local-ocr" : '.rf-study-panel button[type="submit"]',
          )
          if (button?.disabled) state.busy = true
          done = state.busy && button && !button.disabled
        }
        if (done) {
          const kind = state.active
          state.active = null
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              state.results[kind] = performance.now() - state.start
            }),
          )
        }
      }).observe(document.body, { attributes: true, childList: true, subtree: true })
    })
    const heap = async () => {
      await cdp.send("HeapProfiler.collectGarbage")
      const value = await cdp.send("Runtime.getHeapUsage")
      return {
        jsUsed: value.usedSize,
        jsTotal: value.totalSize,
        embedder: value.embedderHeapUsedSize,
        backingStorage: value.backingStorageSize,
      }
    }
    const stage = async (name) => {
      record.stages[name] = { at: Date.now(), heap: await heap() }
    }
    const waitTiming = async (metric) => {
      await reader.waitForFunction(
        (key) => typeof __pdfBench.results[key] === "number",
        { polling: 100, timeout: 180000 },
        metric,
      )
      return reader.evaluate((key) => __pdfBench.results[key], metric)
    }
    const load = async (file) => {
      await (await reader.$('input[type="file"]')).uploadFile(file)
      return waitTiming("open")
    }
    const click = async (text) =>
      reader.evaluate((needle) => {
        const button = [...document.querySelectorAll("button")].find((item) =>
          item.textContent.includes(needle),
        )
        assertButton(button)
        function assertButton(value) {
          if (!value) throw Error("Missing button " + needle)
          value.click()
        }
      }, text)
    await stage("idle")
    record.stages.openStart = { at: Date.now() }
    record.timing.openMs = await load(pdfPath)
    await pause(300)
    await stage("largePdfReady")
    await reader.keyboard.down("Control")
    await reader.keyboard.press("f")
    await reader.keyboard.up("Control")
    record.stages.searchStart = { at: Date.now() }
    record.timing.searchMs = []
    for (const query of [
      "quasar*xyztail",
      "not-found-huckleberry",
      "final destination",
      "never-present-987654",
    ]) {
      await reader.click('[aria-label="Từ khóa PDF"]')
      await reader.keyboard.down("Control")
      await reader.keyboard.press("a")
      await reader.keyboard.up("Control")
      await reader.keyboard.press("Backspace")
      await reader.type('[aria-label="Từ khóa PDF"]', query)
      await reader.keyboard.press("Enter")
      record.timing.searchMs.push({
        query,
        ms: await waitTiming("search"),
        results: await reader.$$eval(".rf-study-result", (nodes) => nodes.length),
      })
      assert.equal(
        record.timing.searchMs.at(-1).results,
        query.includes("quasar") || query === "final destination" ? 1 : 0,
      )
    }
    await stage("searchReady")
    await reader.click('[aria-label="Đóng menu PDF"]')
    record.stages.scanOpenStart = { at: Date.now() }
    record.timing.scanOpenMs = await load(ocrPath)
    await pause(300)
    await stage("scanReady")
    await click("OCR trên máy")
    await reader.type('[aria-label="OCR đến trang"]', "8")
    record.stages.ocrStart = { at: Date.now() }
    await reader.click("#pdf-local-ocr")
    record.timing.ocr8Ms = await waitTiming("ocr")
    const text = await reader.$eval(".rf-study-panel", (element) => element.textContent)
    assert.ok(text.includes("Đã lưu 8/20"), "All eight OCR pages completed")
    record.ocrTextHash = await reader.$eval(".rf-ocr-text", (element) => element.textContent)
    await pause(1200)
    await stage("ocrReleased")
    assert.ok(
      await reader.$$eval(".rf-pdf-page canvas", (nodes) => nodes.length <= 3),
      "Three reading canvases",
    )
    assert.equal(await worker.evaluate(() => __pdfCalls.length), 0, "No OpenAI request")
    record.effectiveConfig = await worker.evaluate(async () => {
      const { config } = await chrome.storage.local.get("config")
      return {
        target: config.language.targetCode,
        glossary: config.glossary.enabled,
        provider: config.providersConfig.map((item) => item.provider ?? item.type),
      }
    })
    await reader.screenshot({ path: path.join(folder, "final.png") })
    await reader.reload()
    await pause(1200)
    await stage("readerReloaded")
    clearInterval(updating)
    await fs.writeFile(path.join(folder, "stop"), "")
    await pause(350)
    const samples = (await fs.readFile(path.join(folder, "memory.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.ok(
      samples.length > 3 && samples.some((item) => item.workingSet > 0),
      "OS memory sampler produced measurements",
    )
    record.memorySamples = samples
    for (const [name, state] of Object.entries(record.stages)) {
      const relevant = samples.filter((sample) => Math.abs(sample.at - state.at) < 450)
      if (relevant.length) state.memory = relevant.at(-1)
      if (name.endsWith("Start")) {
        const next = Object.values(record.stages).find((value) => value.at > state.at)
        const range = samples.filter(
          (sample) => sample.at >= state.at && sample.at <= (next?.at ?? Infinity),
        )
        if (range.length)
          state.peakWorkingSet = Math.max(...range.map((sample) => sample.workingSet))
      }
    }
    record.peakWorkingSet = Math.max(...samples.map((sample) => sample.workingSet))
    console.log(
      JSON.stringify({
        label: args.label,
        run: record.run,
        timing: record.timing,
        peakWorkingSet: record.peakWorkingSet,
      }),
    )
  } catch (error) {
    record.failure = error.stack
    throw error
  } finally {
    clearInterval(updating)
    await fs.writeFile(path.join(folder, "stop"), "")
    sampling?.kill()
    results.push(record)
    await fs.writeFile(
      path.join(output, "results.json"),
      JSON.stringify(
        {
          label: args.label,
          extension: path.resolve(args.extension),
          fixtures: {
            native: digest(await fs.readFile(pdfPath)),
            scan: digest(await fs.readFile(ocrPath)),
          },
          results,
        },
        null,
        2,
      ),
    )
    await browser.close()
  }
}
console.log("EVIDENCE", output)
