import { describe, expect, it } from "vitest"
import { CURATED_ICON_OPTIONS } from "@/entrypoints/options/pages/custom-actions/action-config-form/icon-field-options"
import { selectionToolbarCustomActionSchema } from "@/types/config/selection-toolbar"
import { ACTION_ICON_IDS, isActionIcon, normalizeActionIcon } from "../action-icons"
import { isBundledIcon } from "../bundled-icons"

describe("offline action icon allowlist", () => {
  it("offers only locally bundled IDs that the public schema accepts", () => {
    expect(CURATED_ICON_OPTIONS).toEqual(ACTION_ICON_IDS)
    for (const icon of ACTION_ICON_IDS) {
      expect(isBundledIcon(icon)).toBe(true)
      expect(selectionToolbarCustomActionSchema.shape.icon.safeParse(icon).success).toBe(true)
    }
    expect(isActionIcon("remote:unavailable")).toBe(false)
  })
  it.each(["remote:unavailable", "constructor", "toString", null, undefined])(
    "normalizes unsupported IDs locally",
    (id) => {
      expect(normalizeActionIcon(id)).toBe("tabler:sparkles")
    },
  )
  it("maps a historical ID to its bundled equivalent", () => {
    expect(normalizeActionIcon("streamline-color:dictionary-language-book-flat")).toBe(
      "tabler:book-2",
    )
  })
})
