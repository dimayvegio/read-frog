import { describe, expect, it, vi } from "vitest"
import { SentenceStudyPlayer, type StudyMedia } from "../sentence-study"
function fixture() {
  const media: StudyMedia = {
    currentTime: 0.2,
    paused: false,
    pause: vi.fn<() => void>(() => {
      media.paused = true
    }),
    play: vi.fn<() => Promise<void>>(async () => {
      media.paused = false
    }),
  }
  const changed = vi.fn<(index: number) => void>(),
    player = new SentenceStudyPlayer(
      media,
      [
        { start: 0, end: 1000 },
        { start: 1200, end: 2200 },
        { start: 3000, end: 4000 },
      ],
      changed,
    )
  player.tick()
  return { media, player, changed }
}
describe("opt-in sentence playback", () => {
  it("does not jump back and pause the preceding sentence after a browser-rounded fractional seek", () => {
    const { media } = fixture()
    let clock = 0
    Object.defineProperty(media, "currentTime", {
      get: () => clock,
      set: (value: number) => {
        clock = Math.floor(value * 1000000) / 1000000
      },
    })
    const boundary = (2000 * 4) / 11
    const player = new SentenceStudyPlayer(
      media,
      [
        { start: 0, end: boundary },
        { start: boundary, end: 2000 },
      ],
      () => {},
    )
    player.preferences(1, true)
    player.tick()
    player.command("next")
    player.seeking()
    player.seeked()
    player.tick()
    expect(player.index).toBe(1)
    media.currentTime = 0.75
    player.tick()
    expect(player.index).toBe(1)
    expect(media.pause).not.toHaveBeenCalled()
  })
  it("keeps the current repeat count and paused boundary when AI appends more prepared sentences", () => {
    const { media, player } = fixture()
    player.preferences(2, true)
    media.currentTime = 1.01
    player.tick()
    player.seeked()
    player.updateCues([
      { start: 0, end: 1000 },
      { start: 1200, end: 2200 },
      { start: 3000, end: 4000 },
      { start: 4500, end: 5500 },
    ])
    media.currentTime = 1.01
    player.tick()
    expect(media.pause).toHaveBeenCalledTimes(1)
    expect(media.currentTime).toBe(0.97)
  })
  it("observes time without changing playback by default", () => {
    const { media, player } = fixture()
    media.currentTime = 1.05
    player.tick()
    expect(media.pause).not.toHaveBeenCalled()
    expect(media.play).not.toHaveBeenCalled()
  })
  it("repeats a line exactly the selected number and pauses inside its end", () => {
    const { media, player } = fixture()
    player.preferences(3, true)
    for (let pass = 1; pass <= 3; pass++) {
      media.currentTime = 1.01
      player.tick()
      player.seeking()
      player.seeked()
      expect(media.pause).toHaveBeenCalledTimes(pass === 3 ? 1 : 0)
      expect(media.currentTime).toBe(pass === 3 ? 0.97 : 0)
    }
    player.tick()
    expect(player.index).toBe(0)
  })
  it("does not trap manual play at a line already paused", async () => {
    const { media, player } = fixture()
    player.preferences(1, true)
    media.currentTime = 1.01
    player.tick()
    player.seeked()
    await media.play()
    media.currentTime = 1.25
    player.tick()
    expect(player.index).toBe(1)
    expect(media.pause).toHaveBeenCalledTimes(1)
  })
  it("follows manual seeks without looping the previous cue", () => {
    const { media, player } = fixture()
    player.preferences(3, true)
    media.currentTime = 1.4
    player.seeking()
    player.tick()
    expect(player.index).toBe(1)
    expect(media.currentTime).toBe(1.4)
    expect(media.pause).not.toHaveBeenCalled()
  })
  it("previous/replay/next clamp at boundaries and explicitly play", () => {
    const { media, player } = fixture()
    player.command("previous")
    expect(media.currentTime).toBe(0)
    player.command("next")
    expect(media.currentTime).toBe(1.2)
    player.command("replay")
    expect(media.currentTime).toBe(1.2)
    player.command("next")
    player.command("next")
    expect(media.currentTime).toBe(3)
    expect(media.play).toHaveBeenCalledTimes(5)
  })
  it("ignores invalid cues and stays safe with an empty track", () => {
    const { media } = fixture(),
      player = new SentenceStudyPlayer(
        media,
        [{ start: 3, end: 2 }],
        vi.fn<(index: number) => void>(),
      )
    player.tick()
    player.command("next")
    expect(player.index).toBe(-1)
  })
  it("replays the last caption after seeking beyond the track", () => {
    const { media, player } = fixture()
    media.currentTime = 60
    player.seeking()
    player.seeked()
    player.command("replay")
    expect(media.currentTime).toBe(3)
    player.command("previous")
    expect(media.currentTime).toBe(1.2)
  })
  it("looks up a long track without changing source cue objects", () => {
    const { media } = fixture(),
      cues = Array.from({ length: 20000 }, (_, n) => ({ start: n * 1000, end: n * 1000 + 900 }))
    const copy = structuredClone(cues),
      player = new SentenceStudyPlayer(media, cues, vi.fn<(index: number) => void>())
    media.currentTime = 18000.1
    player.tick()
    expect(player.index).toBe(18000)
    expect(cues).toEqual(copy)
  })
})
