# The voice dock is one button

Status: written 2026-11-28.

The foot of the window used to carry the pink mark with the label that pulled
out on hover - "Talk to Mr.KO" - and the chat bubble beside it. Two controls,
one of them forty-eight pixels tall, and one that started the microphone
whether the owner wanted a conversation or a dictation.

Now the foot carries **one** button: the chat bubble, always visible, and
pressing it opens the conversation. The microphone moved into the
conversation's own head, where it sits next to the close button as a small
pink circle.

| where | what |
| --- | --- |
| the dock (`.voice-caption-toggle`) | opens and closes the conversation |
| the panel's head (`.voice-mic`) | starts and stops the microphone |

The panel does not animate open any more: pressing the button puts it on the
screen, which is all that was wanted of it.

Chatspace is unchanged - it has its own dictation and never had the microphone
button - and its toggle stays a bare icon in the header.

`desktop/service/test/deck-facts-ui.mjs` covers both halves: the counts on the
head of the wall, and the one button at the foot of the window.
