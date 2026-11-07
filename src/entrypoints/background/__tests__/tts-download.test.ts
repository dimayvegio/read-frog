import { it, expect, vi, afterEach } from "vitest"
import { browser } from "#imports"
import { encodeSpeechMp3 } from "@/utils/tts-playback/mp3-download"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { downloadTTSMp3 } from "../tts-download"

afterEach(() => vi.restoreAllMocks())
it("only saves validated MP3 for extension callers, using an explicit Save dialog and a path-free filename", async () => {
  const save = vi.spyOn(browser.downloads, "download").mockResolvedValue(undefined)
  const bytes = await encodeSpeechMp3([wavFixture()], new AbortController().signal)
  const audioBase64 = Buffer.from(bytes).toString("base64")
  await expect(downloadTTSMp3({ audioBase64 }, "another-extension")).rejects.toThrow(/sender/)
  await expect(
    downloadTTSMp3(
      { audioBase64: Buffer.from(wavFixture()).toString("base64") },
      browser.runtime.id,
    ),
  ).rejects.toThrow(/MP3/)
  await expect(downloadTTSMp3({ audioBase64: "#invalid" }, browser.runtime.id)).rejects.toThrow(
    /Invalid/,
  )
  expect(save).not.toHaveBeenCalled()
  expect(await downloadTTSMp3({ audioBase64 }, browser.runtime.id)).toEqual({ saved: true })
  expect(save).toHaveBeenCalledWith({
    url: `data:audio/mpeg;base64,${audioBase64}`,
    filename: expect.stringMatching(/^ReadFrog-OpenAI-TTS-[\dTZ-]+\.mp3$/),
    saveAs: true,
    conflictAction: "uniquify",
  })
  save.mockRejectedValueOnce(new Error("User canceled"))
  expect(await downloadTTSMp3({ audioBase64 }, browser.runtime.id)).toEqual({ saved: false })
  save.mockRejectedValueOnce(new Error("private error"))
  await expect(downloadTTSMp3({ audioBase64 }, browser.runtime.id)).rejects.toThrow(
    /^Unable to save MP3 audio$/,
  )
})
