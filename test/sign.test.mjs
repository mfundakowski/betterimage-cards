import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  canonicalString,
  metaTags,
  metaTagsHtml,
  parseApiKey,
  sign,
  signedImageUrl,
} from "../dist/index.js";

const KEY_ID = "a1b2c3d4e5";
const SECRET = "s3cr3t-not-a-real-key";

test("parseApiKey splits a key and rejects anything else", () => {
  assert.deepEqual(parseApiKey(`bi_${KEY_ID}_${SECRET}`), { keyId: KEY_ID, secret: SECRET });
  assert.throws(() => parseApiKey("nope"), TypeError);
  assert.throws(() => parseApiKey("bi__secret"), TypeError);
});

test("the canonical string is sorted, raw and prefixed with key and template", () => {
  const canonical = canonicalString(KEY_ID, "blog-card", {
    title: "Your headline",
    description: "One support line",
  });

  assert.equal(canonical, `${KEY_ID}/blog-card?description=One support line&title=Your headline`);
});

test("empty and nullish fields are dropped, numbers and booleans stringified", () => {
  const canonical = canonicalString(KEY_ID, "blog-card", {
    title: "T",
    tag: "",
    author: null,
    footer: undefined,
    scale: 2,
    dark: true,
  });

  assert.equal(canonical, `${KEY_ID}/blog-card?dark=true&scale=2&title=T`);
});

test("field order in the object does not change the signature", async () => {
  const one = await signedImageUrl({ keyId: KEY_ID, secret: SECRET, template: "c", fields: { b: "2", a: "1" } });
  const two = await signedImageUrl({ keyId: KEY_ID, secret: SECRET, template: "c", fields: { a: "1", b: "2" } });

  assert.equal(new URL(one).searchParams.get("s"), new URL(two).searchParams.get("s"));
});

test("sign matches an independent HMAC-SHA256 implementation", async () => {
  const canonical = canonicalString(KEY_ID, "blog-card", { title: "Your headline" });
  const expected = createHmac("sha256", SECRET).update(canonical).digest("hex");

  assert.equal(await sign(SECRET, canonical), expected);
});

test("the URL carries the encoded fields plus the signature", async () => {
  const url = await signedImageUrl({
    keyId: KEY_ID,
    secret: SECRET,
    template: "blog-card",
    fields: { title: "Rust + Elixir", description: "100% shipped" },
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, `https://betterimage.io/api/v1/i/${KEY_ID}/blog-card.png`);
  assert.equal(parsed.searchParams.get("title"), "Rust + Elixir");
  assert.equal(parsed.searchParams.get("description"), "100% shipped");

  // A literal plus must survive as %2B, or the server reads it as a space.
  assert.match(parsed.search, /title=Rust\+%2B\+Elixir/);

  const canonical = canonicalString(KEY_ID, "blog-card", {
    title: "Rust + Elixir",
    description: "100% shipped",
  });
  assert.equal(parsed.searchParams.get("s"), await sign(SECRET, canonical));
});

test("baseUrl can be overridden and never doubles the slash", async () => {
  const url = await signedImageUrl({
    keyId: KEY_ID,
    secret: SECRET,
    template: "c",
    baseUrl: "https://example.test/",
  });

  assert.ok(url.startsWith("https://example.test/api/v1/i/"));
});

test("signedImageUrl refuses incomplete input", async () => {
  await assert.rejects(() => signedImageUrl({ keyId: "", secret: SECRET, template: "c" }), TypeError);
  await assert.rejects(() => signedImageUrl({ keyId: KEY_ID, secret: SECRET, template: "" }), TypeError);
});

test("metaTags cover og:image and the Twitter pair", () => {
  const tags = metaTags("https://betterimage.io/card.png");

  assert.deepEqual(
    tags.map((tag) => tag.property ?? tag.name),
    ["og:image", "og:image:width", "og:image:height", "twitter:card", "twitter:image"],
  );

  assert.match(metaTagsHtml('https://x.test/c.png?a=1&b="2"'), /content="https:\/\/x.test\/c.png\?a=1&amp;b=&quot;2&quot;"/);
});
