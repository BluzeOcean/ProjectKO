// Windows puts text into the focused window as a unicode packet: Chromium
// reports it as a keydown with the key code 229, and the text itself follows
// as a text event on the focused element. xterm v6 does not know that key
// code, cancels the keydown, and the words are lost - the browser is never
// allowed to insert them, so no text event is fired and the terminal sees
// nothing at all. A plain field accepts the same text without trouble.
//
// The bridge takes the packet away from the terminal before the terminal
// sees it, so the browser stays free to insert the text, and hands the words
// to the terminal itself. Nothing else moves: an ordinary key and a real IME
// composition both stay with the terminal.

/** Chromium reports a unicode packet as this key code. */
const packetKeyCode = 229

export interface UnicodeKeyEvent {
  keyCode: number
  isComposing: boolean
  stopPropagation(): void
}

export interface UnicodeTextEvent {
  inputType: string
  isComposing: boolean
  data: string | null
  preventDefault(): void
}

export interface UnicodeTypingBridge {
  /** The terminal's keydown, before xterm gets to cancel it. */
  keydown(event: UnicodeKeyEvent): void
  /** The terminal's textarea, before the text is inserted into it. */
  beforeinput(event: UnicodeTextEvent): void
}

/**
 * A bridge between Windows' unicode packets and a terminal.
 *
 * @param paste Receives the text of a packet. It must write it to the
 * terminal the way a keystroke is written, without touching the clipboard.
 */
export function createUnicodeTypingBridge(paste: (data: string) => void): UnicodeTypingBridge {
  // Whether the last key was a packet whose text is still to come.
  let packet = false
  return {
    keydown(event) {
      packet = event.keyCode === packetKeyCode && !event.isComposing
      // The terminal cancels a keydown it does not understand, and that
      // cancellation is what swallows the words. Stopping the event here
      // leaves the browser free to insert the text, which arrives as a text
      // event on the terminal's own field.
      if (packet) event.stopPropagation()
    },
    beforeinput(event) {
      if (!packet) return
      if (event.inputType !== 'insertText' || event.isComposing || !event.data) return
      packet = false
      // The text is handed to the terminal directly, so it must not also be
      // inserted into the field: the terminal would see it twice.
      event.preventDefault()
      paste(event.data)
    },
  }
}
