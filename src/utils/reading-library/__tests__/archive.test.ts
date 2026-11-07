import JSZip from "jszip"
import { describe, it, expect } from "vitest"
import { readReadingArchive, writeReadingArchive } from "../archive"
import { bundleFixture } from "./fixtures"
describe("portable reading ZIP1", () => {
  it("reads historical speech metadata independently of the current runtime model list", async () => {
    const bundle = await bundleFixture()
    bundle.passages[0]!.speech = {
      model: "retired-model-name",
      voice: "legacy-voice",
      speed: 1,
      instructions: "",
    }
    const restored = await readReadingArchive(await writeReadingArchive(bundle))
    expect(restored.passages[0]!.speech?.model).toBe("retired-model-name")
    expect(restored.assets).toHaveLength(1)
  })
  it("round-trips complete passages and deduplicated MP3; recordings require opt-in", async () => {
    const bundle = await bundleFixture()
    const plain = await readReadingArchive(await writeReadingArchive(bundle))
    expect(plain.passages[0]!.pairs[0]!.recording).toBeNull()
    expect(plain.assets).toHaveLength(1)
    const full = await readReadingArchive(await writeReadingArchive(bundle, true))
    expect(full).toEqual(bundle)
    const zip = await JSZip.loadAsync(await writeReadingArchive(bundle, true))
    expect(Object.keys(zip.files).sort()).toEqual(
      ["manifest.json", ...bundle.assets.map((asset) => `audio/${asset.id}`)].sort(),
    )
  })
  it("refuses foreign ZIPs, paths, incorrect audio hashes and unknown metadata fields", async () => {
    await expect(readReadingArchive(new Uint8Array(22))).rejects.toThrow(/ZIP/)
    const source = await writeReadingArchive(await bundleFixture(), true),
      zip = await JSZip.loadAsync(source)
    zip.file("../credential.json", "secret")
    await expect(
      readReadingArchive(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/lạ/)
    const wrong = await JSZip.loadAsync(source),
      name = Object.keys(wrong.files).find((key) => key.startsWith("audio/"))!
    wrong.file(name, new Uint8Array([1, 2, 3]), { createFolders: false })
    await expect(
      readReadingArchive(await wrong.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/Audio/)
    const metadata = await JSZip.loadAsync(source),
      manifest = JSON.parse(await metadata.file("manifest.json")!.async("string"))
    manifest.apiKey = "not-allowed"
    metadata.file("manifest.json", JSON.stringify(manifest))
    await expect(
      readReadingArchive(await metadata.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/Unrecognized|apiKey/)
  })
  it("bounds actual inflation and checks CRC without trusting declared ZIP sizes", async () => {
    const source = await writeReadingArchive(await bundleFixture()),
      under = source.slice(),
      view = new DataView(under.buffer)
    let cursor = 0
    while (cursor + 46 < under.length && view.getUint32(cursor, true) !== 0x02014b50) cursor++
    expect(cursor + 46).toBeLessThan(under.length)
    view.setUint32(cursor + 24, 1, true)
    await expect(readReadingArchive(under)).rejects.toThrow(/vượt khai báo/)
    const corrupt = source.slice(),
      check = new DataView(corrupt.buffer)
    check.setUint32(cursor + 16, 0, true)
    await expect(readReadingArchive(corrupt)).rejects.toThrow(/CRC32/)
  })
})
