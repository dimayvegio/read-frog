# Local PDF study dependencies

- Tesseract.js 7.0.0 and tesseract.js-core 7.0.0: Apache-2.0, https://github.com/naptha/tesseract.js and https://github.com/naptha/tesseract.js-core.
- Packaged English, Vietnamese, Simplified Chinese and Japanese integer LSTM models: @tesseract.js-data packages 1.0.0, Apache-2.0, https://github.com/naptha/tessdata. Source models: https://github.com/tesseract-ocr/tessdata_best (Apache-2.0).
- pdf-lib 1.17.1: MIT, https://github.com/Hopding/pdf-lib.

OCR runs locally after an explicit action. Worker, WASM and model files are bundled; no CDN is used. Export creates a local annotated copy. See bundled license files and existing PDF_THIRD_PARTY_NOTICES.md for PDF.js notices.
