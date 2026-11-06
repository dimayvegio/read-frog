import { sha256, emptyProgress, type VocabularyBundle, type VocabularyCard } from "../schema"

export function wavFixture(sample = 1) {
  const bytes = new Uint8Array(2444)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
  }
  write(0, "RIFF")
  view.setUint32(4, bytes.length - 8, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 24000, true)
  view.setUint32(28, 48000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, 2400, true)
  for (let i = 44; i < bytes.length; i += 2)
    view.setInt16(i, Math.round(Math.sin(i / 10) * sample * 1000), true)
  return bytes
}
export async function vocabularyFixture(word = "reverse"): Promise<VocabularyBundle> {
  const wordAudio = wavFixture(),
    exampleAudio = wavFixture(2)
  const id = await sha256(word),
    key = await sha256(`capture:${word}`),
    wordHash = await sha256(wordAudio),
    exampleHash = await sha256(exampleAudio)
  const card: VocabularyCard = {
    id,
    captureKey: key,
    word,
    language: "en-US",
    ipa: "/rɪˈvɝːs/",
    partOfSpeech: "Động từ",
    meaning: "đảo ngược",
    definition: "Làm thay đổi một xu hướng theo hướng ngược lại.",
    pronunciationTip: "Nhấn âm tiết thứ hai.",
    context: "The election is unlikely to reverse the structural demand.",
    originalTranslation: "Cuộc bầu cử khó có thể đảo ngược nhu cầu mang tính cơ cấu.",
    example: {
      sentence: `They hope to ${word} the decline.`,
      translation: "Họ hy vọng đảo ngược sự suy giảm.",
    },
    distractors: ["tiếp tục duy trì", "đẩy nhanh tiến độ", "đo lường kết quả"],
    acceptedAnswers: [word],
    tags: ["Kinh tế"],
    createdAt: 1000,
    updatedAt: 1000,
    sourceTitle: "Bài báo đã đọc",
    sourceUrl: "https://example.com/article",
    audio: { word: wordHash, example: exampleHash },
    speech: { model: "gpt-realtime-2.1-mini", voice: "marin", speed: 1 },
  }
  return {
    cards: [card],
    progress: [emptyProgress(id)],
    audio: [
      { id: wordHash, bytes: wordAudio, contentType: "audio/wav" },
      { id: exampleHash, bytes: exampleAudio, contentType: "audio/wav" },
    ],
  }
}
