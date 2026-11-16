<script lang="ts">
  import { onMount } from "svelte";
  import DitherBand from "./lib/DitherBand.svelte";
  import { EXAMPLES } from "./lib/examples";
  import { LiveCheck } from "./lib/liveCheck.svelte";
  import { ripple } from "./lib/ripples";
  import { segments } from "./lib/segments";
  import { typeOut } from "./lib/typewriter";

  const INSTALL = "npm install tinyfix";
  /** Both lines, and the box you type in, share one set of metrics, so the squiggles sit under the right words. */
  const SIZE = "font-serif text-[clamp(25px,3.4vw,44px)] leading-[1.42] tracking-[-0.005em]";
  const LINE = `${SIZE} whitespace-pre-wrap wrap-break-word`;
  const SQUIGGLE =
    "animate-squiggle text-sub underline decoration-squiggle decoration-wavy decoration-[1.5px] underline-offset-[0.24em]";
  /** A fixed word's underline is drawn as a background, so it can grow in from the left as the fix lands. */
  const UNDERLINE = "animate-land rounded-[0.15em] bg-linear-to-r bg-size-[100%_3px] bg-bottom-left bg-no-repeat";
  const UNDERLINE_KIND = {
    context: "from-context-line to-context-line [--flash:var(--context-flash)]",
    spelling: "from-spelling-line to-spelling-line [--flash:var(--spelling-flash)]",
  };
  const TITLE = { context: "Fixed from the words around it", spelling: "Fixed spelling" };
  const LABEL = "pt-[0.2em] font-mono text-[11.5px] font-semibold tracking-[0.16em] text-sub uppercase sm:text-right";

  const live = new LiveCheck();
  let text = $state("");
  let typing: AbortController | null = null;
  let copied = $state(false);

  const parts = $derived(segments(text, live.fixes));
  const fixedCount = $derived(parts.filter((part) => part.fix).length);

  $effect(() => live.update(text));

  /** Types an example out, as if someone were typing it, so the fixes land the way they do as you write. */
  async function play(example: string): Promise<void> {
    typing?.abort();
    typing = new AbortController();
    text = "";
    await typeOut(example, (typed) => (text = typed), typing.signal);
  }

  function stopPlaying(): void {
    typing?.abort();
    typing = null;
  }

  async function copyInstall(): Promise<void> {
    await navigator.clipboard.writeText(INSTALL);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }

  onMount(() => {
    // The first example plays once the model is ready, unless someone has started typing by then.
    void live.load().then(() => {
      if (!text && live.status === "ready") void play(EXAMPLES[0].text);
    });
    return stopPlaying;
  });
</script>

<div class="relative flex min-h-dvh flex-col overflow-hidden px-4 sm:px-8">
  <header class="pt-12 text-center sm:pt-14">
    <h1 class="text-[26px] font-[650] tracking-[-0.01em] text-ink sm:text-[30px]">
      tiny<i class="font-serif text-[1.12em] font-medium text-context">fix</i>
      <span class="ml-2 text-lg font-normal tracking-normal text-sub sm:text-xl">autocorrect · 2.1 MB</span>
    </h1>
    <p class="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-sub">
      Spell check can’t tell that “form” should be “from”. tinyfix reads the words on both sides. It runs in your
      browser, so nothing you type leaves this page.
    </p>
  </header>

  <main class="mx-auto mt-12 w-full max-w-5xl flex-1 sm:mt-14">
    <div class="grid grid-cols-1 items-baseline gap-x-10 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-8">
      <label for="typed" class={LABEL}>You type</label>
      <div class="relative min-h-[2.84em] {SIZE}">
        <!--
          What's drawn: the words in gray, with a squiggle under each one tinyfix changes. Line breaks and spaces are
          kept here as they are in the textarea, so the markup inside it is on one line. The zero-width space at the
          end gives a final empty line its height.
        -->
        <!-- prettier-ignore -->
        <div aria-hidden="true" class="text-faint {LINE}">{#each parts as part (part.key)}{#if part.fix}<span class={SQUIGGLE}>{part.text}</span>{:else}{part.text}{/if}{/each}&#8203;</div>
        <!-- What you type into: the same text, see-through, laid exactly over the drawing. -->
        <textarea
          id="typed"
          bind:value={text}
          oninput={stopPlaying}
          onpointerdown={stopPlaying}
          maxlength="400"
          rows="2"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="sentences"
          placeholder="Type something with a typo in it…"
          class="absolute inset-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-transparent caret-context outline-none selection:bg-context/20 placeholder:text-faint {LINE}"
        ></textarea>
      </div>

      <p id="got-label" class="{LABEL} mt-8 sm:mt-0">You get</p>
      <!-- prettier-ignore -->
      <div class="min-h-[2.84em] text-body {LINE}" aria-labelledby="got-label">{#each parts as part (part.key)}{#if part.fix}<span {@attach ripple} class={[UNDERLINE, UNDERLINE_KIND[part.fix.kind]]} title={TITLE[part.fix.kind]}>{part.fix.replacement}</span>{:else}{part.text}{/if}{/each}</div>

      <!-- The examples and status line up under the text, past the labels. -->
      <span class="hidden sm:block"></span>
      <div class="mt-10 flex flex-col gap-4 sm:mt-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-1 text-sm text-sub">Try:</span>
          {#each EXAMPLES as example (example.label)}
            <button
              type="button"
              class="min-h-9 rounded-full border border-line px-3.5 text-sm text-body hover:bg-chip"
              onclick={() => play(example.text)}>{example.label}</button
            >
          {/each}
          {#if text}
            <button
              type="button"
              class="min-h-9 rounded-full px-3 text-sm text-sub hover:text-ink"
              onclick={() => {
                stopPlaying();
                text = "";
                document.getElementById("typed")?.focus();
              }}>Clear</button
            >
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-sub" role="status">
          {#if live.status === "loading"}
            <span class="flex items-center gap-2"
              ><i class="size-1.5 animate-pulse rounded-full bg-faint"></i>Loading the model (2.1 MB)…</span
            >
          {:else if live.status === "error"}
            <span class="text-squiggle">The model couldn’t load. Try reloading the page.</span>
          {:else}
            <span class="flex items-center gap-2"
              ><i class="size-1.5 rounded-full bg-[#34c759]"></i>Running in your browser{live.milliseconds === null
                ? ""
                : ` · checked in ${live.milliseconds} ms`}</span
            >
            {#if fixedCount}
              <span class="flex items-center gap-4">
                <span class="flex items-center gap-1.5"
                  ><i class="h-[3px] w-3.5 rounded-full bg-context-line"></i>from the words around it</span
                >
                <span class="flex items-center gap-1.5"
                  ><i class="h-[3px] w-3.5 rounded-full bg-spelling-line"></i>spelling</span
                >
              </span>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </main>

  <footer
    class="mx-auto mt-12 mb-40 flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-sub"
  >
    <button
      type="button"
      class="flex min-h-9 items-center gap-3 rounded-lg bg-chip px-3.5 font-mono text-[13px] text-body"
      onclick={copyInstall}
      aria-label="Copy {INSTALL}"
    >
      {INSTALL}<span class="font-sans text-xs text-sub">{copied ? "Copied" : "Copy"}</span>
    </button>
    <a class="hover:text-ink" href="https://github.com/cfahlgren1/tinyfix" target="_blank" rel="noopener">GitHub ↗</a>
    <a class="hover:text-ink" href="https://huggingface.co/paperweight/tinyfix" target="_blank" rel="noopener"
      >Model ↗</a
    >
    <a class="hover:text-ink" href="https://offlinepage.app" target="_blank" rel="noopener">offlinepage.app ↗</a>
  </footer>

  <DitherBand />
</div>
