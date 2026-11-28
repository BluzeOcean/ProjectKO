# The deck's facts sit on its head

Status: written 2026-11-28.

The wall of boards (the Vaultspace) and the wall of pages (a board) used to end
with a band at the foot: "10 pages · 11 tabs". The number of pages was already
at the head of the wall ("PAGES 10"), so the band repeated itself and spent a
line of the window on the repeat.

Now the head carries the whole count - the level, how many are on screen, and
what is inside them:

```text
BOARDS 1 · 2 pages
PAGES 2 · 3 tabs
```

There is no band at the foot of the stage at all, and `.deck-status` is gone.
`TileDeck` takes the rest of the level's facts as `stageFacts` and draws them
in the head, beside the count.

Both numbers follow the filter: the count is what is on screen, and so is the
number beside it.

The stage's bottom padding went from 84px to 64px with it. The voice dock
floats over the bottom-left corner of the window, and it is one button now, so
it asks for one button's worth of room.
