/** Keep browser gestures out of the play surface; HTML controls retain their taps. */
export function installPointerRouting(): () => void {
  const prevent = (event: Event) => event.preventDefault();
  const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
  const options = { passive: false };
  for (const name of ['contextmenu', 'gesturestart', 'gesturechange', 'wheel']) canvas?.addEventListener(name, prevent, options);
  return () => { for (const name of ['contextmenu', 'gesturestart', 'gesturechange', 'wheel']) canvas?.removeEventListener(name, prevent); };
}
