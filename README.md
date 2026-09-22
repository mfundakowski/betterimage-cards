# @betterimage/og

Signed [betterimage.io](https://betterimage.io) image URLs, so every page on your site gets its own social card from one saved template.

You design the card once, put a URL in the `og:image` tag, and the image is rendered the first time a crawler fetches it, then cached at the edge. There is no image pipeline to build, nothing to upload on every post, and the API key's secret never leaves your server.

Zero dependencies. Runs on Node 18+, Bun, Deno and edge runtimes (Vercel Edge, Cloudflare Workers); the signature uses Web Crypto.

## Install

```bash
npm install @betterimage/og
```

## Use

```ts
import { parseApiKey, signedImageUrl } from "@betterimage/og";

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
import { metaTags, parseApiKey, signedImageUrl } from "@betterimage/og";

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
import { parseApiKey, signedImageUrl, metaTagsHtml } from "@betterimage/og";

const url = await signedImageUrl({
  ...parseApiKey(import.meta.env.BETTERIMAGE_API_KEY),
  template: "blog-card",
  fields: { title: frontmatter.title },
});
---
<Fragment set:html={metaTagsHtml(url)} />
```

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
| `signedImageUrl(options)` | The signed URL for one page. `{ keyId, secret, template, fields?, baseUrl? }` |
| `parseApiKey(apiKey)` | Splits `bi_<keyId>_<secret>` into `{ keyId, secret }` |
| `canonicalString(keyId, template, fields)` | The exact string that gets signed, for debugging a 403 |
| `sign(secret, canonical)` | Lowercase hex HMAC-SHA256 |
| `metaTags(url)` / `metaTagsHtml(url)` | The tags to put in `<head>` |

Field values that are `undefined`, `null` or `""` are dropped, numbers and booleans are stringified, and the order of keys in the object never changes the signature.

## How the signature works

The canonical string is `<keyId>/<template>?` followed by the fields, raw and sorted by name, joined with `&`. Its HMAC-SHA256, hex encoded, is the `s` parameter. The server rebuilds the same string from the request, so the fields in the URL are the fields you signed: a URL cannot be edited after the fact to render different text on your quota.

A 403 response echoes the canonical string the server derived, which is the fastest way to spot a mismatch. Full reference: [betterimage.io/api#signing](https://betterimage.io/api#signing).

## Quota and caching

Successful renders are cached at the edge for a day, and cached fetches do not count against your quota. A URL that exceeds the quota still answers with an image and a 200, so your link previews never break; it carries `x-bi-quota-exceeded: true` and is cached for a minute. Plans and limits: [betterimage.io/api](https://betterimage.io/api).

## Also

- [MCP server](https://betterimage.io/mcp): the same templates from Claude, Cursor or VS Code.
- [Link preview checker](https://betterimage.io/link-preview-checker): what X, Facebook, LinkedIn, Slack and Discord will show for a URL.

MIT
