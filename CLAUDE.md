# n8n-nodes-edenai

n8n community node for Eden AI. Published to npm as `n8n-nodes-edenai`.

## Release flow (GitHub-automated)

Publishing is automated by [.github/workflows/publish.yml](.github/workflows/publish.yml).
The workflow triggers on **any pushed tag matching `v*`** and runs `npm ci`,
`npm run build`, `npm run lint`, then `npm publish --provenance --access public`
using the `NPM_TOKEN` secret.

**Do not run `npm publish` locally.** Release by pushing a tag.

### Steps to ship a new version

1. Bump `version` in [package.json](package.json) (e.g. `0.1.8` → `0.1.9`).
2. Sanity check locally: `npm run build && npm run lint`.
3. Commit: `git commit -am "vX.Y.Z"`.
4. Tag and push:
   ```
   git tag vX.Y.Z
   git push origin master --tags
   ```
5. Watch the `publish` workflow on GitHub Actions. When it goes green, the
   version is live on npm with provenance attestation.

The tag version **must match** the `version` field in package.json — npm will
reject the publish otherwise.

### Manual re-run

The workflow also accepts `workflow_dispatch` from the Actions tab if a tag
push needs to be retried without re-tagging.

## n8n community-node requirements

This package declares `@n8n/ai-node-sdk` as a peer dependency, so the `n8n`
section of package.json must include **both**:

- `n8nNodesApiVersion: 1`
- `aiNodeSdkVersion: 1`

Missing `aiNodeSdkVersion` will fail n8n's community-node verification review.

## Project layout

- [nodes/](nodes/) — node implementations (TypeScript source)
- [credentials/](credentials/) — credential definitions
- [dist/](dist/) — compiled output (published to npm via the `files` field)
- [scripts/post-build.js](scripts/post-build.js) — copies non-TS assets into `dist/`
