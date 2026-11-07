import { sha256 } from "js-sha256"
import { MAX_WAV_BYTES } from "./schema"

const RATE = 16000
export function encodePracticeWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, "RIFF")
  view.setUint32(4, bytes.length - 8, true)
  ascii(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), true)
  return bytes
}
export function wavBase64(bytes: Uint8Array): string {
  let result = ""
  for (let offset = 0; offset < bytes.length; offset += 8192)
    result += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(result)
}
/** Exact bounded canonical PCM; no compressed decoder runs in the credential executor. */
export function validatePracticeWav(base64: string) {
  if (
    base64.length > Math.ceil(MAX_WAV_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    base64.length % 4
  )
    throw new Error("Bản thu không hợp lệ.")
  let raw: string
  try {
    raw = atob(base64)
  } catch {
    throw new Error("Bản thu không hợp lệ.")
  }
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    view = new DataView(bytes.buffer)
  if (bytes.length < 44 + RATE * 2 * 0.3 || bytes.length > MAX_WAV_BYTES || bytes.length % 2)
    throw new Error("Thu từ 0,3 đến 30 giây, tối đa 31 giây gồm đuôi âm thanh.")
  if (
    raw.slice(0, 4) !== "RIFF" ||
    raw.slice(8, 16) !== "WAVEfmt " ||
    raw.slice(36, 40) !== "data" ||
    view.getUint32(4, true) !== bytes.length - 8 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== RATE ||
    view.getUint32(28, true) !== RATE * 2 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.length - 44
  )
    throw new Error("Bản thu cần WAV PCM mono 16 kHz.")
  let energy = 0
  for (let i = 44; i < bytes.length; i += 2) energy += (view.getInt16(i, true) / 32768) ** 2
  if (Math.sqrt(energy / ((bytes.length - 44) / 2)) < 0.001)
    throw new Error("Bản thu quá nhỏ hoặc im lặng. Đưa micro gần hơn và thu lại.")
  return { hash: sha256(bytes), audioMs: ((bytes.length - 44) / (RATE * 2)) * 1000 }
}
export async function preparePracticeWav(data: ArrayBuffer) {
  if (data.byteLength > 8 * 1024 * 1024) throw new Error("Bản thu vượt 8 MiB.")
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(data.slice(0))
    if (decoded.duration < 0.3 || decoded.duration > 31)
      throw new Error("Thu từ 0,3 đến 30 giây. Chia đoạn dài thành câu ngắn.")
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    const wav = wavBase64(encodePracticeWav(rendered.getChannelData(0)))
    validatePracticeWav(wav)
    return wav
  } finally {
    await context.close()
  }
}
