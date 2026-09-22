/**
 * Signed betterimage.io card URLs.
 *
 * One saved template renders a card per page, at any of the six platform
 * sizes: a 1200x630 link preview for og:image, a YouTube thumbnail, an
 * Instagram square or portrait, a story, or a Pinterest pin. The image is
 * rendered the first time it is fetched and then cached at the edge, so
 * nothing runs on your side and the API key's secret never leaves your
 * server.
 *
 * The signature is an HMAC-SHA256 over a canonical string the server
 * rebuilds from the request, so the fields in the URL are the fields you
 * signed. See https://betterimage.io/api#signing.
 */

const DEFAULT_BASE_URL = "https://betterimage.io";

/** The sizes a template renders at, with the pixels each one produces at scale 1. */
export const SIZES = {
  og: { width: 1200, height: 630, label: "Open Graph" },
  youtube: { width: 1280, height: 720, label: "YouTube thumbnail" },
  square: { width: 1080, height: 1080, label: "Square post" },
  portrait: { width: 1080, height: 1350, label: "Portrait post" },
  story: { width: 1080, height: 1920, label: "Story" },
  pinterest: { width: 1000, height: 1500, label: "Pinterest pin" },
} as const satisfies Record<string, { width: number; height: number; label: string }>;

export type CardSize = keyof typeof SIZES;

/** 2 renders at twice the pixel size for high-DPI screens. */
export type Scale = 1 | 2;

export interface Dimensions {
  width: number;
  height: number;
}

/** The pixels a size renders at, doubled when scale is 2. */
export function dimensions(size: CardSize = "og", scale: Scale = 1): Dimensions {
  const base = SIZES[size];
  return { width: base.width * scale, height: base.height * scale };
}

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
  /** Which platform size to render. Defaults to `og` (1200x630). */
  size?: CardSize;
  /** 2 for a high-DPI render at twice the pixels. Defaults to 1. */
  scale?: Scale;
  /** Override for self-hosted or staging deployments. */
  baseUrl?: string;
}

export interface SignedImage extends Dimensions {
  /** The URL to put in the tag. */
  url: string;
  size: CardSize;
  scale: Scale;
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
  return (await signedImage(options)).url;
}

/**
 * The same URL plus the pixels it renders at, which is what the
 * og:image:width and og:image:height tags need.
 */
export async function signedImage(options: SignOptions): Promise<SignedImage> {
  const { keyId, secret, template, fields = {}, baseUrl = DEFAULT_BASE_URL } = options;
  const size = options.size ?? "og";
  const scale = options.scale ?? 1;

  if (!keyId || !secret) {
    throw new TypeError("signedImageUrl needs both keyId and secret (see parseApiKey).");
  }

  if (!template) {
    throw new TypeError("signedImageUrl needs a template slug (GET /api/v1/templates lists them).");
  }

  if (!(size in SIZES)) {
    throw new TypeError(`Unknown size "${size}". Valid sizes: ${Object.keys(SIZES).join(", ")}.`);
  }

  if (scale !== 1 && scale !== 2) {
    throw new TypeError("scale must be 1 or 2.");
  }

  // size and scale travel as ordinary signed fields, so a URL cannot be
  // edited afterwards to render a different canvas on your quota.
  const signedFields: Fields = { ...fields };
  if (options.size) signedFields["size"] = size;
  if (options.scale) signedFields["scale"] = scale;

  const signature = await sign(secret, canonicalString(keyId, template, signedFields));

  // URLSearchParams uses the same form encoding the server decodes with, so
  // a literal plus in the text survives as %2B rather than becoming a space.
  const query = new URLSearchParams(normalizeFields(signedFields));
  query.set("s", signature);

  const url = `${trimSlash(baseUrl)}/api/v1/i/${encodeURIComponent(keyId)}/${encodeURIComponent(template)}.png?${query}`;

  return { url, size, scale, ...dimensions(size, scale) };
}

export interface MetaTag {
  property?: string;
  name?: string;
  content: string;
}

/**
 * The tags that make the image render as a full-width card everywhere:
 * og:image with its declared pixels, and the Twitter pair X needs to show
 * a card at all.
 *
 * Pass the result of `signedImage` to get the right width and height for
 * a non-default size; a bare URL is assumed to be a 1200x630 link preview,
 * which is the only size link previews use.
 */
export function metaTags(image: string | SignedImage): MetaTag[] {
  const url = typeof image === "string" ? image : image.url;
  const { width, height } = typeof image === "string" ? dimensions("og") : image;

  return [
    { property: "og:image", content: url },
    { property: "og:image:width", content: String(width) },
    { property: "og:image:height", content: String(height) },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: url },
  ];
}

/** The same tags as HTML, for templates that take a string. */
export function metaTagsHtml(image: string | SignedImage): string {
  return metaTags(image)
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
