import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v113-to-v114"
import { testSeries } from "../example/v113"

const connection = {
  notebaseId: "notebase-1",
  notebaseNameSnapshot: "Words",
  connectedAccount: { id: "user-1", name: "Reader", email: "reader@example.com" },
  mappings: [
    {
      id: "mapping-1",
      localFieldId: "default-dictionary-term",
      notebaseColumnId: "column-term",
      notebaseColumnNameSnapshot: "Term",
    },
  ],
}

describe("v113-to-v114 migration", () => {
  it("changes nothing: v114 only allows a new optional list", () => {
    const config = {
      selectionToolbar: { builtInActions: { dictionary: { notebaseConnection: connection } } },
    }
    expect(migrate(config)).toBe(config)
  })

  it("leaves an older connection with no skipped fields, so its unmapped fields are undecided", () => {
    const config = structuredClone(Object.values(testSeries)[0]!.config)
    config.selectionToolbar.builtInActions.dictionary.notebaseConnection =
      structuredClone(connection)

    const parsed = { success: true, data: migrate(config) }

    expect(parsed.success).toBe(true)
    const migrated = parsed.data?.selectionToolbar.builtInActions.dictionary.notebaseConnection
    expect(migrated?.mappings).toEqual(connection.mappings)
    expect(migrated?.skippedFieldIds).toBeUndefined()
  })

  it("accepts the list a v114 connection carries", () => {
    const config = structuredClone(Object.values(testSeries)[0]!.config)
    config.selectionToolbar.builtInActions.dictionary.notebaseConnection = {
      ...structuredClone(connection),
      skippedFieldIds: ["default-dictionary-difficulty"],
    }

    const parsed = { success: true, data: migrate(config) }

    expect(parsed.success).toBe(true)
    expect(
      parsed.data?.selectionToolbar.builtInActions.dictionary.notebaseConnection?.skippedFieldIds,
    ).toEqual(["default-dictionary-difficulty"])
  })
})
