// What "the last reply" is, and how it sounds when it is spoken.
//
// The conversation view reads a reply out of the rendered page, where links,
// lists and headings are already elements. A chat's terminal view has no such
// page — its replies are bytes on a canvas — so the same reply is taken from the
// transcript and turned into speech here, with the same exclusions the page
// makes: code blocks, tables and images are not read out. An inline name or
// command is different: it is usually the noun the sentence is about, so it is
// read, without its backticks.

export interface SpeechMessage { role: string; text: string }

const spoken = (message: SpeechMessage) => message.role === 'assistant' && !!message.text.trim();

// The index the bar belongs under: the agent's latest reply, even when a notice
// followed it (a background task finishing, a slash command's output). A notice
// is not a reply, and must not hide the one before it.
export function lastReplyIndex(messages: SpeechMessage[], floor = 0): number {
  for (let index = messages.length - 1; index > floor; index--) if (spoken(messages[index])) return index;
  return -1;
}

// The reply, not the notes written on the way to it. A CLI streams a turn as
// several messages: "Let me review the diff" before a tool call, then the answer.
// Each note is a message with a tool call after it, so the answer is the last one.
export function lastReply(messages: SpeechMessage[]): string {
  const index = lastReplyIndex(messages, -1);
  return index < 0 ? '' : messages[index].text.trim();
}

// Markdown as it is spoken. A fenced block is minutes of noise and goes; an
// inline name stays, because "Committed as on" is not what the sentence said.
export function spokenMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('|'))
    .map(line => line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d{1,3}[.)])\s+/, '')
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
      .replace(/\*\*|__/g, '')
      // Single markers are emphasis only when they open a word and close one; an
      // underscore inside a name stays.
      .replace(/(^|[\s(])[*_](?=\S)([^*_\n]+?)[*_](?=[\s).,!?:;]|$)/g, '$1$2'))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
// Where each word sits inside the audio the engine returned.
//
// The engine gives sound and nothing else: no word timings, no phonemes. Aligning
// them would mean a second model and seconds of work per segment, which is more
// than the reading itself. This plan is the cheap answer — the words of each
// segment, weighted so that a longer word takes longer and punctuation takes a
// breath — and it is only ever compared against the audio element's clock.
export interface SpeakingSegment { start: number; total: number; weights: number[] }

export function speakingPlan(segments: string[]): SpeakingSegment[] {
  let start = 0
  return segments.map(segment => {
    const words = segment.match(/\S+/g) || []
    // Two extra units per word spread the silence between words; a full stop is
    // worth about three letters of pause.
    const weights = words.map(word => word.length + 2 + (/[,.!?;:…]$/.test(word) ? 6 : 0))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const plan = { start, total, weights }
    start += words.length
    return plan
  })
}
