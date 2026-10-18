# Changelog

## Unreleased

- Brand the library as PuFF: `@yashsuthar/puff`, the `PuFF` browser global, `dist/puff.js`, and `PUFF_*` test settings.
- Update reduced-motion state from media-query change events instead of reading it during each draw.
- Run nested verification commands offline with npm update notifications disabled, and build directly in the packing hook.
- License PuFF under MIT and include the license in npm packages.
- Prepare public scoped npm packaging with explicit classic-script and stylesheet exports.
- Enable removal of unused ESM renderers while retaining classic-script and CSS side effects.
- Make readonly lighting palettes usable across the public TypeScript API and correct creation-only option types.
- Reject changes to creation-only scene settings instead of silently ignoring them.
- Add external CloudText styles for hosts with a strict Content Security Policy.
- Rebuild before packing; verify installed consumers, type composition, bundle sizes, and browser behavior.
- Document npm integration, lifecycle cleanup, browser requirements, and publication steps.

Before publishing, move these entries under the selected version and date. Use a new version for any already-published package; npm versions cannot be overwritten. For this pre-1.0 API, use a minor version for incompatible public API changes and a patch version for compatible fixes. Describe API changes and migrations in each release.
