# Changelog

## 1.0.1

Documentation only; no code change and no change to the signature.

- `fields` now documents what it accepts, which it never did: the text a
  card draws, and the card's pictures by URL (`image_url`, `image2_url`,
  `logo_url`, `background_url`). The picture fields shipped on the API
  while this README still implied `fields` was text.
- A worked example of the case they exist for: one saved design and a
  different photo per product, signed locally, so a catalogue of any size
  costs no API calls until something fetches an image.

## 1.0.0

First release.

- `signedImageUrl` and `signedImage`: signed card URLs from a saved
  template, with the pixels the image renders at.
- Every platform size (`og`, `youtube`, `square`, `portrait`, `story`,
  `pinterest`) and `scale` 1 or 2, both part of the signature.
- `metaTags` and `metaTagsHtml` for the head block.
- `parseApiKey`, `canonicalString` and `sign` for wiring and debugging.
- Zero runtime dependencies; Web Crypto, so Node 20+, Bun, Deno and edge
  runtimes all work. Node 18 is out of support and its test runner does not
  expose the Web Crypto global, so the floor is 20.
