<script lang="ts">
  import { onMount } from "svelte";
  import { ripples } from "./ripples";

  /** Ordered (Bayer 8×8) dithering: each cell is lit when the field is brighter than its place in the pattern. */
  const BAYER = [
    0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52, 11, 59, 7, 55, 40, 24, 36, 20, 43, 27,
    39, 23, 2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29, 10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22,
    41, 25, 37, 21,
  ];
  const CELL = 6;
  const GAP = 0.7;
  /** The band redraws at a film-like rate, which suits the pixels and keeps it cheap. */
  const FRAME_MS = 1000 / 24;
  const RIPPLE_SECONDS = 1.6;

  let canvas: HTMLCanvasElement;

  const smoothstep = (from: number, to: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
    return t * t * (3 - 2 * t);
  };

  onMount(() => {
    const context = canvas.getContext("2d")!;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;

    function draw(now: number): void {
      const t = still.matches ? 0 : now / 1000;
      while (ripples[0] && (now - ripples[0].at) / 1000 > RIPPLE_SECONDS) ripples.shift();
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(canvas).color;
      const columns = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      for (let y = 0; y < rows; y++) {
        const py = y * CELL;
        const v = py / height;
        // Sparse at the top of the band, dense at the bottom, with slow waves running through it.
        const fade = smoothstep(0.05, 1, v);
        for (let x = 0; x < columns; x++) {
          const px = x * CELL;
          let light =
            fade *
            0.9 *
            (0.5 +
              0.3 * Math.sin(px / 76 + Math.sin(py / 120) * 2.2 + t * 0.35) +
              0.2 * Math.sin(py / 52 - px / 180 - t * 0.25));
          // A ring spreading out from under each fix that landed.
          for (const { x: at, at: start } of ripples) {
            const age = (now - start) / 1000;
            const distance = Math.hypot(px - at * width, py - height);
            light +=
              0.6 * Math.exp(-(((distance - age * 280) / 24) ** 2)) * (1 - age / RIPPLE_SECONDS) * (0.35 + 0.65 * v);
          }
          if (light > (BAYER[(y % 8) * 8 + (x % 8)]! + 0.5) / 64) context.fillRect(px, py, CELL - GAP, CELL - GAP);
        }
      }
    }

    function resize(): void {
      const scale = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      draw(performance.now());
    }

    function loop(now: number): void {
      frame = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const start = () => {
      cancelAnimationFrame(frame);
      if (still.matches) draw(performance.now());
      else frame = requestAnimationFrame(loop);
    };
    start();
    still.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      still.removeEventListener("change", start);
    };
  });
</script>

<canvas
  bind:this={canvas}
  aria-hidden="true"
  class="pointer-events-none absolute inset-x-0 bottom-0 h-36 w-full text-dither"
></canvas>
