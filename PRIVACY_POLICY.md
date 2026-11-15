# FlowRead Privacy Policy

Effective: 15 November 2026. Product: **FlowRead** for Microsoft Edge and Google Chrome. Maintainer and privacy/support contact: **admin@4dv.top**. [Source](https://github.com/dimayvegio/read-frog). FlowRead is an independent GPL fork of Read Frog, not an official upstream release. This policy describes this fork.

## Data on your device

Settings, your OpenAI API key, translation caches, local document history, reading positions, PDF annotations/bookmarks, vocabulary notebooks, learning answers/statistics and optional saved reading recordings are stored in your browser's local storage/IndexedDB. The key is kept in separate local credential storage, excluded from normal settings exports and Edge settings sync. Local browser storage is not a hardware vault; people with access to your profile may access it.

The extension-owned PDF reader processes the **PDF binary locally** with bundled PDF.js. It never uploads the PDF binary to OpenAI or a developer server. Bundled local OCR runs locally. Opening, scrolling, searching, editing, printing or extracting pages does not call an AI provider. Workspace metadata is not automatically included in every export or backup; use feature-specific exports and retain original files.

## Direct OpenAI processing

You supply your own OpenAI API key. AI translation, dictionary/enrichment, summary, speech generation, image OCR, pronunciation grading, audio transcription and video analysis send required text, selected image crops or audio **directly to fixed OpenAI HTTPS/WSS endpoints**, authenticated with that key. There is no FlowRead content proxy, developer processing server, analytics SDK, advertising or data sale.

Text may include selected passages, neighboring page/caption context, glossary terms or your optional instructions. Video analysis may send a bounded transcript excerpt/title plus enabled audio samples for context and speaker slots. Unknown speakers use a configured preset voice. This is not voice cloning or identity recognition. Selected content can contain personal or sensitive information; share only material you are authorized to send.

Only crops explicitly chosen for OpenAI image/OCR processing are sent. Local OCR remains local. File transcription sends the chosen audio; live tab transcription sends audio while capture is active. Pronunciation microphone audio uploads only after explicit grading. Local shadowing recordings are not uploaded for scoring. Tab capture does not use the microphone. Microphone practice asks for browser permission and has separate recording/grading controls.

AI features have OpenAI usage fees, separate from ChatGPT subscriptions. They require a configured key and user initiation/enablement. User-enabled automatic page/site translation can send eligible text on matching pages. Live transcription and automatic video analysis continue within their owned session until stopped or invalidated. Automatic video analysis samples the user-selected amount (15 seconds to ten minutes, default 15 seconds) of played audio in each new ten-minute timeline part, at most 128 parts/session. Explicit prepared mode records a selected interval from the current position, waits for analysis, then restores the owned position paused. Longer intervals take more time and may cost more. Changing duration stops old work and turns AI off until re-enabled. These modes do not download future audio or silently fall back to paid OCR/ASR. A failed paid analysis does not automatically retry. Turn the mode off to stop it.

OpenAI handles received data under its own terms and account/endpoint retention settings: [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). `store:false` where supported does not guarantee zero retention. FlowRead cannot control provider retention; review provider terms before enabling AI.

## Other network access

Native caption requests go to the watched website and its caption hosts. Opening a remote PDF requires a source GET to its URL; this is not uploading the document. Site access enables translation interfaces on chosen sites and supported local files when file access is granted. Scripts, WASM, OCR models, fonts, icons and site rules ship in the package, without remote rule updates or executable CDN fallbacks.

Optional **Edge account settings sync** uses browser-native storage.sync. It transfers supported small configuration values, not keys, glossary rows, vocabulary/audio/progress, PDF/image history or pronunciation records. Delivery depends on browser/account settings and Microsoft services. FlowRead has no independent cloud account. Support/source links open external websites. Emailing support or posting an issue shares what you send with those services/the maintainer; remove keys and private content first.

## Retention and controls

Session-only captures, live transcripts and video-analysis profiles are memory-only and released when their owner/session ends. Save/download controls create local files when requested. Persisted local data remains until feature-specific clearing, browser data clearing or uninstall, subject to cache limits. Closing a tab does not delete saved notebooks/history. Uninstall normally removes extension browser data, not exported files. Deleting a key stops future authenticated requests but cannot retract data already sent. Disable/clear synchronized configuration if Edge sync was used; revoke site, microphone or file access in browser settings.

There is no developer-held content account to erase. Privacy questions: **admin@4dv.top**. FlowRead is not directed to children; the maintainer does not knowingly solicit children's information. Data use is limited to the disclosed user-facing functions: no personalized advertising, sale, creditworthiness or lending use. This policy must be updated before adding new data uses.

## Tóm tắt tiếng Việt

FlowRead dùng khóa OpenAI của bạn; thao tác AI gửi văn bản/ngữ cảnh, vùng ảnh hoặc audio cần thiết trực tiếp đến OpenAI và có phí API riêng. PDF gốc xử lý trên máy, không upload cả PDF. OCR cục bộ, tìm kiếm và chú thích không gọi API. Chế độ tự động chỉ chạy sau khi bạn bật. Sổ từ, lịch sử, vị trí đọc và khóa lưu trên máy; đồng bộ Edge tùy chọn chỉ gồm cấu hình nhỏ, không gồm khóa hoặc dữ liệu học. Không có máy chủ xử lý nội dung của FlowRead, quảng cáo hay telemetry. Xóa dữ liệu bằng nút của tính năng hoặc cài đặt trình duyệt; liên hệ admin@4dv.top. Lưu dữ liệu phía OpenAI phụ thuộc chính sách/tài khoản/endpoint, không cam kết lưu trữ bằng không.
