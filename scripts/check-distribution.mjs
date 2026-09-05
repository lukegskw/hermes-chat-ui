import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const [packageMetadata, changelog] = await Promise.all([
  readFile(resolve(projectRoot, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(projectRoot, "CHANGELOG.md"), "utf8"),
]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(
  typeof packageMetadata.version === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      packageMetadata.version,
    ),
  "package.json must contain a semantic version",
);
check(
  packageMetadata.name === "@lukegskw/hermes-chat-ui",
  "Unexpected npm package name",
);
check(packageMetadata.private !== true, "npm package must not be private");
check(packageMetadata.license === "MIT", "npm package license must be MIT");
check(
  packageMetadata.repository?.url ===
    "https://github.com/lukegskw/hermes-chat-ui.git",
  "Unexpected repository URL",
);
check(
  packageMetadata.bin?.["hermes-chat-ui"] === "bin/hermes-chat-ui.js",
  "npm executable metadata is missing",
);
check(
  packageMetadata.publishConfig?.access === "public",
  "Scoped npm package must publish with public access",
);
check(
  changelog.includes(`## ${packageMetadata.version} -`),
  "CHANGELOG.md must contain the package version",
);
for (const requiredFile of [
  "bin",
  "dist",
  "dist-server",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
]) {
  check(
    packageMetadata.files?.includes(requiredFile),
    `npm package files must include ${requiredFile}`,
  );
}

process.stdout.write(
  `Distribution metadata is consistent at version ${packageMetadata.version}\n`,
);
