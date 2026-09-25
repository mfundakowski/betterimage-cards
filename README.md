# @betterimage/cards

Signed [betterimage.io](https://betterimage.io) card URLs, so every page on your site gets its own social card from one saved template.

You design the card once and the image is rendered the first time it is fetched, then cached at the edge. There is no image pipeline to build, nothing to upload on every post, and the API key's secret never leaves your server.

The same template renders at every platform size: a 1200x630 link preview for `og:image`, a YouTube thumbnail, an Instagram square or portrait, a story, or a Pinterest pin.

Zero dependencies. Runs on Node 20+, Bun, Deno and edge runtimes (Vercel Edge, Cloudflare Workers); the signature uses Web Crypto, so there is no `node:crypto` import to break a bundler.

## Install

```bash
npm install @betterimage/cards
```

## Use

```ts
import { parseApiKey, signedImageUrl } from "@betterimage/cards";

const { keyId, secret } = parseApiKey(process.env.BETTERIMAGE_API_KEY!);

const url = await signedImageUrl({
  keyId,
  secret,
  template: "blog-card",
  fields: { title: post.title, description: post.excerpt },
});
// https://betterimage.io/api/v1/i/<keyId>/blog-card.png?description=...&title=...&s=...
```

You need an API key from [account settings](https://betterimage.io/users/settings/api) and a saved template; `GET /api/v1/templates` lists the slugs and the fields each one accepts. Templates are made in the [editor](https://betterimage.io/editor) or from a preset.

### Next.js (app router)

```ts
// app/blog/[slug]/page.tsx
import { metaTags, parseApiKey, signedImageUrl } from "@betterimage/cards";

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);

  const url = await signedImageUrl({
    ...parseApiKey(process.env.BETTERIMAGE_API_KEY!),
    template: "blog-card",
    fields: { title: post.title, description: post.excerpt, author: post.author },
  });

  return {
    title: post.title,
    openGraph: { images: [{ url, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}
```

### Astro

```astro
---
import { parseApiKey, signedImageUrl, metaTagsHtml } from "@betterimage/cards";

const url = await signedImageUrl({
  ...parseApiKey(import.meta.env.BETTERIMAGE_API_KEY),
  template: "blog-card",
  fields: { title: frontmatter.title },
});
---
<Fragment set:html={metaTagsHtml(url)} />
```

### A different picture per item

`fields` carries the text, and it carries the card's pictures too. Pass
`image_url` and that photo is fetched server-side and drawn in the slot the
saved design already lays out, keeping its crop framing, so a catalogue
comes out as one series instead of one card per shape.

```ts
const url = await signedImageUrl({
  keyId,
  secret,
  template: "shop-listing",
  fields: {
    title: product.name,
    price: product.price,
    price_was: product.compareAtPrice,
    badge: product.discountLabel,
    image_url: product.image,
  },
});
```

`image2_url`, `logo_url` and `background_url` fill the card's other slots
the same way. PNG, JPEG or WebP up to 5 MB, decided by the bytes rather
than the URL. Which slots a template actually draws is in the
`image_fields` of `GET /api/v1/templates`.

Nothing is uploaded and nothing is rendered here: the URL is signed
locally, so a catalogue of any size costs no API calls until something
fetches the image.

### Sizes other than the link preview

```ts
import { signedImage } from "@betterimage/cards";

const thumb = await signedImage({
  ...parseApiKey(process.env.BETTERIMAGE_API_KEY!),
  template: "blog-card",
  fields: { title: episode.title },
  size: "youtube",   // og | youtube | square | portrait | story | pinterest
  scale: 2,          // 2 renders at twice the pixels for high-DPI screens
});

thumb.url;                      // the signed URL
thumb.width, thumb.height;      // 2560 x 1440 at scale 2
```

`signedImage` returns the pixels the image renders at, which is what `og:image:width` and `og:image:height` need; `metaTags(thumb)` uses them. `SIZES` holds the full table and `dimensions(size, scale)` computes one without signing anything.

| Size | Pixels | Where it goes |
|---|---|---|
| `og` (default) | 1200x630 | Link previews: X, Facebook, LinkedIn, Slack, Discord, WhatsApp |
| `youtube` | 1280x720 | YouTube thumbnails and any 16:9 slot |
| `square` | 1080x1080 | Instagram and Facebook feed posts |
| `portrait` | 1080x1350 | Instagram portrait posts (4:5) |
| `story` | 1080x1920 | Instagram, Facebook and TikTok stories (9:16) |
| `pinterest` | 1000x1500 | Pinterest pins (2:3) |

`size` and `scale` are part of the signature, so a published URL cannot be edited to render a different canvas on your quota.

### Anything else

`metaTags(url)` returns the five tags as objects, `metaTagsHtml(url)` as a string:

```html
<meta property="og:image" content="https://betterimage.io/api/v1/i/..." />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://betterimage.io/api/v1/i/..." />
```

## API

| Export | What it does |
|---|---|
| `signedImageUrl(options)` | The signed URL for one page. `{ keyId, secret, template, fields?, size?, scale?, baseUrl? }` |
| `signedImage(options)` | The same, plus `width`, `height`, `size` and `scale` |
| `SIZES` / `dimensions(size, scale)` | The platform sizes and the pixels each renders at |
| `parseApiKey(apiKey)` | Splits `bi_<keyId>_<secret>` into `{ keyId, secret }` |
| `canonicalString(keyId, template, fields)` | The exact string that gets signed, for debugging a 403 |
| `sign(secret, canonical)` | Lowercase hex HMAC-SHA256 |
| `metaTags(url)` / `metaTagsHtml(url)` | The tags to put in `<head>` |

Field values that are `undefined`, `null` or `""` are dropped, numbers and booleans are stringified, and the order of keys in the object never changes the signature.

`fields` takes the text a card draws (`title`, `description`, `tag`, `author`, `footer`, and on a Product card `rating`, `price`, `price_was`, `price_note`, `badge`) and its pictures by URL (`image_url`, `image2_url`, `logo_url`, `background_url`). `GET /api/v1/templates` lists what each saved template accepts.

## How the signature works

The canonical string is `<keyId>/<template>?` followed by the fields, raw and sorted by name, joined with `&`. Its HMAC-SHA256, hex encoded, is the `s` parameter. The server rebuilds the same string from the request, so the fields in the URL are the fields you signed: a URL cannot be edited after the fact to render different text on your quota.

A 403 response echoes the canonical string the server derived, which is the fastest way to spot a mismatch. Full reference: [betterimage.io/api#signing](https://betterimage.io/api#signing).

## Quota and caching

Successful renders are cached at the edge for a day, and cached fetches do not count against your quota. A URL that exceeds the quota still answers with an image and a 200, so your link previews never break; it carries `x-bi-quota-exceeded: true` and is cached for a minute. Plans and limits: [betterimage.io/api](https://betterimage.io/api).

## Also

- [MCP server](https://betterimage.io/mcp): the same templates from Claude, Cursor or VS Code.
- [Link preview checker](https://betterimage.io/link-preview-checker): what X, Facebook, LinkedIn, Slack and Discord will show for a URL.

MIT
