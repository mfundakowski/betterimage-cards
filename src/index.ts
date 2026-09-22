/**
 * Signed og:image URLs for betterimage.io.
 *
 * One saved template renders a card per page: you put a URL in the
 * og:image tag and the image is rendered when a crawler first fetches it,
 * then cached at the edge. Nothing runs on your side, and the API key's
 * secret never leaves your server.
 *
 * The signature is an HMAC-SHA256 over a canonical string the server
 * rebuilds from the request, so the fields in the URL are the fields you
 * signed. See https://betterimage.io/api#signing.
 */

const DEFAULT_BASE_URL = "https://betterimage.io";

/** Text drawn on the card. Which names a template accepts comes from the template itself. */
export type Fields = Record<string, string | number | boolean | null | undefined>;

export interface SignOptions {
  /** The key id: the middle part of `bi_<keyId>_<secret>`. */
  keyId: string;
  /** The key secret. Keep it on the server; it never appears in a URL. */
  secret: string;
  /** Slug of a saved template, as listed by GET /api/v1/templates. */
  template: string;
  /** Field values for this page. Empty and nullish values are dropped. */
  fields?: Fields;
  /** Override for self-hosted or staging deployments. */
  baseUrl?: string;
}

export interface ApiKeyParts {
  keyId: string;
  secret: string;
}

/**
 * Split a `bi_<keyId>_<secret>` API key.
 *
 * @throws TypeError when the key is not in that shape.
 */
export function parseApiKey(apiKey: string): ApiKeyParts {
  const parts = apiKey.split("_");

  if (parts.length !== 3 || parts[0] !== "bi" || !parts[1] || !parts[2]) {
    throw new TypeError(
      "Not a betterimage.io API key: expected bi_<keyId>_<secret>. Create one at https://betterimage.io/users/settings/api",
    );
  }

  return { keyId: parts[1], secret: parts[2] };
}

/**
 * The exact string the server signs: `<keyId>/<template>?` followed by the
 * fields, raw (not URL encoded), sorted by name, joined with `&`.
 *
 * Exported because a 403 from the image endpoint echoes the canonical
 * string it derived, which makes a mismatch quick to spot.
 */
export function canonicalString(
  keyId: string,
  template: string,
  fields: Fields = {},
): string {
  const query = normalizeFields(fields)
    .map(([name, value]) => `${name}=${value}`)
    .join("&");

  return `${keyId}/${template}?${query}`;
}

/** Lowercase hex HMAC-SHA256, the format the `s` parameter takes. */
export async function sign(secret: string, canonical: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The full image URL, ready for an og:image tag.
 *
 * ```ts
 * const url = await signedImageUrl({
 *   ...parseApiKey(process.env.BETTERIMAGE_API_KEY!),
 *   template: "blog-card",
 *   fields: { title: post.title, description: post.excerpt },
 * });
 * ```
 */
export async function signedImageUrl(options: SignOptions): Promise<string> {
  const { keyId, secret, template, fields = {}, baseUrl = DEFAULT_BASE_URL } = options;

  if (!keyId || !secret) {
    throw new TypeError("signedImageUrl needs both keyId and secret (see parseApiKey).");
  }

  if (!template) {
    throw new TypeError("signedImageUrl needs a template slug (GET /api/v1/templates lists them).");
  }

  const pairs = normalizeFields(fields);
  const signature = await sign(secret, canonicalString(keyId, template, fields));

  // URLSearchParams uses the same form encoding the server decodes with, so
  // a literal plus in the text survives as %2B rather than becoming a space.
  const query = new URLSearchParams(pairs);
  query.set("s", signature);

  return `${trimSlash(baseUrl)}/api/v1/i/${encodeURIComponent(keyId)}/${encodeURIComponent(template)}.png?${query}`;
}

export interface MetaTag {
  property?: string;
  name?: string;
  content: string;
}

/**
 * The tags that make the image render as a full-width card everywhere:
 * og:image with its declared size, and the Twitter pair X needs to show a
 * card at all. Width and height are the size this endpoint renders.
 */
export function metaTags(url: string): MetaTag[] {
  return [
    { property: "og:image", content: url },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: url },
  ];
}

/** The same tags as HTML, for templates that take a string. */
export function metaTagsHtml(url: string): string {
  return metaTags(url)
    .map((tag) => {
      const attribute = tag.property ? `property="${tag.property}"` : `name="${tag.name}"`;
      return `<meta ${attribute} content="${escapeAttribute(tag.content)}" />`;
    })
    .join("\n");
}

// Drop what the server would not see, stringify the rest, and sort by name
// the way the server does: by UTF-8 bytes, not by locale.
function normalizeFields(fields: Fields): [string, string][] {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => [name, String(value)] as [string, string])
    .sort(([a], [b]) => compareBytes(a, b));
}

function compareBytes(a: string, b: string): number {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i]! - right[i]!;
    if (difference !== 0) return difference;
  }

  return left.length - right.length;
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
