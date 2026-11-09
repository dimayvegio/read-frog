import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
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
const scratch = path.resolve(`.codex/audio-${Date.now()}`)
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
const server = http.createServer((_request, response) =>
  response.end(
    `<!doctype html><title>Tab audio fixture</title><button id="play">Play synthetic audio</button><button id="work">Work: 0</button><script>play.onclick=()=>{window.ctx=new AudioContext();window.tone=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=.12;tone.connect(gain).connect(ctx.destination);tone.start();ctx.resume()};work.onclick=()=>work.textContent='Work: '+(Number(work.textContent.split(': ')[1])+1)</script>`,
  ),
)
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
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
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  evidence.browser = await browser.version()
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
    globalThis.__audioCalls = []
    globalThis.__audioDelay = 0
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (request.url === "https://api.openai.com/v1/audio/transcriptions") {
        const data = await request.formData(),
          file = data.get("file")
        __audioCalls.push({
          kind: "file",
          name: file.name,
          bytes: file.size,
          model: data.get("model"),
          languages: data.getAll("languages[]"),
          authorized: request.headers.get("authorization") === "Bearer pdf-reading-test-sentinel",
        })
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
  await page.setViewport({ width: 390, height: 844 })
  check(
    "mobile layout fits without horizontal overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  )
  await page.screenshot({ path: path.join(scratch, "audio-mobile.png"), fullPage: true })
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
  await source.goto(`http://127.0.0.1:${server.address().port}`)
  await source.click("#play")
  const launchFromSource = async () => {
    await source.bringToFront()
    const { targetInfos } = await cdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    })
    const targetInfo = targetInfos.find((target) => target.url === source.url())
    if (!targetInfo) throw new Error("Missing browser tab target")
    await cdp.send("Extensions.triggerAction", { id, targetId: targetInfo.targetId })
    const popup = await (
      await browser.waitForTarget((t) => t.url() === base + "popup.html")
    ).asPage()
    await popup.waitForSelector("[data-open-audio-transcription]")
    await popup.click("[data-open-audio-transcription]")
    const target = await browser.waitForTarget((t) =>
      t.url().startsWith(base + "audio-transcription.html?source="),
    )
    const monitor = await target.page()
    await monitor.waitForSelector(".modes input")
    return monitor
  }
  const recorded = await launchFromSource()
  await (await recorded.$$(".modes input"))[1].click()
  await click(recorded, "Bắt đầu thu tab")
  await recorded.waitForFunction(() => document.body.innerText.includes("Đang thu trên máy"), {
    timeout: 15000,
  })
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
    (await worker.evaluate(() => __audioCalls.length)) === 2,
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
      const dc = e.channel; let index=0, previous=null
      const initial=()=>dc.send(JSON.stringify({type:'conversation.item.input_audio_transcription.delta',item_id:'turn-0',delta:'Live partial words'}))
      dc.onopen=initial
      dc.onmessage= e => { const event=JSON.parse(e.data); if(event.type==='input_audio_buffer.commit'){ const id='turn-'+index++; dc.send(JSON.stringify({type:'input_audio_buffer.committed',item_id:id,previous_item_id:previous})); dc.send(JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:'Live finalized words.'})); previous=id } }
    }
    await peer.setRemoteDescription({type:'offer',sdp:${JSON.stringify(offer)}}); await peer.setLocalDescription(await peer.createAnswer())
    if(peer.iceGatheringState!=='complete') await new Promise(resolve=>{peer.addEventListener('icegatheringstatechange',()=>{if(peer.iceGatheringState==='complete')resolve()});setTimeout(resolve,4000)})
    return peer.localDescription.sdp
  })()`)
  await worker.evaluate((sdp) => __finishRtc(sdp), answer)
  await live.waitForFunction(
    () => document.querySelector(".pending")?.innerText.includes("Live partial words"),
    { timeout: 15000 },
  )
  check(
    "live deltas are visible before stopping or finalizing a turn",
    (await live.$(".pending")) !== null,
  )
  await work.bringToFront()
  await work.click("#work")
  await pause(1500)
  check(
    "real WebRTC audio flows while the monitor is backgrounded",
    await offEval(
      `(async()=>{const stats=await __serverPeer.getStats();return [...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)})()`,
    ),
  )
  await live.bringToFront()
  await click(live, "Dừng thu")
  await live.waitForFunction(
    () => document.querySelector(".transcript")?.innerText === "Live finalized words.",
  )
  check(
    "manual stop commits and drains the final transcript",
    await live.$eval(".transcript", (p) => p.textContent === "Live finalized words."),
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
  await live.waitForFunction(() => document.body.innerText.includes("Đã dừng thu âm."))
  await live.bringToFront()
  await live.screenshot({ path: path.join(scratch, "audio-desktop.png"), fullPage: true })
  await offEval(`__serverPeer.close()`)
  await live.close()
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
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
console.log(JSON.stringify({ scratch, passed: evidence.checks.length }))
