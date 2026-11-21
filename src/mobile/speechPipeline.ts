/**
 * Reading a reply aloud is a queue problem, not a playback problem.
 *
 * The engine speaks one segment at a time and needs roughly two thirds of a
 * second to write a second of audio. Playing a segment faster than it was
 * generated leaves nothing to cover the next one, so the queue is kept full in
 * *seconds of audio*, not in segments: at 1.5x the same lead is worth less wall
 * time, so the target is scaled by the speed before it gets here.
 */

// The first segment is short so that sound starts sooner, and each may be half
// again as long as the one before it: the next one is generated while the
// current one plays, so a sudden long segment would arrive too late.
const opening = 110
const second = 160
const paragraph = 220

export function speechChunks(text: string): string[] {
  const sentences = (text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*(?=\s|$)/g) || []).map(sentence => sentence.trim()).filter(Boolean)
  const result: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const target = result.length === 0 ? opening : result.length === 1 ? second : paragraph
    if (current && current.length + 1 + sentence.length > target) { result.push(current); current = '' }
    current = current ? current + ' ' + sentence : sentence
    // A sentence without a full stop can still be too long to generate at once.
    while (current.length > paragraph * 1.6) {
      const space = current.lastIndexOf(' ', Math.floor(paragraph * 1.6))
      const at = space > opening ? space : Math.floor(paragraph * 1.6)
      result.push(current.slice(0, at).trim())
      current = current.slice(at).trim()
    }
  }
  if (current) result.push(current)
  return result
}

export type Segment = { blob: Blob; seconds: number }

export type SpeechOptions = {
  segments: string[]
  speak: (text: string, signal: AbortSignal) => Promise<ArrayBuffer>
  play: (segment: Segment) => Promise<void>
  cancelled: () => boolean
  // Seconds of audio to keep ready. Fewer means the voice stops to wait.
  target?: number
  maxInFlight?: number
  onLoading?: (loading: boolean) => void
}

// Length of the audio inside a RIFF/WAVE file. The engine writes 24 kHz mono
// 16-bit, but the header is read anyway so a different rate cannot skew it.
export function wavSeconds(data: ArrayBuffer | Uint8Array): number {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.byteLength < 44 || view.getUint32(0) !== 0x52494646) return 8
  let rate = 24000, channels = 1, bits = 16, offset = 12
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset)
    const size = view.getUint32(offset + 4, true)
    if (id === 0x666d7420 && offset + 24 <= view.byteLength) {
      channels = Math.max(1, view.getUint16(offset + 10, true))
      rate = view.getUint32(offset + 12, true) || rate
      bits = view.getUint16(offset + 22, true) || bits
    }
    if (id === 0x64617461) return size / (rate * channels * (bits / 8))
    offset += 8 + size + (size % 2)
  }
  return 8
}

// Six is the browser's limit of connections to one host; leaving two free keeps
// the transcript polls that run while the voice speaks from queueing behind it.
export function runSpeech({ segments, speak, play, cancelled, target = 24, maxInFlight = 4, onLoading }: SpeechOptions) {
  const ready: Array<Segment & { index: number }> = []
  const controllers = new Set<AbortController>()
  let next = 0, played = 0, asking = 0, buffered = 0, produced = 0, average = 9
  let failure: unknown = null, wake: (() => void) | null = null, stopped = false
  const gone = () => stopped || cancelled()
  const nudge = () => { const resume = wake; wake = null; resume?.() }

  // Keep asking while the queue holds less than the target. In-flight requests
  // count at the average segment length, so a slow first segment does not
  // starve the queue behind it.
  const fill = () => {
    while (!gone() && !failure && next < segments.length && asking < maxInFlight && buffered + asking * average < target) {
      const text = segments[next], index = next
      next += 1
      const controller = new AbortController()
      controllers.add(controller); asking += 1
      void speak(text, controller.signal).then(data => {
        if (gone()) return
        const seconds = wavSeconds(data)
        produced += 1
        average = (average * (produced - 1) + seconds) / produced
        buffered += seconds
        ready.push({ index, blob: new Blob([data], { type: 'audio/wav' }), seconds })
      }, cause => { if (!gone()) failure = cause })
        .finally(() => { asking -= 1; controllers.delete(controller); nudge() })
    }
  }

  const take = async (): Promise<Segment | null> => {
    fill()
    for (;;) {
      if (gone()) return null
      if (failure) throw failure
      // Answers can arrive out of order; the reply is still spoken in order, so
      // the next segment is the one with the lowest index not played yet.
      const at = ready.findIndex(segment => segment.index === played)
      if (at >= 0) { const [segment] = ready.splice(at, 1); played += 1; buffered -= segment.seconds; return segment }
      if (!asking) return null
      onLoading?.(true)
      await new Promise<void>(resolve => { wake = resolve })
      fill()
    }
  }

  const done = (async () => {
    for (;;) {
      const segment = await take()
      if (!segment) return
      onLoading?.(false)
      await play(segment)
    }
  })()

  return {
    done,
    stop() { stopped = true; for (const controller of controllers) controller.abort(); controllers.clear(); nudge() },
  }
}
