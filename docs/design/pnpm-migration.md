# pnpm migration

Date: 2026-08-16

Status: implemented

## Understanding

- Replace npm with pnpm across local development, dependency locking, documentation, and Docker builds.
- Keep Node.js 24 and the current single-package repository structure.
- Preserve application behavior, dependency declarations, security boundaries, and the separate official Hermes Agent container.
- Produce a reproducible production image containing only production dependencies and compiled artifacts.
- Review the operator's two Compose definitions after the migration and identify obsolete, redundant, and optional entries.
- Do not deploy to the NAS or modify running containers.

## Assumptions

- The repository will remain a single package; no pnpm workspace is needed.
- pnpm changes dependency installation and build tooling only, not runtime behavior.
- Existing dependency ranges will not be intentionally upgraded during lockfile conversion.
- The GitHub workflow needs no pnpm setup because it delegates installation and compilation to Docker BuildKit.
- One trusted user continues to operate both services on a private Docker network.

## Final design

Pin pnpm 11.22.0 through the `packageManager` field. Replace the npm lockfile with `pnpm-lock.yaml`, use pnpm for nested package scripts and contributor commands, and activate the pinned package manager through Corepack in the Node.js 24 Docker build.

The Dockerfile uses frozen installs for both the full build dependency set and a separate production-only dependency set. Installation scripts remain disabled. The final stage copies production `node_modules`, compiled server JavaScript, and SPA assets, then starts the BFF directly with Node.js; pnpm is not part of the running process.

Validation includes a clean frozen install, lint, type-check, tests, production build, production dependency audit, both Compose configurations, an amd64 Docker build, runtime health, and confirmation that development dependencies are absent from the final image.

## Decision log

1. **Use Corepack with pnpm 11.22.0.** This keeps the existing Node image and makes the selected package-manager version reproducible.
2. **Do not use the pnpm container image.** A second image lineage and pnpm-managed Node runtime add unnecessary maintenance for a single package.
3. **Do not bootstrap pnpm globally through npm.** Corepack honors the project pin without an independent global-version convention.
4. **Do not add a workspace.** There is only one package, so workspace metadata would provide no benefit.
5. **Keep pnpm out of the runtime process.** The compiled BFF starts with Node.js and needs only production dependencies.
6. **Keep the CI workflow Docker-centric.** Package installation remains encapsulated by the Dockerfile and its lockfile contract.
