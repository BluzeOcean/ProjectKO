/** The shared mark for Workspace, Chats and the voice controls. */
export default function PkoLogo({ size = 64, tone = 'pink' }: { size?: number; animated?: boolean; tone?: 'pink' | 'black' }) {
  return <img className="pko-logo" src={tone === 'black' ? '/assets/pko-mark-chats.svg' : '/assets/pko-mark.svg'} width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }} />
}
