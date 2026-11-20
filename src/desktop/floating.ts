import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * A popover that floats over the New chat panel instead of pushing it down.
 * The dialog scrolls, so an in-flow menu would be clipped by it and the
 * control it measures would move under the popover.
 */
export function placeFloating(list: HTMLElement, control: HTMLElement) {
  // Park the popover in the corner and cap its height BEFORE measuring. An
  // unconstrained popover hangs past the bottom of the window, which gives the
  // document a scrollbar for one frame; the centred dialog then shifts a few
  // pixels and the popover lands off its own button. At the top-left with a
  // capped height it cannot overflow, so the measurement is of the settled
  // layout.
  list.style.position = 'fixed'
  list.style.top = '0px'
  list.style.left = '0px'
  list.style.maxHeight = `${window.innerHeight}px`

  const box = control.getBoundingClientRect()
  // The scrim carries a backdrop-filter, so it is the containing block for
  // fixed descendants: the coordinates are measured against the scrim.
  const frame = control.closest('.desk-scrim')?.getBoundingClientRect()
  const top = frame ? frame.top : 0
  const left = frame ? frame.left : 0
  const bottom = frame ? frame.bottom : window.innerHeight
  const gap = 6
  const below = bottom - box.bottom - gap
  const above = box.top - top - gap
  // Prefer downwards: the popover covers the form below, which reads better
  // than floating back over the field above. Flip up only when there is not
  // enough room to be worth it.
  const downwards = below >= 180 || below >= above
  const height = Math.max(170, Math.min(downwards ? below : above, bottom - top - 16))
  list.style.top = `${(downwards ? box.bottom + gap : box.top - gap - height) - top}px`
  list.style.left = `${box.left - left}px`
  list.style.width = `${box.width}px`
  list.style.maxHeight = `${height}px`
}

/**
 * The plumbing every floating popover needs: it places the popover against
 * its control, closes it on a click outside, and follows the page when the
 * window resizes or scrolls.
 */
export function useFloating<C extends HTMLElement, L extends HTMLElement>(open: boolean, close: () => void) {
  const wrap = useRef<HTMLDivElement>(null)
  const control = useRef<C>(null)
  const list = useRef<L>(null)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])
  const place = useCallback(() => {
    if (list.current && control.current) placeFloating(list.current, control.current)
  }, [])
  // Placed after every render: the popover follows its control when the
  // content around it changes height.
  useLayoutEffect(() => { if (open) place() })
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) closeRef.current() }
    const move = () => place()
    document.addEventListener('mousedown', outside)
    window.addEventListener('resize', move)
    window.addEventListener('scroll', move, true)
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('resize', move); window.removeEventListener('scroll', move, true) }
  }, [open, place])
  return { wrap, control, list, place }
}
