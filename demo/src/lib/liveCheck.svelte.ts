import type { Fix, Tinyfix } from "tinyfix";
import { finishedLength } from "./segments";

/**
 * Keeps the fixes for a text that's being typed. Only the finished words are checked, one check at a time, and a check
 * that comes back after the text moved on is followed by another, so the fixes always catch up with the typing.
 */
export class LiveCheck {
  status = $state<"loading" | "ready" | "error">("loading");
  fixes = $state.raw<Fix[]>([]);
  /** How long the last check took, to show that it runs right here. */
  milliseconds = $state<number | null>(null);

  #tinyfix: Tinyfix | null = null;
  #wanted = "";
  #checked = "";
  #running = false;

  async load(): Promise<void> {
    try {
      // Loaded as its own chunk: ONNX Runtime starts its worker from the script it's in, which mustn't be the page's.
      const { loadTinyfix } = await import("tinyfix");
      this.#tinyfix = await loadTinyfix();
      this.status = "ready";
      await this.#catchUp();
    } catch (error) {
      console.error("tinyfix couldn't load.", error);
      this.status = "error";
    }
  }

  update(text: string): void {
    this.#wanted = text.slice(0, finishedLength(text));
    void this.#catchUp();
  }

  async #catchUp(): Promise<void> {
    if (!this.#tinyfix || this.#running) return;
    this.#running = true;
    try {
      while (this.#checked !== this.#wanted) {
        const text = this.#wanted;
        const started = performance.now();
        this.fixes = text.trim() ? await this.#tinyfix.check(text) : [];
        if (text.trim()) this.milliseconds = Math.max(1, Math.round(performance.now() - started));
        this.#checked = text;
      }
    } catch (error) {
      console.error("tinyfix couldn't check the text.", error);
      this.status = "error";
    } finally {
      this.#running = false;
    }
  }
}
