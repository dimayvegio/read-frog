import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { pathToFileURL } from "node:url"
import JSZip from "jszip"
import { checkPinAndSrt } from "./check-pin-srt.mjs"
import { checkYouTubeLiveView } from "./check-youtube-live-view.mjs"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/audio-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = {
  checks: [],
  liveOpenAI: false,
  audio: "real tab capture of a synthetic oscillator; local WebRTC peer, mocked API text",
}
const check = (name, condition) => {
  assert.ok(condition, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sourceViewTest = Boolean(process.env.AUDIO_YOUTUBE || process.env.AUDIO_SOURCE_VIEW)
const sourceHTML = `<!doctype html><meta charset="utf-8"><title>Live source fixture</title><style>body{background:#101110;color:#eee;font:18px system-ui;margin:26px}#movie_player{background:linear-gradient(140deg,#16303c,#264b32);height:560px;width:900px;display:grid;place-content:center;border-radius:18px}h1{font-size:32px}button{padding:12px;margin:8px;font:inherit}#native-cc{color:#ced6be}</style><h3>Read Frog · Live source test fixture</h3><div id="movie_player"><h1>Live listening · Bilingual transcript</h1><p>Streaming audio + contextual translation</p><button id="play">Play synthetic audio</button><button id="fullscreen">Fullscreen video</button><p id="native-cc">Native CC unchanged</p></div><script>play.onclick=()=>{window.ctx=new AudioContext();window.tone=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=.12;tone.connect(gain).connect(ctx.destination);tone.start();ctx.resume()};fullscreen.onclick=()=>document.querySelector('#movie_player').requestFullscreen()</script>`
const server = http.createServer((request, response) =>
  response.end(
    request.url === "/source-view"
      ? sourceHTML
      : `<!doctype html><title>Tab audio fixture</title><button id="play">Play synthetic audio</button><button id="work">Work: 0</button><script>play.onclick=()=>{window.ctx=new AudioContext();window.tone=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=.12;tone.connect(gain).connect(ctx.destination);tone.start();ctx.resume()};work.onclick=()=>work.textContent='Work: '+(Number(work.textContent.split(': ')[1])+1)</script>`,
  ),
)
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const embeddedSourceURL = process.env.AUDIO_YOUTUBE
  ? "https://live-player.read-frog.test/embedded-player"
  : `http://localhost:${server.address().port}/embedded-player`
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: process.env.AUDIO_BROWSER_PIPE !== "false",
  enableExtensions: true,
  defaultViewport: { width: 1400, height: 1000 },
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
  ],
})
let source, offscreen
try {
  let extensionPath = path.resolve(".output/edge-mv3")
  if (process.env.AUDIO_UPGRADE_FROM) {
    extensionPath = path.join(scratch, "installed")
    const zip = await JSZip.loadAsync(await fs.readFile(process.env.AUDIO_UPGRADE_FROM), {
      checkCRC32: true,
    })
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const target = path.resolve(extensionPath, entry.name)
      if (!target.startsWith(extensionPath + path.sep)) throw new Error("Unsafe baseline ZIP path")
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await entry.async("nodebuffer"))
    }
  }
  const id = await browser.installExtension(extensionPath),
    base = `chrome-extension://${id}/`
  evidence.browser = await browser.version()
  let worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  let options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  if (process.env.AUDIO_UPGRADE_FROM) {
    const before = await worker.evaluate(async () =>
      JSON.stringify((await chrome.storage.local.get("config")).config),
    )
    const oldTarget = browser
      .targets()
      .find((t) => t.type() === "service_worker" && t.url() === base + "background.js")
    await fs.cp(path.resolve(".output/edge-mv3"), extensionPath, { recursive: true })
    const reloadedId = await browser.installExtension(extensionPath)
    check("reloading the same unpacked directory retains its extension ID", reloadedId === id)
    options = await browser.newPage()
    await options.goto(base + "options.html#/api-providers")
    await options.waitForSelector("#openai-key")
    worker = await (
      await browser.waitForTarget(
        (t) =>
          t !== oldTarget && t.type() === "service_worker" && t.url() === base + "background.js",
      )
    ).worker()
    check(
      "in-place upgrade keeps the extension ID and numeric version advances to 1.58.1.4",
      await worker.evaluate(() => chrome.runtime.getManifest().version === "1.58.1.4"),
    )
    check(
      "in-place upgrade preserves public configuration byte-for-byte",
      before ===
        (await worker.evaluate(async () =>
          JSON.stringify((await chrome.storage.local.get("config")).config),
        )),
    )
    check(
      "in-place upgrade preserves the private credential and its revision",
      await worker.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("edge-openai-credentials")
            request.onerror = reject
            request.onsuccess = () => {
              const db = request.result,
                read = db
                  .transaction("credentialState")
                  .objectStore("credentialState")
                  .get("openai")
              read.onsuccess = () => {
                resolve(
                  read.result.apiKey === "pdf-reading-test-sentinel" &&
                    read.result.revision === 1000,
                )
                db.close()
              }
              read.onerror = reject
            }
          }),
      ),
    )
  }
  await worker.evaluate(() => {
    globalThis.__textFetch = globalThis.fetch
    globalThis.__pdfTextOutput = (body) => {
      const input = body.input
        .flatMap((item) => item.content ?? [])
        .find((part) => part.type === "input_text")
      const data = JSON.parse(input.text)
      return JSON.stringify({
        translations: data.rows.map((row) => ({
          id: row.id,
          text:
            data.targetLanguage === "Vietnamese"
              ? "Ngân hàng có chi nhánh để phục vụ khách hàng."
              : "The bank has branches for its customers.",
        })),
      })
    }
    globalThis.__audioCalls = []
    globalThis.__audioDelay = 0
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (request.url === "https://api.openai.com/v1/responses") return __textFetch(request)
      if (request.url === "https://api.openai.com/v1/audio/transcriptions") {
        const data = await request.formData(),
          file = data.get("file")
        __audioCalls.push({
          kind: "file",
          name: file.name,
          bytes: file.size,
          model: data.get("model"),
          languages: data.getAll("languages[]"),
          responseFormat: data.get("response_format"),
          language: data.get("language"),
          stream: data.get("stream"),
          timestamps: data.getAll("timestamp_granularities[]"),
          authorized: request.headers.get("authorization") === "Bearer pdf-reading-test-sentinel",
        })
        if (data.get("model") === "whisper-1")
          return new Response(
            JSON.stringify({
              text: "Hello. Xin chào.",
              duration: 1,
              segments: [
                { start: 0.125, end: 0.45, text: "Hello." },
                { start: 0.7, end: 0.95, text: "Xin chào." },
              ],
              usage: { type: "duration", seconds: 1 },
            }),
            { headers: { "content-type": "application/json" } },
          )
        const delay = __audioDelay
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ type: "transcript.text.delta", delta: "Tiếng Việt / 中文 / 日本語" })}\n\n`,
                ),
              )
              setTimeout(() => {
                if (!request.signal.aborted) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify({ type: "transcript.text.done", text: "Tiếng Việt / 中文 / 日本語 / English.", languages: [{ code: "vi" }], usage: { type: "duration", seconds: 5 } })}\n\n`,
                    ),
                  )
                  controller.close()
                }
              }, delay || 100)
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      }
      if (request.url === "https://api.openai.com/v1/realtime/client_secrets") {
        const body = await request.json()
        __audioCalls.push({
          kind: "secret",
          body,
          authorized: request.headers.get("authorization") === "Bearer pdf-reading-test-sentinel",
        })
        return new Response(JSON.stringify({ value: "ek-synthetic-transcription" }))
      }
      if (request.url === "https://api.openai.com/v1/realtime/calls") {
        __audioCalls.push({
          kind: "rtc",
          authorized: request.headers.get("authorization") === "Bearer ek-synthetic-transcription",
        })
        globalThis.__liveOffer = await request.text()
        return new Promise((resolve) => {
          globalThis.__finishRtc = (sdp) => resolve(new Response(sdp))
        })
      }
      throw new Error("Unexpected fixture network call")
    }
  })
  const page = await browser.newPage()
  await page.goto(base + "audio-transcription.html")
  await page.waitForSelector('input[type="file"]')
  check(
    "opens standalone page with four default language hints, without uploading on open",
    (await page.$$eval(".languages input:checked", (nodes) => nodes.length === 4)) &&
      (await worker.evaluate(() => __audioCalls.length)) === 0,
  )
  const wav = Buffer.alloc(44 + 32000)
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
  const wavPath = path.join(scratch, "private-local-name.wav")
  await fs.writeFile(wavPath, wav)
  await (await page.$('input[type="file"]')).uploadFile(wavPath)
  check(
    "choosing a local file is free and enables a local preview",
    (await page.$("audio")) !== null && (await worker.evaluate(() => __audioCalls.length)) === 0,
  )
  const click = (p, text) =>
    p.evaluate((label) => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === label,
      )
      if (!button) throw new Error("Missing button " + label)
      button.click()
    }, text)
  await click(page, "Chuyển file này thành chữ")
  await page.waitForFunction(() => document.querySelector(".result")?.value.endsWith("English."))
  check(
    "production file port streams a multilingual final transcript",
    await page.$eval(".result", (node) => node.value === "Tiếng Việt / 中文 / 日本語 / English."),
  )
  const first = await worker.evaluate(() => __audioCalls[0])
  check(
    "only the fixed model, generic filename, selected hints and private authorization reach the provider",
    first.name === "audio.wav" &&
      first.authorized &&
      first.model === "gpt-transcribe" &&
      first.languages.join() === "en,zh,ja,vi",
  )
  const cdp = await browser.target().createCDPSession()
  const downloads = path.join(scratch, "downloads")
  await fs.mkdir(downloads)
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads })
  await click(page, "Tải TXT")
  for (
    let i = 0;
    i < 50 && !(await fs.readdir(downloads)).some((name) => name.endsWith(".txt"));
    i++
  )
    await pause(100)
  check(
    "TXT download preserves UTF-8 and uses only the local filename",
    (await fs.readFile(path.join(downloads, "private-local-name.txt"), "utf8")).includes(
      "Tiếng Việt / 中文 / 日本語",
    ),
  )
  await worker.evaluate(() => {
    __audioDelay = 4000
  })
  await click(page, "Chép lời lại (có tính phí)")
  await page.waitForFunction(
    () =>
      document.querySelector(".result")?.value.includes("Tiếng Việt") &&
      !document.querySelector(".result")?.value.includes("English"),
  )
  await click(page, "Dừng xử lý file")
  await page.waitForFunction(() => document.body.innerText.includes("bản nháp"))
  check(
    "explicit cancellation keeps partial text labelled as a draft without retrying",
    (await worker.evaluate(() => __audioCalls.filter((v) => v.kind === "file").length)) === 2,
  )
  await worker.evaluate(() => {
    __audioDelay = 0
  })
  if (process.env.AUDIO_PIN_SRT)
    await checkPinAndSrt({ page, browser, worker, check, downloads, scratch })
  await page.setViewport({ width: 390, height: 844 })
  check(
    "mobile layout fits without horizontal overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  )
  await page.screenshot({ path: path.join(scratch, "audio-mobile.png"), fullPage: true })
  if (!process.env.AUDIO_FILES_ONLY) {
    await worker.evaluate(() => {
      globalThis.__captureDiagnostic = []
      const wrap = () => {
        __captureDiagnostic.push({
          captureAvailable: typeof chrome.tabCapture?.getMediaStreamId === "function",
        })
        if (!chrome.tabCapture?.getMediaStreamId || chrome.tabCapture.getMediaStreamId.__wrapped)
          return
        const original = chrome.tabCapture.getMediaStreamId
        const wrapped = async (captureOptions) => {
          try {
            const value = await original(captureOptions)
            __captureDiagnostic.push({ stream: true })
            return value
          } catch (error) {
            __captureDiagnostic.push({ error: error.message })
            throw error
          }
        }
        wrapped.__wrapped = true
        chrome.tabCapture.getMediaStreamId = wrapped
      }
      wrap()
      chrome.permissions.onAdded.addListener(wrap)
    })
    await options.evaluate(() =>
      chrome.runtime.sendMessage({
        id: crypto.randomUUID(),
        type: "ttsPlaybackPrepare",
        data: {},
        timestamp: Date.now(),
      }),
    )
    offscreen = await (
      await browser.waitForTarget((t) => t.url() === base + "offscreen.html")
    ).createCDPSession()
    await offscreen.send("Runtime.enable")
    const offEval = async (expression) => {
      const result = await offscreen.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.text + " " + result.exceptionDetails.exception?.description,
        )
      return result.result.value
    }
    await offEval(
      `(() => { const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); globalThis.__captureStreams=[]; navigator.mediaDevices.getUserMedia=async (...args)=>{ const stream=await original(...args); __captureStreams.push(stream); return stream }; })()`,
    )
    source = await browser.newPage()
    if (process.env.AUDIO_YOUTUBE) {
      await source.setRequestInterception(true)
      source.on("request", (request) => {
        if (request.url() === embeddedSourceURL) {
          void request.respond({
            status: 200,
            contentType: "text/html",
            body: '<!doctype html><meta charset="utf-8"><button id="work">Work: 0</button><script>work.onclick=()=>work.textContent="Work: "+(Number(work.textContent.split(": ")[1])+1)</script>',
          })
          return
        }
        if (
          request.isNavigationRequest() &&
          request.url().startsWith("https://www.youtube.com/watch")
        )
          void request.respond({
            status: 200,
            contentType: "text/html",
            body: sourceHTML,
          })
        else void request.continue()
      })
      await source.goto("https://www.youtube.com/watch?v=readfrog-live-fixture")
    } else
      await source.goto(
        `http://127.0.0.1:${server.address().port}${sourceViewTest ? "/source-view" : ""}`,
      )
    await source.click("#play")
    const launchFromSource = async () => {
      await source.bringToFront()
      const { targetInfos } = await cdp.send("Target.getTargets", {
        filter: [{ type: "tab", exclude: false }],
      })
      const targetInfo = targetInfos.find((target) => target.url === source.url())
      if (!targetInfo) throw new Error("Missing browser tab target")
      const priorTargets = new Set(browser.targets())
      await cdp.send("Extensions.triggerAction", { id, targetId: targetInfo.targetId })
      const popup = await (
        await browser.waitForTarget((t) => !priorTargets.has(t) && t.url() === base + "popup.html")
      ).asPage()
      await popup.waitForSelector("[data-open-audio-transcription]")
      await popup.click("[data-open-audio-transcription]")
      const target = await browser.waitForTarget(
        (t) =>
          !priorTargets.has(t) && t.url().startsWith(base + "audio-transcription.html?source="),
      )
      const monitor = await target.page()
      await monitor.waitForSelector(".modes input")
      return monitor
    }
    const recorded = await launchFromSource()
    await (await recorded.$$(".modes input"))[1].click()
    await click(recorded, "Bắt đầu thu tab")
    await recorded.waitForFunction(
      () =>
        document.body.innerText.includes("Đang thu trên máy") || document.querySelector(".error"),
      { timeout: 15000 },
    )
    if (await recorded.$(".error"))
      throw new Error(JSON.stringify(await worker.evaluate(() => __captureDiagnostic)))
    const work = await browser.newPage()
    await work.goto(`http://127.0.0.1:${server.address().port}/work`)
    await work.click("#work")
    await pause(2500)
    check(
      "tab audio recording remains active while another tab is used",
      (await worker.evaluate(() => chrome.tabCapture.getCapturedTabs())).some(
        (v) => v.status === "active",
      ) && (await work.$eval("#work", (b) => b.textContent === "Work: 1")),
    )
    check(
      "record-only mode does not call OpenAI",
      (await worker.evaluate(() => __audioCalls.length)) === (process.env.AUDIO_PIN_SRT ? 3 : 2),
    )
    await recorded.bringToFront()
    await click(recorded, "Dừng thu")
    await recorded.waitForSelector("audio")
    check(
      "stopping yields an independently decodable local WebM recording",
      await recorded.evaluate(async () => {
        const response = await fetch(document.querySelector("audio").src)
        const context = new AudioContext()
        try {
          const decoded = await context.decodeAudioData(await response.arrayBuffer())
          return decoded.duration > 2 && decoded.getChannelData(0).some((v) => Math.abs(v) > 0.001)
        } finally {
          await context.close()
        }
      }),
    )
    check(
      "stopping cleans captured tracks",
      await offEval(`__captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))`),
    )
    await click(recorded, "Chuyển file này thành chữ")
    await recorded.waitForFunction(() =>
      document.querySelector(".result")?.value.includes("English."),
    )
    check(
      "recorded tab audio reuses the same private file-transcription path on explicit action",
      (await worker.evaluate(() => __audioCalls.filter((v) => v.kind === "file").at(-1).name)) ===
        "audio.webm",
    )
    await recorded.close()
    const live = await launchFromSource()
    await click(live, "Anh + Nhật + Việt")
    check(
      "meeting preset selects exactly English, Japanese and Vietnamese",
      await live.$$eval(".languages input:checked", (nodes) => nodes.length === 3),
    )
    await click(live, "Bắt đầu chép lời trực tiếp")
    for (let i = 0; i < 100 && !(await worker.evaluate(() => Boolean(globalThis.__liveOffer))); i++)
      await pause(100)
    const offer = await worker.evaluate(() => __liveOffer)
    check(
      "live mode negotiates a transcription-only WebRTC session with private credentials",
      typeof offer === "string" &&
        (await worker.evaluate(
          () =>
            __audioCalls.find((v) => v.kind === "secret").body.session.audio.input.transcription
              .model,
        )) === "gpt-live-transcribe",
    )
    const answer = await offEval(`(async () => {
    const peer = globalThis.__serverPeer = new RTCPeerConnection(); globalThis.__receivedAudio = false
    peer.ontrack = () => { __receivedAudio=true }
    peer.ondatachannel = e => {
      const dc = globalThis.__serverDC = e.channel; let index=0, previous=null; globalThis.__commitTimes=[]; globalThis.__replyText=${sourceViewTest ? '""' : '"Live finalized words."'}
      globalThis.__emitFinal=(text)=>{const id="turn-"+index++; dc.send(JSON.stringify({type:"input_audio_buffer.committed",item_id:id,previous_item_id:previous}));dc.send(JSON.stringify({type:"conversation.item.input_audio_transcription.completed",item_id:id,transcript:text}));previous=id}
      globalThis.__pushPending=(text)=>dc.send(JSON.stringify({type:"conversation.item.input_audio_transcription.delta",item_id:"turn-"+index,delta:text}));
      const initial=()=>{ globalThis.__openedAt=performance.now(); dc.send(JSON.stringify({type:'conversation.item.input_audio_transcription.delta',item_id:'turn-0',delta:'Live partial words'})) }
      dc.onopen=initial
      dc.onmessage= e => { const event=JSON.parse(e.data); if(event.type==='input_audio_buffer.commit'){ __commitTimes.push(performance.now()); __emitFinal(__replyText) } }
    }
    await peer.setRemoteDescription({type:'offer',sdp:${JSON.stringify(offer)}}); await peer.setLocalDescription(await peer.createAnswer())
    if(peer.iceGatheringState!=='complete') await new Promise(resolve=>{peer.addEventListener('icegatheringstatechange',()=>{if(peer.iceGatheringState==='complete')resolve()});setTimeout(resolve,4000)})
    return peer.localDescription.sdp
  })()`)
    await worker.evaluate((sdp) => __finishRtc(sdp), answer)
    await live.waitForFunction(
      () => document.querySelector(".pending")?.innerText.includes("Live partial words"),
      { timeout: Number(process.env.AUDIO_CAPTURE_WAIT ?? 15000), polling: 100 },
    )
    check(
      "live deltas are visible before stopping or finalizing a turn",
      (await live.$(".pending")) !== null,
    )
    if (process.env.AUDIO_PIN_SRT && !sourceViewTest) {
      await live.bringToFront()
      await live.click("[data-pin-audio]")
      await live.waitForFunction(() =>
        documentPictureInPicture.window?.document
          .querySelector("[data-pinned-pending]")
          ?.textContent.includes("Live partial words"),
      )
      check("actual pinned window mirrors live partial speech without a second capture", true)
    }
    if (sourceViewTest)
      await checkYouTubeLiveView({
        source,
        live,
        worker,
        offEval,
        check,
        scratch,
        embedURL: embeddedSourceURL,
      }).catch(async (error) => {
        console.log(
          JSON.stringify({
            calls: await worker.evaluate(() => __pdfCalls.map((c) => c.body)),
            pane: await source.$eval("#read-frog-live-transcript", (h) => h.shadowRoot.textContent),
            monitor: await live.$eval(".transcript", (n) => n.textContent),
          }),
        )
        throw error
      })
    await work.bringToFront()
    await work.click("#work")
    await pause(1500)
    check(
      "real WebRTC audio flows while the monitor is backgrounded",
      await offEval(
        `(async()=>{const stats=await __serverPeer.getStats();return [...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)})()`,
      ),
    )
    if (process.env.AUDIO_PIN_SRT && !sourceViewTest) {
      check(
        "pinned live transcript survives background work without opening another WebRTC session",
        (await live.evaluate(() =>
          Boolean(documentPictureInPicture.window && !documentPictureInPicture.window.closed),
        )) &&
          (await worker.evaluate(
            () => __audioCalls.filter((v) => v.kind === "secret").length === 1,
          )),
      )
      await live.evaluate(() => documentPictureInPicture.window.close())
      await live.waitForFunction(() => !documentPictureInPicture.window)
      check(
        "closing live Picture-in-Picture leaves the original captured stream running",
        (await worker.evaluate(() => chrome.tabCapture.getCapturedTabs())).some(
          (v) => v.status === "active",
        ),
      )
    }
    if (sourceViewTest) {
      await source.bringToFront()
      await offEval(`__emitFinal('Live finalized words.')`)
      await source.$eval("pierce/.live-toolbar button:last-child", (node) => node.click())
    } else {
      await live.bringToFront()
      await click(live, "Dừng thu")
    }
    await live.waitForFunction(
      () => document.querySelector(".transcript")?.textContent.includes("Live finalized words."),
      { polling: 100 },
    )
    check(
      "manual stop commits and drains the final transcript",
      await live.$eval(".transcript", (p) => p.textContent.includes("Live finalized words.")),
    )
    check(
      "live stop releases all tab tracks",
      await offEval(`__captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))`),
    )
    const publicStorage = await worker.evaluate(async () =>
      JSON.stringify(await chrome.storage.local.get(null)),
    )
    check(
      "public storage contains no credential, recording URL or transcript",
      !publicStorage.includes("pdf-reading-test-sentinel") &&
        !publicStorage.includes("Live finalized words") &&
        !publicStorage.includes("blob:chrome-extension"),
    )
    await live.waitForFunction(() => document.body.innerText.includes("Đã dừng thu âm."), {
      polling: 100,
    })
    await live.bringToFront()
    await live.screenshot({ path: path.join(scratch, "audio-desktop.png"), fullPage: true })
    await offEval(`__serverPeer.close()`)
    await live.close()
    if (sourceViewTest) {
      await source.bringToFront()
      await source.waitForSelector('pierce/[aria-label="Đóng khung chép lời"]')
      check(
        "closing the Audio owner leaves the pinned view visibly stopped without capture or translation",
        await source.$eval("#read-frog-live-transcript", (host) =>
          host.shadowRoot.textContent.includes("Khung vẫn được ghim"),
        ),
      )
      await source.evaluate(() =>
        history.pushState({}, "", location.pathname + "?changed-source=1"),
      )
      await source.waitForFunction(() =>
        document
          .querySelector("#read-frog-live-transcript")
          ?.shadowRoot.textContent.includes("Trang nguồn đã đổi"),
      )
      check(
        "a pinned ended session erases source text and translations on a different SPA route",
        await source.$eval(
          "#read-frog-live-transcript",
          (host) =>
            !host.shadowRoot.textContent.includes("Live finalized words") &&
            !host.shadowRoot.querySelector("[data-live-final]"),
        ),
      )
      await source.click('pierce/[aria-label="Đóng khung chép lời"]')
      await source.waitForSelector("#read-frog-live-transcript", { hidden: true })
    }
    const closing = await launchFromSource()
    await (await closing.$$(".modes input"))[1].click()
    await click(closing, "Bắt đầu thu tab")
    await closing.waitForFunction(() => document.body.innerText.includes("Đang thu trên máy"))
    await closing.close()
    for (
      let i = 0;
      i < 50 &&
      !(await offEval(`__captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))`));
      i++
    )
      await pause(100)
    check(
      "closing the owner page stops all tab capture tracks",
      await offEval(`__captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))`),
    )
    if (sourceViewTest) {
      const reloading = await launchFromSource()
      await (await reloading.$$(".modes input"))[1].click()
      await click(reloading, "Bắt đầu thu tab")
      await reloading.waitForFunction(() => document.body.innerText.includes("Đang thu trên máy"))
      await source.reload()
      for (
        let i = 0;
        i < 50 &&
        !(await offEval(
          "__captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))",
        ));
        i++
      )
        await pause(100)
      check(
        "reloading the source stops capture even when its URL is unchanged",
        await offEval("__captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"),
      )
      await reloading.close()
      const stale = await launchFromSource()
      await source.reload()
      await (await stale.$$(".modes input"))[1].click()
      await click(stale, "Bắt đầu thu tab")
      await stale.waitForSelector(".error")
      check(
        "reloading a source invalidates its unconsumed launch channel",
        await stale.$eval(".error", (node) => node.textContent.includes("hết hạn")),
      )
      await stale.close()
    }
  }
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
console.log(JSON.stringify({ scratch, passed: evidence.checks.length }))
