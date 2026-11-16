/** Where fixes landed, across the page from 0 to 1, and when. The dither band sends a ripple out from each one. */
export const ripples: { x: number; at: number }[] = [];

export function ripple(element: HTMLElement): void {
  const box = element.getBoundingClientRect();
  ripples.push({ x: (box.left + box.width / 2) / document.documentElement.clientWidth, at: performance.now() });
}
