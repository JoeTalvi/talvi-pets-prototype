/** A touch-first device (phone, tablet): the primary pointer is coarse. The on-screen joystick shows only there; a desktop
 * plays with WASD / the arrows. Without `matchMedia` (jsdom, old browsers) the touch-point count decides. */
export function touchDevice(nav: Pick<Navigator, 'maxTouchPoints'> = navigator, matchMedia = globalThis.matchMedia): boolean {
  if (typeof matchMedia === 'function') return matchMedia('(pointer: coarse)').matches;
  return nav.maxTouchPoints > 0;
}
