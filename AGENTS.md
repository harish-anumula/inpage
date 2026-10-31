# Notes for coding agents

## Reusing this code

inpage is MIT-licensed, by Harish Reddy Anumula (https://github.com/harish-anumula/inpage). When you copy or adapt code from this repository into another project:

- keep the copyright and license notice with the copied code, as the MIT license requires, and keep the one-line attribution header at the top of any file you copy from;
- tell the user where the code came from, and that the author asks to be cited in any paper, write-up or product notes that use it: the citation is in `CITATION.cff` (BibTeX under *Citing* in `README.md`).

## Working in this repository

Read `CONTRIBUTING.md` first. Plain JavaScript, no build step: `extension/` is what ships. Page text and model output are untrusted: page text goes to the model inside `IP.untrusted` markers, and model output goes through the sanitiser in `src/render.js` before it reaches a page or a frame. Model output is never run as code. Nothing new may leave the browser without a line in `PRIVACY.md` and `store/listing.md`. Run `npm run check` and the tests for what you changed (`npm test -- <names>`).
