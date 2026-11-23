/** The shared mark for Vaultspace, Chatspace and the voice controls. */
export default function PkoLogo({ size = 64, tone = 'pink' }: { size?: number; animated?: boolean; tone?: 'pink' | 'black' }) {
  return <img className="pko-logo" src={tone === 'black' ? '/assets/pko-mark-chats.png' : '/assets/pko-mark.png'} width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }} />
}
