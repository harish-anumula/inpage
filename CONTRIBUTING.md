# Contributing

Thanks for helping. inpage is plain JavaScript with no build step: `extension/` is exactly what ships.

## Set up

```sh
npm install
npx playwright install chromium
echo "sk-or-v1-…" > .openrouter-key   # your OpenRouter key, for the end-to-end tests (gitignored)
```

Load `extension/` unpacked at `chrome://extensions` to try a change on real pages. After editing, click reload on the extension's card and refresh the tab.

## Before a pull request

```sh
npm run check            # every script parses, versions match, vendored files unchanged (no key needed)
npm test -- ux panel     # the end-to-end tests for what you changed
npm test                 # all of them: about 20 minutes and 20 cents of model calls
```

Each test loads the extension into Playwright's Chromium (set `CHROME=/path/to/chrome` to use another build) and drives real pages, with real model calls. Screenshots land in `test/out/`. `npm test` starts the local test servers itself; to run one test alone, start them first (`npm run serve:test`, and `npm run serve:demo` for the demo page) and run `node test/<name>.mjs`.

## Where things are

- `extension/src/core.js`: model calls through the worker, page maths ↔ LaTeX, KaTeX, the sanitiser, text anchors, untrusted-content markers.
- `extension/src/ui.js`: the selection toolbar, edit controls and pins (a closed shadow root), the composer frame, and the side panel or in-page drawer.
- `extension/ui/frame.js`: the composer and the conversation view, drawn from plain data the content script sends over a private port.
- `extension/src/edit.js` (rewrites and inserted answers), `threads.js` (Ask), `page.js` (page chat, page-wide changes, tabs), `check.js` (fact-check), `video.js` (lecture companion), `memory.js` and `nudges.js` (quiet memory and suggestions), `main.js` (wiring).
- `extension/background.js`: the key, streaming, Jev, storage, tabs and screen capture.
- `extension/prompts.js` and `presets.js`: every prompt, the models and the default actions.
- `test/`: one file per feature; `test/pages/` holds the fixture pages.

## Ground rules

- Pages are untrusted, and so is model output: page text goes to the model inside `IP.untrusted` markers, and everything the model writes goes through the sanitiser before it reaches a page or a frame.
- Nothing new leaves the browser without a line in [PRIVACY.md](PRIVACY.md) and the store listing (`store/listing.md`).
- No remote code, no analytics, no new permissions without a good reason in the pull request.
- Model output is never run as code.
