# Changelog

## 1.0.0

First release.

- `signedImageUrl` and `signedImage`: signed card URLs from a saved
  template, with the pixels the image renders at.
- Every platform size (`og`, `youtube`, `square`, `portrait`, `story`,
  `pinterest`) and `scale` 1 or 2, both part of the signature.
- `metaTags` and `metaTagsHtml` for the head block.
- `parseApiKey`, `canonicalString` and `sign` for wiring and debugging.
- Zero runtime dependencies; Web Crypto, so Node 18+, Bun, Deno and edge
  runtimes all work.
