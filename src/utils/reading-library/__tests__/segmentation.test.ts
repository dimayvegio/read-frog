import { it, expect } from "vitest"
import { validateReadingPassage } from "../schema"
import { initialReadingPairs, parseReadingAlignment } from "../segmentation"
import { passageFixture } from "./fixtures"
it("keeps short sentences separate and retains the entire passage when counts differ", () => {
  const capture = { title: "mẫu", original: "Yes. I agree.", translation: "Đúng. Tôi đồng ý." }
  expect(initialReadingPairs(capture).pairs.map((pair) => pair.original)).toEqual([
    "Yes.",
    "I agree.",
  ])
  const grouped = initialReadingPairs({ ...capture, translation: "Đúng và tôi đồng ý." })
  expect(grouped.grouped).toBe(true)
  expect(grouped.pairs[0]!.original).toBe(capture.original)
})
it("only accepts complete monotonic index alignment; never trusts AI-rewritten text", () => {
  const capture = { title: "mẫu", original: "Yes. I agree.", translation: "Đúng. Tôi đồng ý." }
  expect(
    parseReadingAlignment('{"ends":[[0,0],[1,1]]}', capture).map((pair) => pair.translation),
  ).toEqual(["Đúng.", "Tôi đồng ý."])
  for (const text of [
    '{"ends":[[0,0]]}',
    '{"ends":[[1,1],[0,0]]}',
    '{"ends":[[2,2]]}',
    '{"ends":[[-1,0]]}',
    '{"ends":[[0.2,1]]}',
    '{"ends":[]}',
  ])
    expect(() => parseReadingAlignment(text, capture)).toThrow(/câu|văn bản/)
  const passage = passageFixture()
  passage.pairs[0]!.original = "Omitted text"
  expect(() => validateReadingPassage(passage)).toThrow(/giữ đủ/)
})
