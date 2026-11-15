import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  imageEditRequest,
  imageEditPng,
  imageEditPrompt,
} from "@/utils/image-translation/generated-schema"
import { executeImageEdit, handleImageEditPort } from "../generated-image"
const { key, config, finish } = vi.hoisted(() => ({
  key: { apiKey: "private-test-only", revision: 7 },
  config: { language: { targetCode: "vi" } },
  finish: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => {} }))
vi.mock("../openai-credentials", () => ({
  readOpenAIExecutionCredential: async () => ({ ...key }),
}))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: async () => config }))
vi.mock("../usage", () => ({ beginUsage: async () => ({ finish }) }))
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXsAAAAASUVORK5CYII="
const input = {
  image: `data:image/png;base64,${png}`,
  model: "gpt-image-2.6-sunburst" as const,
  quality: "high" as const,
  target: "vi",
  revision: 7,
}
const reply = () => new Response(JSON.stringify({ data: [{ b64_json: png }] }))
beforeEach(() => {
  key.apiKey = "private-test-only"
  key.revision = 7
  config.language.targetCode = "vi"
  finish.mockClear()
})
afterEach(() => vi.restoreAllMocks())
it("posts the selected image only to fixed OpenAI image edits and returns the unchanged PNG", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply())
  expect(await executeImageEdit(input)).toEqual({ image: input.image, width: 1, height: 1 })
  const [url, options] = fetcher.mock.calls[0]!
  expect(url).toBe("https://api.openai.com/v1/images/edits")
  expect(options).toMatchObject({
    method: "POST",
    credentials: "omit",
    redirect: "error",
    headers: { Authorization: "Bearer private-test-only" },
  })
  const body = JSON.parse(options!.body as string)
  expect(body).toMatchObject({
    model: input.model,
    quality: "high",
    output_format: "png",
    n: 1,
    size: "auto",
    images: [{ image_url: input.image }],
  })
  expect(body.prompt).toContain("Vietnamese")
  expect(JSON.stringify(await executeImageEdit(input))).not.toContain(key.apiKey)
  expect(finish).toHaveBeenCalledWith("complete")
})
it.each([401, 403, 404, 429, 500])(
  "uses safe HTTP %s messages and never retries or forwards provider text",
  async (status) => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("private-test-only raw-provider-body", { status }))
    await expect(executeImageEdit(input)).rejects.toThrow(`IE-HTTP-${status}`)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await expect(executeImageEdit(input)).rejects.not.toThrow("raw-provider-body")
  },
)
it("rejects stale credentials and language before a paid request", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch")
  key.revision++
  await expect(executeImageEdit(input)).rejects.toThrow("IE-KEY")
  key.revision = 7
  config.language.targetCode = "en"
  await expect(executeImageEdit(input)).rejects.toThrow("IE-TARGET")
  expect(fetcher).not.toHaveBeenCalled()
})
it("drops a late image after credential rotation", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    key.revision++
    return reply()
  })
  await expect(executeImageEdit(input)).rejects.toThrow("IE-STALE")
})
it("accepts only one completed streamed PNG, ignoring partial images", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        `event: image_edit.partial_image\ndata: {"type":"image_edit.partial_image","b64_json":"not-the-final-image"}\n\nevent: image_edit.completed\ndata: {"type":"image_edit.completed","b64_json":"${png}"}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      ),
    )
  expect(await executeImageEdit(input)).toMatchObject({ image: input.image })
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
    stream: true,
    partial_images: 0,
  })
})
it.each([
  'data: {"type":"image_edit.partial_image","b64_json":"unfinished"}\n\n',
  'data: {"type":"error","message":"private-test-only"}\n\n',
])("rejects incomplete/error image streams without a retry", async (raw) => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(raw, { headers: { "content-type": "text/event-stream" } }))
  await expect(executeImageEdit(input)).rejects.toThrow("IE-IMAGE")
  expect(fetcher).toHaveBeenCalledOnce()
})
it("bounds simultaneous jobs and releases slots on completion", async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await gate
    return reply()
  })
  const a = executeImageEdit(input),
    b = executeImageEdit(input)
  await expect(executeImageEdit(input)).rejects.toThrow("IE-BUSY")
  release()
  await Promise.all([a, b])
  await expect(executeImageEdit(input)).resolves.toMatchObject({ width: 1 })
})
it("never downloads a provider URL or accepts SVG", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: "https://other.invalid/file" }] })),
    )
  await expect(executeImageEdit(input)).rejects.toThrow("IE-IMAGE")
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(() => imageEditPng(btoa("<svg/>"))).toThrow("IE-IMAGE")
})
it("cancels the existing request without a retry", async () => {
  const control = new AbortController()
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    control.abort()
    options!.signal!.throwIfAborted()
    return reply()
  })
  await expect(executeImageEdit(input, { signal: control.signal })).rejects.toThrow("abort")
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it("accepts only bounded inline images and app-owned model/quality/target", () => {
  expect(imageEditRequest.safeParse({ ...input, endpoint: "https://other.invalid" }).success).toBe(
    false,
  )
  expect(
    imageEditRequest.safeParse({ ...input, image: "https://other.invalid/image.png" }).success,
  ).toBe(false)
  expect(imageEditRequest.safeParse({ ...input, target: "invalid" }).success).toBe(false)
  expect(
    imageEditRequest.safeParse({ ...input, model: DEFAULT_CONFIG.language.targetCode }).success,
  ).toBe(false)
  expect(imageEditPrompt("en")).toContain("English")
})
it("rejects untrusted pages before registering an image port", () => {
  const disconnect = vi.fn<() => void>()
  handleImageEditPort({
    sender: { id: "other", url: "https://example.org", frameId: 0 },
    disconnect,
  } as any)
  expect(disconnect).toHaveBeenCalledOnce()
})
