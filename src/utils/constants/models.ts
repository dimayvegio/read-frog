import type { JSONValue } from "ai"

// Local catalog retained from the pinned baseline.
export const LLM_PROVIDER_MODELS = {
  openai: [
    "gpt-6-luna",
    "gpt-6.1-sol",
    "gpt-6.1-terra",
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    "gpt-5.6",
    "gpt-5.5",
    "gpt-5.4-pro",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.3-chat-latest",
    "gpt-5.2-pro",
    "gpt-5.2-chat-latest",
    "gpt-5.2",
    "gpt-5.1-codex-mini",
    "gpt-5.1-codex",
    "gpt-5.1-chat-latest",
    "gpt-5.1",
    "gpt-5-pro",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-codex",
    "gpt-5-chat-latest",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
  ],
} as const

export const LLM_MODEL_OPTIONS: Array<{ pattern: RegExp; options: Record<string, JSONValue> }> = [
  // OpenAI reasoning models - use the lowest supported reasoning effort
  {
    pattern: /^(?:o1|o3|o4-mini)(?:-|$)/i,
    options: { reasoningEffort: "minimal" },
  },

  // OpenAI GPT-5 and GPT-6 - the lowest reasoning effort each model accepts, unless noted.
  // The accepted range is noted on each entry. The chat-latest variants are left out on
  // purpose: their docs do not advertise reasoning.effort.
  // https://ai-sdk.dev/providers/ai-sdk-providers/openai (reviewed 2026-11-04)
  {
    // Accepts low to max: cannot turn reasoning off.
    pattern: /^(?:openai\/)?gpt-6\.1-sol$/i,
    options: { reasoningEffort: "low" },
  },
  {
    // Accepts none to max.
    pattern: /^(?:openai\/)?gpt-6\.1-terra$/i,
    options: { reasoningEffort: "none" },
  },
  {
    // Accepts low to max.
    pattern: /^(?:openai\/)?gpt-6-astra$/i,
    options: { reasoningEffort: "low" },
  },
  {
    // Accepts none to max, but recommends medium rather than the floor (since #2241).
    pattern: /^(?:openai\/)?gpt-6-sol$/i,
    options: { reasoningEffort: "medium" },
  },
  {
    // Accepts none to max, but recommends medium rather than the floor (since #2241).
    pattern: /^(?:openai\/)?gpt-6-luna$/i,
    options: { reasoningEffort: "medium" },
  },
  {
    // Accepts none to max.
    pattern: /^(?:openai\/)?gpt-5\.6(?:-(?:luna|terra|sol))?$/i,
    options: { reasoningEffort: "none" },
  },
  {
    // Accepts medium to xhigh.
    pattern: /^gpt-5\.[24]-pro$/i,
    options: { reasoningEffort: "medium" },
  },
  {
    // Accepts high only.
    pattern: /^gpt-5-pro$/i,
    options: { reasoningEffort: "high" },
  },
  {
    // Accepts none to xhigh.
    pattern: /^(?:gpt-5\.5|gpt-5\.4|gpt-5\.4-mini|gpt-5\.4-nano|gpt-5\.2)$/i,
    options: { reasoningEffort: "none" },
  },
  {
    // Accepts none to high.
    pattern: /^(?:gpt-5\.1|gpt-5\.1-codex|gpt-5\.1-codex-mini)$/i,
    options: { reasoningEffort: "none" },
  },
  {
    // Accepts minimal to high.
    pattern: /^(?:gpt-5|gpt-5-mini|gpt-5-nano|gpt-5-codex)$/i,
    options: { reasoningEffort: "minimal" },
  },
]
