import type { ReviewEvent } from "../utils/vocabulary/review-log"
import type { VocabularyCard, CardProgress, VocabularyNotebook } from "../utils/vocabulary/schema"
import {
  currentLearningTask,
  spellingDiff,
  type LearningRun,
  type LearningMode,
} from "../utils/vocabulary/guided-learning"
import {
  loadLearningRun,
  startLearningRun,
  changeLearningRun,
  submitLearningAnswer,
} from "../utils/vocabulary/learning-run-db"

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  )
const names = {
  today: "Học hôm nay",
  weak: "Luyện từ hay sai",
  recall: "Luyện gõ nhiều vòng",
  dictation: "Nghe và gõ",
  cloze: "Điền từ trong câu",
}
const taskNames = {
  recall: "Nhớ nghĩa và gõ từ",
  dictation: "Nghe và gõ",
  cloze: "Điền từ trong câu",
}
interface Options {
  notebook: VocabularyNotebook
  cards: VocabularyCard[]
  events: ReviewEvent[]
  progress: CardProgress[]
  sessionId: string
  initialMode?: LearningMode
  onBusy: (value: boolean) => void
  onRecorded: (event: ReviewEvent, progress?: CardProgress) => void
  onExit: () => void
  play: (id: string, rate: number) => Promise<void>
  stopAudio: () => void
}
export function mountGuidedLearning(root: HTMLElement, options: Options) {
  let run: LearningRun | null = null,
    busy = false,
    disposed = false,
    draft = "",
    message = "",
    rate = 1,
    clockKey = "",
    activeMs = 0,
    started = performance.now()
  const cards = new Map(options.cards.map((card) => [card.id, card]))
  const elapsed = () =>
    Math.min(
      3_600_000,
      Math.max(0, Math.round(activeMs + (document.hidden ? 0 : performance.now() - started))),
    )
  const onVisibility = () => {
    if (document.hidden) activeMs += performance.now() - started
    else started = performance.now()
  }
  document.addEventListener("visibilitychange", onVisibility)
  const action = (id: string, label: string, primary = false) =>
    `<button data-learn-action="${id}" ${busy ? "disabled" : ""} class="${primary ? "primary" : ""}">${label}</button>`
  function hint() {
    const task = run && currentLearningTask(run)
    if (!task || !run || run.hint === "none") return ""
    const chars = Array.from(task.expected)
    return `<p class="learning-hint" role="status">Gợi ý: <strong>${esc(chars.map((char, index) => (/\s/.test(char) || index === 0 || (run!.hint === "partial" && (index === chars.length - 1 || index % 2 === 0)) ? char : "_")).join(" "))}</strong></p>`
  }
  function audio() {
    return `<div class="learning-audio">${action("audio", "▶ Nghe từ")}${action("example-audio", "Nghe câu ví dụ")}<label>Tốc độ<select id="learning-speed">${[0.75, 1, 1.25].map((value) => `<option value="${value}" ${rate === value ? "selected" : ""}>${value}×</option>`).join("")}</select></label></div>`
  }
  function render() {
    if (disposed) return
    const task = run && currentLearningTask(run),
      card = task && cards.get(task.cardId)
    const key = task
      ? `${task.id}:${run!.phase === "correction" ? run!.correctionId : run!.phase === "study" ? "study" : "question"}`
      : ""
    if (key !== clockKey) {
      clockKey = key
      activeMs = 0
      started = performance.now()
    }
    const header = `<div class="page-top"><h1>Học và nhớ từ</h1><p>Nhớ lại nhiều lần, sửa đúng chỗ sai, rồi gặp lại sau.</p></div><div class="learning-actions">${action("exit", "Về ôn tập")}${run && run.phase !== "done" ? action("pause", "Tạm dừng") : ""}</div>${message ? `<p role="status" class="notice">${esc(message)}</p>` : ""}`
    if (!run || run.phase === "done") {
      root.innerHTML =
        header +
        `${run ? (run.queue.length ? '<p class="learning-complete">Đã hoàn thành lượt học. Nhật ký và lịch ôn đã được lưu; có thể tải báo cáo trong tab Nhật ký.</p>' : "<p>Chưa có từ phù hợp cho lượt này. Điền câu cần câu ví dụ chứa đúng từ; Học hôm nay cần từ mới, từ yếu hoặc đến lịch. Bạn có thể chọn Luyện gõ để luyện thêm.</p>") : ""}<div class="learning-start"><h2>Chọn lượt học</h2><p>Học hôm nay ưu tiên từ còn yếu, từ đến lịch và tối đa năm từ mới. Mỗi từ được gặp lại qua ba vòng; sau lỗi sẽ có bước gõ sửa và kiểm tra lại.</p><div class="learning-mode-list">${(Object.keys(names) as LearningMode[]).map((mode) => `<button data-learn-mode="${mode}" ${busy ? "disabled" : ""} class="${mode === "today" ? "primary" : ""}">${names[mode]}</button>`).join("")}</div><p class="hint">Dùng từ, ví dụ và audio đã lưu; học offline, không gọi API. Mỗi lượt tối đa 10 từ. Bước đang học được giữ trên trình duyệt này khi đóng trang.</p></div>`
      return
    }
    if (!card || !task) {
      root.innerHTML =
        header + "<p>Từ trong bước này đã thay đổi. Về ôn tập rồi mở lại buổi học.</p>"
      return
    }
    const detail = `<h2 lang="${esc(card.language)}">${esc(card.word)}</h2><p class="phonetic">${esc(card.ipa)}</p><p class="meaning">${esc(card.meaning)}</p><p>${esc(card.pronunciationTip)}</p>${audio()}`
    let body: string
    if (run.phase === "study")
      body = `<p class="badge">Làm quen từ mới</p>${detail}<blockquote>${esc(card.example.sentence)}</blockquote><p>${esc(card.example.translation)}</p>${action("intro", "Ẩn từ và bắt đầu gõ", true)}<p class="hint">Đây là bước học mẫu, chưa tính là trả lời đúng.</p>`
    else if (run.phase === "question") {
      const cue =
        task.kind === "dictation"
          ? `<p>Nghe từ, sau đó gõ lại. Từ và phiên âm đang được ẩn.</p>${action("audio", "▶ Nghe từ", true)}<label class="learning-rate">Tốc độ<select id="learning-speed">${[0.75, 1, 1.25].map((value) => `<option value="${value}" ${rate === value ? "selected" : ""}>${value}×</option>`).join("")}</select></label>`
          : `<p class="prompt">${task.kind === "cloze" ? "Điền từ đã học vào chỗ trống" : "Nhớ lại từ trong sổ có nghĩa sau"}</p><h2 class="learning-cue">${esc(task.prompt)}</h2>`
      body =
        cue +
        hint() +
        `<form id="learning-answer-form"><label for="learning-answer">Đáp án</label><input id="learning-answer" value="${esc(draft)}" maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" required ${busy ? "disabled" : ""}><button class="primary" type="submit" ${busy ? "disabled" : ""}>Kiểm tra</button></form><div class="learning-actions">${action("hint", run.hint === "none" ? "Gợi ý chữ đầu" : "Thêm gợi ý")}${action("reveal", "Tôi chưa nhớ / hiện đáp án")}</div><p class="hint">Dùng gợi ý hoặc dán đáp án được ghi là có hỗ trợ, không tính vào số lần tự nhớ đúng.</p>`
    } else {
      const feedback = run.feedback!,
        diff = spellingDiff(task.expected, feedback.answer)
      const renderChars = (chars: { text: string; changed: boolean }[]) =>
        chars
          .map((char) => (char.changed ? `<mark>${esc(char.text)}</mark>` : esc(char.text)))
          .join("")
      body = `<p class="feedback ${feedback.result === "correct" ? "correct" : "wrong"}">${feedback.result === "correct" ? (run.hint !== "none" || run.pasted ? "Đã trả lời đúng với hỗ trợ; sẽ kiểm tra lại." : "Đúng rồi. Bạn sẽ gặp lại từ ở vòng sau.") : "Lượt đầu chưa nhớ đúng. Kết quả này được giữ trong nhật ký."}</p>${feedback.answer ? `<p>Bạn gõ: <span class="spelling-original">${renderChars(diff.original)}</span></p>` : ""}<p>Đáp án: <strong class="spelling-target">${renderChars(diff.target)}</strong></p>${detail}`
      if (run.phase === "correction")
        body += `<form id="learning-answer-form"><label for="learning-answer">Gõ sửa theo đáp án phía trên</label><input id="learning-answer" value="${esc(draft)}" maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" required ${busy ? "disabled" : ""}><button type="submit" class="primary" ${busy ? "disabled" : ""}>Kiểm tra phần sửa</button></form><p class="hint">Đây là gõ sửa có mẫu; không đổi lượt sai thành lượt tự nhớ đúng.</p>`
      else
        body += `${run.corrected ? '<p class="feedback correct">Đã sửa đúng. Từ sẽ quay lại khi không còn mẫu.</p>' : ""}${action("next", "Tiếp tục", true)}`
    }
    root.innerHTML =
      header +
      `<section class="study learning-study"><div class="study-header"><span>${names[run.mode]} · Bước ${run.cursor + 1}/${run.queue.length}</span><span>${task.round === 4 ? "Kiểm tra lại" : `Vòng ${task.round}/3`}</span></div><div class="study-main"><p class="badge">${taskNames[task.kind]}</p>${body}</div></section>`
  }
  async function execute(work: () => Promise<void>, repaint = true) {
    if (busy || disposed) return
    busy = true
    options.onBusy(true)
    root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => (button.disabled = true))
    try {
      await work()
      message = ""
    } catch (error) {
      message = error instanceof Error ? error.message : "Chưa lưu được buổi học. Hãy thử lại."
    } finally {
      busy = false
      options.onBusy(false)
      if (!disposed) {
        if (repaint || message) render()
        else
          root
            .querySelectorAll<HTMLButtonElement>("button")
            .forEach((button) => (button.disabled = false))
      }
    }
  }
  async function modify(kind: "hint" | "paste" | "audio" | "intro" | "next", repaint = true) {
    if (!run) return
    await execute(async () => {
      run = await changeLearningRun(
        options.notebook.id,
        run!.id,
        kind,
        currentLearningTask(run!)?.id,
      )
      if (kind === "next" || kind === "intro") draft = ""
    }, repaint)
  }
  const click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>("button")
    if (!button || !root.contains(button)) return
    event.stopPropagation()
    if (busy || button.hasAttribute("disabled")) return
    if (button.dataset.learnMode) {
      void execute(async () => {
        run = await startLearningRun(
          options.notebook.id,
          options.cards,
          options.events,
          options.progress,
          button.dataset.learnMode as LearningMode,
        )
        draft = ""
        options.stopAudio()
      })
      return
    }
    const kind = button.dataset.learnAction
    if (kind === "exit" || kind === "pause") {
      options.stopAudio()
      options.onExit()
      return
    }
    if (kind === "audio" || kind === "example-audio") {
      const card = run && cards.get(currentLearningTask(run)!.cardId)
      if (!card) return
      void execute(async () => {
        if (kind === "audio" && run!.phase === "question")
          run = await changeLearningRun(
            options.notebook.id,
            run!.id,
            "audio",
            currentLearningTask(run!)!.id,
          )
        await options.play(kind === "audio" ? card.audio.word : card.audio.example, rate)
      }, false)
      return
    }
    if (kind === "hint" || kind === "intro" || kind === "next") {
      void modify(kind)
      return
    }
    if (kind === "reveal") void submit(true)
  }
  async function submit(reveal = false) {
    if (!run) return
    const value = draft,
      taskId = currentLearningTask(run)?.id,
      elapsedMs = elapsed()
    await execute(async () => {
      const result = await submitLearningAnswer(
        options.notebook.id,
        run!.id,
        value,
        options.sessionId,
        elapsedMs,
        reveal,
        taskId,
      )
      run = result.run
      draft = ""
      if (result.event) {
        options.events.push(result.event)
        if (result.progress) {
          const index = options.progress.findIndex((row) => row.cardId === result.progress!.cardId)
          if (index < 0) options.progress.push(result.progress)
          else options.progress[index] = result.progress
        }
        options.onRecorded(result.event, result.progress)
      }
      options.stopAudio()
    })
  }
  const submitHandler = (event: Event) => {
    if ((event.target as HTMLElement).id !== "learning-answer-form") return
    event.preventDefault()
    event.stopPropagation()
    if (!busy) void submit()
  }
  const input = (event: Event) => {
    if ((event.target as HTMLElement).id === "learning-answer")
      draft = (event.target as HTMLInputElement).value
  }
  const paste = (event: Event) => {
    if ((event.target as HTMLElement).id === "learning-answer" && run?.phase === "question")
      void modify("paste", false)
  }
  const change = (event: Event) => {
    if ((event.target as HTMLElement).id === "learning-speed")
      rate = Number((event.target as HTMLSelectElement).value)
  }
  root.addEventListener("click", click)
  root.addEventListener("submit", submitHandler)
  root.addEventListener("input", input)
  root.addEventListener("paste", paste)
  root.addEventListener("change", change)
  void execute(async () => {
    run = await loadLearningRun(options.notebook.id)
    if (options.initialMode && (!run || run.phase === "done" || run.mode !== options.initialMode))
      run = await startLearningRun(
        options.notebook.id,
        options.cards,
        options.events,
        options.progress,
        options.initialMode,
      )
  })
  render()
  return {
    dispose: () => {
      disposed = true
      options.stopAudio()
      document.removeEventListener("visibilitychange", onVisibility)
      root.removeEventListener("click", click)
      root.removeEventListener("submit", submitHandler)
      root.removeEventListener("input", input)
      root.removeEventListener("paste", paste)
      root.removeEventListener("change", change)
    },
    isBusy: () => busy,
  }
}
