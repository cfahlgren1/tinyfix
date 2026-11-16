const CONTRACTIONS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    arent: "aren't",
    cant: "can't",
    couldnt: "couldn't",
    didnt: "didn't",
    doesnt: "doesn't",
    dont: "don't",
    hadnt: "hadn't",
    hasnt: "hasn't",
    havent: "haven't",
    im: "I'm",
    isnt: "isn't",
    ive: "I've",
    shouldnt: "shouldn't",
    thats: "that's",
    theres: "there's",
    theyre: "they're",
    theyve: "they've",
    wasnt: "wasn't",
    werent: "weren't",
    weve: "we've",
    whats: "what's",
    wont: "won't",
    wouldnt: "wouldn't",
    youre: "you're",
    youve: "you've",
  }),
);

const BRITISH_OUR_ENDING = /(.{2,})our(s|ed|ing|ite|ites|ful|able|ably|less|hood|hoods|ly|ist|ists|er|ers)?$/;
const BRITISH_ISE_ENDING = /(is|ys)(e|es|ed|ing|er|ers|ation|ations|able)$/;
const BRITISH_DOUBLED_L =
  /^(un|re|mis|pre)?(travel|cancel|model|label|signal|fuel|level|total|marvel|counsel|jewel|tunnel|channel|shovel|dial|equal|quarrel|rival|panel|funnel|pencil|spiral|trial)l(ed|ing|er|ers|or|ors)$/;
const MIN_LENGTH_FOR_ISE_RULE = 7;
/** "councillor", "panellist", "pedalling": a doubled l before an ending where American English has one. */
const BRITISH_DOUBLED_L_ENDING = /ll(ed|ing|er|ers|or|ors|ist|ists|ous)$/;
/** "epicentre", "kilometres", "centred": re where American English has er. */
const BRITISH_RE_ENDING = /([^aeiou])re(s|d)?$/;
const MIN_LENGTH_FOR_RE_RULE = 5;
/** "paediatric", "haemorrhage", "oesophagus": ae and oe where American English has e. */
const BRITISH_DIGRAPH = /(ae|oe)/;
const MIN_LENGTH_FOR_DIGRAPH_RULE = 7;

const BRITISH_WORDS: ReadonlySet<string> = new Set(
  (
    "theatre centre centred metre litre fibre calibre sombre spectre defence offence licence pretence catalogue analogue programme judgement " +
    "ageing aluminium fulfil enrol skilful wilful jewellery tyre grey mould moulding plough sceptical sceptic cheque kerb draught manoeuvre " +
    "paediatric anaesthetic foetus oestrogen moustache pyjamas storey acknowledgement instalment distil instil appal " +
    "whisky enquiry amongst whilst"
  )
    .split(" ")
    .flatMap((word) => [word, `${word}s`]),
);

/** Everyday words newer than the word list, which would otherwise be "corrected" (emoji → meiji, todo → too). */
const NEWER_WORDS: ReadonlySet<string> = new Set(
  (
    "https emoji todo selfie hashtag livestream chatbot vlog vlogger influencer fintech covid podcaster blogger unfollow " +
    "unfriend retweet screenshare webinar onboarding offboarding skincare smartwatch earbud airpod wifi bluetooth " +
    "async runtime frontend backend dataset username login logout signup checkout touchscreen spreadsheet " +
    "workflow timeline toolbar dropdown popup tooltip codebase repo config dev devops cybersecurity crypto " +
    "kombucha matcha ramen udon pho bao boba poke quinoa kale hummus falafel tahini sriracha kimchi gochujang " +
    "tofu tempeh seitan acai chia granola brunch latte cappuccino espresso macchiato americano frappe smoothie " +
    "barista crema robusta arabica croissant focaccia ciabatta brioche sourdough gelato prosecco charcuterie " +
    "hygge wellness mindfulness hangry yeet meme binge rewatch preorder crowdfund carpool rideshare " +
    "staycation glamping bae vibe vibes ghosting doomscroll doomscrolling cringe adulting"
  )
    .split(" ")
    .flatMap((word) => [word, `${word}s`]),
);

/** True for newer everyday words the word list doesn't have. */
export const isNewerWord = (lower: string): boolean => NEWER_WORDS.has(lower);

/** Recognizes British spellings, so "colour" isn't treated as a misspelling of "color". */
export function isBritishSpelling(lower: string, isKnown: (word: string) => boolean): boolean {
  if (BRITISH_WORDS.has(lower)) return true;
  const doubled = BRITISH_DOUBLED_L.exec(lower);
  if (doubled) return true;
  const withOr = lower.replace(BRITISH_OUR_ENDING, "$1or$2");
  if (withOr !== lower && isKnown(withOr)) return true;
  const singleL = lower.replace(BRITISH_DOUBLED_L_ENDING, "l$1");
  if (singleL !== lower && isKnown(singleL)) return true;
  const withEr =
    lower.length < MIN_LENGTH_FOR_RE_RULE
      ? lower
      : lower.replace(
          BRITISH_RE_ENDING,
          (_, before: string, ending = "") => `${before}er${ending === "d" ? "ed" : ending}`,
        );
  if (withEr !== lower && isKnown(withEr)) return true;
  if (
    lower.length >= MIN_LENGTH_FOR_DIGRAPH_RULE &&
    BRITISH_DIGRAPH.test(lower) &&
    isKnown(lower.replace(BRITISH_DIGRAPH, "e"))
  )
    return true;
  if (lower.length < MIN_LENGTH_FOR_ISE_RULE) return false;
  const withZ = lower.replace(
    BRITISH_ISE_ENDING,
    (_, stem: string, ending: string) => `${stem === "is" ? "iz" : "yz"}${ending}`,
  );
  return withZ !== lower && isKnown(withZ);
}

export function isSentenceStart(textBefore: string): boolean {
  return /(^|[.!?:\n]\s*|^\s*[-*•]\s+)$/.test(textBefore);
}

/** Applies typed casing to a replacement, so "Teh" becomes "The". */
export function matchCase(typed: string, replacement: string): string {
  const isCapitalized = typed[0] !== typed[0]!.toLowerCase();
  return isCapitalized ? replacement[0]!.toUpperCase() + replacement.slice(1) : replacement;
}

export function applyFixedRule(word: string): string | null {
  if (word === "i") return "I";
  const lower = word.toLowerCase();
  const contraction = CONTRACTIONS.get(lower);
  if (!contraction) return null;
  return contraction.startsWith("I") ? contraction : matchCase(word, contraction);
}

/** Words the engine must leave alone: names, acronyms, identifiers and anything not plainly a word. */
export function isCheckable(word: string, textBefore: string): boolean {
  if (word.length < 3 || !/^[A-Za-z]+$/.test(word)) return false;
  if (word === word.toUpperCase()) return false;
  if (/[A-Z]/.test(word.slice(1))) return false;
  const isCapitalized = word[0] !== word[0]!.toLowerCase();
  if (isCapitalized && !isSentenceStart(textBefore)) return false;
  const previousToken = textBefore.trimEnd().split(/\s/).pop() ?? "";
  return !/[/@\\_#]|\.\w/.test(previousToken);
}
