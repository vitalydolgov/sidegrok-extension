---
name: publish-amo
description: >
  Package this Firefox extension and submit that version to the listed
  SideGrok add-on on addons.mozilla.org. Use when the user asks to package,
  upload, publish, or submit the extension, or runs /publish-amo.
---

# Publish to AMO

Package this extension and submit that version to the existing listed add-on.

Do not bump `manifest.json`, edit `CHANGELOG.md`, commit, or push.

## Login

There is no password and no browser session in the upload. The developer creates one API credential at https://addons.mozilla.org/developers/addon/api/key/ while signed into the Firefox account that owns the add-on. Mozilla shows a JWT issuer (`user:12345678:987`) and a JWT secret once. A new credential revokes the old secret.

Keep both values in the environment, not in the repo:

- `WEB_EXT_API_KEY` is the issuer.
- `WEB_EXT_API_SECRET` is the secret.

`web-ext sign` builds a short-lived JWT for each request to `https://addons.mozilla.org/api/v5/`. Do not build the JWT, put either value on the command line, print the secret, or ask for it in chat. If either variable is unset, stop and name the credentials page. The credential must be allowed to submit this add-on. A wrong secret fails the request. It does not use a logged-in Firefox profile.

## Steps

1. Read `version` and `browser_specific_settings.gecko.id` from `manifest.json`. Channel is `listed` unless the user asks for a self-distributed signed build (`unlisted`).
2. Read the `CHANGELOG.md` section for that version. Its body is the `en-US` release note. If the section is missing, stop. Do not invent notes.
3. Check the two environment variables from Login. Stop if either is unset.
4. Use `web-ext` on `PATH`. If it is missing, use `~/.npm/_npx/43d181ce0e38748d/node_modules/.bin/web-ext`. Use `npx --yes web-ext` only if both are missing. web-ext 10 needs Node 22 or newer.
5. Lint from the repo and stop on errors:

```bash
web-ext lint --source-dir <repo> --no-input
```

6. Build:

```bash
web-ext build --source-dir <repo> --artifacts-dir <repo>/web-ext-artifacts --overwrite-dest --no-input
```

Confirm `web-ext-artifacts/<name>-<version>.zip` and that the zip’s manifest version matches. Dotfiles are left out. `web-ext-artifacts/` is gitignored.

7. Show the version, channel, zip path, and release-note text. Wait for an explicit yes. Submitting creates a public version.
8. Write this metadata under `/tmp`, not in the repo. Use the changelog section body only:

```json
{ "version": { "release_notes": { "en-US": "<changelog body>" } } }
```

An update does not need summary, categories, or license.

9. Submit immediately, before any further edits. `sign` packages from the source tree:

```bash
web-ext sign --channel listed --source-dir <repo> --artifacts-dir <repo>/web-ext-artifacts --amo-metadata <tmp file> --approval-timeout 0 --no-input
```

`--approval-timeout 0` returns after the upload is accepted. Say that Mozilla review can still be pending.

10. Report success, validation errors, or that this version is already on AMO. Do not bump the version and retry.

Do not pass `--upload-source-code`. The package is the readable source. If AMO asks for a separate source archive, stop and say so.

For an explicit unlisted request, skip the release notes, use `--channel unlisted`, and report the path of the downloaded signed `.xpi`.
