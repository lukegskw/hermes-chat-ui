# Release process

[Back to the README](../README.md)

Docker images and npm packages are published only by the release workflow. The
ordinary CI workflow tests pushes and pull requests and builds a container
without pushing it to a registry.

## Prepare a release

1. Choose a new semantic version and synchronize `package.json`:

   ```bash
   pnpm release:prepare X.Y.Z
   ```

2. Move the relevant entries in `CHANGELOG.md` under that version and date.
3. Validate the exact npm artifact and application:

   ```bash
   pnpm lint
   pnpm type-check
   pnpm test
   pnpm build
   pnpm test:distribution
   pnpm test:package
   ```

4. Commit the version and changelog together, then push the release commit to
   `main`.

The release workflow detects that `vX.Y.Z` does not exist, repeats all checks,
and creates the tag. It then publishes these artifacts:

- `ghcr.io/lukegskw/hermes-chat-ui:X.Y.Z`
- `ghcr.io/lukegskw/hermes-chat-ui:X.Y` and `latest` for stable versions
- `@lukegskw/hermes-chat-ui@X.Y.Z` on npm
- GitHub Release `vX.Y.Z`

Prereleases publish only the exact container tag. The workflow checks existing
Docker and npm artifacts before publishing, so a failed run can be retried. It
also pulls the container without saved registry credentials, starts it, checks
`/api/health`, and launches the published npm executable with `--version`.

The repository needs an `NPM_TOKEN` Actions secret authorized to publish the
scoped public package. The workflow uses npm provenance and GitHub's OIDC token.
