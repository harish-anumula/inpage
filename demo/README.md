# Demo

`index.html` is a short lesson ("Attention, step by step") with inline and display maths, a figure image and a code block: everything inpage does shows up on one page. Serve the repository root and open it:

```bash
python3 -m http.server 8800 --bind 127.0.0.1
# then open http://127.0.0.1:8800/demo/
```

## A 60-second demo script

1. **Ask (0:00–0:12).** Select "Dividing by √d_k …", click **Ask**, type *Why does dividing by √d_k stop the softmax from saturating? Show a tiny example.* The answer streams into the drawer with maths.
2. **Rewrite in place (0:12–0:25).** Alt-click the same paragraph, choose **Step by step**. The paragraph rewrites itself in the page's own typography; hover it to show **Again / Original / Undo**, click **Original** and back.
3. **Images (0:25–0:35).** Hover the figure, **Ask about this → Explain this figure**.
4. **Whole page (0:35–0:52).** Alt+Shift+I, click **Add a check-your-understanding question after each section**. Questions stream in after each section; click **Review** to jump between them, then **Undo all**.
5. **Persistence (0:52–0:60).** Reload: the pins, the rewrite and the questions are still there.
