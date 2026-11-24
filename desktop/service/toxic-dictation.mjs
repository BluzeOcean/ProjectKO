import { ToxicClient } from './toxic.mjs';

/**
 * A partner take, driven from Project KO's own terminal.
 *
 * Toxic's system-wide chord hook never fires for a key that goes to a Chromium
 * web view: the WebView2 host takes the keyboard as raw input, so no keyboard
 * message - and therefore no `WH_KEYBOARD_LL` callback - is ever generated
 * for it. The chord *is* delivered to the page, so the terminal catches it
 * and asks Toxic for a take from here.
 *
 * A partner take is not typed anywhere. Toxic hands the transcript back to
 * the app that asked for it, so the words land in the terminal that asked for
 * them, and a take made in another application can never type into Project KO.
 * The microphone, the recording and the transcription all stay in Toxic.
 */

const fail = (message, status = 502) => Object.assign(new Error(message), { status });

export class ToxicDictation {
  constructor({ client = null, env = process.env } = {}) {
    this.client = client || new ToxicClient({ env });
  }

  /** Open a take. Toxic shows its listening bar and takes the microphone. */
  async take({ hint } = {}) {
    await this.client.dictation('start', { hint });
    return { listening: true };
  }

  /** Finish the take and hand back what was said. */
  async stop() {
    const transcript = await this.client.dictation('stop');
    return { transcript: typeof transcript === 'string' ? transcript.trim() : '' };
  }

  /** Throw the take away: the owner changed their mind. */
  async cancel() {
    await this.client.dictation('cancel');
    return { listening: false };
  }

  /** Is a take running, and what was said last? */
  async status() {
    const state = await this.client.dictation('status');
    return { listening: state?.listening === true, last: state?.last || null };
  }
}

export { fail };
