import { useAtom, useAtomValue } from "jotai"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Input } from "@/components/ui/base-ui/input"
import {
  FEATURE_METADATA_LIST,
  featureModelSettingSchema,
  type FeatureMetadata,
  type FeatureModelSetting,
} from "@/types/feature-models"
import { configAtom } from "@/utils/atoms/config"
import { featureModelsAtom, liveModelsAtom } from "@/utils/atoms/feature-models"
import { getCatalogModels } from "@/utils/constants/openai-catalog"
import { sendMessage } from "@/utils/message"
import { resolveModelId } from "@/utils/providers/model-id"

export function OpenAIFeatureModelsSettings() {
  const config = useAtomValue(configAtom)
  const [settings, write] = useAtom(featureModelsAtom)
  const [live, setLive] = useAtom(liveModelsAtom)
  const [fetching, setFetching] = useState(false)
  const [status, setStatus] = useState("")
  const global = resolveModelId(config.providersConfig[0]!.model)!
  const fetchModels = async () => {
    setFetching(true)
    try {
      const result = await sendMessage("fetchOpenAILiveModels", undefined)
      if (!result.ok) throw new Error()
      await setLive(result.models)
      setStatus(
        `Đã tải ${result.models.length} model. Danh sách chỉ xác nhận quyền truy cập, không xác nhận khả năng dùng với từng API.`,
      )
    } catch {
      setStatus("Chưa tải được danh sách. Kiểm tra khóa và kết nối; không tự gửi lại.")
    } finally {
      setFetching(false)
    }
  }
  return (
    <section className="flex max-w-2xl flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Model theo tính năng</h2>
        <Button size="sm" variant="outline" disabled={fetching} onClick={() => void fetchModels()}>
          {fetching ? "Đang tải…" : "Làm mới danh sách OpenAI"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Lưu riêng trên máy, chưa đồng bộ Edge. Sau khi lưu, tải lại các tab đang dùng FlowRead để áp
        dụng. Model được giữ cố định trong mỗi tab để kết quả khớp cache. Xem/chỉnh tùy chọn không
        gọi API tạo nội dung.
      </p>
      {status && (
        <p role="status" className="text-xs">
          {status}
        </p>
      )}
      {FEATURE_METADATA_LIST.map((feature) => (
        <FeatureRow
          key={`${feature.key}:${JSON.stringify(settings[feature.key])}`}
          feature={feature}
          setting={settings[feature.key]}
          global={global}
          live={live}
          save={async (value) => {
            await write((current) => {
              const next = { ...current }
              if (value) next[feature.key] = value
              else delete next[feature.key]
              return next
            })
            setStatus("Đã lưu. Tải lại các tab đang dùng để áp dụng.")
          }}
        />
      ))}
    </section>
  )
}
function FeatureRow({
  feature,
  setting,
  global,
  live,
  save,
}: {
  feature: FeatureMetadata
  setting?: FeatureModelSetting
  global: string
  live: string[]
  save: (value: FeatureModelSetting | null) => Promise<void>
}) {
  const customSetting =
    setting &&
    setting.model !== "default" &&
    (setting.isCustomModel || !getCatalogModels(feature.modelType).includes(setting.model))
  const [model, setModel] = useState(customSetting ? "custom" : (setting?.model ?? "default"))
  const [custom, setCustom] = useState(
    setting?.customModel ?? (customSetting ? setting?.model : "") ?? "",
  )
  const [temperature, setTemperature] = useState(setting?.temperature?.toString() ?? "")
  const [reasoning, setReasoning] = useState(setting?.reasoning ?? "")
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const audio = feature.modelType === "audio"
  const models = getCatalogModels(feature.modelType)
  const fallback = feature.modelType === "text" ? global : feature.defaultHint
  const commit = async (reset = false) => {
    setBusy(true)
    try {
      const value = reset
        ? null
        : featureModelSettingSchema.parse({
            model: model === "custom" ? custom.trim() : model,
            isCustomModel: model === "custom",
            customModel: model === "custom" ? custom.trim() : null,
            ...(temperature !== "" ? { temperature: Number(temperature) } : {}),
            ...(reasoning ? { reasoning } : {}),
          })
      await save(value)
      setStatus("Đã lưu. Tải lại tab đang dùng để áp dụng.")
    } catch {
      setStatus("Chưa lưu. Kiểm tra model ID, nhiệt độ 0–2 và quyền ghi bộ nhớ.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-4 text-sm">
      <strong>
        {feature.icon} {feature.name}
      </strong>
      <p className="text-xs text-muted-foreground">{feature.description}</p>
      {audio ? (
        <p className="text-xs">
          Model cố định theo tác vụ: {feature.defaultHint}. Chép trực tiếp: gpt-live-transcribe; SRT
          dùng timestamp từ whisper-1. Model âm thanh không thay thế lẫn nhau.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            Model
            <select
              className="h-9 rounded border bg-background px-2"
              aria-label={`Model ${feature.key}`}
              value={model}
              disabled={busy}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="default">Mặc định ({fallback})</option>
              {models.map((id) => (
                <option key={id} value={id}>
                  {id}
                  {live.includes(id) ? " · tài khoản có quyền" : ""}
                </option>
              ))}
              {feature.modelType === "text" && <option value="custom">Nhập model ID…</option>}
            </select>
          </label>
          {model === "custom" && (
            <Input
              aria-label={`Mã model tùy ý cho ${feature.name}`}
              maxLength={128}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Model hỗ trợ Responses API"
              disabled={busy}
            />
          )}
          {feature.modelType === "text" && (
            <>
              <button
                type="button"
                className="self-start text-xs underline"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                Tùy chỉnh nâng cao
              </button>
              {advanced && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    Nhiệt độ
                    <Input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      placeholder="Theo mặc định chung"
                      onChange={(e) => setTemperature(e.target.value)}
                    />
                  </label>
                  <label>
                    Suy luận
                    <select
                      className="h-9 w-full rounded border bg-background"
                      value={reasoning}
                      onChange={(e) => setReasoning(e.target.value)}
                    >
                      <option value="">Theo mặc định chung</option>
                      {[
                        "provider-default",
                        "none",
                        "minimal",
                        "low",
                        "medium",
                        "high",
                        "xhigh",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Chỉ chọn tham số model hỗ trợ; API có thể từ chối tham số không phù hợp. Model
                    mới hoặc tùy chỉnh chưa được tiện ích xác thực khả năng thị giác.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void commit()}>
              Lưu
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void commit(true)}>
              Đặt lại
            </Button>
          </div>
        </>
      )}
      {status && (
        <p role="status" className="text-xs">
          {status}
        </p>
      )}
    </div>
  )
}
