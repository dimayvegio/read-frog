import { PageLayout } from "../../components/page-layout"
export function HelpAndCommunityPage() {
  return (
    <PageLayout title="Help" description="OpenAI text translation and OpenAI / Microsoft speech">
      <div className="max-w-2xl space-y-4 text-sm">
        <p>
          Save your OpenAI API key and choose a model in OpenAI settings. Page translation,
          selection translation, input translation and custom actions use that same configuration.
        </p>
        <p>
          Choose Microsoft or OpenAI under Text-to-Speech. OpenAI speech uses the same saved API key
          with a separate speech model and voices. Microsoft speech works independently of the key.
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
