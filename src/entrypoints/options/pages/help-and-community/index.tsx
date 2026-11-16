import { Button } from "@/components/ui/base-ui/button"
import { useExportDiagnostics } from "@/hooks/use-export-diagnostics"
import { i18n } from "@/utils/i18n"
import { PageLayout } from "../../components/page-layout"
export function HelpAndCommunityPage() {
  const exportDiagnostics = useExportDiagnostics()
  return (
    <PageLayout title="Help" description="OpenAI text translation and OpenAI speech">
      <div className="max-w-2xl space-y-4 text-sm">
        <Button onClick={() => exportDiagnostics.mutate()} disabled={exportDiagnostics.isPending}>
          {i18n.t("options.helpAndCommunity.diagnostics.title")}
        </Button>
        <p>
          Diagnostics are saved locally. Review the file before sharing; nothing is uploaded
          automatically.
        </p>
        <p>
          Save your OpenAI API key and choose a model in OpenAI settings. Page translation,
          selection translation, input translation and custom actions use that same configuration.
        </p>
        <p>
          Choose a model and voice under Text-to-Speech. OpenAI speech uses the same saved API key
          with a separate speech model and voices. This build does not use Microsoft speech.
        </p>
        <p>
          Use Preferences to export settings and glossary data. Exports never contain the saved API
          key. Resetting or importing settings keeps the saved credential; deleting credentials is a
          separate action.
        </p>
        <p>
          Automatic migration applies only when updating an installation with the same extension ID.
          For a different extension ID, import your settings file and enter a key separately.
        </p>
      </div>
    </PageLayout>
  )
}
