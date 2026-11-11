import { expect, it } from "vitest"
import { LiveTurnGate } from "../turn-gate"

it("commits a voiced pause after 500ms while retaining a six-second continuous-speech cap", () => {
  const paused = new LiveTurnGate(0),
    continuous = new LiveTurnGate(0)
  const pauses: number[] = [],
    caps: number[] = []
  for (let now = 0; now <= 12000; now += 50) {
    if (paused.push(now < 1000 ? 0.1 : 0, now) === "commit") pauses.push(now)
    if (continuous.push(0.1, now) === "commit") caps.push(now)
  }
  expect(pauses).toEqual([1500])
  expect(caps).toEqual([6000, 12000])
})
it("clears silence without inventing a transcript and uses elapsed audio time after delayed polling", () => {
  const silent = new LiveTurnGate(0)
  expect(silent.push(0, 6000)).toBe("clear")
  expect(silent.push(0, 6100)).toBeNull()
  const delayed = new LiveTurnGate(1000)
  delayed.push(0.1, 1100)
  delayed.push(0.1, 1200)
  expect(delayed.push(0.1, 7500)).toBe("commit")
  expect(delayed.push(0.1, 7501)).toBeNull()
  expect(delayed.push(NaN, 14000)).toBeNull()
})
