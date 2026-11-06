import { createVocabularyZip, readVocabularyZip } from "../utils/vocabulary/archive"
import {
  loadLibrary,
  vocabularyDB,
  exportLibrary,
  importLibrary,
  reviewCard,
  deleteVocabularyCard,
  clearVocabularyLibrary,
} from "../utils/vocabulary/db"
import {
  REVIEW_MODES,
  normalizeAnswer,
  safeSourceUrl,
  emptyProgress,
  scheduleReview,
  MAX_ARCHIVE_BYTES,
  type VocabularyCard,
  type CardProgress,
  type ReviewMode,
  type Grade,
  type VocabularyCapture,
  type VocabularySaveEvent,
} from "../utils/vocabulary/schema"
import style from "./style.css?inline"

export interface VocabularyBridge {
  generate: (
    capture: VocabularyCapture,
    signal: AbortSignal,
    onChunk: (event: VocabularySaveEvent) => void,
  ) => Promise<VocabularySaveEvent>
  htmlUrl: string
}
const speaker = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>`
const book = `<svg width="25" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 3h14v18l-7-4-7 4V3Z"/><path d="M9 7h6M9 11h6"/></svg>`
const esc = (v: unknown) =>
  String(typeof v === "string" || typeof v === "number" ? v : "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  )
const modeLabels: Record<ReviewMode, string> = {
  flash: "Thẻ lật",
  choice: "Trắc nghiệm",
  type: "Gõ đáp án",
}
const gradeLabels: Record<Grade, string> = {
  again: "Chưa nhớ",
  hard: "Khó",
  good: "Nhớ",
  easy: "Dễ",
}
const date = (time: number) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time)
function shuffled<T>(values: T[]) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0]!
    const j = random % (i + 1)
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}
function intervalLabel(days: number) {
  return days < 1 / 24
    ? `${Math.max(1, Math.round(days * 1440))} phút`
    : days < 1
      ? `${Math.round(days * 24)} giờ`
      : `${Math.round(days)} ngày`
}

export async function mountVocabularyReview(root: HTMLElement, bridge?: VocabularyBridge) {
  const css = document.createElement("style")
  css.textContent = style
  document.head.append(css)
  let cards: VocabularyCard[] = [],
    progress = new Map<string, CardProgress>()
  let mode: ReviewMode = "flash",
    tab = "study",
    query = "",
    tag = "",
    filtersOpen = false,
    limit = 40,
    activeId = "",
    revealed = false,
    answered: boolean | null = null,
    picked = -1,
    choices: string[] = [],
    practice = false,
    completed = new Set<string>(),
    busy = false,
    speed = 1,
    generation: AbortController | null = null
  let playing: HTMLAudioElement | null = null,
    audioUrl = ""
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let playSequence = 0
  const stopAudio = () => {
    playSequence++
    if (playing) playing.onended = null
    playing?.pause()
    playing = null
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    audioUrl = ""
  }
  const notice = (message: string, error = false) => {
    const element = root.querySelector<HTMLElement>("#notice")!
    element.textContent = message
    element.classList.toggle("error", error)
    if (noticeTimer) clearTimeout(noticeTimer)
    if (!error) noticeTimer = setTimeout(() => (element.textContent = ""), 7000)
  }
  const refresh = async () => {
    const data = await loadLibrary()
    cards = data.cards
    progress = new Map(data.progress.map((p) => [p.cardId, p]))
  }
  const getState = (id: string) => progress.get(id) ?? emptyProgress(id)
  const filtered = () =>
    cards.filter(
      (c) =>
        (!tag || c.tags.includes(tag)) &&
        normalizeAnswer(`${c.word} ${c.meaning} ${c.context} ${c.tags.join(" ")}`).includes(
          normalizeAnswer(query),
        ),
    )
  const reset = () => {
    activeId = ""
    revealed = false
    answered = null
    picked = -1
    choices = []
    stopAudio()
  }
  const freshSession = () => {
    reset()
    completed = new Set()
    practice = false
  }
  const current = () => {
    const available = filtered()
      .filter(
        (c) =>
          (!completed.has(c.id) || (!practice && getState(c.id)[mode].dueAt <= Date.now())) &&
          (practice || getState(c.id)[mode].dueAt <= Date.now()),
      )
      .sort((a, b) => getState(a.id)[mode].dueAt - getState(b.id)[mode].dueAt)
    const selected = available.find((c) => c.id === activeId) ?? available[0]
    if (selected?.id !== activeId) {
      reset()
      if (selected) {
        activeId = selected.id
        choices = shuffled([selected.meaning, ...selected.distractors])
      }
    }
    return selected
  }
  const source = (card: VocabularyCard) => {
    const url = safeSourceUrl(card.sourceUrl)
    return card.sourceTitle || url
      ? `<div class="source">Nguồn: ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(card.sourceTitle || url)}</a>` : esc(card.sourceTitle)}</div>`
      : ""
  }
  const audioButton = (id: string, label: string) =>
    `<button class="word-button" data-action="audio" data-id="${id}" aria-label="${esc(label)}" title="${esc(label)}">${speaker}</button>`
  const answer = (card: VocabularyCard) =>
    `<div class="answer"><p class="meaning">${esc(card.meaning)}</p><p>${esc(card.definition)}</p>${card.pronunciationTip ? `<p class="muted">Cách đọc: ${esc(card.pronunciationTip)}</p>` : ""}${card.context ? `<p class="muted">${esc(card.originalTranslation)}</p>` : ""}<div class="example"><div class="example-top"><label>Ví dụ</label>${audioButton(card.audio.example, "Nghe câu ví dụ")}</div><p lang="${esc(card.language)}">${esc(card.example.sentence)}</p><p class="muted">${esc(card.example.translation)}</p></div>${source(card)}</div>`
  const grades = (card: VocabularyCard) =>
    `<div class="grades" aria-label="Mức độ ghi nhớ">${(["again", "hard", "good", "easy"] as Grade[]).map((grade) => `<button data-grade="${grade}" ${answered === false && grade !== "again" ? "disabled" : ""}>${gradeLabels[grade]}<small>${intervalLabel(scheduleReview(getState(card.id)[mode], grade).intervalDays)}</small></button>`).join("")}</div>`
  const empty = (title: string, description: string, actions: string) =>
    `<div class="study empty"><div class="empty-content"><div class="empty-mark">${book}</div><h2>${title}</h2><p>${description}</p><div class="tools">${actions}</div></div></div>`
  function study() {
    const card = current()
    if (!cards.length)
      return empty(
        "Bắt đầu với những từ bạn đã gặp",
        "Nhập bộ từ vựng ZIP xuất từ Read Frog. Mỗi từ mang theo nghĩa, ví dụ và giọng đọc OpenAI để nghe lại khi offline.",
        `<button class="primary" data-action="import">Nhập bộ từ ZIP</button><button data-action="help">Cách thêm từ</button>`,
      )
    if (!card) {
      const next = filtered()
        .map((c) => getState(c.id)[mode].dueAt)
        .filter((time) => time > Date.now())
        .sort((a, b) => a - b)[0]
      return empty(
        completed.size ? "Đã hoàn thành lượt ôn" : "Chưa có từ đến lịch ôn",
        `${completed.size ? `Bạn vừa ôn ${completed.size} từ. ` : ""}${next ? `Lượt tiếp theo: ${date(next)}.` : "Bạn có thể đổi nhãn hoặc bắt đầu một lượt luyện thêm."}`,
        `<button class="primary" data-action="practice">Luyện thêm tất cả</button><button data-action="check-due">Kiểm tra lịch</button><button data-tab="library">Xem sổ từ</button>`,
      )
    }
    const wordVisible = mode !== "type" || revealed
    const head = wordVisible
      ? `<div class="term-row"><div><h2 class="word" lang="${esc(card.language)}">${esc(card.word)}</h2><p class="phonetic">${esc(card.ipa)} <small>${esc(card.partOfSpeech)}</small></p></div>${audioButton(card.audio.word, "Nghe phát âm từ")}</div>`
      : `<p class="prompt">Gõ từ hoặc cụm từ phù hợp với nghĩa sau</p><h2 class="meaning">${esc(card.meaning)}</h2>`
    let exercise = ""
    if (mode === "flash")
      exercise = revealed
        ? answer(card) + grades(card)
        : `<button class="primary reveal" data-action="reveal">Hiện nghĩa và ví dụ</button>`
    if (mode === "choice")
      exercise = `<p class="prompt">Chọn nghĩa phù hợp trong ngữ cảnh</p><div class="choices">${choices.map((choice, i) => `<button class="choice ${answered !== null ? (choice === card.meaning ? "correct" : i === picked ? "wrong" : "") : ""}" data-choice="${i}" ${answered !== null ? "disabled" : ""}><b>${String.fromCharCode(65 + i)}</b><span>${esc(choice)}</span></button>`).join("")}</div>${answered !== null ? `<div role="status" class="feedback ${answered ? "correct" : "wrong"}">${answered ? "Đúng rồi." : `Chưa đúng. Đáp án: ${esc(card.meaning)}`}</div>${answer(card)}${grades(card)}` : ""}`
    if (mode === "type")
      exercise = revealed
        ? `<div role="status" class="feedback ${answered ? "correct" : "wrong"}">${answered ? "Chính xác." : `Đáp án: ${esc(card.word)}`}</div>${answer(card)}${grades(card)}`
        : `<form id="type-form" class="typing"><label for="typed-answer" hidden>Từ hoặc cụm từ</label><input id="typed-answer" placeholder="Gõ đáp án…" autocomplete="off" autocapitalize="off" spellcheck="false" required maxlength="160"><button class="primary" type="submit">Kiểm tra</button></form><button class="quiet next-session" data-action="give-up">Tôi chưa nhớ</button>`
    return `<div class="study"><div class="study-header"><span>${completed.size ? `Đã ôn ${completed.size} từ` : practice ? "Đang luyện thêm" : "Từng từ, từng ngữ cảnh"}</span><span class="badge">${modeLabels[mode]}</span></div><div class="study-main">${head}${card.context && mode !== "type" ? `<blockquote class="context">${esc(card.context)}</blockquote>` : ""}${exercise}</div><div class="study-footer"><span>Giọng đọc do OpenAI tạo · Phát từ bộ đã lưu</span><label style="margin:0;font-weight:400">Tốc độ <select id="audio-speed" aria-label="Tốc độ nghe">${[0.75, 1, 1.25].map((n) => `<option value="${n}" ${speed === n ? "selected" : ""}>${n}×</option>`).join("")}</select></label></div></div><p class="hint">${mode === "flash" ? "Phím Space để hiện nghĩa; 1–4 để chọn mức độ ghi nhớ." : "Lịch ôn được lưu riêng cho mỗi kiểu học."} ${practice ? "Bạn đang luyện cả các từ chưa đến lịch." : ""}</p>`
  }
  function library() {
    const list = filtered()
    if (!list.length)
      return empty(
        "Chưa tìm thấy từ",
        "Thử một từ khóa hoặc nhãn khác, hoặc nhập thêm bộ từ của bạn.",
        `<button data-action="import">Nhập bộ từ ZIP</button>`,
      )
    return `<div class="library">${list
      .slice(0, limit)
      .map(
        (card) =>
          `<article class="entry"><div><h3>${esc(card.word)} <small style="display:inline">${esc(card.ipa)}</small></h3><p>${esc(card.meaning)}</p><small>${esc(card.example.sentence)}</small><div class="tags">${card.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}<span class="tag">${getState(card.id)[mode].reviews ? `Lịch ôn: ${date(getState(card.id)[mode].dueAt)}` : "Từ mới"}</span></div></div><div class="entry-actions">${audioButton(card.audio.word, `Nghe ${card.word}`)}<button data-action="view" data-id="${card.id}">Xem</button><button class="quiet danger" data-action="delete" data-id="${card.id}">Xóa</button></div></article>`,
      )
      .join(
        "",
      )}</div>${list.length > limit ? `<button class="load-more" data-action="more">Xem thêm (${list.length - limit} từ)</button>` : ""}`
  }
  function render() {
    const focused =
      document.activeElement instanceof HTMLInputElement
        ? {
            id: document.activeElement.id,
            start: document.activeElement.selectionStart,
            end: document.activeElement.selectionEnd,
          }
        : null
    const countDue = cards.filter((c) => getState(c.id)[mode].dueAt <= Date.now()).length
    const main = root.querySelector<HTMLElement>("#content")!
    main.dataset.tab = tab
    main.innerHTML = `<div class="page-top"><h1>${tab === "study" ? "Ôn từ vựng" : "Sổ từ của bạn"}</h1><p>${tab === "study" ? "Nhớ cách dùng từ qua những câu bạn đã đọc." : "Từ, ví dụ và giọng đọc, luôn ở cùng một nơi."}</p><div class="numbers"><div class="number"><strong>${cards.length}</strong><span>Từ đã lưu</span></div><div class="number"><strong>${countDue}</strong><span>Đến lịch ôn</span></div><div class="number"><strong>${completed.size}</strong><span>Đã ôn lượt này</span></div></div></div><div class="controls"><div class="modes" aria-label="Kiểu ôn tập">${REVIEW_MODES.map((m) => `<button data-mode="${m}" aria-pressed="${mode === m}">${modeLabels[m]}</button>`).join("")}</div>${bridge ? `<button data-action="add">Thêm từ bằng OpenAI</button>` : ""}</div><div class="filters"><div><label for="search" hidden>Tìm từ hoặc nghĩa</label><input type="search" id="search" value="${esc(query)}" placeholder="Tìm từ, nghĩa hoặc câu đã gặp…"></div><div><label for="tag-filter" hidden>Lọc chủ đề</label><select id="tag-filter"><option value="">Tất cả chủ đề</option>${[
      ...new Set(cards.flatMap((c) => c.tags)),
    ]
      .sort()
      .map((t) => `<option value="${esc(t)}" ${tag === t ? "selected" : ""}>${esc(t)}</option>`)
      .join("")}</select></div></div>${tab === "study" ? study() : library()}`
    const filters = main.querySelector<HTMLElement>(".filters")!
    filters.classList.toggle("is-open", filtersOpen || tab === "library")
    main.querySelector(".modes")?.setAttribute("role", "group")
    if (tab === "study") {
      const toggle = document.createElement("button")
      toggle.className = "filter-toggle"
      toggle.dataset.action = "filters"
      toggle.setAttribute("aria-expanded", String(filtersOpen))
      toggle.textContent = filtersOpen
        ? "Đóng bộ lọc"
        : query || tag
          ? "Đang lọc từ · Mở bộ lọc"
          : "Tìm từ / lọc chủ đề"
      filters.before(toggle)
    }
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => {
      if (el.closest(".nav"))
        el.setAttribute("aria-current", el.dataset.tab === tab ? "page" : "false")
    })
    if (focused) {
      const el = document.getElementById(focused.id)
      if (el instanceof HTMLInputElement) {
        el.focus({ preventScroll: true })
        if (el.type !== "search" || focused.start !== null)
          try {
            el.setSelectionRange(focused.start, focused.end)
          } catch {
            /* Non-text inputs do not have selection ranges. */
          }
      }
    }
  }
  const download = (bytes: Uint8Array, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
  const showDialog = (html: string) => {
    const dialog = root.querySelector<HTMLDialogElement>("#dialog")!
    dialog.innerHTML = html
    dialog.showModal()
    return dialog
  }
  const closeDialog = () => {
    stopAudio()
    generation?.abort()
    generation = null
    root.querySelector<HTMLDialogElement>("#dialog")!.close()
  }
  async function play(id: string) {
    stopAudio()
    const sequence = playSequence
    const asset = await vocabularyDB.audio.get(id)
    if (sequence !== playSequence) return
    if (!asset) throw new Error("Thiếu audio. Hãy nhập lại bộ ZIP gốc.")
    audioUrl = URL.createObjectURL(
      new Blob([new Uint8Array(asset.bytes)], { type: asset.contentType }),
    )
    playing = new Audio(audioUrl)
    playing.playbackRate = speed
    playing.onended = stopAudio
    try {
      await playing.play()
    } catch {
      stopAudio()
      throw new Error("Chưa phát được audio. Hãy chạm nút nghe một lần nữa.")
    }
  }
  const help = () =>
    showDialog(
      `<h2>Mang những từ đã gặp vào đây</h2><ol class="help-list"><li>Trong Read Frog trên máy tính, bôi đen một từ/cụm từ rồi dịch.</li><li>Bấm <strong>Lưu để học</strong>. OpenAI tạo nghĩa theo câu, ví dụ và hai audio. API chỉ dùng khi tạo nội dung.</li><li>Mở <strong>Sổ từ</strong> trong extension rồi bấm <strong>Xuất ZIP</strong>.</li><li>Trên điện thoại hoặc máy tính, mở trang ôn tập và <strong>Nhập ZIP</strong>. Bạn có thể học và nghe offline.</li><li>Sau khi ôn, <strong>Xuất ZIP</strong> để mang theo tiến độ. Nhập bộ cập nhật sẽ ghép từ, giữ tiến độ mới hơn của từng kiểu ôn.</li></ol><p>Dữ liệu nằm trong trình duyệt trên máy này. Giữ bản ZIP để khôi phục khi đổi trình duyệt hoặc xóa dữ liệu. Trang HTML cần được mở trong trình duyệt có JavaScript; trình xem trước file của điện thoại có thể không chạy ứng dụng.</p><div class="dialog-footer"><button data-action="close">Đã hiểu</button></div>`,
    )
  async function handleAction(action: string, button: HTMLElement) {
    if (action === "filters") {
      filtersOpen = !filtersOpen
      render()
      root.querySelector<HTMLButtonElement>(".filter-toggle")?.focus({ preventScroll: true })
      return
    }
    if (action === "import") {
      root.querySelector<HTMLInputElement>("#import-file")!.click()
      return
    }
    if (action === "help") {
      help()
      return
    }
    if (action === "close") {
      closeDialog()
      return
    }
    if (action === "theme") {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme !== "dark"
        : !matchMedia("(prefers-color-scheme:dark)").matches
      document.documentElement.dataset.theme = dark ? "dark" : "light"
      return
    }
    if (action === "audio") {
      await play(button.dataset.id!)
      return
    }
    if (action === "more") {
      limit += 40
      render()
      return
    }
    if (action === "practice") {
      freshSession()
      practice = true
      render()
      return
    }
    if (action === "check-due") {
      freshSession()
      render()
      return
    }
    if (action === "new-library") {
      showDialog(
        `<h2>Tạo bộ từ mới?</h2><p>Xuất ZIP trước để giữ từ, audio và tiến độ hiện tại. Bộ hiện tại sẽ được xóa khỏi trình duyệt; bạn có thể nhập lại từ ZIP đã lưu.</p><label><input id="backup-confirmed" type="checkbox" style="width:20px;min-height:20px;vertical-align:middle"> Tôi đã giữ bản ZIP và muốn tạo bộ mới</label><div class="dialog-footer"><button data-action="close">Giữ bộ hiện tại</button><button class="danger" data-action="confirm-new-library">Tạo bộ mới</button></div>`,
      )
      return
    }
    if (action === "confirm-new-library") {
      if (!root.querySelector<HTMLInputElement>("#backup-confirmed")?.checked) return
      await clearVocabularyLibrary()
      closeDialog()
      query = ""
      tag = ""
      freshSession()
      await refresh()
      render()
      notice("Đã tạo thư viện trống. Bạn có thể nhập ZIP khác hoặc thêm từ mới.")
      return
    }
    if (action === "reveal") {
      revealed = true
      render()
      return
    }
    if (action === "give-up") {
      answered = false
      revealed = true
      render()
      return
    }
    if (action === "add") {
      showDialog(
        `<form id="generate-form"><h2>Thêm từ bằng OpenAI</h2><p>Tạo nghĩa tiếng Việt, ví dụ và giọng đọc từ cấu hình OpenAI hiện tại của extension.</p><div class="field"><label for="new-word">Từ hoặc cụm từ</label><input id="new-word" required maxlength="160" autocomplete="off"></div><div class="field"><label for="new-context">Câu chứa từ đó</label><textarea id="new-context" maxlength="1800" placeholder="Dán câu gốc để lấy đúng nghĩa…"></textarea></div><p id="generate-status" role="status"></p><div class="dialog-footer"><button type="button" data-action="close">Hủy</button><button class="primary" type="submit">Tạo và lưu</button></div></form>`,
      )
      return
    }
    if (action === "view") {
      const card = cards.find((c) => c.id === button.dataset.id)!
      showDialog(
        `<h2>${esc(card.word)}</h2><p class="phonetic">${esc(card.ipa)} · ${esc(card.partOfSpeech)}</p>${audioButton(card.audio.word, "Nghe phát âm từ")}${card.context ? `<blockquote class="context">${esc(card.context)}</blockquote>` : ""}${answer(card)}<div class="dialog-footer"><button data-action="close">Đóng</button></div>`,
      )
      return
    }
    if (action === "delete") {
      const card = cards.find((c) => c.id === button.dataset.id)!
      showDialog(
        `<h2>Xóa từ này?</h2><p>${esc(card.word)} sẽ được xóa khỏi thư viện trên máy, cùng tiến độ ôn của từ này. File ZIP đã xuất vẫn được giữ.</p><div class="dialog-footer"><button data-action="close">Giữ lại</button><button class="danger" data-action="confirm-delete" data-id="${card.id}">Xóa từ</button></div>`,
      )
      return
    }
    if (action === "confirm-delete") {
      await deleteVocabularyCard(button.dataset.id!)
      closeDialog()
      reset()
      await refresh()
      render()
      notice("Đã xóa từ. Xuất ZIP để lưu bộ đã cập nhật.")
      return
    }
    if (action === "export") {
      if (busy) return
      busy = true
      button.setAttribute("disabled", "")
      notice("Đang đóng gói từ, audio và tiến độ…")
      try {
        const bytes = await createVocabularyZip(await exportLibrary())
        download(bytes, `Tu-vung-${new Date().toISOString().slice(0, 10)}.zip`, "application/zip")
        notice("Đã xuất ZIP kèm audio và tiến độ. Giữ file này để sao lưu hoặc chuyển máy.")
      } finally {
        busy = false
        button.removeAttribute("disabled")
      }
    }
  }
  root.innerHTML = `<header><a class="brand" href="#" data-action="home"><span class="brand-mark">${book}</span><span><strong>Read Frog · Sổ từ</strong><small>Gặp một lần, ôn để nhớ</small></span></a><div class="tools header-tools"><button data-action="import">Nhập ZIP</button><button data-action="export">Xuất ZIP</button><button data-action="theme" aria-label="Đổi giao diện sáng tối" title="Đổi sáng/tối">◐</button></div></header><main class="shell"><aside><nav class="nav" aria-label="Trang chính"><button data-tab="study" aria-current="page">Ôn tập</button><button data-tab="library">Sổ từ</button></nav><div class="sidebar-note"><p><strong>Học từ những gì bạn đọc</strong></p><p>Mỗi từ giữ lại câu gốc, nghĩa theo ngữ cảnh và giọng đọc OpenAI.</p><p>Cả ba kiểu học có lịch ôn riêng. Từ chưa nhớ sẽ trở lại sớm hơn.</p><button class="quiet" data-action="help">Hướng dẫn sử dụng</button>${bridge ? `<p style="margin-top:20px"><a href="${esc(bridge.htmlUrl)}" download="ReadFrog-OnTuVung.html">Tải HTML để học riêng</a></p>` : ""}</div></aside><section class="stage" aria-label="Nội dung học"><div id="notice" class="notice" role="status" aria-live="polite"></div><div id="content"></div></section></main><footer class="footer-note">Bộ từ lưu trên thiết bị này. Xuất ZIP để mang theo cả nội dung, audio và tiến độ. <button class="quiet" data-action="help">Hướng dẫn</button></footer><input id="import-file" type="file" accept=".zip,application/zip"><dialog id="dialog" aria-label="Thông tin từ vựng"></dialog>`
  const newLibraryButton = document.createElement("button")
  newLibraryButton.className = "quiet"
  newLibraryButton.dataset.action = "new-library"
  newLibraryButton.textContent = "Tạo bộ mới"
  root.querySelector(".footer-note")!.append(newLibraryButton)
  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("button,[data-action]")
    if (!button || !root.contains(button) || button.hasAttribute("disabled")) return
    if (button.dataset.tab) {
      tab = button.dataset.tab
      reset()
      render()
      return
    }
    if (button.dataset.mode) {
      mode = button.dataset.mode as ReviewMode
      freshSession()
      render()
      return
    }
    if (button.dataset.choice !== undefined) {
      const card = current()
      if (!card || answered !== null) return
      picked = Number(button.dataset.choice)
      answered = choices[picked] === card.meaning
      revealed = true
      render()
      return
    }
    if (button.dataset.grade) {
      const card = current()
      if (!card || !revealed || busy) return
      busy = true
      button.setAttribute("disabled", "")
      void reviewCard(card.id, mode, button.dataset.grade as Grade)
        .then((p) => {
          progress.set(p.cardId, p)
          completed.add(card.id)
          reset()
          render()
        })
        .catch(() =>
          notice("Chưa lưu được tiến độ. Hãy xuất ZIP để bảo vệ bộ từ và thử lại.", true),
        )
        .finally(() => {
          busy = false
          button.removeAttribute("disabled")
        })
      return
    }
    if (button.dataset.action) {
      if (button.dataset.action === "home") {
        event.preventDefault()
        tab = "study"
        reset()
        render()
        return
      }
      void handleAction(button.dataset.action, button).catch((e) =>
        notice(e instanceof Error ? e.message : "Không hoàn tất được thao tác.", true),
      )
    }
  })
  root.addEventListener("input", (event) => {
    if ((event.target as HTMLElement).id === "search") {
      query = (event.target as HTMLInputElement).value
      limit = 40
      reset()
      render()
    }
  })
  root.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement
    if (input.id === "tag-filter") {
      tag = input.value
      freshSession()
      render()
    }
    if (input.id === "audio-speed") {
      speed = Number(input.value)
      if (playing) playing.playbackRate = speed
    }
  })
  root.addEventListener("submit", (event) => {
    event.preventDefault()
    const form = event.target as HTMLFormElement
    if (form.id === "type-form") {
      const card = current()
      if (!card || revealed) return
      const typed = root.querySelector<HTMLInputElement>("#typed-answer")!.value
      answered = card.acceptedAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(typed))
      revealed = true
      render()
    }
    if (form.id === "generate-form" && bridge && !generation) {
      const controller = new AbortController()
      generation = controller
      const status = form.querySelector<HTMLElement>("#generate-status")!
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!
      button.disabled = true
      const capture = {
        word: form.querySelector<HTMLInputElement>("#new-word")!.value.trim(),
        context: form.querySelector<HTMLTextAreaElement>("#new-context")!.value,
        sourceTitle: "Thêm thủ công",
        sourceUrl: "",
      }
      status.textContent = "Đang tạo nội dung bằng OpenAI…"
      void bridge
        .generate(
          capture,
          controller.signal,
          (e) =>
            (status.textContent =
              e.stage === "text"
                ? "Đang tạo nghĩa và ví dụ…"
                : e.stage === "word-audio"
                  ? "Đang tạo audio từ…"
                  : "Đang tạo audio ví dụ…"),
        )
        .then(async (result) => {
          if (controller.signal.aborted) return
          closeDialog()
          await refresh()
          freshSession()
          render()
          notice(result.duplicate ? "Từ này đã có trong sổ." : "Đã lưu từ và hai audio OpenAI.")
        })
        .catch(() => {
          if (!controller.signal.aborted)
            status.textContent = "Chưa lưu được. Kiểm tra OpenAI/API key và thử lại."
        })
        .finally(() => {
          if (generation === controller) generation = null
          button.disabled = false
        })
    }
  })
  root.querySelector<HTMLDialogElement>("#dialog")!.addEventListener("cancel", () => {
    generation?.abort()
    generation = null
    stopAudio()
  })
  root.querySelector<HTMLInputElement>("#import-file")!.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0]
    input.value = ""
    if (!file || busy) return
    if (file.size > MAX_ARCHIVE_BYTES) {
      notice("Bộ từ vượt 64 MB. Hãy chia thành bộ nhỏ hơn.", true)
      return
    }
    busy = true
    notice("Đang kiểm tra và nhập bộ từ…")
    void (async () => {
      const bundle = await readVocabularyZip(new Uint8Array(await file.arrayBuffer()))
      await importLibrary(bundle)
      await refresh()
      freshSession()
      render()
      notice(`Đã nhập ${bundle.cards.length} từ; giữ tiến độ mới hơn của từng kiểu ôn.`)
    })()
      .catch(() =>
        notice(
          "Không nhập được. Cần ZIP từ vựng Read Frog phiên bản 1 có đủ dữ liệu và audio, tối đa 64 MB. Thư viện cũ vẫn được giữ.",
          true,
        ),
      )
      .finally(() => (busy = false))
  })
  document.addEventListener("keydown", (event) => {
    if (
      root.querySelector<HTMLDialogElement>("#dialog")!.open ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.repeat ||
      tab !== "study"
    )
      return
    if (
      event.code === "Space" &&
      event.target instanceof Element &&
      event.target.closest("button,a")
    )
      return
    if (event.code === "Space" && mode === "flash" && !revealed) {
      event.preventDefault()
      revealed = true
      render()
    }
    if (revealed && /^[1-4]$/.test(event.key)) {
      const button = root.querySelector<HTMLButtonElement>(`.grades button:nth-child(${event.key})`)
      if (button && !button.disabled) {
        event.preventDefault()
        button.click()
      }
    }
  })
  window.addEventListener("pagehide", () => {
    generation?.abort()
    stopAudio()
  })
  window.addEventListener("focus", () => {
    if (!generation && !busy && !root.querySelector<HTMLDialogElement>("#dialog")!.open)
      void refresh()
        .then(render)
        .catch(() => notice("Chưa đọc được dữ liệu trên máy.", true))
  })
  try {
    await refresh()
    render()
  } catch {
    root.querySelector<HTMLElement>("#content")!.innerHTML = empty(
      "Chưa mở được thư viện",
      "Hãy mở HTML bằng trình duyệt Edge/Chrome, cho phép lưu dữ liệu và tránh trình xem trước file. Giữ ZIP gốc để nhập lại.",
      `<button data-action="help">Xem hướng dẫn</button>`,
    )
    notice("Trình duyệt chưa cho phép truy cập bộ nhớ trên thiết bị.", true)
  }
}
