import { useState } from 'react'
import type { DictationInfo } from '../mobile/client'
import './dictation-settings.css'

const fallback = [{ id: 'toxic', label: 'Toxic · local' }, { id: 'local', label: 'Local Whisper · Free' }, { id: 'openai', label: 'OpenAI · Paid' }, { id: 'openrouter', label: 'OpenRouter · Paid' }, { id: 'off', label: 'Off' }]

function useProvider(info: DictationInfo | undefined, onChange: (provider: string) => Promise<DictationInfo>) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function change(provider: string) {
    setBusy(true); setError('')
    try { await onChange(provider) } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const selected = info?.providers?.find(item => item.id === info.provider)
  const unavailable = selected && !selected.available
    ? selected.id === 'toxic' ? 'Toxic is not running. Open Toxic on your computer.'
      : selected.id === 'local' ? 'Local Whisper needs setup on your computer.'
        : `${selected.id === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'} is missing. Add it to the computer workspace .env.`
    : ''
  return { busy, error, selected, unavailable, change }
}

/* The phone-settings panel draws its own section with its own headings.
   Settings draws two rows in the panel's grammar; the behaviour is one. */
export default function DictationSettings({ info, onChange, disabled = false }: { info?: DictationInfo; onChange: (provider: string) => Promise<DictationInfo>; disabled?: boolean }) {
  const { busy, error, selected, unavailable, change } = useProvider(info, onChange)
  return <section className="dictation-settings" aria-label="Speech-to-text settings">
    <h3>Speech-to-text</h3>
    <label>Dictation provider<select aria-label="Dictation provider" value={info?.provider || 'toxic'} disabled={disabled || busy || !info} onChange={event => void change(event.target.value)}>
      {(info?.providers || fallback).map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
    </select></label>
    <p>{selected?.detail} Shared by desktop and all paired phones. Changes apply to the next transcription; text stays a draft.</p>
    {unavailable && <p role="status">{unavailable} No automatic switch to another provider.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

export function DictationRows({ info, onChange }: { info?: DictationInfo; onChange: (provider: string) => Promise<DictationInfo> }) {
  const { busy, error, selected, unavailable, change } = useProvider(info, onChange)
  return <>
    <label className="settings-row">
      <span className="settings-row-name">Dictation provider</span>
      <span className="settings-row-value">
        <select className="settings-select" aria-label="Dictation provider" value={info?.provider || 'toxic'} disabled={busy || !info} onChange={event => void change(event.target.value)}>
          {(info?.providers || fallback).map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
        </select>
      </span>
    </label>
    <p className="settings-row-help">{selected?.detail} Shared by desktop and all paired phones. Changes apply to the next transcription; text stays a draft.</p>
    {unavailable && <p className="settings-status" role="status">{unavailable} No automatic switch to another provider.</p>}
    {error && <p className="settings-status" role="alert">{error}</p>}
  </>
}
