import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue, useSetAtom } from "jotai"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Input } from "@/components/ui/base-ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { LLM_PROVIDER_MODELS } from "@/utils/constants/models"
import { sendMessage } from "@/utils/message"
import { getOpenAIOutputIdentity } from "@/utils/providers/openai-profile"
import { PageLayout } from "../../components/page-layout"
import { AIContentAwareConfig } from "./ai-content-aware"
import { LanguageDetectionConfig } from "./language-detection"

const MODEL_ITEMS = LLM_PROVIDER_MODELS.openai.map((value) => ({ value, label: value }))
const REASONING_ITEMS = [
  { value: "model-recommendation", label: "Model recommendation" },
  ...["provider-default", "none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({
    value,
    label: value,
  })),
]

export function ApiProvidersPage() {
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const provider = config.providersConfig[0]!
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ["openai-key-status"],
    queryFn: () => sendMessage("getOpenAIKeyStatus", undefined),
    retry: false,
  })
  const [keyInput, setKeyInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState("")
  const serial = useRef(0)
  const latest = useRef({
    identity: getOpenAIOutputIdentity(provider),
    revision: status.data?.revision,
  })
  // oxlint-disable-next-line react/refs -- callbacks compare against the current rendered snapshot, never a closed-over prior model.
  latest.current = { identity: getOpenAIOutputIdentity(provider), revision: status.data?.revision }

  async function updateProvider(update: Record<string, unknown>) {
    serial.current++
    setFeedback("")
    try {
      await setConfig((current) => ({
        providersConfig: [
          openAIPublicConfigSchema.parse({ ...current.providersConfig[0], ...update }),
        ],
      }))
    } catch {
      setFeedback("The model settings could not be saved.")
    }
  }
  async function mutateCredential(remove: boolean) {
    serial.current++
    setBusy(true)
    setFeedback("")
    try {
      const next = remove
        ? await sendMessage("deleteOpenAIKey", undefined)
        : await sendMessage("saveOpenAIKey", { key: keyInput })
      setKeyInput("")
      queryClient.setQueryData(["openai-key-status"], next)
      setFeedback(
        remove
          ? "API key deleted. Your settings and Microsoft TTS are retained."
          : "API key saved on this device.",
      )
    } catch {
      setFeedback("The credential could not be saved. Check the input and local storage.")
    } finally {
      setBusy(false)
    }
  }
  async function testConnection() {
    const run = ++serial.current
    const snapshot = openAIPublicConfigSchema.parse(provider)
    const identity = getOpenAIOutputIdentity(snapshot)
    setBusy(true)
    setFeedback("")
    try {
      const result = await sendMessage("testOpenAIConnection", snapshot)
      if (
        run !== serial.current ||
        identity !== latest.current.identity ||
        result.credentialRevision !== latest.current.revision
      )
        return
      setFeedback(
        result.ok
          ? "OpenAI connection succeeded."
          : result.code === "NOT_CONFIGURED"
            ? "Save an OpenAI API key first."
            : "OpenAI connection failed. Check your key, model and OpenAI account limits.",
      )
    } catch {
      if (run === serial.current) setFeedback("The connection test could not be completed.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <PageLayout
      title="OpenAI"
      description="Translate, analyze text and enable OpenAI speech with your API key. Choose speech providers and voices under Text to Speech."
      innerClassName="flex flex-col gap-8"
    >
      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-lg font-semibold">API key</h2>
        <p>
          {status.isError
            ? "Credential storage is unavailable."
            : status.data?.configured
              ? "Configured on this device"
              : status.data?.requiresReentry
                ? "Re-enter an official OpenAI key. Previous credentials were not activated automatically."
                : "No API key configured"}
        </p>
        <p className="text-sm text-muted-foreground">
          Keys are kept in separate local credential storage and excluded from settings exports.
          Only this settings page can replace or delete the key.
        </p>
        {!!status.data?.recoveryBackupCount && (
          <p role="alert">
            {status.data.recoveryBackupCount} old backup(s) could not be converted. They have been
            retained privately on this device and excluded from ordinary export.
          </p>
        )}
        <label htmlFor="openai-key">New API key</label>
        <Input
          id="openai-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={keyInput}
          disabled={busy}
          onChange={(event) => setKeyInput(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !keyInput.trim()}
            onClick={() => {
              void mutateCredential(false)
            }}
          >
            Save key
          </Button>
          <Button
            variant="outline"
            disabled={
              busy || !status.data || (!status.data.configured && !status.data.requiresReentry)
            }
            onClick={() => {
              void mutateCredential(true)
            }}
          >
            Delete credentials
          </Button>
          <Button
            variant="outline"
            disabled={busy || !status.data?.configured}
            onClick={() => {
              void testConnection()
            }}
          >
            Test connection
          </Button>
        </div>
        <p role="status">{feedback}</p>
        <label htmlFor="openai-model">OpenAI model</label>
        <Select
          items={MODEL_ITEMS}
          value={provider.model.model}
          disabled={provider.model.isCustomModel}
          onValueChange={(value) => {
            if (value) void updateProvider({ model: { ...provider.model, model: value } })
          }}
        >
          <SelectTrigger id="openai-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {LLM_PROVIDER_MODELS.openai.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={provider.model.isCustomModel}
            onChange={(event) => {
              void updateProvider({
                model: {
                  ...provider.model,
                  isCustomModel: event.target.checked,
                  customModel: provider.model.customModel || provider.model.model,
                },
              })
            }}
          />
          Enter a model ID
        </label>
        {provider.model.isCustomModel && (
          <Input
            aria-label="Custom OpenAI model ID"
            defaultValue={provider.model.customModel ?? ""}
            onBlur={(event) => {
              void updateProvider({ model: { ...provider.model, customModel: event.target.value } })
            }}
          />
        )}
        <label htmlFor="openai-reasoning">Reasoning</label>
        <Select
          items={REASONING_ITEMS}
          value={provider.reasoning ?? "model-recommendation"}
          onValueChange={(value) => {
            if (value)
              void updateProvider({
                reasoning: value === "model-recommendation" ? undefined : value,
              })
          }}
        >
          <SelectTrigger id="openai-reasoning" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASONING_ITEMS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label htmlFor="openai-temperature">Temperature (optional)</label>
        <Input
          id="openai-temperature"
          type="number"
          min={0}
          max={2}
          step={0.1}
          defaultValue={provider.temperature ?? ""}
          onBlur={(event) => {
            void updateProvider({
              temperature: event.target.value === "" ? undefined : Number(event.target.value),
            })
          }}
        />
      </section>
      <LanguageDetectionConfig />
      <AIContentAwareConfig />
    </PageLayout>
  )
}
