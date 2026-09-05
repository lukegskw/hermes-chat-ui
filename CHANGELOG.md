# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-09-05

### Added

- Local Node.js installation through `npx @lukegskw/hermes-chat-ui`.
- Multi-platform Docker release images for Linux amd64 and arm64.
- Read-only Hermes compatibility diagnostic.
- Canonical Hermes session history, streamed agent activity, image attachments,
  and completion notifications in the installable PWA.

### Changed

- Docker images, npm packages, and GitHub Releases now share one semantic
  version and are published only by the release workflow.
- Installation examples use generic paths, private Docker networking, and the
  published GHCR image.
