# Local PDF reader

The local PDF reader uses unmodified Mozilla PDF.js (`pdfjs-dist` 6.5.438),
Copyright Mozilla Foundation, under Apache-2.0. Its worker, CMaps, standard
fonts, ICC profiles and image decoders are bundled locally. The Apache license
and individual font/decoder notices are packaged in `pdf-assets/`. Source:
https://github.com/mozilla/pdf.js (pinned npm package `pdfjs-dist@6.5.438`).
The reader does not instantiate PDF.js document scripting or annotation actions.
