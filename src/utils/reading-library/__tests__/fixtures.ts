import type { ReadingPassage, ReadingAsset } from "../schema"
import { DEFAULT_OPENAI_TTS_CONFIG } from "@/types/openai-tts"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { encodeSpeechMp3 } from "@/utils/tts-playback/mp3-download"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { readingAssetId } from "../db"
import { initialReadingPairs } from "../segmentation"
let mp3: Promise<ReadingAsset> | undefined
export function audioFixture() {
  return (mp3 ??= encodeSpeechMp3([wavFixture()], new AbortController().signal).then((bytes) => ({
    id: readingAssetId(bytes),
    type: "audio/mpeg",
    bytes,
  })))
}
export function passageFixture(): ReadingPassage {
  const capture = {
    original: "Yes. I agree.",
    translation: "Đúng vậy. Tôi đồng ý.",
    title: "Bài nghe mẫu",
  }
  return {
    ...capture,
    id: getRandomUUID(),
    folderId: null,
    favorite: false,
    pairs: initialReadingPairs(capture).pairs,
    speech: DEFAULT_OPENAI_TTS_CONFIG,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
  }
}
export async function bundleFixture() {
  const passage = passageFixture(),
    audio = await audioFixture(),
    bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80]),
    recording: ReadingAsset = { id: readingAssetId(bytes), type: "audio/webm", bytes }
  passage.pairs.forEach((pair) => {
    pair.originalAudio = audio.id
    pair.translationAudio = audio.id
  })
  passage.pairs[0]!.recording = recording.id
  return { passages: [passage], folders: [], assets: [audio, recording] }
}
