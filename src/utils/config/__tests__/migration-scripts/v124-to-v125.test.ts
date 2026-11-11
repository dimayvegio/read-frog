import { expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v124-to-v125"
it("upgrades only language fields while keeping private-provider references, prompts and fork settings intact", () => {
  const old = {
    language: { sourceCode: "auto", targetCode: "vie", level: "intermediate" },
    translationHub: { sourceCode: "eng", targetCode: "cmn-Hant" },
    inputTranslation: { fromLang: "sourceCode", toLang: "jpn" },
    tts: {
      provider: "openai",
      openai: { model: "gpt-4o-mini-tts", voice: "coral", speed: 1.25, instructions: "eng" },
      languageVoices: { eng: "en-US-AriaNeural", vie: "vi-VN-HoaiMyNeural", custom: "keep" },
    },
    providersConfig: [{ id: "my-openai", provider: "openai", model: "my-model", prompt: "vie" }],
    selectionToolbar: { customActions: [{ sampleData: { targetCode: "por", text: "eng" } }] },
    pageTranslation: {
      page: { skipLanguages: ["eng"], autoTranslateLanguages: ["cmn"], prompt: "jpn" },
    },
    videoSubtitles: { prefetch: 120, autoStart: { anipm: true, netflix: false } },
  }
  const before = structuredClone(old),
    next = migrate(old)
  expect(old).toEqual(before)
  expect(next.language.targetCode).toBe("vi")
  expect(next.inputTranslation).toEqual({ fromLang: "sourceCode", toLang: "ja" })
  expect(next.tts.languageVoices).toMatchObject({
    en: "en-US-AriaNeural",
    vi: "vi-VN-HoaiMyNeural",
    "pt-PT": "pt-PT-DuarteNeural",
    custom: "keep",
  })
  expect(next.tts.openai).toEqual(old.tts.openai)
  expect(next.providersConfig).toEqual(old.providersConfig)
  expect(next.videoSubtitles).toEqual(old.videoSubtitles)
  expect(next.selectionToolbar.customActions[0].sampleData).toEqual({
    targetCode: "pt-BR",
    text: "eng",
  })
  expect(next.pageTranslation.page).toEqual({
    skipLanguages: ["en"],
    autoTranslateLanguages: ["zh-Hans"],
    prompt: "jpn",
  })
  expect(migrate(next)).toEqual(next)
})
