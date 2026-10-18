# Publishing PuFF

The first public release is prepared as `@chartara/puff@0.1.0`. Publishing is a separate step.

## Owner decisions before the first release

1. MIT is selected: the terms are in `LICENSE`, and `package.json` declares `"license": "MIT"`. Include the existing license file when uploading the repository to GitHub.
2. Create or choose the public source repository. Set `repository` in `package.json` to its actual URL; add the real homepage, issues/support URL, and author metadata. Push this checkout so the checked-in workflow can run. The `examples/` gallery stays in the repository and is excluded from npm.
3. Confirm that your npm account can publish under `@chartara`. If not, select a scope you own and update package-name imports in the docs, tests, and helper before releasing. `publishConfig.access` is already public.
4. Confirm the version. Check `npm view @chartara/puff versions --json`; an E404 is expected if the package does not exist. If needed, run `npm version minor --no-git-tag-version` (or choose an explicit version) and update `CHANGELOG.md`. This preparation corrects types and now rejects changes to creation-only scene settings; document that API tightening.

`prepublishOnly` refuses publication until license terms and a repository URL are present, then runs the full verification command. `private` is false so it no longer blocks the intended public release. These checks do not log in, commit, tag, or publish by themselves.

## Local verification

Use Node.js 22 or 24 and npm:

```sh
npm ci
npx playwright install chromium firefox webkit
npm --offline --no-update-notifier run check
```

These setup commands download dependencies and browser engines; run them only when you intend to allow network access. On Linux, missing browser system libraries can be installed with `npx playwright install-deps chromium firefox webkit` (requires administrator access and may download OS packages). If host validation reports a missing library such as `libavif16`, install the required platform package before running that engine. The workflow uses `playwright install --with-deps` on Ubuntu so it installs the corresponding prerequisites there.

The shader tests need a C compiler and EGL/GLES development libraries. On Ubuntu, install `build-essential libegl1-mesa-dev libgles2-mesa-dev`. Use `PUFF_REQUIRE_GL=1 npm test` to make missing shader prerequisites fail. CI and the publish hook require this check.

For a headless machine without an accelerated GPU, run browser tests with `PUFF_SOFTWARE_GL=1`; the test fixture relaxes the performance-caveat context flag while still using real WebGL and compiling the shipped shaders. It separately verifies native fallback when WebGL is unavailable. This is a software rendering correctness check, not a GPU benchmark.

```sh
PUFF_SOFTWARE_GL=1 npm run test:browser
PUFF_SOFTWARE_GL=1 PUFF_HEADED=1 LIBGL_ALWAYS_SOFTWARE=1 PUFF_BROWSER=firefox xvfb-run --auto-servernum npm run test:browser
PUFF_SOFTWARE_GL=1 PUFF_HEADED=1 LIBGL_ALWAYS_SOFTWARE=1 PUFF_BROWSER=webkit xvfb-run --auto-servernum npm run test:browser
```

On Linux CI, Firefox needs a display to create its WebGL2 context. The browser jobs run under Xvfb with `PUFF_HEADED=1` and Mesa software rendering. This still exercises real WebGL2; unavailable contexts fail the test.

`PUFF_BROWSER_EXECUTABLE=/path/to/chrome` can select an existing Chromium executable. A mobile-sized viewport test is layout coverage; it is not an actual phone test.

Before claiming device support, manually check current desktop Chrome/Firefox/Safari and real iOS/Android devices: typography/wrapping, selection and links, touch scrolling and play mode, reduced motion, resize/visibility, CSP integration, teardown, sustained frame pacing, GPU time, and memory. Scene context loss currently requires host recreation after restoration; Shadow DOM text targets remain unsupported. Keep those limits documented rather than claiming broader coverage from fixture tests.

## Inspect and publish

Once the owner decisions and browser checks are complete:

```sh
npm pack --dry-run
npm pack
```

Packing runs the build automatically. Review the file list and install the resulting `.tgz` into an application if you need an integration trial. `npm run test:package` already exercises a fresh tarball installation, all public exports, TypeScript, and production bundle sizes.

Then authenticate as the scope owner, review the intended package/version, and publish from this source checkout:

For a first npm release, create your npm account and verify its email before logging in. The configured package is `@chartara/puff`; after login, check that your account owns the `@chartara` scope.

```sh
npm login
npm whoami
npm publish --access public
```

`npm publish` runs the metadata guard and full checks. Set `PUFF_SOFTWARE_GL=1` for a software-only release machine, and install its browser engines first. Do not pass `--ignore-scripts` when publishing: that bypasses the release checks. Publishing an already-created tarball does not run the source checkout's verification hook; publish from the verified source checkout as shown above.

After publication, confirm installation in a new app, record/tag the released source version, and publish the changelog. CI validates packages and browsers only; it does not publish automatically or require npm credentials.
