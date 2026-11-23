import { useState } from 'react'
import { api } from './client'
import DictationButton from './DictationButton'

// The terminal view of a chat keeps Ctrl+T: Toxic does the listening, and the
// words are typed into the CLI without a second recorder in the browser.
export default function DictationComposer({ id, connected, running }: { id: string; connected: boolean; running: boolean }) {
  const [note, setNote] = useState('')
  return <div className="terminal-dictation"><DictationButton connected={connected} disabled={!running} toggleEvent="mrmak-toggle-dictation" onNote={setNote} onText={text => {
    setNote('')
    api(`/sessions/${id}/input`, { text, paste: true, submit: false })
      .then(() => window.dispatchEvent(new CustomEvent('mrmak-dictation-inserted', { detail: { id } })))
      .catch(error => setNote(error instanceof Error ? error.message : String(error)))
  }} />{note && <span className="terminal-dictation-note" role="status">{note}</span>}</div>
}
