import { liveQuery } from "dexie"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTextToSpeech } from "@/hooks/use-text-to-speech"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { sendMessage } from "@/utils/message"
import { preparePracticeWav } from "@/utils/pronunciation/audio"
import { pronunciationDB, pronunciationEpoch } from "@/utils/pronunciation/db"
import { pronunciationReport } from "@/utils/pronunciation/report"
import {
  criterionKeys,
  criterionLabels,
  PRONUNCIATION_MODEL,
  PRONUNCIATION_PORT,
  referenceSchema,
  referenceKey,
  wordTokens,
  type PronunciationAttempt,
  type PronunciationResult,
} from "@/utils/pronunciation/schema"
import { ShadowRecorder } from "@/utils/reading-library/recorder"

function download(text: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime })),
    link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Chưa thực hiện được. Hãy thử lại."
export function PronunciationPractice() {
  const [text, setText] = useState("")
  const [context, setContext] = useState("")
  const [capture, setCapture] = useState("")
  const [ready, setReady] = useState(false)
  const [recordState, setRecordState] = useState<"idle" | "requesting" | "recording">("idle")
  const [elapsed, setElapsed] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [wav, setWav] = useState("")
  const [recordURL, setRecordURL] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<PronunciationResult | null>(null)
  const [history, setHistory] = useState<PronunciationAttempt[]>([])
  const [clearArmed, setClearArmed] = useState(false)
  const [stopOnSilence, setStopOnSilence] = useState(true)
  const ownAudio = useRef<HTMLAudioElement | null>(null)
  const generation = useRef(0),
    request = useRef<AbortController | null>(null),
    epoch = useRef<number | null>(null)
  const [recorder] = useState(
    () =>
      new ShadowRecorder((state) => {
        setRecordState(state)
        if (state === "recording") setElapsed(0)
      }, 30000),
  )
  const ttsConfig = useAtomValue(configFieldsAtomMap.tts)
  const { play, stop, isPlaying, isFetching } = useTextToSpeech()
  const valid = referenceSchema.safeParse(text).success
  const currentReference = referenceKey(text, context)
  const matching = history.filter((row) => row.referenceKey === currentReference)
  const pastReferences = [
    ...new Map(history.map((row) => [row.referenceKey, row])).values(),
  ].reverse()
  const previous = result
    ? matching
        .filter(
          (row) =>
            row.id !== result.attempt.id &&
            row.model === result.attempt.model &&
            row.score !== null &&
            row.createdAt < result.attempt.createdAt,
        )
        .at(-1)
    : undefined
  const sentences = useMemo(
    () =>
      [...new Intl.Segmenter("en-US", { granularity: "sentence" }).segment(capture)]
        .map((part) => ({ text: part.segment.trim(), offset: part.index }))
        .filter((part) => !!part.text),
    [capture],
  )
  const cancel = useCallback(() => {
    generation.current++
    request.current?.abort()
    request.current = null
    recorder.stop(true)
    setBusy(false)
    setPreparing(false)
  }, [recorder])
  function resetRecording() {
    cancel()
    setWav("")
    setRecordURL("")
    setResult(null)
    setMessage("")
  }
  useEffect(
    () => () => {
      if (recordURL) URL.revokeObjectURL(recordURL)
    },
    [recordURL],
  )
  useEffect(() => {
    const subscription = liveQuery(async () => ({
      epoch: await pronunciationEpoch(),
      rows: await pronunciationDB.attempts.orderBy("createdAt").toArray(),
    })).subscribe({
      next: (snapshot) => {
        if (epoch.current !== null && snapshot.epoch !== epoch.current) {
          cancel()
          setResult(null)
          setMessage("Lịch sử đã xóa. Kết quả đang chấm đã hủy.")
        }
        epoch.current = snapshot.epoch
        setHistory(snapshot.rows)
      },
      error: () => setMessage("Không đọc được lịch sử trên máy. Kiểm tra dung lượng lưu trữ."),
    })
    let active = true
    const channel = new URL(location.href).searchParams.get("channel")
    void (channel ? sendMessage("consumePronunciationCapture", { channel }) : Promise.resolve(null))
      .then((value) => {
        if (!active) return
        if (value) {
          setCapture(value.text)
          setText(value.text)
          setContext(value.context)
        } else if (channel) setMessage("Đoạn chọn đã hết hạn. Dán lại câu tiếng Anh để luyện.")
      })
      .catch(() => {
        if (active) setMessage("Không lấy được đoạn chọn. Bạn có thể dán câu tiếng Anh.")
      })
      .finally(() => {
        if (active) setReady(true)
      })
    const close = () => {
      generation.current++
      request.current?.abort()
      recorder.stop(true)
    }
    window.addEventListener("pagehide", close)
    return () => {
      active = false
      close()
      subscription.unsubscribe()
      window.removeEventListener("pagehide", close)
    }
  }, [recorder, cancel])
  useEffect(() => {
    if (recordState !== "recording") return undefined
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(interval)
  }, [recordState])
  async function record() {
    resetRecording()
    stop()
    ownAudio.current?.pause()
    const run = generation.current
    let stoppedOnSilence = false
    try {
      const asset = await recorder.start({
        stopOnSilence,
        onSilenceStop: () => {
          stoppedOnSilence = true
          if (run === generation.current)
            setMessage("Đã tự dừng sau khi nói và im lặng khoảng 1,5 giây.")
        },
        onSilenceUnavailable: () => {
          if (run === generation.current)
            setMessage(
              "Tự dừng chưa khả dụng trên thiết bị này. Bấm Dừng khi nói xong; giới hạn 30 giây vẫn hoạt động.",
            )
        },
      })
      if (!asset || run !== generation.current) return
      setPreparing(true)
      const converted = await preparePracticeWav(
        asset.bytes.buffer.slice(
          asset.bytes.byteOffset,
          asset.bytes.byteOffset + asset.bytes.byteLength,
        ) as ArrayBuffer,
      )
      if (run !== generation.current) return
      setWav(converted)
      setRecordURL(
        URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.type })),
      )
      setMessage(
        (stoppedOnSilence ? "Đã tự dừng sau khoảng 1,5 giây im lặng. " : "Đã thu trên máy. ") +
          "Nghe lại rồi bấm Chấm phát âm để gửi bản thu này tới OpenAI.",
      )
    } catch (e) {
      if (run === generation.current) setMessage(messageOf(e))
    } finally {
      if (run === generation.current) setPreparing(false)
    }
  }
  async function assess() {
    if (!valid || !wav || busy) return
    request.current?.abort()
    const controller = new AbortController(),
      run = ++generation.current
    request.current = controller
    setBusy(true)
    setResult(null)
    setMessage("")
    stop()
    ownAudio.current?.pause()
    try {
      const response = await createPortStreamPromise<PronunciationResult>(
        PRONUNCIATION_PORT,
        { text, context, wav },
        { signal: controller.signal },
      )
      if (
        controller.signal.aborted ||
        run !== generation.current ||
        (epoch.current !== null && response.epoch !== epoch.current)
      )
        return
      setResult(response)
      setMessage(
        response.cached
          ? "Dùng lại kết quả bản thu này; không gửi lại và không tăng số lần thử."
          : response.saved
            ? "Đã lưu nhận xét trên máy. Bản ghi âm không được lưu trong lịch sử."
            : "Đã chấm nhưng lịch sử đầy hoặc không lưu được. Xuất báo cáo rồi xóa lịch sử để tiếp tục lưu.",
      )
    } catch (e) {
      if (!controller.signal.aborted && run === generation.current) setMessage(messageOf(e))
    } finally {
      if (run === generation.current) {
        setBusy(false)
        request.current = null
      }
    }
  }
  function listen() {
    if (!valid) return
    if (isPlaying || isFetching) {
      stop()
      return
    }
    ownAudio.current?.pause()
    const us = {
      ...ttsConfig,
      openai: {
        ...ttsConfig.openai,
        instructions:
          "Read the English practice text in clear, natural General American English. Use American word stress and rhythm, with a rhotic r. Do not translate or add commentary.",
      },
    }
    void play(text, us).catch(() => setMessage("Chưa nghe được mẫu. Kiểm tra cấu hình TTS."))
  }
  const feedback = result?.attempt.feedback
  return (
    <main className="pronunciation-app">
      <header>
        <div>
          <small>READ FROG · GENERAL AMERICAN</small>
          <h1>Phát âm</h1>
        </div>
        <a href="#history">Lịch sử</a>
      </header>
      <p className="muted">
        Điểm AI ước lượng <b>0–10, bước 0,5</b>. Ưu tiên rõ nghĩa, trọng âm và nhịp tự nhiên; chấp
        nhận các biến thể giọng Mỹ thông dụng.
      </p>
      <section aria-labelledby="reference-title">
        <h2 id="reference-title">1. Chọn đoạn đọc</h2>
        {sentences.length > 1 && (
          <label>
            Chọn một câu ngắn
            <select
              aria-label="Chọn câu"
              defaultValue=""
              onChange={(e) => {
                const i = Number(e.target.value)
                if (Number.isInteger(i) && sentences[i]) {
                  resetRecording()
                  setText(sentences[i].text)
                }
              }}
            >
              <option value="" disabled>
                Chọn câu từ đoạn đã bôi đen
              </option>
              {sentences.map((sentence, i) => (
                <option key={sentence.offset} value={i}>
                  {sentence.text.slice(0, 140)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Tiếng Anh cần luyện
          <textarea
            id="practice-text"
            rows={3}
            value={text}
            maxLength={20000}
            disabled={!ready || busy || recordState !== "idle" || preparing}
            onChange={(e) => {
              resetRecording()
              setText(e.target.value)
            }}
          />
        </label>
        <p className={valid ? "muted" : "validation"}>
          {wordTokens(text).length}/80 từ · tối đa 1.200 ký tự và 30 giây.{" "}
          {valid ? "Có thể sửa câu trước khi thu." : "Chọn một từ hoặc câu tiếng Anh ngắn hơn."}
        </p>
        <details>
          <summary>Ngữ cảnh để phân biệt cách đọc (tùy chọn)</summary>
          <textarea
            aria-label="Ngữ cảnh"
            rows={2}
            maxLength={2000}
            value={context}
            disabled={busy || recordState !== "idle" || preparing}
            onChange={(e) => {
              resetRecording()
              setContext(e.target.value)
            }}
          />
          <p className="muted">
            Ví dụ: “I read it yesterday” giúp phân biệt cách đọc của “read”. Ngữ cảnh cũng được gửi
            khi chấm.
          </p>
        </details>
        <div className="actions">
          <button
            type="button"
            disabled={!valid || busy || recordState !== "idle" || preparing}
            onClick={listen}
          >
            {isPlaying || isFetching ? "Dừng mẫu" : "Nghe mẫu giọng Mỹ"}
          </button>
          <span className="muted">
            {ttsConfig.provider === "openai" ? "OpenAI TTS" : "Microsoft en-US"}
          </span>
        </div>
      </section>
      <section aria-labelledby="record-title">
        <h2 id="record-title">2. Thu và chấm</h2>
        <label className="auto-stop-option">
          <input
            type="checkbox"
            id="auto-stop-recording"
            checked={stopOnSilence}
            disabled={busy || preparing || recordState !== "idle"}
            onChange={(event) => setStopOnSilence(event.target.checked)}
          />
          Tự dừng khi nói xong
        </label>
        <p className="muted">
          Dừng sau khoảng 1,5 giây im lặng khi đã nhận được tiếng nói. Vẫn có thể bấm Dừng thủ công;
          tự dừng không tự gửi chấm.
        </p>
        <div className="actions">
          <button
            type="button"
            id="record-practice"
            disabled={!ready || !valid || busy || preparing}
            onClick={() => {
              if (recordState !== "idle") recorder.stop()
              else void record()
            }}
          >
            {recordState === "requesting"
              ? "Hủy mở micro"
              : recordState === "recording"
                ? `Dừng thu · ${elapsed}s / 30s`
                : wav
                  ? "Thu lại"
                  : "Thu âm"}
          </button>
          <button
            type="button"
            id="assess-practice"
            className="primary"
            disabled={!wav || !valid || busy || recordState !== "idle" || preparing}
            onClick={() => void assess()}
          >
            {busy ? "Đang nghe bản thu…" : "Chấm phát âm"}
          </button>
          {(busy || preparing) && (
            <button
              type="button"
              onClick={() => {
                cancel()
                setMessage("Đã hủy. Không nhận kết quả đến muộn.")
              }}
            >
              Hủy
            </button>
          )}
        </div>
        {preparing && <p role="status">Đang chuẩn bị bản thu…</p>}
        {recordURL && (
          <audio
            ref={ownAudio}
            aria-label="Nghe bản thu của bạn"
            controls
            src={recordURL}
            onPlay={stop}
          />
        )}
        <p className="muted">
          Thu âm ở trên máy. Chỉ nút <b>Chấm phát âm</b> gửi âm thanh, câu và ngữ cảnh tới OpenAI (
          {PRONUNCIATION_MODEL}); có tính phí API. Lịch sử chỉ lưu nhận xét, không lưu âm thanh.
          Điểm không phải chứng chỉ hay kết quả thi.
        </p>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
      {feedback && result && (
        <section id="practice-feedback" aria-labelledby="feedback-title">
          <div className="score-heading">
            <div>
              <small>NHẬN XÉT PHÁT ÂM MỸ</small>
              <h2 id="feedback-title">
                {feedback.verdict === "retry" ? "Cần thu lại để chấm" : "Kết quả lần này"}
              </h2>
            </div>
            <strong className="score">
              {result.attempt.score === null ? "—" : result.attempt.score.toFixed(1)}
              <small>/10</small>
            </strong>
          </div>
          <p>{feedback.overview}</p>
          <p className="muted">
            Độ chắc chắn:{" "}
            {feedback.confidence === "high"
              ? "cao"
              : feedback.confidence === "medium"
                ? "vừa"
                : "thấp"}
            .{" "}
            {previous &&
              result.attempt.score !== null &&
              `Lần trước cùng đoạn và model: ${previous.score}/10; thay đổi ${(result.attempt.score - previous.score!).toFixed(1)} điểm. Khác biệt nhỏ có thể do cách thu hoặc độ biến động của AI.`}
          </p>
          {feedback.heardText && (
            <details>
              <summary>AI nghe gần đúng</summary>
              <p>{feedback.heardText}</p>
              <p className="muted">
                Bản chép lời có thể sai; không dùng riêng nó để kết luận lỗi âm.
              </p>
            </details>
          )}
          <div className="criteria">
            {criterionKeys.map((key) => (
              <article key={key}>
                <div>
                  <h3>{criterionLabels[key]}</h3>
                  <b>
                    {feedback.criteria[key].score === null
                      ? "N/A"
                      : `${feedback.criteria[key].score}/10`}
                  </b>
                </div>
                <p>{feedback.criteria[key].feedback}</p>
              </article>
            ))}
          </div>
          {feedback.strengths.length > 0 && (
            <>
              <h3>Đang làm tốt</h3>
              <ul>
                {feedback.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {feedback.findings.length > 0 && (
            <>
              <h3>Lỗi nghe được và cách sửa</h3>
              {feedback.findings.map((f) => (
                <article className="finding" key={JSON.stringify(f)}>
                  <h4>
                    {f.wordStart === null
                      ? "Cả đoạn"
                      : wordTokens(result.attempt.text)
                          .slice(f.wordStart, f.wordEnd! + 1)
                          .join(" ")}{" "}
                    <small>{f.confidence === "medium" ? "· có thể, cần nghe lại" : ""}</small>
                  </h4>
                  <p>
                    <b>Nghe được:</b> {f.heard || "Bỏ sót / chưa rõ"}
                  </p>
                  <p>
                    <b>Đích giọng Mỹ:</b> {f.expected}
                  </p>
                  <p>{f.explanation}</p>
                  <p>
                    <b>Cách luyện:</b> {f.practice}
                  </p>
                </article>
              ))}
            </>
          )}
          <h3>Mục tiêu lần thu tiếp</h3>
          <ol>
            {feedback.nextPractice.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <button
            type="button"
            disabled={busy || preparing || recordState !== "idle"}
            onClick={() => void record()}
          >
            Thử lại cùng đoạn
          </button>
        </section>
      )}
      <section id="history">
        <h2>3. Tiến trình trên máy</h2>
        {pastReferences.length > 0 && (
          <label>
            Đoạn đã luyện
            <select
              aria-label="Đoạn đã luyện"
              value={matching.length ? currentReference : ""}
              disabled={busy || recordState !== "idle" || preparing}
              onChange={(e) => {
                const row = pastReferences.find((a) => a.referenceKey === e.target.value)
                if (row) {
                  resetRecording()
                  setText(row.text)
                  setContext(row.context)
                  setCapture(row.text)
                }
              }}
            >
              <option value="" disabled>
                Chọn đoạn để xem lại hoặc luyện tiếp
              </option>
              {pastReferences.map((row) => (
                <option key={row.referenceKey} value={row.referenceKey}>
                  {row.text.slice(0, 110)}
                </option>
              ))}
            </select>
          </label>
        )}
        <p>
          {history.length} lần chấm duy nhất · {matching.length} lần cho đoạn này. Bản thu dùng lại
          cache không tạo thêm lần thử. Điểm phát âm không thay đổi lịch ôn hoặc tỷ lệ đúng của Sổ
          từ.
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={!history.length}
            onClick={() =>
              download(
                pronunciationReport(history),
                "ReadFrog-PhatAmMy-ChatGPT.md",
                "text/markdown;charset=utf-8",
              )
            }
          >
            Xuất báo cáo ChatGPT
          </button>
          <button
            type="button"
            disabled={!history.length}
            onClick={() =>
              download(
                JSON.stringify(
                  {
                    format: "read-frog-pronunciation",
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    attempts: history,
                  },
                  null,
                  2,
                ),
                "ReadFrog-PhatAmMy.json",
                "application/json",
              )
            }
          >
            Xuất JSON
          </button>
        </div>
        {matching.length > 0 && (
          <ol className="attempt-list">
            {matching
              .slice(-10)
              .reverse()
              .map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!busy && recordState === "idle") {
                        setResult({
                          attempt: a,
                          cached: true,
                          saved: true,
                          epoch: epoch.current ?? 0,
                        })
                        document
                          .querySelector("#practice-feedback")
                          ?.scrollIntoView({ block: "start" })
                      }
                    }}
                    disabled={busy || recordState !== "idle"}
                  >
                    {new Date(a.createdAt).toLocaleString("vi-VN")} ·{" "}
                    {a.score === null ? "Cần thu lại" : `${a.score}/10`}
                  </button>
                </li>
              ))}
          </ol>
        )}
        <details>
          <summary>Cách tính điểm và giới hạn</summary>
          <p>
            Từng tiêu chí và điểm tổng tăng theo bước 0,5. Từ riêng lẻ: âm 50%, trọng âm 35%, đọc
            đúng 15%; không chấm nhịp câu hoặc trôi chảy. Câu/đoạn: âm 40%, trọng âm 15%, nhịp 20%,
            trôi chảy 15%, đọc đúng 10%. Tiêu chí không đủ dữ liệu hiển thị N/A và chia lại trọng
            số. Không chấm khi AI chưa nghe đủ rõ.
          </p>
          <p>
            Lịch sử tối đa 1.000 lần / 16 MiB, lưu tại extension trên máy, tách khỏi đồng bộ Edge và
            Sổ từ. Xuất báo cáo trước khi xóa hoặc đổi máy. So sánh chỉ có ý nghĩa trong cùng đoạn,
            ngữ cảnh, rubric và model thực tế; model có thể được OpenAI cập nhật.
          </p>
        </details>
        <div className="actions">
          {clearArmed ? (
            <>
              <span>Xóa toàn bộ nhận xét và cache phát âm?</span>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  cancel()
                  void sendMessage("clearPronunciationHistory")
                    .then(() => {
                      setClearArmed(false)
                      setResult(null)
                    })
                    .catch((e: unknown) => setMessage(messageOf(e)))
                }}
              >
                Xác nhận xóa
              </button>
              <button type="button" onClick={() => setClearArmed(false)}>
                Giữ lại
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!history.length || busy}
              onClick={() => setClearArmed(true)}
            >
              Xóa lịch sử phát âm…
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
