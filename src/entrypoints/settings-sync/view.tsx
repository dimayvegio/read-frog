import type { EdgeSyncView, SettingsSummary } from "@/utils/settings-sync/db"
import { useCallback, useEffect, useState } from "react"
import { sendMessage } from "@/utils/message"
const language = (code: string) =>
  code === "vie" ? "Tiếng Việt" : code === "eng" ? "Tiếng Anh" : code
function Summary({ value }: { value: SettingsSummary }) {
  return (
    <p>
      Model: <strong>{value.model}</strong>
      <br />
      Dịch sang: {language(value.targetLanguage)}
      <br />
      Ngôn ngữ giao diện: {value.uiLanguage}
      <br />
      Tô từ đang học: {value.studyHighlightsEnabled ? "Bật" : "Tắt"}
    </p>
  )
}
function Configuration({ value }: { value: EdgeSyncView["localConfiguration"] }) {
  return (
    <details>
      <summary>Xem đầy đủ cấu hình trước khi chọn</summary>
      <pre className="sync-config">{JSON.stringify(value, null, 2)}</pre>
    </details>
  )
}
export function SettingsSyncPage() {
  const [data, setData] = useState<EdgeSyncView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const refresh = useCallback(async (force = false) => {
    try {
      const next = await sendMessage("getEdgeSettingsSync", undefined)
      setData((current) => (!force && current?.status === "conflict" ? current : next))
      setError("")
    } catch {
      setError("Chưa đọc được trạng thái đồng bộ. Bấm Tải lại để thử lại.")
    }
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Hydrates external state from the background.
    void refresh()
    const timer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 3000)
    return () => clearInterval(timer)
  }, [refresh])
  const run = async (operation: () => Promise<EdgeSyncView>) => {
    setBusy(true)
    try {
      setData(await operation())
      setError("")
    } catch {
      setError("Chưa thực hiện được. Bấm Tải lại và thử lại; cấu hình đã sao lưu vẫn được giữ.")
    } finally {
      setBusy(false)
    }
  }
  const disabled = busy || data?.status === "busy"
  return (
    <main className="rf-usage" data-testid="settings-sync">
      <header>
        <p className="rf-usage-eyebrow">READ FROG · ĐỒNG BỘ EDGE</p>
        <h1>Cấu hình đi cùng bạn</h1>
        <p>
          Dùng tài khoản đã đăng nhập Microsoft Edge. Không cần Client ID, Azure hoặc máy chủ trung
          gian.
        </p>
      </header>
      <section>
        <h2>Kết nối trình duyệt</h2>
        <p>
          Trên các máy, đăng nhập cùng tài khoản Edge và bật đồng bộ <strong>Extensions</strong>.
          Read Frog tự lưu cấu hình vào kho đồng bộ của trình duyệt khi bạn bật bên dưới.
        </p>
        <div className="rf-usage-tools">
          <button type="button" onClick={() => void sendMessage("openEdgeSyncSettings", undefined)}>
            Mở thiết lập đồng bộ Edge
          </button>
          <button type="button" onClick={() => void refresh(true)}>
            Tải lại
          </button>
        </div>
        {data && (
          <>
            <p>
              ID extension: <code style={{ overflowWrap: "anywhere" }}>{data.extensionId}</code>
            </p>
            <p>
              Các máy phải có <strong>cùng ID extension</strong>. Với bản ZIP cài tay, giữ nguyên
              đường dẫn thư mục khi cập nhật; khi cài máy khác hãy đối chiếu ID này. Cài từ đường
              dẫn khác có thể tạo ID khác và kho đồng bộ riêng.
            </p>
          </>
        )}
      </section>
      <section>
        <h2>Đồng bộ cấu hình</h2>
        <p>
          Gồm model và tham số dịch, ngôn ngữ, prompt, style, TTS, phím tắt, quy tắc website và nút
          tô từ. API key, glossary, sổ từ, audio, nhật ký học và lịch sử PDF tiếp tục lưu riêng trên
          máy.
        </p>
        {data && (
          <>
            <label className="rf-usage-tools">
              <input
                type="checkbox"
                aria-label="Bật đồng bộ cấu hình Edge"
                checked={data.enabled}
                disabled={disabled}
                onChange={(event) =>
                  void run(() =>
                    sendMessage("setEdgeSettingsSyncEnabled", { enabled: event.target.checked }),
                  )
                }
              />
              Bật đồng bộ cấu hình Edge trên máy này
            </label>
            <p role="status" data-testid="sync-status">
              {data.message}
            </p>
            {data.lastSync && (
              <p>Lần xử lý gần nhất: {new Date(data.lastSync).toLocaleString("vi-VN")}</p>
            )}
            <p>
              Đang dùng khoảng {Math.ceil(data.bytes / 1024)} KB trong kho đồng bộ. Cấu hình được
              nén; nếu vượt giới hạn sẽ báo lỗi và giữ nguyên bản đang có. Kho Edge có giới hạn
              khoảng 100 KB.
            </p>
            <div className="rf-usage-tools">
              <button
                type="button"
                disabled={disabled || !data.enabled || data.pendingApply}
                onClick={() => void run(() => sendMessage("syncEdgeSettingsNow", undefined))}
              >
                Đồng bộ ngay
              </button>
              {data.pendingApply && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    void run(() => sendMessage("acknowledgeEdgeSyncRecovery", undefined))
                  }
                >
                  Giữ cấu hình hiện tại và tắt đồng bộ
                </button>
              )}
              {data.canUndo && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (
                      confirm(
                        "Khôi phục cấu hình trước lần nhận đồng bộ và tắt đồng bộ trên máy này? API key và sổ từ không thay đổi.",
                      )
                    )
                      void run(() => sendMessage("undoEdgeSettingsSync", undefined))
                  }}
                >
                  Khôi phục cấu hình trước lần nhận
                </button>
              )}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      {data?.enabled && data.status === "conflict" && !data.incomplete && (
        <section data-testid="sync-conflict">
          <h2>Chọn bản cấu hình muốn dùng</h2>
          <p>
            Hai máy cùng thay đổi hoặc đây là lần kết nối đầu tiên. Chọn một bản sẽ tạo phiên bản
            tiếp theo; bản cấu hình trên máy được sao lưu trước khi nhận bản khác.
          </p>
          <article>
            <h3>Máy này</h3>
            <Summary value={data.local} />
            <Configuration value={data.localConfiguration} />
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                void run(() =>
                  sendMessage("syncEdgeSettingsNow", { token: data.token, source: "local" }),
                )
              }
            >
              Dùng cấu hình máy này
            </button>
          </article>
          {data.candidates.map((row) => (
            <article key={row.id}>
              <h3>Bản từ thiết bị {row.device.slice(0, 8)}</h3>
              <p>Lưu lúc {new Date(row.at).toLocaleString("vi-VN")}</p>
              <Summary value={row} />
              <Configuration value={row.configuration} />
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  void run(() =>
                    sendMessage("syncEdgeSettingsNow", { token: data.token, source: row.id }),
                  )
                }
              >
                Dùng bản này
              </button>
            </article>
          ))}
        </section>
      )}
      <section>
        <h2>Cách kiểm tra trên máy khác</h2>
        <p>
          Bật tính năng trên cả hai máy, đối chiếu ID extension rồi đổi thử một thiết lập nhỏ. Edge
          chuyển dữ liệu khi tài khoản bật đồng bộ; nếu chưa đăng nhập hoặc đang offline, kho này
          chỉ hoạt động trên máy và sẽ gửi lại khi Edge kết nối.
        </p>
        <p>
          Trạng thái ghi vào kho Edge không phải xác nhận máy khác đã nhận. Với sổ từ và audio, tiếp
          tục dùng <strong>Xuất ZIP / Nhập ZIP</strong>.
        </p>
      </section>
    </main>
  )
}
