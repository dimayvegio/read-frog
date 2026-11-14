// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { QuickDictionaryPopover, type QuickWordTarget } from "../quick-dictionary"

const { send } = vi.hoisted(() => ({ send: vi.fn<(...args: any[]) => any>() }))
vi.mock("@/utils/message", () => ({ sendMessage: send }))

vi.mock("@/hooks/use-text-to-speech", () => ({
  useTextToSpeech: () => ({
    play: () => Promise.resolve(),
    stop: () => {},
    isFetching: false,
    isPlaying: false,
  }),
  selectTTSVoice: () => undefined,
}))
const mockTarget: QuickWordTarget = {
  word: "architecture",
  rect: { top: 200, bottom: 220, left: 100, right: 180, width: 80, height: 20 },
  context: "The system architecture is designed for scale.",
  page: 1,
}

describe("QuickDictionaryPopover", () => {
  it("renders target word and close button", () => {
    send.mockResolvedValue({ words: [] })
    const onClose = vi.fn<(...args: any[]) => any>()

    render(
      <QuickDictionaryPopover
        target={mockTarget}
        documentId={"a".repeat(64)}
        documentTitle="Spec.pdf"
        config={DEFAULT_CONFIG}
        onClose={onClose}
      />,
    )

    expect(screen.getByText("architecture")).toBeDefined()
    const closeBtn = screen.getByLabelText("pdfReader.quickDictClose")
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose when pressing Escape key", () => {
    send.mockResolvedValue({ words: [] })
    const onClose = vi.fn<(...args: any[]) => any>()

    render(
      <QuickDictionaryPopover
        target={mockTarget}
        documentId={"a".repeat(64)}
        documentTitle="Spec.pdf"
        config={DEFAULT_CONFIG}
        onClose={onClose}
      />,
    )

    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })
})
