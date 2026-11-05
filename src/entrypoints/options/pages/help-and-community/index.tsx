import { PageLayout } from "../../components/page-layout"
export function HelpAndCommunityPage() {
  return (
    <PageLayout title="Help" description="OpenAI text translation and Microsoft text-to-speech">
      <div className="max-w-2xl space-y-4 text-sm">
        <p>
          Save your OpenAI API key and choose a model in OpenAI settings. Page translation,
          selection translation, input translation and custom actions use that same configuration.
        </p>
        <p>
          Microsoft text-to-speech works independently of the OpenAI key. Choose voices and speech
          settings under Text-to-Speech.
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
