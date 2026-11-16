/** Types a sentence out a character at a time, at about the pace of a person, until it's done or the signal aborts. */
export async function typeOut(text: string, write: (typed: string) => void, signal: AbortSignal): Promise<void> {
  for (let count = 1; count <= text.length; count++) {
    const char = text[count - 1] ?? "";
    const pause = 38 + Math.random() * 42 + (char === " " ? 25 : 0) + (".,?!".includes(char) ? 220 : 0);
    await new Promise((resolve) => setTimeout(resolve, pause));
    if (signal.aborted) return;
    write(text.slice(0, count));
  }
}
