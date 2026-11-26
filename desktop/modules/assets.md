---
name: assets
label: raw and generated assets
description: Where raw and generated assets live, and which workflow produces them.
---

# Assets

Everything the owner produces as a picture, a model, a sound or a clip belongs to a
board in the Vault, not to the code project you were pointed at. Keep the two apart:
the workspace holds the project's code, the Vault holds the work that describes and
decorates it.

## Where an asset lives

- Inside the page that uses it: `<vault>/<board>/<page>/media/`.
- Referenced from the card or report with a **relative** path, so the board folder can
  be moved or copied whole.
- Named after what it is (`arachne-front.png`, `arachne-front-marks.png`), not after
  the order it was made in.
- Images the owner uploads through the app are copied into the page's `media/` folder
  and become part of the page when the tab is saved.

An annotation is the marked-up picture the owner drew on: it sits beside the picture
it marks, and the agent receives both together with the owner's feedback.

## Producing an asset

Follow the skill that owns the work; each one states its own gates and its checks.

| You want | Skill |
| --- | --- |
| a reference sheet for a character | `character-sheet-pipeline` |
| an image from a reference | `image-reference-workflow` |
| a mesh from an image | `img2threejs` |
| generated images or video | `fal-ai-generation`, `higgsfield-workflow` |
| motion for a game character | `blender-game-animation`, `motion-reference-workflow` |
| materials for a game asset | `materials-to-game` |
| a real-time clip of the game | `gameplay-visual-review` |
| what is inside a video | `video-watch` |

## Reporting an asset

Say which file was produced, where it landed, and what it was checked against. An
asset that was generated but never opened, played or rendered is not a finished asset.
