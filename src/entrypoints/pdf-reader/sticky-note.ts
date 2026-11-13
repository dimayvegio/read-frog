import type { Annotation } from "./study-data"

export function noteDate(id: string) {
  const value = /^note-(\d{13})-/u.exec(id)
  return value ? new Date(Number(value[1])).toLocaleString("vi-VN") : "Chưa có ngày tạo"
}
export function stickyEditor(
  page: HTMLElement,
  note: Annotation,
  save: (text: string, current: () => boolean) => Promise<boolean>,
) {
  const form = document.createElement("form")
  form.className = "rf-sticky-editor"
  form.setAttribute("aria-label", "Sửa ghi chú PDF")
  const header = document.createElement("strong")
  header.textContent = "Ghi chú"
  const date = document.createElement("small")
  date.textContent = noteDate(note.id)
  const input = document.createElement("textarea")
  input.setAttribute("aria-label", "Nội dung ghi chú")
  input.maxLength = 2000
  input.value = note.text
  const actions = document.createElement("div")
  const submit = document.createElement("button")
  submit.type = "submit"
  submit.textContent = "Lưu ghi chú"
  const cancel = document.createElement("button")
  cancel.type = "button"
  cancel.textContent = "Hủy"
  cancel.onclick = () => form.remove()
  actions.append(submit, cancel)
  form.append(header, date, input, actions)
  form.style.left = `${Math.min(0.55, note.points[0]!.x) * 100}%`
  form.style.top = `${Math.min(0.7, note.points[0]!.y) * 100}%`
  form.onpointerdown = (e) => e.stopPropagation()
  form.onclick = (e) => e.stopPropagation()
  form.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === "Escape") form.remove()
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      form.requestSubmit()
    }
  }
  form.onsubmit = async (e) => {
    e.preventDefault()
    if (!input.value.trim() || submit.disabled) return
    submit.disabled = true
    try {
      if (await save(input.value.trim().normalize("NFC"), () => form.isConnected)) form.remove()
    } finally {
      submit.disabled = false
    }
  }
  page.append(form)
  input.focus({ preventScroll: true })
  return form
}
export function stickyMarker(note: Annotation, edit: () => void, remove: () => void) {
  const marker = document.createElement("div")
  marker.className = "rf-sticky-marker"
  marker.style.left = `${note.points[0]!.x * 100}%`
  marker.style.top = `${note.points[0]!.y * 100}%`
  const icon = document.createElement("button")
  icon.type = "button"
  icon.className = "rf-sticky-icon"
  icon.setAttribute("aria-label", `Ghi chú: ${note.text.slice(0, 80)}`)
  icon.style.setProperty("--note-color", note.color)
  // A local speech-bubble icon, no external assets or HTML from user text.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  const path = document.createElementNS(svg.namespaceURI, "path")
  path.setAttribute("d", "M4 4h16v12H9l-5 4V4m4 4h8M8 12h6")
  svg.append(path)
  icon.append(svg)
  icon.onclick = edit
  const popup = document.createElement("section")
  popup.className = "rf-sticky-popup"
  popup.setAttribute("aria-label", "Chi tiết ghi chú")
  const title = document.createElement("strong")
  title.textContent = "Ghi chú"
  const date = document.createElement("small")
  date.textContent = noteDate(note.id)
  const content = document.createElement("p")
  content.textContent = note.text
  const actions = document.createElement("div")
  for (const [label, action] of [
    ["Sửa", edit],
    ["Xóa ghi chú", remove],
  ] as const) {
    const b = document.createElement("button")
    b.type = "button"
    b.textContent = label
    b.onclick = action
    actions.append(b)
  }
  if (note.points[0]!.x > 0.6) {
    popup.style.left = "auto"
    popup.style.right = "0"
  }
  if (note.points[0]!.y > 0.7) {
    popup.style.top = "auto"
    popup.style.bottom = "100%"
  }
  popup.append(title, date, content, actions)
  marker.append(icon, popup)
  marker.onpointerdown = (e) => e.stopPropagation()
  marker.onclick = (e) => e.stopPropagation()
  return marker
}
