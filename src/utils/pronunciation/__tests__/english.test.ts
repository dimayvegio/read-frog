import { expect, it } from "vitest"
import { isEnglishPracticeText } from "../english"
it("shows for English words and sentences, using actual English context for short unknown words", () => {
  for (const text of [
    "read",
    "hello",
    "comfortable",
    "read it again",
    "I don't understand.",
    "Regular practice helps us remember new words.",
    "The election is unlikely to reverse the structural demand for AI infrastructure.",
  ])
    expect(isEnglishPracticeText(text)).toBe(true)
  expect(
    isEnglishPracticeText("heteronyms", "We should practice heteronyms in this English lesson."),
  ).toBe(true)
})
it("hides non-English selections even when the surrounding page is English", () => {
  for (const text of [
    "你好",
    "日本語",
    "안녕하세요",
    "Xin chào",
    "Đọc lại đoạn này.",
    "Bonjour tout le monde, comment allez-vous aujourd’hui ?",
    "Hola, quiero aprender nuevas palabras todos los días.",
    "Dies ist ein Beispiel für einen deutschen Satz.",
    "Привет",
    "12345",
    "<div>hello</div>",
    "",
    "       ",
  ])
    expect(
      isEnglishPracticeText(
        text,
        `This English article contains the quote ${text} and some further discussion.`,
      ),
    ).toBe(false)
})
it("hides unknown short fragments without spending API tokens or trusting unrelated context", () => {
  expect(isEnglishPracticeText("xyzzy")).toBe(false)
  expect(
    isEnglishPracticeText(
      "bonjour",
      "This is a long English sentence about pronunciation practice.",
    ),
  ).toBe(false)
  expect(
    isEnglishPracticeText(
      "heteronyms",
      "Những heteronyms trong tài liệu này cần luyện đọc cẩn thận.",
    ),
  ).toBe(false)
})
