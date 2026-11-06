# Third-party notices

The original Read Frog copyright and repository license remain in [LICENSE](LICENSE).
Dependency licenses remain applicable; this refactor does not relicense those packages.

The packaged OpenAI mark and the local Tabler icon vectors are derived from
`@tabler/icons-react` 3.50.0, Copyright (c) 2020-2026 Paweł Kuna, under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

`streamline-color:pen-tool-flat` is by Streamline, distributed through Iconify,
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: [Streamline vectors](https://github.com/webalys-hq/streamline-vectors).
The other historical Streamline IDs now map to packaged Tabler equivalents.

The local Remix vector is derived from `@remixicon/react` 4.9.0, by Remix Design,
under the Remix Icon License 1.0. Lucide React vectors and Inter fonts retain
their respective ISC and SIL Open Font License notices in their packages.
All icons and fonts used by the extension are bundled locally.

Temml 0.14.0, Copyright (c) 2020 Ron Kok, is used under the MIT license
(the permission grant, conditions, and warranty disclaimer reproduced above).
Formula rendering uses the system's math font without fetching remote fonts.

Vocabulary MP3 compression uses the unmodified `@breezystack/lamejs` 1.2.7,
a JavaScript port of LAME, under LGPL-3.0 (LAME project / Alex Zhukov).
Source and build instructions: https://github.com/gideonstele/lamejs
Pinned package source: https://registry.npmjs.org/@breezystack/lamejs/-/lamejs-1.2.7.tgz
LAME project: https://lame.sourceforge.io/
LGPL-3.0 text: https://www.gnu.org/licenses/lgpl-3.0.html
The application remains GPL-3.0; its source, lockfile and build scripts allow
rebuilding the HTML/extension with a replacement encoder. No encoder is loaded
from a CDN at runtime. The standalone HTML includes these notices and the
package's license notice.
