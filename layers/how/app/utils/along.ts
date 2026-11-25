/**
 * The stretch of its scene's scrolling over which one drawing moves, as the
 * custom properties the `play-*` diagram utilities read (main.css › Play).
 * `from` and `to` are percentages of the scene's way across the window.
 */
export function along(from: number, to: number, move: Record<string, string> = {}) {
  return { '--from': `${from}%`, '--to': `${to}%`, ...move }
}
