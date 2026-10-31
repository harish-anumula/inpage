# Privacy

inpage has no servers, no analytics and no account. Nothing about you is sold or shared. The only service it sends anything to is [OpenRouter](https://openrouter.ai), with your own key, and only to do what you asked.

**What leaves your browser, and when.** Only when you ask something (Ask, Rewrite, a page request, an image or video question, a fact-check), inpage sends the parts of the page needed to answer to OpenRouter:

- the text you selected or the block you're rewriting, a few hundred characters around it, the page title and the section heading;
- for page-level requests, the page's main text (up to about 26,000 characters) or an outline of its blocks;
- for image questions, that image (and up to two images from the same figure when you ask about a caption). inpage downloads the image from its own site first, without your cookies, so the model gets the picture; if it can't, it tells you and sends nothing;
- your question and the earlier messages in that thread;
- for a **video question**, the video's title, the site's name, its captions from the minutes before that moment (from the page), and a picture of the part of the screen where the video is (with anything drawn over it, such as captions);
- when you **ask across tabs**, the titles and text of the tabs you picked (or, if you say "my open tabs", up to five open tabs in this window), up to about 32,000 characters in all;
- when you ask inpage to make or change one of your **actions** by chatting, your current actions go with that request;
- when you ask about a short term with **Remember terms** on, that term and the answer you got, to write a one-line definition for your glossary;
- for **Fact-check**, the page's main text (up to about 24,000 characters) to find the claims, then each claim with web search;
- if you turn on **Web**, OpenRouter also runs a web search for that request through its search provider (and inpage turns it on for a single question when Jev judges it needs current information);
- with **Fast routing with Jev** on (the default, in Settings), your request, the page title and the selected text go to Jev, TypeSafe's fast judgment model, through the same OpenRouter key, to decide how to handle the request. Once per page, on your first request there, the page's main text (up to 20,000 characters) also goes to Jev to check it for text aimed at AI assistants. Turn the setting off to stop all of this.

What you type into the page itself (form fields, comment and message boxes) is left out of all of the above. A document you're editing in a web app counts as page text when you ask about the page.

OpenRouter passes the request to the model you picked. Their [privacy policy](https://openrouter.ai/privacy) and the model provider's terms apply to that request.

**What stays in your browser.** inpage keeps these in `chrome.storage.local` in this browser profile, and sends them nowhere except as listed above: your OpenRouter key (only to OpenRouter, to authorise requests), your settings and actions, your threads and edits for each page, your glossary, and where you stopped reading long pages (the page's address, a short quote and how far you got). While a video plays, inpage remembers its recent captions in that tab's memory, so a question about a moment has them; they're sent only with your question and saved with that thread. The signals behind quiet suggestions (which paragraphs you come back to, which parts of a video you rewind) are kept in memory only and never stored or sent. Web pages can't read any of this; the key is readable only by the extension's own pages and service worker. Rewrites and answers you insert into the page become part of it, so the page can read those.

To show pictures in the side panel and All notes (an image you asked about, the icons in the tab picker), inpage downloads them from their own sites, without your cookies.

**Deleting it.** Clear a page's notes from the popup or All notes, and delete glossary entries in All notes. A reading bookmark goes when you finish the page (inpage keeps the 400 most recent). Removing the extension deletes everything it stored.

**What inpage never does.** It never sends your cookies or passwords, never sends anything to a server of its own, never shows ads, and never uses your data for anything but answering you.

**Chrome Web Store User Data Policy.** The use of information received from Chrome APIs and web pages adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements: data is used only to provide the features you use, is transferred only to OpenRouter (and the model provider it routes to) to do so, is never sold, never used for advertising or to determine creditworthiness, and is never read by people.
