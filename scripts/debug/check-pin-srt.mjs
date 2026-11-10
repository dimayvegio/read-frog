import fs from "node:fs/promises"
import path from "node:path"
import JSZip from "jszip"
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export async function checkPinAndSrt({ page, browser, worker, check, downloads, scratch }) {
  const calls = await worker.evaluate(() => __audioCalls.length)
  await page.select('[aria-label="Đầu ra file audio"]', "subtitles")
  await page.select('[aria-label="Ngôn ngữ file SRT"]', "vi")
  check(
    "selecting timed output is explicit and makes no paid call",
    await worker.evaluate((count) => __audioCalls.length === count, calls),
  )
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Chép lời lại (có tính phí)")
      .click(),
  )
  await page.waitForFunction(
    () =>
      document.querySelector("[data-download-srt]") &&
      !document.querySelector("[data-download-srt]").disabled,
  )
  check(
    "file subtitles use one Whisper verbose JSON request with a single language and no stream",
    await worker.evaluate(() => {
      const call = __audioCalls.at(-1)
      return (
        call.model === "whisper-1" &&
        call.responseFormat === "verbose_json" &&
        call.language === "vi" &&
        call.stream === null &&
        call.timestamps.join() === "segment" &&
        call.name === "audio.wav"
      )
    }),
  )
  await page.click("[data-download-srt]")
  for (
    let i = 0;
    i < 50 && !(await fs.readdir(downloads)).some((name) => name.endsWith(".srt"));
    i++
  )
    await pause(100)
  const file = await fs.readFile(path.join(downloads, "private-local-name.srt"), "utf8")
  check(
    "SRT download keeps API cue gaps, millisecond timestamps and UTF-8 text",
    file.includes("00:00:00,125 --> 00:00:00,450") &&
      file.includes("00:00:00,700 --> 00:00:00,950") &&
      file.includes("Xin chào."),
  )
  await page.$eval(".result", (node) => {
    node.value = "Edited plain text"
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
  // React controlled textarea input must use the native value setter.
  await page.$eval(".result", (node) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
      node,
      "Edited plain text!",
    )
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await page.waitForFunction(() => document.querySelector("[data-download-srt]").disabled)
  check("plain text edits cannot silently invalidate or fabricate subtitle timing", true)
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Khôi phục văn bản có timing")
      .click(),
  )
  await page.waitForFunction(() => !document.querySelector("[data-download-srt]").disabled)
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Tải TXT/SRT trong ZIP")
      .click(),
  )
  for (
    let i = 0;
    i < 50 && !(await fs.readdir(downloads)).some((name) => name.endsWith(".zip"));
    i++
  )
    await pause(100)
  const zip = await JSZip.loadAsync(
    await fs.readFile(path.join(downloads, "ReadFrog-Transcripts.zip")),
    { checkCRC32: true },
  )
  check(
    "explicit archive includes matching TXT and SRT without a second transcription",
    Object.keys(zip.files).some((name) => name.endsWith(".srt")) &&
      Object.keys(zip.files).some((name) => name.endsWith(".txt")) &&
      (await worker.evaluate((count) => __audioCalls.length === count + 1, calls)),
  )
  await page.click("[data-pin-audio]")
  await page.waitForFunction(() =>
    window.documentPictureInPicture?.window?.document
      .querySelector("[data-pinned-final]")
      ?.textContent.includes("Xin chào"),
  )
  check(
    "the actual browser opens an owner-bound Document Picture-in-Picture transcript",
    await page.evaluate(() =>
      Boolean(documentPictureInPicture.window && !documentPictureInPicture.window.closed),
    ),
  )
  const other = await browser.newPage()
  await other.goto("about:blank")
  await pause(500)
  check(
    "pinned transcript remains open while the owner is backgrounded, without a model call",
    (await page.evaluate(() =>
      Boolean(documentPictureInPicture.window && !documentPictureInPicture.window.closed),
    )) && (await worker.evaluate((count) => __audioCalls.length === count + 1, calls)),
  )
  await other.close()
  await page.bringToFront()
  await page.screenshot({ path: path.join(scratch, "audio-srt-controls.png"), fullPage: true })
  await page.evaluate(() => documentPictureInPicture.window.close())
  await page.waitForFunction(() => !documentPictureInPicture.window)
  check(
    "closing the pinned window leaves the original Audio page and result intact",
    await page.$eval(".result", (node) => node.value.includes("Xin chào")),
  )
  await page.select('[aria-label="Đầu ra file audio"]', "text")
}
