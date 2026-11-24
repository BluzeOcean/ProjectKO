export const readingVoices = [{ id: 'toxic', label: 'Toxic' }]
export const readingVoiceKey = 'mrmak.mobile.read-aloud.voice'
export const readingVoiceChanged = 'mrmak-reading-voice-changed'
let currentVoice = 'toxic'
export function savedReadingVoice() {
  let value = currentVoice
  try { value = localStorage.getItem(readingVoiceKey) || value } catch { /* Use the current visit's choice. */ }
  return readingVoices.some(voice => voice.id === value) ? value : 'toxic'
}
export function saveReadingVoice(value: string) {
  if (!readingVoices.some(voice => voice.id === value)) return
  currentVoice = value; try { localStorage.setItem(readingVoiceKey, value) } catch { /* Keep the choice for this visit. */ }
}
