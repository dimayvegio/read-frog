import assert from "node:assert/strict"
import fs from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import path from "node:path"
import { performance } from "node:perf_hooks"

// Sequential pure-kernel measurements; not model latency, browser FPS or OS RAM.
async function loadSource(file) {
  const source = await fs.readFile(path.resolve(file), "utf8")
  const outputText = stripTypeScriptTypes(source)
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`)
}
const { sameDubbingScope } = await loadSource("src/utils/subtitles/dubbing/scope.ts")
const { MonoPcmConverter } = await loadSource("src/utils/subtitles/dubbing/pcm.ts")
function measure(fn, loops, rounds = 7) {
  for (let i = 0; i < Math.min(loops, 100); i++) fn()
  const timings = []
  for (let r = 0; r < rounds; r++) {
    const start = performance.now()
    for (let i = 0; i < loops; i++) fn()
    timings.push(performance.now() - start)
  }
  timings.sort((a, b) => a - b)
  return timings[Math.floor(timings.length / 2)]
}
const config = {
  providers: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    model: "gpt-realtime-2.1-mini",
    instructions: "read naturally ".repeat(20),
  })),
}
const profile = {
  assignments: Array.from({ length: 1500 }, (_, i) => ({
    from: i,
    to: i,
    speaker: `s${(i % 8) + 1}`,
    confidence: 0.9,
  })),
  context: "context ".repeat(100),
}
const snapshot = { id: "video", config, context: "anime", profile }
const serialized = JSON.stringify([snapshot.id, config, snapshot.context, profile])
let sink = 0
const identityOld = () => {
  if (JSON.stringify([snapshot.id, config, snapshot.context, profile]) === serialized) sink++
}
const identityNew = () => {
  if (sameDubbingScope(snapshot, { id: "video", config, context: "anime", profile })) sink++
}
const length = 4096,
  left = Float32Array.from({ length }, (_, i) => Math.sin(i / 20) * 0.4),
  right = Float32Array.from({ length }, (_, i) => Math.cos(i / 19) * 0.3)
let channelReads = 0
const input = {
  length,
  numberOfChannels: 2,
  getChannelData: (n) => {
    channelReads++
    return n ? right : left
  },
}
let oldPeak = 0
const oldPcm = () => {
  const samples = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    let value = 0
    for (let ch = 0; ch < input.numberOfChannels; ch++) value += input.getChannelData(ch)[i]
    value /= Math.max(1, input.numberOfChannels)
    oldPeak = Math.max(oldPeak, Math.abs(value))
    samples[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767)
  }
  sink += samples[0]
  return samples
}
const converter = new MonoPcmConverter()
assert.deepEqual(converter.convert(input), oldPcm())
const blocks = Math.ceil((600 * 16000) / length)
channelReads = 0
oldPcm()
const oldReads = channelReads
channelReads = 0
const block = converter.convert(input)
const newReads = channelReads
assert.equal(converter.convert(input), block)
const report = {
  baseline: "6fd9206d / a.5 algorithms",
  runtime: process.version,
  scope:
    "Sequential synthetic kernels; 1500 speaker assignments; 10 min PCM stereo16kHz. No live OpenAI or OS memory measurement.",
  identity: {
    iterations: 3000,
    baselineMs: measure(identityOld, 3000),
    candidateMs: measure(identityNew, 3000),
    serializedCharactersPerCheckBefore: serialized.length,
    serializedCharactersPerCheckAfter: 0,
  },
  pcm: {
    blocks,
    baselineMs: measure(oldPcm, blocks),
    candidateMs: measure(() => {
      sink += converter.convert(input)[0]
    }, blocks),
    channelReadsPerBlockBefore: oldReads,
    channelReadsPerBlockAfter: newReads,
    pcmAllocationsFor600SecondsBefore: blocks,
    pcmAllocationsFor600SecondsAfter: 1,
    pcmAllocatedBytesBefore: blocks * length * 2,
    pcmAllocatedBytesAfter: length * 2,
  },
  sink,
}
const target = path.resolve(".codex/dubbing-a6-benchmark.json")
await fs.writeFile(target, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
