import { useState } from 'react'
import { api } from './client'
import DictationButton from './DictationButton'

// The terminal view of a chat keeps the words in the CLI, never in a browser
// field: the transcript is pasted into the pseudo-terminal without a newline.
// Toxic's own takes are typed where the caret is, which a web view terminal
// does not receive, so this view also tells the switch when the words are
// already on screen.
export default function DictationComposer({ id, connected, running }: { id: string; connected: boolean; running: boolean }) {
  const [note, setNote] = useState('')
  const alreadyThere = (text: string) => {
    const rows = document.querySelector('.terminal-host .xterm-rows')?.textContent || ''
    const seen = rows.replace(/\s+/g, ' ').toLowerCase()
    const needle = text.trim().slice(0, 24).replace(/\s+/g, ' ').toLowerCase()
    return !!needle && seen.includes(needle)
  }
  return <div className="terminal-dictation"><DictationButton connected={connected} disabled={!running} alreadyThere={alreadyThere} onNote={setNote} onText={text => {
    setNote('')
    api(`/sessions/${id}/input`, { text, paste: true, submit: false })
      .then(() => window.dispatchEvent(new CustomEvent('mrmak-dictation-inserted', { detail: { id } })))
      .catch(error => setNote(error instanceof Error ? error.message : String(error)))
  }} />{note && <span className="terminal-dictation-note" role="status">{note}</span>}</div>
}
