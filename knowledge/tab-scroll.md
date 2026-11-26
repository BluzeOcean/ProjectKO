# A tab document has to scroll

Status: fixed 2026-11-26, measured on v0.6.4.

**The symptom.** A board's page opens, the cards are there, and the page cannot
be scrolled. The bottom of every page is unreachable. The owner sees a page
with a cut-off bottom edge and no scrollbar.

**The cause.** The content pane clips its overflow, and so does every level
above the document:

```
.app-layout   { height: 100% }
  .main       { flex: 1; display: flex; flex-direction: column; overflow: hidden }
    .content  { flex: 1; position: relative; overflow: hidden }
      .tab-editor { display: flex; flex-direction: column; gap: 18px }
        article.card-content { max-width: 1180px; margin: 0 auto; padding: 44px 38px 64px }
```

Nothing in that chain scrolls. `.card-content` grows to the length of the
document, `.content` clips it, and the pane is exactly as tall as the window.

**Why it appeared.** The page layer replaced the old wrapper. The v1 card view
had `.editable-card { height: 100%; min-height: 0; overflow: auto }` — the
scroller — and the v2 tab view grew `.tab-editor` and `.card-content` without
it. The old rule is still in `src/styles/editable-cards.css` and **nothing
applies the class any more**: the CSS outlived the markup that used it.

**The fix.** `.tab-editor` is the scroller:

```css
.tab-editor { height: 100%; min-height: 0; overflow: auto; }
```

`height: 100%` resolves against `.content`, which has a definite height as a
flex item of `.main`. `ReportBoundary` renders its children without a wrapper
element, so `.tab-editor` really is a child of `.content` — a wrapper in
between would break the percentage.

**The check.** `desktop/service/test/tab-scroll-ui.mjs` builds a page whose
document is taller than the window and asserts that the pane overflows, that
its `overflow-y` is not `hidden`, and that scrolling to the end brings the
last card into view. It fails on the old rule and passes on the new one.

**The lesson.** A rule that gives a pane its scrollbar is part of the layout,
not part of the theme. When a view is rewritten, check that something still
scrolls — and check that the class the rule names is still applied anywhere.
