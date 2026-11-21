// How often the agent's quota may be read: quota.ps1's own list, plus two for
// patience. The line at the foot of the Chats window is what they drive, and
// the Settings panel and the window's Appearance popover both offer them.
export const quotaIntervals = [1, 3, 5, 10, 15, 30]

export const quotaIntervalLabel = (minutes: number) => minutes === 1 ? '1 minute' : minutes + ' minutes'

export const quotaIntervalNote = 'The MiniMax agent\u2019s five-hour window and week, as the line at the foot of Chats shows them. Project KO reads the CLI at this interval and keeps the last answer for thirty seconds.'
