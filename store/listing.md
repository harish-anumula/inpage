# Chrome Web Store submission

Everything the developer dashboard asks for, in the order it asks. Upload `dist/inpage-1.0.0.zip` (`npm run package`). The images in this folder come from `npm run images` (`store/render.mjs`).

## Store listing

**Name:** inpage

**Summary** (132 characters max):

> Ask about anything on a page, rewrite it in place, check the answers. Lectures, your tabs, your own notes. Uses your OpenRouter key.

**Category:** Productivity → Education (fallback: Productivity → Tools)

**Language:** English

**Description:**

> A learning copilot that lives in the page you're reading. Select anything to ask about it, or rewrite it in place, styled like the site, with real maths.
>
> WHAT YOU GET
> • Ask about a selection: the answer streams into the browser's side panel, with Markdown, tables and maths. Follow up in the same thread.
> • Rewrite in place: "step by step", "add a numeric example", "simpler". The new text appears in the page in the site's own style. Again, Original and Undo beside every edit.
> • Ask about the whole page, or change it: "add a check-your-understanding question after each section". Review and Undo all.
> • Answers you can check: page answers quote the page with numbered chips; click one to see the exact sentence. Every answer shows the model, the exact cost and what was sent.
> • Lecture companion: on a video, ask about this moment. inpage reads the recent captions and the slide or code on screen, and answers with timestamps you can click.
> • Across your tabs: compare the tabs you pick; every point links to its quote in its own tab.
> • Catch me up: a recap of what you've read so far, with nothing from further down.
> • Fact-check: a page's key claims checked with web search, tinted supported, disputed or unclear, with sources.
> • Your own one-click actions, a notes library with Markdown export, and a quiet glossary that remembers terms you've asked about.
>
> YOUR OWN KEY, YOUR COSTS
> inpage uses your own OpenRouter key and the model you pick. A question or a rewrite with the default model costs about $0.0002–0.001; web search adds about $0.005.
>
> PRIVATE BY DESIGN
> No servers, no analytics, no account with us. Page text goes to OpenRouter only when you ask something, and only the parts needed to answer. Pages can't see your questions or answers: they run in the browser's side panel and in extension frames. What you type into a page's forms never leaves your browser.
>
> Open source (MIT): https://github.com/harish-anumula/inpage

**Graphic assets** (in `store/`):

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `extension/icons/icon-128.png` |
| Screenshots (up to 5) | 1280×800 | `store/screenshot-1.png` … `store/screenshot-5.png`, in that order |
| Small promo tile | 440×280 | `store/promo-small.png` |
| Marquee promo tile (optional) | 1400×560 | `store/promo-marquee.png` |

Screenshots: 1 select and ask; 2 an answer with quotes from the page; 3 a rewrite in place; 4 the lecture companion; 5 fact-check.

**Official URL:** none · **Homepage URL:** https://github.com/harish-anumula/inpage · **Support URL:** https://github.com/harish-anumula/inpage/issues

## Privacy practices

**Single purpose:**

> inpage helps the user understand the page they are reading: it answers questions about selected text, the page, a video moment or chosen tabs, and rewrites parts of the page in place, using a model through the user's own OpenRouter key.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's OpenRouter key, settings, custom actions, and the user's notes (questions, answers and rewrites) for each page, so they come back when the user returns. |
| `sidePanel` | Shows conversations in the browser's side panel beside the page. |
| Host `<all_urls>` | The selection toolbar works on any page the user reads: when the user asks, the content script reads the selected text or the page's text and puts rewrites into the page. The same access lets the extension (1) read the text of other open tabs, only tabs the user picks for a question; (2) capture the visible tab when the user asks about a moment in a video, so the model can read the slide or code on screen; (3) download an image the user asks about from its own site, without cookies; and (4) call openrouter.ai, the only service the extension sends data to. |

**Remote code:** No, I am not using remote code. All JavaScript is in the package; the extension fetches only JSON and text from OpenRouter, and the model's output is shown as sanitised text and HTML, never run.

**Data usage** (tick these):

- **Website content**: yes. When the user asks, selected text, page text, the titles and text of tabs the user picks, images the user asks about, video captions and a picture of the video on screen are sent to OpenRouter to answer.
- **Authentication information**: yes. The user's OpenRouter API key is stored locally and sent only to OpenRouter to authorise requests.
- **Personal communications**: yes, only in the sense that a user may select text from an email or chat page and ask about it; it is sent only then, to answer.
- Everything else (personally identifiable information, health, financial, location, web history, user activity): no. (Where the user stopped reading long pages is kept only in the browser, to offer to take them back; it is never sent.)

**Certifications** (all three are true):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/harish-anumula/inpage/blob/main/PRIVACY.md

## Distribution

- Visibility: Public
- Regions: All regions
- Pricing: Free

## Notes for the reviewer (optional field)

> To test: install, and paste the OpenRouter API key given in the test instructions on the settings page that opens. On any article, select a sentence and click Ask: the answer opens in the side panel. Alt-click a paragraph and type "simpler" to rewrite it in place. The extension sends data only to openrouter.ai (it also downloads an image the user asks about from its own site, without cookies). No remote code runs: model output is only ever sanitised text and HTML.

**Test instructions** (the dashboard's private field): a limited OpenRouter key with about $1 of credit, made for the review and deleted after it. Never put it in the repository.
