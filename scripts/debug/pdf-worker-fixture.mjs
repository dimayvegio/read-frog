export const preparePdfWorker = async () => {
  const { config } = await chrome.storage.local.get("config")
  config.language.targetCode = "vie"
  config.uiLanguage = "en"
  config.glossary.enabled = false
  config.providersConfig[0].model.model = "gpt-4o-mini"
  await chrome.storage.local.set({ config })
  await new Promise((resolve, reject) => {
    const request = indexedDB.open("edge-openai-credentials")
    request.onerror = reject
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction("credentialState", "readwrite")
      tx.objectStore("credentialState").put({
        id: "openai",
        state: "active",
        apiKey: "pdf-reading-test-sentinel",
        revision: 1000,
        updatedAt: Date.now(),
        legacyImportAllowed: false,
      })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
    }
  })
  globalThis.__pdfCalls = []
  globalThis.__pdfOffline = false
  globalThis.__pdfDelay = 0
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init),
      body = await request.json()
    if (request.url !== "https://api.openai.com/v1/responses")
      throw new Error("Unexpected API request")
    __pdfCalls.push({
      url: request.url,
      body,
      authorization: request.headers.get("authorization"),
    })
    if (__pdfOffline) throw new Error("Offline fixture")
    const imageInput = body.input?.some(
      (item) =>
        Array.isArray(item.content) && item.content.some((part) => part.type === "input_image"),
    )
    const pair =
      imageInput &&
      body.text?.format?.schema?.properties?.original &&
      body.text?.format?.schema?.properties?.translation
    const original =
      globalThis.__imageOutput ?? "Read Frog image fixture.\nRemember the words you learn."
    const output = pair
        ? (globalThis.__quickOutput ??
          JSON.stringify({
            original,
            translation: original ? "Bản dịch nhanh một lượt. Ghi nhớ những từ bạn học." : "",
          }))
        : imageInput
          ? (globalThis.__imageOutput ?? "Read Frog image fixture.\nRemember the words you learn.")
          : `Bản dịch PDF số ${__pdfCalls.length}. Đây là văn bản tiếng Việt có dấu.`,
      delay = __pdfDelay
    const response = {
      id: "resp_pdf",
      object: "response",
      created_at: 1,
      status: "completed",
      model: body.model,
      output: [
        {
          id: "msg_pdf",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: output, annotations: [], logprobs: [] }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 30,
        total_tokens: 40,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    }
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    if (!body.stream)
      return new Response(JSON.stringify(response), {
        headers: { "content-type": "application/json" },
      })
    const events = [
      {
        type: "response.created",
        response: { id: response.id, created_at: 1, model: body.model },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "message", id: "msg_pdf" },
      },
      { type: "response.output_text.delta", item_id: "msg_pdf", output_index: 0, delta: output },
      { type: "response.output_item.done", output_index: 0, item: response.output[0] },
      { type: "response.completed", response },
    ]
    return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""), {
      headers: { "content-type": "text/event-stream" },
    })
  }
}
