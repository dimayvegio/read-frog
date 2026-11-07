import type { ReadingStep } from "@/utils/reading-library/audio"
import type { ReadingAsset, ReadingPassage, ReadingFolder } from "@/utils/reading-library/schema"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { sendMessage } from "@/utils/message"
import { readReadingArchive, writeReadingArchive } from "@/utils/reading-library/archive"
import {
  generateReadingAudio,
  readingSequence,
  encodeReadingSequence,
} from "@/utils/reading-library/audio"
import {
  createReadingFolder,
  deleteReadingPassage,
  importReadingBundle,
  libraryEpoch,
  readingLibraryDB as db,
  saveReadingPassage,
} from "@/utils/reading-library/db"
import { ReadingPlayer } from "@/utils/reading-library/player"
import { ShadowRecorder } from "@/utils/reading-library/recorder"
import {
  DEFAULT_READING_OPTIONS,
  MAX_READING_ARCHIVE,
  MAX_READING_TEXT,
  READING_LAB_PORT,
  readingCaptureSchema,
  referencedReadingAssets,
} from "@/utils/reading-library/schema"
import { initialReadingPairs } from "@/utils/reading-library/segmentation"

interface Draft {
  passage: ReadingPassage
  assets: ReadingAsset[]
  savedRevision: number | null
  epoch: number
  dirty: boolean
}
const visibleMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Không thực hiện được. Hãy thử lại."
function downloadBytes(bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type })),
    link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
function makeDraft(original: string, translation: string, title: string, epoch: number): Draft {
  const capture = readingCaptureSchema.parse({ original, translation, title }),
    now = Date.now()
  return {
    passage: {
      ...capture,
      id: getRandomUUID(),
      folderId: null,
      favorite: false,
      pairs: initialReadingPairs(capture).pairs,
      speech: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
    assets: [],
    savedRevision: null,
    epoch,
    dirty: true,
  }
}
function RecordingAudio({ asset }: { asset: ReadingAsset }) {
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const next = URL.createObjectURL(
      new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.type }),
    )
    const element = audio.current
    if (element) element.src = next
    return () => {
      element?.pause()
      element?.removeAttribute("src")
      URL.revokeObjectURL(next)
    }
  }, [asset])
  return <audio ref={audio} controls aria-label="Nghe bản thu của tôi" />
}
export function ReadingLab() {
  const client = useQueryClient(),
    tts = useAtomValue(configFieldsAtomMap.tts)
  const [tab, setTab] = useState<"lesson" | "library">("lesson")
  const [draft, setDraft] = useState<Draft | null>(null),
    [original, setOriginal] = useState(""),
    [translation, setTranslation] = useState("")
  const [rows, setRows] = useState<ReadingPassage[]>([]),
    [folders, setFolders] = useState<ReadingFolder[]>([])
  const [title, setTitle] = useState("Đoạn đọc mới"),
    [folderName, setFolderName] = useState("")
  const [search, setSearch] = useState(""),
    [folderFilter, setFolderFilter] = useState("all"),
    [favoriteOnly, setFavoriteOnly] = useState(false)
  const [includeRecordings, setIncludeRecordings] = useState(false),
    [selected, setSelected] = useState<string[]>([])
  const [options, setOptions] = useState(DEFAULT_READING_OPTIONS),
    [activePair, setActivePair] = useState(0)
  const [step, setStep] = useState<ReadingStep | null>(null),
    [playing, setPlaying] = useState<"idle" | "playing" | "paused">("idle")
  const [recordState, setRecordState] = useState<"idle" | "requesting" | "recording">("idle")
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("")
  const [player] = useState(() => new ReadingPlayer(setStep, setPlaying)),
    [recorder] = useState(() => new ShadowRecorder(setRecordState))
  const work = useRef<AbortController | null>(null),
    mounted = useRef(true)
  const recordEpoch = useRef(0)
  const micBusy = recordState !== "idle",
    locked = !!busy || micBusy
  const refresh = async () => {
    const [passages, names] = await Promise.all([
      db.passages.orderBy("updatedAt").reverse().toArray(),
      db.folders.toArray(),
    ])
    if (mounted.current) {
      setRows(passages)
      setFolders(names)
    }
  }
  useEffect(() => {
    mounted.current = true
    const close = () => {
      work.current?.abort()
      work.current = null
      recordEpoch.current++
      player.stop()
      recorder.stop(true)
    }
    window.addEventListener("pagehide", close)
    void (async () => {
      await refresh()
      const channel = new URLSearchParams(location.search).get("channel")
      if (!channel) return
      const capture = await sendMessage("consumeReadingCapture", { channel })
      const epoch = await libraryEpoch()
      if (!mounted.current) return
      history.replaceState(null, "", location.pathname)
      if (!capture) {
        setMessage("Đoạn chuyển sang đã hết hạn. Có thể dán văn bản và bản dịch bên dưới.")
        return
      }
      setOriginal(capture.original)
      setTranslation(capture.translation)
      setTitle(capture.title)
      setDraft(makeDraft(capture.original, capture.translation, capture.title, epoch))
    })().catch((reason) => {
      if (mounted.current) setError(visibleMessage(reason))
    })
    return () => {
      mounted.current = false
      window.removeEventListener("pagehide", close)
      close()
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Single page bootstrap; controllers and state setters are stable.
  }, [player, recorder])
  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (work.current) return
    const controller = new AbortController()
    work.current = controller
    setBusy(label)
    setError("")
    setMessage("")
    try {
      await action(controller.signal)
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current) setError(visibleMessage(reason))
    } finally {
      if (work.current === controller) {
        work.current = null
        if (mounted.current) setBusy("")
      }
    }
  }
  const cancel = () => {
    work.current?.abort()
    work.current = null
    setBusy("")
  }
  function stopMedia() {
    player.stop()
    recordEpoch.current++
    recorder.stop(true)
  }
  function updatePassage(update: Partial<ReadingPassage>) {
    stopMedia()
    setDraft((current) => {
      if (!current) return null
      const passage = { ...current.passage, ...update },
        used = new Set(referencedReadingAssets(passage))
      return {
        ...current,
        passage,
        assets: current.assets.filter((asset) => used.has(asset.id)),
        dirty: true,
      }
    })
  }
  const applyText = () =>
    void run("Đang chia câu…", async (signal) => {
      if (
        draft?.dirty &&
        draft.assets.length &&
        !confirm(
          "Chia lại sẽ bỏ audio của bản đang sửa. Bản đã lưu trong thư viện vẫn được giữ. Tiếp tục?",
        )
      )
        return
      stopMedia()
      const epoch = await libraryEpoch()
      signal.throwIfAborted()
      setDraft(makeDraft(original, translation, title, epoch))
      setActivePair(0)
      setMessage(
        "Đã chia câu trên máy. Kiểm tra từng cặp; dùng Ghép câu bằng AI nếu bản dịch lệch câu.",
      )
    })
  async function saveDraft(signal: AbortSignal) {
    if (!draft) return
    const passage = { ...draft.passage, title: title.trim() || "Đoạn đọc" }
    signal.throwIfAborted()
    const saved = await saveReadingPassage(passage, draft.assets, draft.savedRevision, draft.epoch)
    signal.throwIfAborted()
    setDraft({ ...draft, passage: saved, savedRevision: saved.revision, dirty: false })
    setMessage("Đã lưu đoạn và audio trên máy.")
    await refresh()
  }
  async function openPassage(passage: ReadingPassage) {
    if (draft?.dirty && !confirm("Bài đang sửa chưa được lưu. Mở đoạn khác?")) return
    stopMedia()
    setError("")
    try {
      const latest = await db.passages.get(passage.id)
      if (!latest) throw new Error("Đoạn đã bị xóa. Hãy làm mới thư viện.")
      const assets = (await db.assets.bulkGet(referencedReadingAssets(latest))).filter(
        (asset): asset is ReadingAsset => !!asset,
      )
      setDraft({
        passage: latest,
        assets,
        savedRevision: latest.revision,
        epoch: await libraryEpoch(),
        dirty: false,
      })
      setTitle(latest.title)
      setOriginal(latest.original)
      setTranslation(latest.translation)
      setActivePair(0)
      setTab("lesson")
      setMessage("Đang mở bản lưu trên máy; chưa gọi API.")
    } catch (reason) {
      setError(visibleMessage(reason))
    }
  }
  const align = () =>
    void run("Đang ghép câu bằng AI…", async (signal) => {
      if (!draft) return
      stopMedia()
      if (
        draft.assets.length &&
        !confirm("Ghép lại sẽ bỏ audio trong bản đang sửa. Bản đã lưu vẫn được giữ. Tiếp tục?")
      )
        return
      const pairs = await createPortStreamPromise<ReadingPassage["pairs"]>(
        READING_LAB_PORT,
        { original: draft.passage.original, translation: draft.passage.translation, title },
        { signal },
      )
      signal.throwIfAborted()
      setDraft({
        ...draft,
        passage: { ...draft.passage, pairs, speech: null },
        assets: [],
        dirty: true,
      })
      setActivePair(0)
      setMessage(
        "Đã ghép câu bằng AI, giữ nguyên đủ văn bản. Hãy kiểm tra các cặp trước khi tạo audio.",
      )
    })
  const generate = (force: boolean) =>
    void run("Đang tạo audio OpenAI…", async (signal) => {
      if (!draft) return
      stopMedia()
      const config = { ...tts.openai }
      const generated = await generateReadingAudio(
        draft.passage,
        draft.assets,
        config,
        client,
        signal,
        options.translation,
        (done, total) => {
          if (!signal.aborted) setBusy(`Đang tạo audio OpenAI ${done}/${total}…`)
        },
        force,
      )
      signal.throwIfAborted()
      setDraft({ ...draft, ...generated, dirty: true })
      setMessage("Audio đã sẵn sàng. Bấm Lưu đoạn để giữ sau khi đóng trang.")
    })
  function playSteps(steps: ReadingStep[]) {
    document.querySelectorAll("audio").forEach((audio) => audio.pause())
    recorder.stop(true)
    recordEpoch.current++
    setError("")
    void player.play(steps).catch((reason) => {
      if (mounted.current) setError(visibleMessage(reason))
    })
  }
  const listen = () => {
    if (!draft) return
    try {
      playSteps(readingSequence(draft.passage, draft.assets, options))
    } catch (reason) {
      setError(visibleMessage(reason))
    }
  }
  async function record() {
    if (!draft) return
    player.stop()
    document.querySelectorAll("audio").forEach((audio) => audio.pause())
    const pairId = draft.passage.pairs[activePair]!.id,
      epoch = ++recordEpoch.current
    setError("")
    try {
      const asset = await recorder.start()
      if (!asset || !mounted.current || recordEpoch.current !== epoch) return
      const passage = {
          ...draft.passage,
          pairs: draft.passage.pairs.map((pair) =>
            pair.id === pairId ? { ...pair, recording: asset.id } : pair,
          ),
        },
        used = new Set(referencedReadingAssets(passage))
      const assets = [...draft.assets.filter((item) => item.id !== asset.id), asset].filter(
        (item) => used.has(item.id),
      )
      if (assets.reduce((sum, item) => sum + item.bytes.length, 0) > MAX_READING_ARCHIVE)
        throw new Error("Bài đã đủ 64 MiB; bỏ bớt bản thu hoặc chia nhỏ bài.")
      setDraft({ ...draft, passage, assets, dirty: true })
      setMessage(
        "Đã thu xong. Bấm Lưu đoạn nếu muốn giữ bản thu; ZIP chỉ kèm bản thu khi bạn chọn.",
      )
    } catch (reason) {
      if (mounted.current && recordEpoch.current === epoch) setError(visibleMessage(reason))
    }
  }
  const exportMp3 = () =>
    void run("Đang ghép MP3 xen kẽ…", async (signal) => {
      if (!draft) return
      stopMedia()
      const bytes = await encodeReadingSequence(
        readingSequence(draft.passage, draft.assets, options),
        signal,
      )
      signal.throwIfAborted()
      downloadBytes(bytes, "ReadFrog-BaiNghe.mp3", "audio/mpeg")
      setMessage("Đã xuất MP3 theo thứ tự câu, số lần lặp và khoảng nghỉ đang chọn.")
    })
  const exportZip = (ids: string[]) =>
    void run("Đang xuất thư viện…", async (signal) => {
      const passages = (await db.passages.bulkGet(ids))
        .filter((passage): passage is ReadingPassage => !!passage)
        .map((passage) => ({
          ...passage,
          pairs: passage.pairs.map((pair) => ({
            ...pair,
            recording: includeRecordings ? pair.recording : null,
          })),
        }))
      if (!passages.length) throw new Error("Chọn ít nhất một đoạn đã lưu.")
      const refs = new Set(passages.flatMap(referencedReadingAssets)),
        assets: ReadingAsset[] = []
      let bytesRead = 0
      for (const id of refs) {
        signal.throwIfAborted()
        const asset = await db.assets.get(id)
        if (!asset) throw new Error("Đoạn thiếu audio.")
        bytesRead += asset.bytes.length
        if (bytesRead > MAX_READING_ARCHIVE)
          throw new Error("ZIP vượt 64 MiB; chọn ít đoạn hơn để xuất.")
        assets.push(asset)
      }
      const bytes = await writeReadingArchive(
        { passages, folders: await db.folders.toArray(), assets },
        includeRecordings,
      )
      signal.throwIfAborted()
      downloadBytes(bytes, "ReadFrog-ThuVienDoanDoc.zip", "application/zip")
    })
  const importZip = (file: File) =>
    void run("Đang nhập thư viện…", async (signal) => {
      if (file.size > MAX_READING_ARCHIVE) throw new Error("ZIP vượt 64 MiB.")
      const bundle = await readReadingArchive(new Uint8Array(await file.arrayBuffer()))
      signal.throwIfAborted()
      const result = await importReadingBundle(bundle),
        epoch = await libraryEpoch()
      signal.throwIfAborted()
      setDraft((current) => (current ? { ...current, epoch } : null))
      await refresh()
      setMessage(`Đã thêm ${result.added} đoạn; giữ nguyên ${result.skipped} đoạn trùng ID.`)
    })
  const filtered = rows.filter(
    (row) =>
      (!favoriteOnly || row.favorite) &&
      (folderFilter === "all" ||
        row.folderId === folderFilter ||
        (!row.folderId && folderFilter === "none")) &&
      `${row.title} ${row.original} ${row.translation}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  )
  const pair = draft?.passage.pairs[activePair],
    sample = pair?.originalAudio
      ? draft?.assets.find((asset) => asset.id === pair.originalAudio)
      : null,
    recording = pair?.recording ? draft?.assets.find((asset) => asset.id === pair.recording) : null
  return (
    <main className="reading-lab">
      <header className="lab-header">
        <div>
          <p className="lab-eyebrow">READ FROG</p>
          <h1>Luyện nghe & Thư viện</h1>
          <p>Đọc một đoạn. Nghe từng câu. Tập nói bằng giọng của bạn.</p>
        </div>
        <button
          type="button"
          onClick={() => void sendMessage("openOptionsPage", { route: "/tts" })}
        >
          Giọng OpenAI
        </button>
      </header>
      <nav className="lab-tabs" aria-label="Chế độ">
        <button
          type="button"
          aria-current={tab === "lesson" ? "page" : undefined}
          disabled={micBusy}
          onClick={() => setTab("lesson")}
        >
          Luyện nghe
        </button>
        <button
          type="button"
          aria-current={tab === "library" ? "page" : undefined}
          disabled={micBusy}
          onClick={() => {
            player.stop()
            setTab("library")
            void refresh().catch((reason) => setError(visibleMessage(reason)))
          }}
        >
          Thư viện <span>{rows.length}</span>
        </button>
      </nav>
      {error && (
        <p className="lab-alert error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="lab-alert" role="status">
          {message}
        </p>
      )}
      {busy && (
        <div className="lab-alert" role="status">
          {busy}{" "}
          <button type="button" onClick={cancel}>
            Hủy
          </button>
        </div>
      )}
      {tab === "lesson" ? (
        <>
          <section className="lab-card">
            <div className="lab-row">
              <label className="lab-grow">
                Tên đoạn
                <input
                  id="reading-title"
                  maxLength={160}
                  value={title}
                  disabled={locked}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    setDraft((current) => (current ? { ...current, dirty: true } : null))
                  }}
                />
              </label>
              <label>
                Thư mục
                <select
                  id="reading-folder"
                  value={draft?.passage.folderId ?? ""}
                  disabled={locked || !draft}
                  onChange={(event) => updatePassage({ folderId: event.target.value || null })}
                >
                  <option value="">Chưa phân loại</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details open={!draft}>
              <summary>Văn bản gốc và bản dịch</summary>
              <p className="lab-note">
                Mở từ Translate → Luyện nghe / Lưu đoạn, hoặc dán hai đoạn tương ứng. Mỗi bên tối đa
                20.000 ký tự.
              </p>
              <div className="lab-columns">
                <label>
                  Văn bản gốc
                  <textarea
                    id="reading-original"
                    value={original}
                    maxLength={MAX_READING_TEXT}
                    disabled={locked}
                    onChange={(event) => setOriginal(event.target.value)}
                    rows={6}
                  />
                </label>
                <label>
                  Bản dịch
                  <textarea
                    id="reading-translation"
                    value={translation}
                    maxLength={MAX_READING_TEXT}
                    disabled={locked}
                    onChange={(event) => setTranslation(event.target.value)}
                    rows={6}
                  />
                </label>
              </div>
              <button
                type="button"
                id="reading-apply"
                disabled={locked || !original.trim() || !translation.trim()}
                onClick={applyText}
              >
                {draft ? "Áp dụng văn bản / chia lại" : "Tạo bài nghe"}
              </button>
            </details>
            {draft && (
              <div className="lab-row lab-actions">
                <button
                  type="button"
                  id="reading-save"
                  className="primary"
                  disabled={locked}
                  onClick={() => void run("Đang lưu…", saveDraft)}
                >
                  Lưu đoạn{draft.dirty ? " *" : ""}
                </button>
                <label className="lab-check">
                  <input
                    type="checkbox"
                    checked={draft.passage.favorite}
                    disabled={locked}
                    onChange={(event) => updatePassage({ favorite: event.target.checked })}
                  />
                  Yêu thích
                </label>
                <button type="button" disabled={locked} onClick={align}>
                  Ghép câu bằng AI
                </button>
                <span className="lab-note">
                  {draft.passage.pairs.length} cặp câu ·{" "}
                  {draft.savedRevision ? "Đã có trong thư viện" : "Chưa lưu"}
                </span>
              </div>
            )}
          </section>
          {draft && (
            <div className="lab-layout">
              <section className="lab-card lab-lesson">
                <h2>Nghe nguồn → bản dịch</h2>
                <div className="lab-row">
                  <label>
                    Nghỉ giữa lượt đọc
                    <select
                      id="reading-gap"
                      value={options.gap}
                      disabled={playing !== "idle" || locked}
                      onChange={(event) =>
                        setOptions({ ...options, gap: Number(event.target.value) })
                      }
                    >
                      {[0, 1, 2, 3, 5, 10].map((value) => (
                        <option key={value} value={value}>
                          {value} giây
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Lặp câu gốc
                    <select
                      id="reading-repeats"
                      value={options.repeats}
                      disabled={playing !== "idle" || locked}
                      onChange={(event) =>
                        setOptions({ ...options, repeats: Number(event.target.value) })
                      }
                    >
                      {[1, 2, 3].map((value) => (
                        <option key={value} value={value}>
                          {value} lần
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="lab-check">
                    <input
                      id="reading-target-enabled"
                      type="checkbox"
                      checked={options.translation}
                      disabled={playing !== "idle" || locked}
                      onChange={(event) =>
                        setOptions({ ...options, translation: event.target.checked })
                      }
                    />
                    Đọc bản dịch
                  </label>
                </div>
                <div className="lab-row lab-actions">
                  <button
                    type="button"
                    id="reading-generate"
                    disabled={locked}
                    onClick={() => generate(false)}
                  >
                    Tạo audio OpenAI
                  </button>
                  <button
                    type="button"
                    disabled={locked || !draft.passage.speech}
                    onClick={() => {
                      if (
                        confirm(
                          "Tạo lại audio theo giọng/model đang chọn? Có thể phát sinh phí API.",
                        )
                      )
                        generate(true)
                    }}
                  >
                    Tạo lại theo giọng mới
                  </button>
                </div>
                <p className="lab-note">
                  Audio mới dùng {tts.openai.model} · {tts.openai.voice}. Chỉ bấm tạo mới gọi API.
                  Audio đã lưu nghe được offline.
                  {draft.passage.speech &&
                    ` Giọng bài đã lưu: ${draft.passage.speech.voice} (${draft.passage.speech.model}).`}
                </p>
                <div className="lab-row lab-actions">
                  <button
                    type="button"
                    id="reading-listen"
                    className="primary"
                    disabled={locked}
                    onClick={playing === "paused" ? () => player.resume() : listen}
                  >
                    {playing === "paused" ? "Tiếp tục" : "Nghe toàn bài"}
                  </button>
                  <button
                    type="button"
                    id="reading-pause"
                    disabled={playing !== "playing"}
                    onClick={() => player.pause()}
                  >
                    Tạm dừng
                  </button>
                  <button
                    type="button"
                    id="reading-stop"
                    disabled={playing === "idle"}
                    onClick={() => player.stop()}
                  >
                    Dừng
                  </button>
                  <button type="button" id="reading-mp3" disabled={locked} onClick={exportMp3}>
                    Tải MP3 xen kẽ
                  </button>
                </div>
                <ol className="lab-pairs">
                  {draft.passage.pairs.map((row, index) => (
                    <li key={row.id} className={step?.pair === index ? "active" : ""}>
                      <div className="lab-row">
                        <span className="lab-index">{index + 1}</span>
                        <button
                          type="button"
                          disabled={locked}
                          aria-pressed={activePair === index}
                          onClick={() => {
                            player.stop()
                            setActivePair(index)
                          }}
                        >
                          Luyện câu này
                        </button>
                        {step?.pair === index && (
                          <span className="lab-note">
                            {step.side === "gap"
                              ? "Đang nghỉ để bạn tự hiểu…"
                              : step.side === "translation"
                                ? "Đang đọc bản dịch"
                                : step.side === "recording"
                                  ? "Giọng của bạn"
                                  : "Đang đọc câu gốc"}
                          </span>
                        )}
                      </div>
                      <p>{row.original}</p>
                      <p className="lab-translation">{row.translation}</p>
                    </li>
                  ))}
                </ol>
              </section>
              <aside className="lab-card lab-shadow">
                <p className="lab-eyebrow">SHADOWING</p>
                <h2>Nghe mẫu, nói lại</h2>
                <p className="lab-note">
                  Câu {activePair + 1}/{draft.passage.pairs.length}
                </p>
                <blockquote>{pair?.original}</blockquote>
                <button
                  type="button"
                  id="shadow-sample"
                  disabled={locked || !sample}
                  onClick={() =>
                    sample && playSteps([{ pair: activePair, side: "original", asset: sample }])
                  }
                >
                  Nghe mẫu
                </button>
                <p className="lab-note">
                  Bấm micro rồi đọc lại câu. Tối đa 60 giây/lần; không gửi bản thu lên OpenAI.
                </p>
                <div className="lab-row">
                  <button
                    type="button"
                    id="shadow-record"
                    className="primary"
                    disabled={!!busy}
                    onClick={
                      micBusy
                        ? () => recorder.stop(recordState === "requesting")
                        : () => void record()
                    }
                  >
                    {recordState === "requesting"
                      ? "Hủy yêu cầu micro"
                      : recordState === "recording"
                        ? "Dừng thu"
                        : recording
                          ? "Thu lại"
                          : "Thu giọng của tôi"}
                  </button>
                  {micBusy && (
                    <span role="status" className="lab-recording">
                      {recordState === "requesting" ? "Chờ quyền micro…" : "● Đang thu"}
                    </span>
                  )}
                </div>
                {recording && (
                  <>
                    <RecordingAudio asset={recording} />
                    <button
                      type="button"
                      id="shadow-compare"
                      disabled={locked || !sample}
                      onClick={() =>
                        sample &&
                        playSteps([
                          { pair: activePair, side: "original", asset: sample },
                          { pair: activePair, side: "gap", seconds: 1 },
                          { pair: activePair, side: "recording", asset: recording },
                        ])
                      }
                    >
                      Nghe mẫu → giọng của tôi
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        updatePassage({
                          pairs: draft.passage.pairs.map((row, index) =>
                            index === activePair ? { ...row, recording: null } : row,
                          ),
                        })
                      }
                    >
                      Bỏ bản thu này
                    </button>
                  </>
                )}
                <p className="lab-note">
                  Tự nghe để so sánh cách nhấn giọng, nối âm và tốc độ. Bản thu không được tính là
                  trả lời đúng/sai trong sổ từ.
                </p>
              </aside>
            </div>
          )}
        </>
      ) : (
        <section className="lab-card">
          <div className="lab-row">
            <label className="lab-grow">
              Tìm đoạn
              <input
                id="reading-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên, câu gốc hoặc bản dịch…"
              />
            </label>
            <label>
              Thư mục
              <select
                value={folderFilter}
                onChange={(event) => setFolderFilter(event.target.value)}
              >
                <option value="all">Tất cả</option>
                <option value="none">Chưa phân loại</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab-check">
              <input
                type="checkbox"
                checked={favoriteOnly}
                onChange={(event) => setFavoriteOnly(event.target.checked)}
              />
              Chỉ yêu thích
            </label>
          </div>
          <div className="lab-row lab-actions">
            <input
              aria-label="Tên thư mục mới"
              maxLength={80}
              value={folderName}
              disabled={locked}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Thư mục mới…"
            />
            <button
              type="button"
              disabled={locked || !folderName.trim()}
              onClick={() =>
                void run("Đang tạo thư mục…", async () => {
                  await createReadingFolder(folderName)
                  setFolderName("")
                  await refresh()
                })
              }
            >
              Tạo thư mục
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                if (draft?.dirty && !confirm("Bài hiện tại chưa lưu. Tạo bài mới?")) return
                stopMedia()
                setDraft(null)
                setTitle("Đoạn đọc mới")
                setOriginal("")
                setTranslation("")
                setTab("lesson")
              }}
            >
              Bài mới
            </button>
          </div>
          <div className="lab-row lab-actions">
            <label className="lab-check">
              <input
                type="checkbox"
                checked={includeRecordings}
                onChange={(event) => setIncludeRecordings(event.target.checked)}
              />
              Kèm bản thu giọng của tôi khi xuất ZIP
            </label>
            <button
              type="button"
              id="reading-export-zip"
              disabled={locked || !rows.length}
              onClick={() => exportZip(selected.length ? selected : filtered.map((row) => row.id))}
            >
              Xuất ZIP {selected.length ? `(${selected.length} đoạn chọn)` : "các đoạn đang hiện"}
            </button>
            <label className="lab-file">
              Nhập ZIP thư viện
              <input
                id="reading-import"
                type="file"
                accept=".zip,application/zip"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) importZip(file)
                }}
              />
            </label>
          </div>
          <p className="lab-note">
            Thư viện lưu trên máy, tối đa 100 đoạn / 256 MiB. ZIP tối đa 64 MiB; có thể chọn vài
            đoạn để chia file. Đây là ZIP đoạn đọc, riêng với ZIP Sổ từ. Nhập trùng ID giữ nguyên
            bản local.
          </p>
          <div className="lab-library">
            {filtered.length ? (
              filtered.map((row) => (
                <article key={row.id} className="lab-library-row">
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${row.title}`}
                    checked={selected.includes(row.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, row.id]
                          : current.filter((id) => id !== row.id),
                      )
                    }
                  />
                  <div className="lab-grow">
                    <h3>
                      {row.favorite ? "★ " : ""}
                      {row.title}
                    </h3>
                    <p>{row.original.slice(0, 150)}</p>
                    <small>
                      {row.pairs.length} cặp câu ·{" "}
                      {folders.find((folder) => folder.id === row.folderId)?.name ??
                        "Chưa phân loại"}
                    </small>
                  </div>
                  <button type="button" disabled={locked} onClick={() => void openPassage(row)}>
                    Mở / đổi tên
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      if (!confirm(`Xóa “${row.title}” và audio chỉ dùng trong đoạn này?`)) return
                      void run("Đang xóa…", async () => {
                        await deleteReadingPassage(row.id)
                        const epoch = await libraryEpoch()
                        setDraft((current) =>
                          current?.passage.id === row.id
                            ? null
                            : current
                              ? { ...current, epoch }
                              : null,
                        )
                        setSelected((current) => current.filter((id) => id !== row.id))
                        await refresh()
                      })
                    }}
                  >
                    Xóa
                  </button>
                </article>
              ))
            ) : (
              <p className="lab-empty">
                Chưa có đoạn phù hợp. Mở Translate → Luyện nghe / Lưu đoạn, rồi bấm Lưu đoạn.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
