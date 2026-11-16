import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { loadTinyfix, type Tinyfix } from "../src/index.js";
import { serveModels } from "./helpers.js";

let server: Awaited<ReturnType<typeof serveModels>>;
let tinyfix: Tinyfix;

before(async () => {
  server = await serveModels();
  tinyfix = await loadTinyfix({ baseUrl: server.baseUrl });
});
after(async () => {
  await tinyfix.dispose();
  await server.close();
});

describe("fix", () => {
  // The sentences offlinepage.app is checked with, and what it turns them into.
  const FIXED: Array<[typed: string, expected: string]> = [
    ["Its been a long week for everyone.", "It's been a long week for everyone."],
    ["Their is a problem with the invoice.", "There is a problem with the invoice."],
    ["I am to tired to cook tonight.", "I am too tired to cook tonight."],
    ["I think your right about that.", "I think you're right about that."],
    ["I will send it form home tomorrow.", "I will send it from home tomorrow."],
    ["Did you recieve my email yesterday?", "Did you receive my email yesterday?"],
  ];
  for (const [typed, expected] of FIXED) {
    it(`fixes “${typed}”`, async () => assert.equal(await tinyfix.fix(typed), expected));
  }

  const LEFT_ALONE = [
    "Buy one, get one free.",
    "See the list below, ie the first three items.",
    "The sources of the river are high in the hills.",
    "I filled in the form and sent it back.",
    "Email john@form.com or see https://recieve.teh/form?x=teh for more.",
    "ALL CAPS TEH FORM RECIEVE HERE.",
  ];
  for (const text of LEFT_ALONE) {
    it(`leaves “${text}” alone`, async () => assert.equal(await tinyfix.fix(text), text));
  }

  it("leaves code alone, inline and fenced", async () => {
    const text = "Run `teh form` and recieve it.\n```\nconst teh = recieve;\n```\nThen recieve teh mail.";
    assert.equal(
      await tinyfix.fix(text),
      "Run `teh form` and receive it.\n```\nconst teh = recieve;\n```\nThen receive the mail.",
    );
  });
});

describe("check", () => {
  it("reports each fix with its place, kind and confidence", async () => {
    const text = "I got a letter form the bank and did not recieve it.";
    const fixes = await tinyfix.check(text);
    assert.deepEqual(
      fixes.map(({ confidence: _confidence, ...fix }) => fix),
      [
        { from: 15, to: 19, original: "form", replacement: "from", kind: "context" },
        { from: 41, to: 48, original: "recieve", replacement: "receive", kind: "spelling" },
      ],
    );
    for (const fix of fixes) assert.ok(fix.confidence > 0.5 && fix.confidence <= 1, `confidence ${fix.confidence}`);
  });

  it("gives positions that hold with emoji and other scripts in the text", async () => {
    const text = "I ❤️ teh 🍕 and 日本語, مرحبا, then recieve it.";
    const fixes = await tinyfix.check(text);
    assert.deepEqual(
      fixes.map((fix) => [text.slice(fix.from, fix.to), fix.replacement]),
      [
        ["teh", "the"],
        ["recieve", "receive"],
      ],
    );
    assert.equal(tinyfix.apply(text, fixes), "I ❤️ the 🍕 and 日本語, مرحبا, then receive it.");
  });

  it("only checks words inside the range, and reads the rest as context", async () => {
    const text = "I recieve teh mail and I got a letter form the bank today.";
    const from = text.indexOf("form");
    const fixes = await tinyfix.check(text, { range: [from, from + 4] });
    assert.deepEqual(
      fixes.map((fix) => fix.replacement),
      ["from"],
    );
  });

  it("only looks for the kinds asked for", async () => {
    const text = "I got a letter form the bank and did not recieve it.";
    assert.deepEqual(
      (await tinyfix.check(text, { kinds: ["spelling"] })).map((fix) => fix.replacement),
      ["receive"],
    );
    assert.deepEqual(
      (await tinyfix.check(text, { kinds: ["context"] })).map((fix) => fix.replacement),
      ["from"],
    );
  });

  it("returns nothing for empty text and text with nothing wrong", async () => {
    assert.deepEqual(await tinyfix.check(""), []);
    assert.deepEqual(await tinyfix.check("The cat sat on the mat."), []);
  });
});

describe("apply", () => {
  it("makes fixes that change the length of the text", async () => {
    const text = "I am to tired and I think your right.";
    assert.equal(tinyfix.apply(text, await tinyfix.check(text)), "I am too tired and I think you're right.");
  });

  it("returns the text unchanged for no fixes", () => assert.equal(tinyfix.apply("as is", []), "as is"));

  it("refuses a fix that doesn't match the text", () => {
    const fix = { from: 0, to: 3, original: "teh", replacement: "the", kind: "spelling" as const, confidence: 1 };
    assert.throws(() => tinyfix.apply("cat sat", [fix]), /expects “teh”/);
  });
});

describe("ignore", () => {
  it("stops a word from being changed again", async () => {
    const own = await loadTinyfix({ baseUrl: server.baseUrl });
    assert.equal(await own.fix("I got teh mail."), "I got the mail.");
    own.ignore("teh");
    assert.equal(await own.fix("I got teh mail."), "I got teh mail.");
    await own.dispose();
  });
});

describe("model: false", () => {
  it("fixes misspellings only, and downloads no model", async () => {
    const earlier = server.requested.length;
    const spelling = await loadTinyfix({ baseUrl: server.baseUrl, model: false });
    assert.deepEqual(server.requested.slice(earlier), ["words.txt"]);
    assert.equal(
      await spelling.fix("Did you recieve the letter form the bank?"),
      "Did you receive the letter form the bank?",
    );
    await spelling.dispose();
  });
});

describe("loading", () => {
  it("says which file is missing", async () => {
    await assert.rejects(loadTinyfix({ baseUrl: `${server.baseUrl}nowhere/` }), /couldn't load .+ \(404\)/);
  });
});
