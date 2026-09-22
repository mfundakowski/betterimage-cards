# Security

## Reporting

Mail hello@betterimage.io. Please include what you found and how to
reproduce it; you will get a reply within a few days.

## What this package does with your key

The API key secret is used in one place: the HMAC that signs a URL. It is
never placed in a URL, never logged, never sent anywhere. The package makes
no network requests at all; it only builds a string.

Keep the secret on the server. In frameworks that split code between server
and client, that means reading it where the server runs: `generateMetadata`
or a route handler in Next.js, the frontmatter of an Astro page, a loader in
Remix or SvelteKit. A secret that reaches the browser is a secret anyone can
use against your quota, and the fix is to revoke the key at
https://betterimage.io/users/settings/api and issue a new one.

## Why the signature exists

The fields are part of the signed string, so a published URL cannot be
edited to render different text or a different canvas on your quota. If you
need different text, sign a different URL.

## Supply chain

The package has no runtime dependencies. Releases are published from GitHub
Actions with npm provenance, so the tarball on npm carries an attestation
tying it to this repository and the commit it was built from.
