# The settings panel is a column of folds

Settings used to be nine stacked sections, every control and every sentence
visible at once. At 320 px wide that is about two screens of scroll, and the
first screen was a 150 px picture of the theme that was already chosen. It is
now a column of folds: a header per group that states the group's value, and one
row grammar underneath — name on the left, its control on the right, a hairline
between, the sentence on hover or focus.

Measured on the ported panel at 880 px tall: Appearance open 459 px, every
section shut 344 px. The mock that was chosen is `lab/shots/4-fold.png`; the
bench's README records what each version was arguing.

## Where it lives

| file | what it is |
| --- | --- |
| `src/desktop/WorkspaceSettings.tsx` | the eight folds, the search field, the row builders, and the `Section` component that filters and expands. |
| `src/desktop/desktop.css` `.settings-*` rules | the one row grammar. `.settings-scroll` is still the scroll container. |
| `Vault` fold | the first fold, open by default: `<repo>/workspace`, the folder every board is created in, with a button that calls `POST /api/reveal` so the folder opens in Explorer or Finder. |
| `src/components/ThemePicker.tsx` | `ThemeRow` — the row plus a palette painting one line of itself. The default export (the card, with its big preview) is still what the Appearance popover draws. |
| `src/components/DictationSettings.tsx` | `DictationRows` for the panel; the default export still draws the section the phone and the Mobile access panel use. |
| `src/styles/workspace-theme.css` | the theme overrides that used to target `.settings-scroll select` and friends. |

## Four things that cost an hour if forgotten

1. **A wrapping `<label>` names a select after all of its options.** The
   panel's rows wrap their control in a label so clicking the name focuses it,
   which is right, but the accessible name then read
   "Vaultspace themeCodex / ChatGPTAntigravity…". Every control keeps an explicit
   `aria-label`; `theme-ui.mjs` and `quota-ui.mjs` depend on it
   (`getByLabel('Vaultspace theme', { exact: true })`).
2. **The values are the app's, not the visible words.** A palette option submits
   its id (`light`), the quota interval submits minutes (`5`), because
   `quota-ui.mjs` asserts `toHaveValue('5')`. Labels are for reading.
3. **`.desktop-root input` outranks a bare class.** It carries a border, radius
   and padding for every field in the app; the panel's borderless field is
   `.settings-row .settings-text` for that reason alone.
4. **A theme override using `background` wipes `background-image`.** The row
   selects draw their caret as an inline SVG background image, so the Vaultspace
   theme's rule must set `background-color`, not the shorthand.

## What the tests expect

`theme-ui.mjs` opens Settings and changes `Vaultspace theme` and `Chatspace theme`
— Appearance is the one fold that starts open, so those work unchanged.
`quota-ui.mjs` changes `Check the quota every`, which lives in the Agent quota
fold, so it clicks the header first (`getByRole('button', { name: /^Agent quota/ })`).
Any new test that drives a control inside a closed fold must open it first; the
fold's header is the button and it carries `aria-expanded`.

Search opens every fold that still has a matching row and leaves the stored
open set alone, so clearing the field restores what the reader had open.
