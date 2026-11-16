/** Sentences to try. Each one is fixed completely by the current model; others may not be, and that's fine to show. */
export const EXAMPLES = [
  {
    label: "A letter from the bank",
    text: "I got a letter form the bank. Their is a problem, and I am to tired to recieve it.",
  },
  { label: "Waiting", text: "Can you send me the file? I will loose my mind if I have to wait untill tomorrow." },
  { label: "Lunch plans", text: "I think we should meat at the coffee shop. I'll be their around noon." },
  { label: "The news", text: "Did you here the news? They're new office is right next to ours." },
] as const;
