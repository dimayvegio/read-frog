import { z } from "zod"

export const FEATURE_MODEL_KEYS = [
  "imageTranslate",
  "imageEdit",
  "aiExplanation",
  "selectionTranslate",
  "webTranslate",
  "videoSubtitles",
  "pronunciation",
  "audioTranscription",
] as const

export type FeatureModelKey = (typeof FEATURE_MODEL_KEYS)[number]

export const featureModelSettingSchema = z
  .object({
    model: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9:._-]*$/iu),
    isCustomModel: z.boolean().optional(),
    customModel: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9:._-]*$/iu)
      .nullable()
      .optional(),
    temperature: z.number().min(0).max(2).optional(),
    reasoning: z
      .enum(["provider-default", "none", "minimal", "low", "medium", "high", "xhigh"])
      .optional(),
  })
  .refine((value) => !value.isCustomModel || !!value.customModel, {
    message: "Nhập model ID trước khi lưu.",
  })

export type FeatureModelSetting = z.infer<typeof featureModelSettingSchema>

export const featureModelsRecordSchema = z.partialRecord(
  z.enum(FEATURE_MODEL_KEYS),
  featureModelSettingSchema,
)
export type FeatureModelsRecord = z.infer<typeof featureModelsRecordSchema>

export const OPENAI_FEATURE_MODELS_STORAGE_KEY = "openaiFeatureModelsV1"
export const OPENAI_LIVE_MODELS_CACHE_KEY = "openaiLiveModelsCache"

export interface FeatureMetadata {
  key: FeatureModelKey
  name: string
  description: string
  icon: string
  defaultHint: string
  modelType: "text" | "image" | "audio"
}

export const FEATURE_METADATA_LIST: FeatureMetadata[] = [
  {
    key: "imageTranslate",
    name: "Dịch ảnh OCR (Bảng biểu & Đè chữ)",
    description:
      "Dịch chữ trên ảnh, trích xuất cấu trúc bảng biểu, đè chữ dịch lên ảnh gốc (Overlay & Structure OCR).",
    icon: "🖼️",
    defaultHint: "Theo model chung; cần model hỗ trợ ảnh",
    modelType: "text",
  },
  {
    key: "imageEdit",
    name: "Tạo ảnh dịch OpenAI trực tiếp",
    description:
      "OpenAI vẽ và tạo ảnh mới giữ nguyên bố cục chữ và hình vẽ (chế độ Generate trong Dịch ảnh & PDF).",
    icon: "🎨",
    defaultHint: "gpt-image-2.6-sunburst",
    modelType: "image",
  },
  {
    key: "aiExplanation",
    name: "Giải thích từ & Tóm tắt AI",
    description:
      "Phân tích chuyên sâu ngữ cảnh, giải thích thuật ngữ chuyên ngành và tóm tắt nội dung.",
    icon: "💡",
    defaultHint: "Theo model chung",
    modelType: "text",
  },
  {
    key: "selectionTranslate",
    name: "Dịch văn bản bôi đen & Tra từ",
    description: "Thanh công cụ dịch nhanh khi bôi đen đoạn văn trên web hoặc PDF.",
    icon: "🌐",
    defaultHint: "Theo model chung",
    modelType: "text",
  },
  {
    key: "webTranslate",
    name: "Dịch toàn trang Web & PDF",
    description: "Dịch song ngữ toàn bộ trang web và tài liệu đọc PDF.",
    icon: "📄",
    defaultHint: "Theo model chung",
    modelType: "text",
  },
  {
    key: "videoSubtitles",
    name: "Bản dịch phụ đề video",
    description:
      "Dịch phụ đề YouTube/ani.pm. Giọng TTS và phân tích audio dùng model riêng của các tác vụ đó.",
    icon: "🎬",
    defaultHint: "Theo model chung",
    modelType: "text",
  },
  {
    key: "pronunciation",
    name: "Đánh giá phát âm",
    description: "Chấm điểm phát âm tiếng Anh chuẩn Mỹ qua micro với thang điểm chi tiết.",
    icon: "🎙️",
    defaultHint: "gpt-audio-1.5",
    modelType: "audio",
  },
  {
    key: "audioTranscription",
    name: "Audio → Văn bản",
    description: "Chuyển giọng nói từ tập tin hoặc tab trình duyệt thành văn bản.",
    icon: "📝",
    defaultHint: "gpt-transcribe / whisper-1",
    modelType: "audio",
  },
]
