import path from "node:path"

const host = "#read-frog-live-transcript"
const shadow = (selector) => `pierce/${selector}`
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const box = (source) =>
  source.$eval(host, (node) => {
    const rect = node.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
async function drag(source, selector, dx, dy) {
  const bounds = await (await source.$(shadow(selector))).boundingBox()
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2
  await source.mouse.move(x, y)
  await source.mouse.down()
  await source.mouse.move(x + dx, y + dy, { steps: 8 })
  await source.mouse.up()
}
export async function checkYouTubeLiveView({
  source,
  live,
  worker,
  offEval,
  check,
  scratch,
  embedURL,
}) {
  await source.waitForSelector(host)
  await source.waitForFunction(
    () =>
      document
        .querySelector("#read-frog-live-transcript")
        ?.shadowRoot.querySelector("[data-live-pending]")
        ?.textContent.includes("Live partial words"),
    { polling: 100 },
  )
  check(
    "live capture auto-returns to the selected source with a passive partial transcript pane",
    await worker.evaluate(
      async (url) =>
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url === url,
      source.url(),
    ),
  )
  check(
    "opening the view makes no text-generation request",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  if (process.env.AUDIO_FAST_PROFILE)
    await worker.evaluate(async () => {
      const { config } = await chrome.storage.local.get("config")
      config.providersConfig[0].model.model = "gpt-6-luna"
      delete config.providersConfig[0].reasoning
      await chrome.storage.local.set({ config })
    })
  await source.evaluate(() => {
    window.__liveHost = document.querySelector("#read-frog-live-transcript")
  })
  await source.$eval(host, (node) => node.remove())
  await source.waitForSelector(host)
  check(
    "pinned source view restores the same React host after a Teams-like DOM removal",
    await source.evaluate(
      () => __liveHost === document.querySelector("#read-frog-live-transcript"),
    ),
  )
  await source.evaluate(() => window.ctx.suspend())
  await pause(1200)
  check(
    "silence never hides the pinned source view or ends tab capture",
    (await source.$eval(host, (node) => node.checkVisibility())) &&
      (await worker.evaluate(async () =>
        (await chrome.tabCapture.getCapturedTabs()).some((tab) => tab.status === "active"),
      )),
  )
  await source.evaluate(() => window.ctx.resume())
  const before = await box(source)
  await drag(source, "[data-sidebar-move]", -180, 40)
  const moved = await box(source)
  check(
    "pane can move without remounting the transcript",
    moved.x < before.x - 50 &&
      (await source.evaluate(
        () => __liveHost === document.querySelector("#read-frog-live-transcript"),
      )),
  )
  await drag(source, '[data-live-resize="se"]', 90, -60)
  const resized = await box(source)
  check(
    "pane resizes independently in width and height",
    resized.width > moved.width + 50 && resized.height < moved.height - 30,
  )
  await source.click(shadow('[aria-label="Thu gọn khung chép lời"]'))
  check(
    "minimizing hides content and retains recording",
    (await source.$eval(shadow(".live-body"), (node) => node.hidden)) &&
      (await worker.evaluate(async () =>
        (await chrome.tabCapture.getCapturedTabs()).some((tab) => tab.status === "active"),
      )),
  )
  await source.click(shadow('[aria-label="Mở rộng khung chép lời"]'))
  await source.click(shadow('[aria-label="Chữ lớn hơn"]'))
  check(
    "font controls apply immediately",
    await source.$eval(shadow(".live-text"), (node) => getComputedStyle(node).fontSize === "20px"),
  )
  check(
    "English and Vietnamese are the first target languages with dark readable options",
    await source.$$eval(
      shadow(".live-translation-controls option"),
      (nodes) => nodes[0].value === "en" && nodes[1].value === "vi",
    ),
  )
  await source.click(shadow(".live-translation-controls input"))
  await source.waitForFunction(
    () =>
      document
        .querySelector("#read-frog-live-transcript")
        ?.shadowRoot.querySelector(".live-translation-controls input")?.checked,
    { polling: 100 },
  )
  check("contextual translation checkbox stays enabled after the real source command", true)
  if (process.env.AUDIO_SPA_SOURCE) {
    check(
      "a SPA sender retaining its initial URL is authorized using its current browser frame and matching document ID",
      await worker.evaluate((url) => {
        const entry = __viewDiagnostics.at(-1)
        return (
          entry.url !== url &&
          entry.currentFrame.url === url &&
          entry.documentId === entry.currentFrame.documentId
        )
      }, source.url()),
    )
  }
  await pause(200)
  check(
    "translation opt-in still never sends provisional speech",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  await offEval(`__emitFinal('We are discussing a bank.')`)
  await source.waitForFunction(
    () =>
      document
        .querySelector("#read-frog-live-transcript")
        ?.shadowRoot.querySelector("[data-live-translation]")
        ?.textContent.includes("Ngân hàng"),
    { polling: 100 },
  )
  await offEval(`__emitFinal('It has branches for customers.')`)
  await source.waitForFunction(
    () =>
      [
        ...document
          .querySelector("#read-frog-live-transcript")
          .shadowRoot.querySelectorAll("[data-live-translation]"),
      ].filter((node) => node.textContent.includes("Ngân hàng")).length >= 2,
    { polling: 100 },
  )
  check(
    "final turns display paired source/translation using preceding original context",
    await worker.evaluate(() => {
      const body = __pdfCalls.at(-1).body
      const data = JSON.parse(
        body.input.flatMap((item) => item.content ?? []).find((part) => part.type === "input_text")
          .text,
      )
      return (
        data.targetLanguage === "Vietnamese" &&
        data.rows.some(
          (row) =>
            row.precedingContext.includes("discussing a bank") && row.source.includes("branches"),
        )
      )
    }),
  )
  if (process.env.AUDIO_FAST_PROFILE)
    check(
      "live-only low reasoning reaches the fixed Responses endpoint without changing saved defaults",
      await worker.evaluate(
        async () =>
          __pdfCalls.every(
            (call) => call.body.model === "gpt-6-luna" && call.body.reasoning?.effort === "low",
          ) &&
          (await chrome.storage.local.get("config")).config.providersConfig[0].reasoning ===
            undefined,
      ),
    )
  if (process.env.AUDIO_FACEBOOK) {
    await source.click(shadow(".live-translation-controls input"))
    await source.waitForFunction(
      () =>
        !document
          .querySelector("#read-frog-live-transcript")
          .shadowRoot.querySelector(".live-translation-controls input").checked,
    )
    const count = await worker.evaluate(() => __pdfCalls.length)
    await offEval(`__emitFinal('The bank has many more customers.')`)
    await source.waitForFunction(() =>
      document
        .querySelector("#read-frog-live-transcript")
        .shadowRoot.textContent.includes("many more customers"),
    )
    check(
      "accumulated speech remains untranslated while contextual translation is off",
      await worker.evaluate((n) => __pdfCalls.length === n, count),
    )
    await source.click(shadow(".live-translation-controls input"))
    await source.waitForFunction(
      () =>
        [
          ...document
            .querySelector("#read-frog-live-transcript")
            .shadowRoot.querySelectorAll("[data-live-translation]"),
        ].filter((node) => node.textContent.includes("Ngân hàng")).length >= 3,
    )
    check(
      "enabling translation after speech has accumulated translates the new final turn once",
      await worker.evaluate((n) => __pdfCalls.length === n + 1, count),
    )
  }
  const calls = await worker.evaluate(() => __pdfCalls.length)
  await source.click(shadow(".live-translation-controls input"))
  await source.waitForFunction(
    () =>
      !document
        .querySelector("#read-frog-live-transcript")
        .shadowRoot.querySelector(".live-translation-controls input").checked,
  )
  await source.click(shadow(".live-translation-controls input"))
  await source.waitForFunction(
    () =>
      document
        .querySelector("#read-frog-live-transcript")
        .shadowRoot.querySelector(".live-translation-controls input").checked,
  )
  await pause(200)
  check(
    "toggling or moving the view retains completed translations without paid repeat requests",
    await worker.evaluate((count) => __pdfCalls.length === count, calls),
  )
  await source.select(shadow('[aria-label="Ngôn ngữ bản dịch trực tiếp"]'), "en")
  await source.waitForFunction(
    () =>
      [
        ...document
          .querySelector("#read-frog-live-transcript")
          .shadowRoot.querySelectorAll("[data-live-translation]"),
      ].filter((node) => node.textContent.includes("The bank")).length >= 2,
    { polling: 100 },
  )
  check(
    "changing target uses English and replaces the old target output",
    await worker.evaluate(() => {
      const body = __pdfCalls.at(-1).body
      return (
        JSON.parse(
          body.input
            .flatMap((item) => item.content ?? [])
            .find((part) => part.type === "input_text").text,
        ).targetLanguage === "English"
      )
    }),
  )
  await source.select(shadow('[aria-label="Ngôn ngữ bản dịch trực tiếp"]'), "vi")
  await source.waitForFunction(
    () =>
      document
        .querySelector("#read-frog-live-transcript")
        .shadowRoot.querySelector("[data-live-translation]")
        .textContent.includes("Ngân hàng"),
    { polling: 100 },
  )
  check(
    "native CC is untouched by the separate audio transcript pane",
    await source.$eval("#native-cc", (node) => node.textContent === "Native CC unchanged"),
  )
  // User-gesture fullscreen, same shadow host reparented without losing capture/state.
  await source.click("#fullscreen")
  await source.waitForFunction(
    () =>
      document.querySelector("#read-frog-live-transcript")?.parentElement ===
      document.fullscreenElement,
    { polling: 100 },
  )
  check(
    "pane remains reachable in fullscreen without remounting",
    await source.evaluate(
      () => __liveHost === document.querySelector("#read-frog-live-transcript"),
    ),
  )
  await source.evaluate(() => document.exitFullscreen())
  await source.waitForFunction(() => !document.fullscreenElement, { polling: 100 })
  // An iframe/video is a replaced element: the view must use the parent top layer,
  // never append its shadow host into fallback children that cannot render.
  for (const tag of ["iframe", "video"]) {
    await source.evaluate(
      ({ frameTag, frameURL }) => {
        const target = document.createElement(frameTag)
        target.id = "fullscreen-replaced"
        if (frameTag === "iframe") target.src = frameURL
        Object.assign(target.style, {
          position: "fixed",
          left: "20px",
          top: "20px",
          width: "200px",
          height: "120px",
        })
        document.body.append(target)
        const button = document.createElement("button")
        button.id = "fullscreen-replaced-trigger"
        button.textContent = "Fullscreen " + frameTag
        Object.assign(button.style, {
          position: "fixed",
          left: "20px",
          top: "200px",
          zIndex: "2147483002",
        })
        button.onclick = () => target.requestFullscreen()
        document.body.append(button)
      },
      { frameTag: tag, frameURL: embedURL },
    )
    await source.click("#fullscreen-replaced-trigger")
    await source.waitForFunction(
      () =>
        document.fullscreenElement?.id === "fullscreen-replaced" &&
        document.querySelector("#read-frog-live-transcript")?.matches(":popover-open"),
      { polling: 100 },
    )
    await source.waitForSelector(shadow(".live-fullscreen-note"))
    check(
      "pane remains visible above fullscreen " + tag + " without child-frame access",
      await source.$eval("#read-frog-live-transcript", (h) => {
        return (
          h.parentElement === document.body &&
          h === window.__liveHost &&
          h.checkVisibility() &&
          h.shadowRoot.querySelector(".live-fullscreen-note").textContent.includes("Esc") &&
          [...h.shadowRoot.querySelectorAll("button")].every((button) => !button.checkVisibility())
        )
      }),
    )
    if (tag === "iframe") {
      const embedded = await source.waitForFrame((frame) => frame.url() === embedURL)
      await embedded.waitForSelector("#work")
      await embedded.click("#work")
      check(
        "native fullscreen transcript lets playback-frame clicks pass through",
        await embedded.$eval("#work", (node) => node.textContent === "Work: 1"),
      )
    }
    await source.evaluate(() => document.exitFullscreen())
    await source.waitForFunction(
      () =>
        !document.fullscreenElement &&
        !document.querySelector("#read-frog-live-transcript").hasAttribute("popover"),
      { polling: 100 },
    )
    await source.evaluate(() => {
      document.querySelector("#fullscreen-replaced").remove()
      document.querySelector("#fullscreen-replaced-trigger").remove()
    })
  }
  for (let i = 0; i < 80 && !(await offEval("__commitTimes.length>0")); i++) await pause(100)
  // Real wheel intent; later deltas must not pull the reader down.
  await offEval(`__pushPending(${JSON.stringify("A new provisional line.\n".repeat(150))})`)
  await source.waitForFunction(
    () =>
      document.querySelector("#read-frog-live-transcript").shadowRoot.querySelector(".live-text")
        .scrollHeight > 1500,
    { polling: 100 },
  )
  await source.$eval(shadow(".live-text"), (node) => {
    node.scrollTop = 0
    node.dispatchEvent(new Event("scroll"))
  })
  await source.waitForSelector(shadow(".follow"))
  await offEval(`__pushPending('Updated partial.')`)
  await pause(150)
  check(
    "new text respects manual scroll position",
    await source.$eval(shadow(".live-text"), (node) => node.scrollTop === 0),
  )
  await source.click(shadow(".follow"))
  await source.waitForFunction(
    () => {
      const node = document
        .querySelector("#read-frog-live-transcript")
        .shadowRoot.querySelector(".live-text")
      return node.scrollTop > 0
    },
    { polling: 100 },
  )
  check("follow-new-text button restores scrolling", true)
  // Restore a legible fixture view for a raw screenshot; model outputs remain mocks.
  await offEval(`__emitFinal('Live captions can be read while the video keeps playing.')`)
  await source.waitForFunction(
    () =>
      !document
        .querySelector("#read-frog-live-transcript")
        .shadowRoot.querySelector("[data-live-pending]"),
    { polling: 100 },
  )
  await source.waitForFunction(
    () =>
      [
        ...document
          .querySelector("#read-frog-live-transcript")
          .shadowRoot.querySelectorAll("[data-live-translation]"),
      ].every((node) => node.textContent.includes("Ngân hàng")),
    { polling: 100 },
  )
  await source.click(shadow('[aria-label="Đặt lại vị trí khung"]'))
  await source.screenshot({
    path: path.join(scratch, "source-live-bilingual.png"),
    fullPage: true,
  })
  await source.$eval(shadow("footer button"), (node) => node.click())
  await live.waitForFunction(() => document.visibilityState === "visible", { polling: 100 })
  check(
    "pane opens the existing Audio owner without starting another capture",
    await worker.evaluate(() => __audioCalls.filter((call) => call.kind === "secret").length === 1),
  )
  await source.bringToFront()
  for (
    let i = 0;
    i < 100 &&
    !(await offEval(
      "__commitTimes.some((at,i)=>{const gap=at-(i?__commitTimes[i-1]:__openedAt);return gap>=5000&&gap<7500})",
    ));
    i++
  )
    await pause(100)
  check(
    "continuous source speech commits within the six-second local cap instead of fifteen seconds",
    await offEval(
      "__commitTimes.some((at,i)=>{const gap=at-(i?__commitTimes[i-1]:__openedAt);return gap>=5000&&gap<7500})",
    ),
  )
  await offEval(`__replyText='Live finalized words.'`)
}
