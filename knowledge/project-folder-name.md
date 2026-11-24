# The project folder is called PROJECT-KO

The Files tree labels the project folder **PROJECT-KO**. It used to say **MR-MAK**,
the name of the project this app was forked from; the owner had the tree renamed on
2026-11-24 so the folder carries the app's own name.

| Where | What it says |
| --- | --- |
| The tree's root row (`src/desktop/FilesRail.tsx`, `projectName`) | `PROJECT-KO` |
| The panel's foot button ("… root") | `PROJECT-KO root` |
| The service's refusals ("must stay inside …") | `PROJECT-KO` |

The label is a **name, not a path**. The folder on disk is whatever the launcher was
pointed at (`V:\06_App\ProjectKO` on this machine); the tree shows the app's name
for it and shows the real path in the path bar above the tree.

## What did not change

The fork's internal names are still theirs, because they are not the app's face:

- `pKO` in code — `PkoMark`, `PkoLogo`, the `.pko-` asset names.
- `MRMAK_` environment variables and the `.mrmak/` runtime folder. They are the
  service's own plumbing, and `.mrmak` is a dot-folder, so the tree's "Main
  folders" view leaves it out ("All files" shows it).
- "Project KO" in every sentence the app writes.

Do not rename the runtime folder or the environment variables: the service reads
`.mrmak/settings.json` and the pairing keys are stored there.

## Tests

`desktop/service/test/deck-layout-ui.mjs` checks the tree's root row and the foot
button, with the same browser that draws the window.
