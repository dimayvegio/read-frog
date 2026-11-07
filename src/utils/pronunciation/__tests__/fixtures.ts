import { encodePracticeWav, wavBase64 } from "../audio"
import { criterionKeys, type PronunciationFeedback } from "../schema"

export function practiceWav(frequency = 440) {
  const samples = Float32Array.from(
    { length: 16000 },
    (_, i) => Math.sin((2 * Math.PI * frequency * i) / 16000) * 0.2,
  )
  return wavBase64(encodePracticeWav(samples))
}
export function practiceFeedback(word = false): PronunciationFeedback {
  return {
    verdict: "assessed",
    reason: "ok",
    confidence: "high",
    heardText: "Read it again.",
    overview: "Đọc rõ phần lớn câu; cần giữ âm cuối để người nghe phân biệt từ.",
    strengths: ["Từ đầu câu nghe rõ."],
    criteria: Object.fromEntries(
      criterionKeys.map((k) => [
        k,
        {
          score: word && ["rhythm", "fluency"].includes(k) ? null : k === "sounds" ? 6.5 : 8,
          feedback:
            word && ["rhythm", "fluency"].includes(k)
              ? "Không áp dụng cho từ đơn."
              : "Nhận xét theo tín hiệu nghe được.",
        },
      ]),
    ) as PronunciationFeedback["criteria"],
    findings: [
      {
        wordStart: 0,
        wordEnd: 0,
        category: "ending",
        heard: "âm cuối chưa rõ",
        expected: "read /ɹiːd/",
        explanation: "Giữ vị trí lưỡi cho /d/, không cần bật mạnh.",
        practice: "Đọc read → read it ba lần, giữ âm nối.",
        confidence: "medium",
      },
    ],
    nextPractice: ["Thu lại câu, giữ âm cuối từ read."],
  }
}
