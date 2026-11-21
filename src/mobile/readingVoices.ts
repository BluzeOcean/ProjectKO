export const readingVoices = [{ id: 'chatterbox', label: 'Chatterbox · this machine' }]
export const readingVoiceKey = 'mrmak.mobile.read-aloud.voice'
export const readingVoiceChanged = 'mrmak-reading-voice-changed'
let currentVoice = 'chatterbox'
export function savedReadingVoice() {
  let value = currentVoice
  try { value = localStorage.getItem(readingVoiceKey) || value } catch { /* Use the current visit's choice. */ }
  return readingVoices.some(voice => voice.id === value) ? value : 'chatterbox'
}
export function saveReadingVoice(value: string) {
  if (!readingVoices.some(voice => voice.id === value)) return
  currentVoice = value; try { localStorage.setItem(readingVoiceKey, value) } catch { /* Keep the choice for this visit. */ }
}
