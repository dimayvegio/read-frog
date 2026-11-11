import { expect, it, vi } from "vitest"
import { LiveTranslationController, recentLiveRows } from "../live-translation"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
it("never translates while disabled; finalized rows use previous original speech as context and partial updates do not repeat calls", async () => {
  const translate = vi.fn<(...args: any[]) => any>().mockResolvedValue(["Nó là một ngân hàng."])
  const controller = new LiveTranslationController(translate, () => {})
  controller.update("It is a bank.")
  expect(translate).not.toHaveBeenCalled()
  controller.configure(true, "vi")
  await tick()
  expect(controller.snapshot.rows[0]).toMatchObject({
    translation: "Nó là một ngân hàng.",
    state: "done",
  })
  controller.update("It is a bank.")
  expect(translate).toHaveBeenCalledTimes(1)
  translate.mockResolvedValue(["Tôi gửi tiền ở đó."])
  controller.update("It is a bank.\n\nI deposit money there.")
  await tick()
  expect(translate.mock.calls[1]![0]).toEqual([
    { id: 15, source: "I deposit money there.", context: "It is a bank.\n\n" },
  ])
  expect(controller.snapshot.rows[0]!.translation).toBe("Nó là một ngân hàng.")
  controller.dispose()
})
it("bounds recent input/context/queue and does not split a surrogate pair", () => {
  const text = ("Words on the page. ".repeat(500) + "\n\n").repeat(90)
  const rows = recentLiveRows(text)
  expect(rows.length).toBeLessThanOrEqual(24)
  expect(rows.reduce((sum, row) => sum + row.source.length, 0)).toBeLessThanOrEqual(16000)
  expect(rows.every((row) => row.source.length <= 4000 && row.context.length <= 4000)).toBe(true)
  expect(recentLiveRows("a".repeat(4000) + " tail")[0]!.source.length).toBeLessThanOrEqual(4000)
  expect(recentLiveRows("a".repeat(3999) + "😀more")[0]!.source).toBe("a".repeat(3999))
})
it("allows at most two jobs and prioritizes recent waiting speech when requests are slow", async () => {
  const translate = vi.fn<(...args: any[]) => any>().mockImplementation(() => new Promise(() => {}))
  const controller = new LiveTranslationController(translate, () => {})
  controller.configure(true, "vi")
  for (let i = 1; i <= 100; i++)
    controller.update(Array.from({ length: i }, (_, n) => `Turn ${n}.`).join("\n\n"))
  expect(translate).toHaveBeenCalledTimes(2)
  expect(controller.snapshot.rows.length).toBe(24)
  controller.dispose()
  expect(translate.mock.calls.every((call) => call[2].aborted)).toBe(true)
  await tick()
})
it("cancels language changes, ignores stale completion, and cancels only translation on disable", async () => {
  let complete!: (value: string[]) => void
  const translate = vi
    .fn<(...args: any[]) => any>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    .mockResolvedValue(["English output."])
  const controller = new LiveTranslationController(translate, () => {})
  controller.update("Bonjour.")
  controller.configure(true, "vi")
  controller.configure(true, "en")
  await tick()
  complete(["Stale Vietnamese"])
  await tick()
  expect(controller.snapshot.rows[0]!.translation).toBe("English output.")
  expect(translate.mock.calls[0]![2].aborted).toBe(true)
  controller.configure(false, "en")
  controller.update("Bonjour.\n\nMerci.")
  expect(translate).toHaveBeenCalledTimes(2)
  controller.dispose()
})
it("pauses after invalid/error output with no paid automatic retry and keeps later original speech", async () => {
  const translate = vi.fn<(...args: any[]) => any>().mockResolvedValue([])
  const controller = new LiveTranslationController(translate, () => {})
  controller.update("Hello.")
  controller.configure(true, "vi")
  await tick()
  controller.update("Hello.\n\nAnother sentence.")
  await tick()
  expect(translate).toHaveBeenCalledTimes(1)
  expect(controller.snapshot.failed).toBe(true)
  expect(controller.snapshot.rows).toHaveLength(2)
  translate.mockResolvedValue(["Chào.", "Một câu khác."])
  controller.configure(true, "vi", true)
  await tick()
  expect(controller.snapshot.failed).toBe(false)
  expect(controller.snapshot.rows.every((row) => row.state === "done")).toBe(true)
  controller.invalidate()
  expect(controller.snapshot.enabled).toBe(false)
  expect(controller.snapshot.rows.every((row) => !row.translation)).toBe(true)
  controller.dispose()
})
it("rewrites finalized speech without retaining a translation for a changed context", async () => {
  const translate = vi
    .fn<(...args: any[]) => any>()
    .mockImplementation(async (rows) => rows.map(() => "translated"))
  const controller = new LiveTranslationController(translate, () => {})
  controller.update("First.\n\nThird.")
  controller.configure(true, "vi")
  await tick()
  controller.update("First.\n\nSecond.\n\nThird.")
  await tick()
  expect(translate.mock.calls.at(-1)![0]).toEqual([
    { id: 8, source: "Second.", context: "First.\n\n" },
    { id: 17, source: "Third.", context: "First.\n\nSecond.\n\n" },
  ])
  controller.dispose()
})
