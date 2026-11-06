import { browser } from "#imports"
import { createPortStreamPromise } from "../../utils/content-script/port-streaming"
import { VOCABULARY_PORT, type VocabularySaveEvent } from "../../utils/vocabulary/schema"
import { mountVocabularyReview } from "../../vocabulary-review/app"
void mountVocabularyReview(document.getElementById("app")!, {
  htmlUrl: browser.runtime.getURL("/vocabulary-review.html"),
  generate: (capture, signal, onChunk) =>
    createPortStreamPromise<VocabularySaveEvent>(VOCABULARY_PORT, capture, { signal, onChunk }),
})
