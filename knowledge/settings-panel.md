# The settings panel is a list of rows

Settings used to be nine stacked sections, every control and every sentence
visible at once. At 320 px wide that is about two screens of scroll, and the
first screen was a 150 px picture of the theme that was already chosen. It was
then a column of folds: a header per group that states the group's value, and
one row grammar underneath.

It is now **a list of rows with one level down**. A row names a group and
states the value that group holds; the control itself is a level down, so the
panel never shows a widget before it is asked for one. Choosing a row opens
that group's page, and the page carries the group's rows in the same grammar,
with the sentence that explains each one **always visible** — the reader asked
for this page, so the explanation comes with it.

The mock that was chosen is `lab/mock-1-rows.html` (Mock 1, "Rows"). The
bench's README records what each version was arguing. The panel is at rest
nine rows in five blocks of two:

```
Vault          ···      Appearance    Dark · Dark
Windows        Off      Chats         Claude · Extra high
Read aloud     Toxic    Agent quota   5 minutes
Speech-to-text Toxic    Project KO    Cedar · Medium
Project        ···
```

The Vault is first because it is the app's own folder, not one of the user's
settings, and it reads better at the top than at the bottom of a list of
choices.

## Where it lives

| file | what it is |
| --- | --- |
| `src/desktop/WorkspaceSettings.tsx` | the rows, the drill-down, the search field, the row builders, and the `RowsList` / `RowsPage` components. |
| `src/desktop/desktop.css` `.settings-*` rules | the one row grammar. `.settings-scroll` is still the scroll container. |
| `Vault` row | the first row: `<repo>/workspace`, the folder every board is created in, with a button that calls `POST /api/reveal` so the folder opens in Explorer or Finder. |
| `src/components/ThemePicker.tsx` | `ThemePage` — the Appearance page: which target is being changed, one preview, and the whole catalogue as swatches. `ThemeRow` still draws the row the Appearance popover uses. |
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

The drill-down is one level, so a control that lives inside a group is one
click away and the test has to walk there.

`theme-ui.mjs` opens Settings, then opens **Appearance**, then changes
`Vaultspace theme` and `Chatspace theme`. Its `openAppearance()` helper does
the walking and is idempotent: it opens the panel if it is shut, steps back to
the list if it is on another group's page, and stops if the Appearance page is
already showing.

`quota-ui.mjs` changes `Check the quota every`, which lives in the Agent quota
group, so it clicks the row first (`getByRole('button', { name: /^Agent quota/ })`).
The row is navigation, not an expander: there is no `aria-expanded` on it any
more, and the page it opens is the group's own.

`settings-rows-ui.mjs` covers the panel's shape: nine rows in five blocks, the
drill-down and the back button, the Appearance page and its swatches, and the
search narrowing the list.

The search narrows the **list** to the groups that match — by the group's name
or by the name of any row in it — and narrows the rows of a page that is
already open. It never changes what is stored.
