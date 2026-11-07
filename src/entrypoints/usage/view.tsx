import type { usageSnapshot } from "@/utils/usage/db"
import { useCallback, useEffect, useState } from "react"
import { sendMessage } from "@/utils/message"
import { estimateUsage, USAGE_LABELS, type UsageEntry } from "@/utils/usage/schema"
type Snapshot = Awaited<ReturnType<typeof usageSnapshot>>
const money = (value: number) => `$${value.toFixed(6)}`
const percentile = (values: number[], fraction: number) => {
  if (!values.length) return "—"
  const ordered = [...values].sort((a, b) => a - b)
  return `${Math.round(ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]!)} ms`
}
export function UsageDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState("")
  const [asOf, setAsOf] = useState(() => Date.now())
  const [days, setDays] = useState(30),
    [budget, setBudget] = useState("")
  const [statsModel, setStatsModel] = useState("")
  const [model, setModel] = useState(""),
    [input, setInput] = useState(""),
    [output, setOutput] = useState(""),
    [cached, setCached] = useState(""),
    [audio, setAudio] = useState("")
  const refresh = useCallback(async () => {
    try {
      const next = await sendMessage("getUsageSnapshot", undefined)
      setSnapshot(next)
      setAsOf(Date.now())
      setBudget(String(next.budget))
      setError("")
    } catch {
      setError("Chưa đọc được thống kê. Bấm tải lại để thử lại.")
    }
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Hydrates external IndexedDB state after an asynchronous message.
    void refresh()
    const focus = () => void refresh()
    window.addEventListener("focus", focus)
    return () => window.removeEventListener("focus", focus)
  }, [refresh])
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      await refresh()
    } catch {
      setError("Chưa lưu được. Kiểm tra các giá trị và thử lại.")
    }
  }
  if (!snapshot)
    return (
      <main className="rf-usage">
        <h1>Chi phí và tốc độ OpenAI</h1>
        <p>{error || "Đang tải thống kê trên máy…"}</p>
        <button type="button" onClick={() => void refresh()}>
          Tải lại
        </button>
      </main>
    )
  const entries = snapshot.entries.filter(
    (row) => row.at >= asOf - days * 86400000 && (!statsModel || row.model === statsModel),
  )
  const prices = new Map(snapshot.prices.map((price) => [price.model, price]))
  const priceFor = (entry: UsageEntry) => estimateUsage(entry, prices.get(entry.model))
  const api = entries.filter((entry) => entry.status !== "cache"),
    hits = entries.length - api.length
  const completed = api.filter((entry) => entry.status === "complete")
  const estimate = entries.reduce((sum, entry) => sum + (priceFor(entry) ?? 0), 0)
  const unpriced = api.filter((entry) => priceFor(entry) === null).length
  const models = [
    ...new Set([...api.map((row) => row.model), ...snapshot.prices.map((row) => row.model)]),
  ].sort()
  const tasks = [...new Set(entries.map((row) => row.task))]
  const exportJSON = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { format: "read-frog-api-usage", version: 1, exportedAt: Date.now(), ...snapshot },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    )
    const url = URL.createObjectURL(blob),
      link = document.createElement("a")
    link.href = url
    link.download = `ReadFrog-Usage-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <main className="rf-usage">
      <header>
        <p className="rf-usage-eyebrow">READ FROG · THỐNG KÊ TRÊN MÁY</p>
        <h1>Chi phí và tốc độ OpenAI</h1>
        <p>
          Ghi từ bản cập nhật này. Không đọc hóa đơn hoặc dữ liệu sử dụng của các ứng dụng khác
          trong tài khoản OpenAI.
        </p>
      </header>
      <div className="rf-usage-tools">
        <label>
          Model thống kê
          <select
            aria-label="Lọc model thống kê"
            value={statsModel}
            onChange={(event) => setStatsModel(event.target.value)}
          >
            <option value="">Tất cả model và cache</option>
            {[...new Set(snapshot.entries.map((row) => row.model).filter(Boolean))].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Khoảng thời gian{" "}
          <select
            aria-label="Khoảng thời gian thống kê"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {[1, 7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {n} ngày
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void refresh()}>
          Tải lại
        </button>
        <button type="button" onClick={exportJSON}>
          Xuất thống kê JSON
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Xóa nhật ký usage trên máy? Giữ giá và ngân sách; không xóa sổ từ, API key hoặc lịch sử dịch.",
              )
            )
              void run(() => sendMessage("clearUsage", undefined))
          }}
        >
          Xóa nhật ký usage
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <section className="rf-usage-stats" aria-label="Tổng quan usage">
        {[
          [api.length, "Lần gọi API"],
          [hits, "Lượt lấy từ cache"],
          [api.filter((row) => row.status === "error").length, "Lượt lỗi"],
          [api.filter((row) => row.status === "cancelled").length, "Lượt hủy"],
          [money(estimate), "Phí ước tính phần có giá"],
          [unpriced, "Lượt chưa đủ dữ liệu tính phí"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <p>
        Thời gian hoàn tất API: trung vị{" "}
        <b>
          {percentile(
            completed.map((row) => row.durationMs),
            0.5,
          )}
        </b>{" "}
        · p95{" "}
        <b>
          {percentile(
            completed.map((row) => row.durationMs),
            0.95,
          )}
        </b>
        . Token đầu (kể cả suy luận):{" "}
        <b>
          {percentile(
            completed.flatMap((row) => (row.firstTokenMs === null ? [] : [row.firstTokenMs])),
            0.5,
          )}
        </b>
        .
      </p>
      <p className="rf-usage-note">
        Cache trên máy không gọi API. Cached input do OpenAI báo vẫn thuộc một lần gọi API và được
        tính giá riêng. Batch có thể phục vụ nhiều đoạn trong một lần gọi; không dùng số đoạn để suy
        ra số request. Giữ tối đa 90 ngày / 20.000 lượt.
      </p>
      <section>
        <h2>Theo tác vụ</h2>
        <div className="rf-usage-table">
          <table>
            <thead>
              <tr>
                <th>Tác vụ</th>
                <th>API / cache</th>
                <th>Input / output token</th>
                <th>Cached input</th>
                <th>Trung vị / p95</th>
                <th>Ước tính USD</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const rows = entries.filter((row) => row.task === task),
                  calls = rows.filter((row) => row.status !== "cache"),
                  done = calls.filter((row) => row.status === "complete")
                const unknown = calls.filter((row) => priceFor(row) === null).length
                return (
                  <tr key={task}>
                    <th>{USAGE_LABELS[task]}</th>
                    <td>
                      {calls.length} / {rows.length - calls.length}
                    </td>
                    <td>
                      {calls.reduce((n, row) => n + (row.input ?? 0), 0).toLocaleString()} /{" "}
                      {calls.reduce((n, row) => n + (row.output ?? 0), 0).toLocaleString()}{" "}
                      {calls.some((row) => row.input === null || row.output === null)
                        ? "(thiếu usage)"
                        : ""}
                    </td>
                    <td>
                      {calls.reduce((n, row) => n + (row.cachedInput ?? 0), 0).toLocaleString()}
                    </td>
                    <td>
                      {percentile(
                        done.map((row) => row.durationMs),
                        0.5,
                      )}{" "}
                      /{" "}
                      {percentile(
                        done.map((row) => row.durationMs),
                        0.95,
                      )}
                    </td>
                    <td>
                      {money(rows.reduce((n, row) => n + (priceFor(row) ?? 0), 0))}
                      {unknown > 0 && <small> + {unknown} lượt chưa định giá</small>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!entries.length && (
          <p>Chưa có lượt nào trong khoảng này. Dịch hoặc tạo giọng đọc để bắt đầu ghi số liệu.</p>
        )}
      </section>
      <section>
        <h2>Ngân sách tháng</h2>
        <p>
          Đã ghi nhận {money(snapshot.monthlyEstimatedUsd)} phần có giá; {snapshot.monthlyUnpriced}{" "}
          lượt chưa định giá. Mốc tháng theo giờ trên thiết bị.
        </p>
        <div className="rf-usage-tools">
          <label>
            Ngưỡng cảnh báo USD{" "}
            <input
              aria-label="Ngân sách tháng USD"
              type="number"
              min="0"
              max="100000"
              step="0.01"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void run(() => sendMessage("setUsageBudget", { usd: Number(budget) }))}
          >
            Lưu ngân sách
          </button>
        </div>
        <p className="rf-usage-note">
          0 là tắt cảnh báo. Đây là cảnh báo từ phí ước tính trên thiết bị, không phải giới hạn
          thanh toán và không chặn request đang chạy.
        </p>
        {snapshot.budget > 0 && snapshot.monthlyEstimatedUsd >= snapshot.budget && (
          <p role="alert" className="rf-usage-warning">
            Đã chạm ngưỡng ngân sách tháng bạn đặt.
          </p>
        )}
      </section>
      <section>
        <h2>Giá dùng để ước tính</h2>
        <p>
          USD / 1 triệu token, Standard và ngữ cảnh ngắn. Bảng gốc kiểm tra ngày 07/11/2026 từ{" "}
          <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">
            OpenAI
          </a>
          . Model lạ, lượt thiếu usage, cache-write và ngữ cảnh dài được ghi chưa định giá. Có thể
          nhập giá riêng theo hợp đồng của bạn.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void run(() =>
              sendMessage("saveUsagePrice", {
                model,
                input: Number(input),
                output: Number(output),
                cachedInput: Number(cached),
                audioMinute: audio.trim() ? Number(audio) : null,
                checkedAt: `Tự nhập ${new Date().toISOString().slice(0, 10)}`,
              }),
            )
          }}
        >
          <label>
            Model{" "}
            <input
              list="usage-models"
              aria-label="Model tính phí"
              required
              value={model}
              onChange={(event) => {
                const value = event.target.value
                setModel(value)
                const price = prices.get(value)
                setInput(String(price?.input ?? ""))
                setOutput(String(price?.output ?? ""))
                setCached(String(price?.cachedInput ?? ""))
                setAudio(String(price?.audioMinute ?? ""))
              }}
            />
          </label>
          <datalist id="usage-models">
            {models.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {(
            [
              ["Input", input, setInput],
              ["Output", output, setOutput],
              ["Cached input", cached, setCached],
              ["Audio USD / phút", audio, setAudio],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label}>
              {label}
              <input
                aria-label={label}
                type="number"
                min="0"
                step="any"
                required={label !== "Audio USD / phút"}
                value={value}
                onChange={(event) => set(event.target.value)}
              />
            </label>
          ))}
          <button type="submit">Lưu giá riêng</button>
        </form>
        <p className="rf-usage-note">
          TTS WAV không cung cấp token usage: chỉ ghi độ dài PCM đo được và thời gian gọi. Giá
          audio/phút do bạn nhập là phép ước tính, không phải usage token do API trả về. Thay giá sẽ
          tính lại các ước tính trong bảng.
        </p>
        <details>
          <summary>Xem bảng giá hiện dùng</summary>
          <ul>
            {snapshot.prices.map((price) => (
              <li key={price.model}>
                {price.model}: input {price.input}, output {price.output}, cached{" "}
                {price.cachedInput}
                {price.audioMinute !== null ? `, audio $${price.audioMinute}/phút` : ""} ·{" "}
                {price.checkedAt}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  )
}
