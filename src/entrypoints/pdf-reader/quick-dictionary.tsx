import React, { useEffect, useRef, useState } from "react"
import { Volume2, Bookmark, Check, X, Loader2 } from "lucide-react"
import { i18n } from "@/utils/i18n"
import type { Config } from "@/types/config/config"
import { aiCacheKey, readAiCache, saveAiCache } from "@/utils/ai-cache/db"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"
import { sendMessage } from "@/utils/message"
import {
  VOCABULARY_PORT,
  type VocabularySaveEvent,
} from "@/utils/vocabulary/schema"

export interface QuickWordTarget {
  word: string
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number }
  context: string
  page: number
}

interface QuickDictionaryPopoverProps {
  target: QuickWordTarget
  documentId: string
  documentTitle: string
  config: Config
  onClose: () => void
  onOpenPanel?: (word: string) => void
}

interface WordDefinition {
  ipa?: string
  pos?: string
  meaning?: string
  example?: string
}

export function QuickDictionaryPopover({
  target,
  documentId,
  documentTitle,
  config,
  onClose,
  onOpenPanel,
}: QuickDictionaryPopoverProps) {
  const [definition, setDefinition] = useState<WordDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Speak word using Web Speech API
  const speakWord = () => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(target.word)
    utter.lang = "en-US"
    utter.rate = 0.9
    setSpeaking(true)
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utter)
  }

  // Dismiss on clicking outside or pressing Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleDown)
    window.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleDown)
      window.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Lookup word
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError("")

    async function lookup() {
      // 1. First check if already in vocabulary study snapshot
      try {
        const snapshot = await sendMessage("getVocabularyStudySnapshot", undefined)
        if (cancelled) return
        const norm = target.word.toLowerCase().trim()
        const found = snapshot.words.find((w) => w.variants.includes(norm))
        if (found) {
          setDefinition({
            meaning: found.meaning,
            example: found.context,
          })
          setSaved(true)
          setLoading(false)
          return
        }
      } catch {}

      // 2. Check persistent AI cache
      const dictKey = aiCacheKey("quick-dict", target.word.toLowerCase().trim())
      try {
        const cached = await readAiCache(dictKey)
        if (cached) {
          if (cancelled) return
          const parsed = JSON.parse(cached)
          setDefinition(parsed)
          setLoading(false)
          return
        }
      } catch {}

      // 3. Query via OpenAI streamBackgroundText
      try {
        const provider = resolveProviderRefForCapability(
          "selectionTranslation",
          config.providersConfig,
          config.selectionToolbar.features.translate.providerId,
        )
        if (!provider) {
          throw new Error("Chưa cấu hình OpenAI trong Cài đặt.")
        }

        let rawOutput = ""
        await streamBackgroundText(
          {
            providerKind: "local",
            providerId: provider.config.id,
            providerConfig: provider.config,
            instructions:
              'You are a concise English-to-Vietnamese learner dictionary. For the English word, return ONLY valid JSON: {"ipa":"/.../","pos":"noun/verb/adj","meaning":"nghĩa tiếng Việt ngắn gọn","example":"short English sentence"}. No markdown, no commentary.',
            prompt: target.word,
            usageTask: "selection",
          },
          {
            signal: controller.signal,
            onChunk: (chunk) => {
              if (chunk.output) rawOutput = chunk.output
            },
          },
        )

        if (cancelled) return

        // Parse JSON output
        const match = rawOutput.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          setDefinition({
            ipa: parsed.ipa,
            pos: parsed.pos,
            meaning: parsed.meaning,
            example: parsed.example,
          })
          void saveAiCache(dictKey, "quick-dict", target.word, JSON.stringify(parsed))
        } else if (rawOutput.trim()) {
          const simple = { meaning: rawOutput.trim() }
          setDefinition(simple)
          void saveAiCache(dictKey, "quick-dict", target.word, JSON.stringify(simple))
        } else {
          setError("Không tìm thấy nghĩa của từ.")
        }
      } catch (err: any) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err?.message || "Chưa tải được nghĩa từ.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void lookup()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [target.word, config])

  // Save to vocabulary notebook
  const saveToNotebook = async () => {
    if (saving || saved) return
    setSaving(true)
    try {
      await createPortStreamPromise<VocabularySaveEvent>(
        VOCABULARY_PORT,
        {
          word: target.word,
          context: target.context.slice(0, 1800),
          sourceTitle: documentTitle || "PDF Document",
          sourceUrl: "",
          source: { kind: "pdf", documentId, page: target.page },
        },
        {},
      )
      setSaved(true)
    } catch {
      setError(i18n.t("pdfReader.quickDictSaveError") || "Không thể lưu từ vào sổ. Thử lại sau.")
    } finally {
      setSaving(false)
    }
  }

  // Calculate popover coordinates
  const popWidth = 280
  const popHeight = 150
  const top =
    target.rect.top > popHeight + 60
      ? target.rect.top - popHeight - 8
      : target.rect.bottom + 8
  const left = Math.max(
    12,
    Math.min(
      window.innerWidth - popWidth - 12,
      target.rect.left + target.rect.width / 2 - popWidth / 2,
    ),
  )

  return (
    <div
      ref={popoverRef}
      className="rf-quick-dict-popover"
      style={{
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${popWidth}px`,
        zIndex: 9999,
      }}
      role="dialog"
      aria-label={`Từ điển nhanh: ${target.word}`}
    >
      <div className="rf-quick-dict-header">
        <div className="rf-quick-dict-word-group">
          <span className="rf-quick-dict-word">{target.word}</span>
          {definition?.pos && <span className="rf-quick-dict-pos">{definition.pos}</span>}
        </div>
        <div className="rf-quick-dict-actions">
          <button
            type="button"
            className={`rf-quick-dict-icon-btn ${speaking ? "rf-active" : ""}`}
            title={i18n.t("pdfReader.quickDictPronounce") || "Phát âm"}
            aria-label={i18n.t("pdfReader.quickDictPronounce") || "Phát âm"}
            onClick={speakWord}
          >
            <Volume2 size={15} />
          </button>
          <button
            type="button"
            className="rf-quick-dict-icon-btn"
            title={i18n.t("pdfReader.quickDictClose") || "Đóng"}
            aria-label={i18n.t("pdfReader.quickDictClose") || "Đóng"}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {definition?.ipa && (
        <div className="rf-quick-dict-ipa">{definition.ipa}</div>
      )}

      <div className="rf-quick-dict-body">
        {loading && (
          <div className="rf-quick-dict-loading">
            <Loader2 size={16} className="rf-spin" />
            <span>{i18n.t("pdfReader.quickDictLookup") || "Đang tra từ…"}</span>
          </div>
        )}
        {error && !loading && <div className="rf-quick-dict-error">{error}</div>}
        {definition?.meaning && !loading && (
          <div className="rf-quick-dict-meaning">{definition.meaning}</div>
        )}
        {definition?.example && !loading && (
          <div className="rf-quick-dict-example">“{definition.example}”</div>
        )}
      </div>

      <div className="rf-quick-dict-footer">
        <button
          type="button"
          className={`rf-quick-dict-save-btn ${saved ? "rf-saved" : ""}`}
          disabled={saving || saved}
          onClick={saveToNotebook}
        >
          {saving ? (
            <>
              <Loader2 size={13} className="rf-spin" /> {i18n.t("pdfReader.quickDictSaving") || "Đang lưu…"}
            </>
          ) : saved ? (
            <>
              <Check size={13} /> {i18n.t("pdfReader.quickDictSavedToNotebook") || "Đã lưu vào sổ từ"}
            </>
          ) : (
            <>
              <Bookmark size={13} /> {i18n.t("pdfReader.quickDictSave") || "Lưu vào sổ từ"}
            </>
          )}
        </button>
        {onOpenPanel && (
          <button
            type="button"
            className="rf-quick-dict-panel-link"
            title={i18n.t("pdfReader.quickDictOpenPanel") || "Mở khung dịch chi tiết"}
            onClick={() => onOpenPanel(target.word)}
          >
            {i18n.t("pdfReader.quickDictDetailedTranslate") || "Dịch chi tiết →"}
          </button>
        )}
      </div>
    </div>
  )
}
