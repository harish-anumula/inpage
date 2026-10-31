# Vendored libraries (copied from node_modules; never loaded from a CDN).
# Check: (cd extension/lib && shasum -a 256 -c VERSIONS.sha256)

purify.min.js: dompurify@3.4.17 (Apache-2.0, chosen from its Apache-2.0 / MPL-2.0 dual licence; LICENSES/DOMPurify-Apache-2.0.txt). It bundles regenerator-runtime (MIT; LICENSES/regenerator-runtime-MIT.txt).
marked.min.js: marked@18.1.1 (MIT, with the original Markdown's BSD notice; LICENSES/marked.md)
katex/katex.min.js, katex/katex.min.css: katex@0.19.0 (MIT; LICENSES/KaTeX-MIT.txt)
katex/fonts: from the same katex release (SIL Open Font License 1.1; LICENSES/KaTeX-fonts-OFL-1.1.txt)

inpage itself is MIT (../LICENSE).
