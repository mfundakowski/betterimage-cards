import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  SIZES,
  canonicalString,
  dimensions,
  metaTags,
  metaTagsHtml,
  parseApiKey,
  sign,
  signedImage,
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

test("every platform size is offered and scale doubles the pixels", () => {
  assert.deepEqual(Object.keys(SIZES), ["og", "youtube", "square", "portrait", "story", "pinterest"]);
  assert.deepEqual(dimensions(), { width: 1200, height: 630 });
  assert.deepEqual(dimensions("story"), { width: 1080, height: 1920 });
  assert.deepEqual(dimensions("og", 2), { width: 2400, height: 1260 });
});

test("size and scale are signed fields, not free query parameters", async () => {
  const image = await signedImage({
    keyId: KEY_ID,
    secret: SECRET,
    template: "card",
    fields: { title: "T" },
    size: "story",
    scale: 2,
  });

  assert.deepEqual(image, {
    url: image.url,
    size: "story",
    scale: 2,
    width: 2160,
    height: 3840,
  });

  const parsed = new URL(image.url);
  assert.equal(parsed.searchParams.get("size"), "story");
  assert.equal(parsed.searchParams.get("scale"), "2");
  assert.equal(
    parsed.searchParams.get("s"),
    await sign(SECRET, canonicalString(KEY_ID, "card", { title: "T", size: "story", scale: 2 })),
  );
});

test("the default size stays out of the URL so it matches a hand-built one", async () => {
  const url = await signedImageUrl({ keyId: KEY_ID, secret: SECRET, template: "card", fields: { title: "T" } });
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("size"), null);
  assert.equal(parsed.searchParams.get("scale"), null);
});

test("an unknown size or scale is refused before the request is made", async () => {
  await assert.rejects(
    () => signedImage({ keyId: KEY_ID, secret: SECRET, template: "card", size: "banner" }),
    /Unknown size "banner"/,
  );
  await assert.rejects(
    () => signedImage({ keyId: KEY_ID, secret: SECRET, template: "card", scale: 3 }),
    /scale must be 1 or 2/,
  );
});

test("metaTags cover og:image and the Twitter pair", () => {
  const tags = metaTags("https://betterimage.io/card.png");

  assert.deepEqual(
    tags.map((tag) => tag.property ?? tag.name),
    ["og:image", "og:image:width", "og:image:height", "twitter:card", "twitter:image"],
  );

  assert.match(metaTagsHtml('https://x.test/c.png?a=1&b="2"'), /content="https:\/\/x.test\/c.png\?a=1&amp;b=&quot;2&quot;"/);

  // a bare URL is treated as the default link-preview size
  assert.equal(tags[1].content, "1200");
  assert.equal(tags[2].content, "630");

  const story = metaTags({ url: "https://x.test/s.png", size: "story", scale: 1, width: 1080, height: 1920 });
  assert.equal(story[1].content, "1080");
  assert.equal(story[2].content, "1920");
});
