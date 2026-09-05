import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format } from "prettier";

const version = process.argv[2];
if (
  version === undefined ||
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
    version,
  )
) {
  throw new Error("Usage: pnpm release:prepare <semantic-version>");
}

const packagePath = resolve(import.meta.dirname, "..", "package.json");
const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
packageMetadata.version = version;
const json = `${JSON.stringify(packageMetadata, null, 2)}\n`;
await writeFile(packagePath, await format(json, { filepath: packagePath }));

process.stdout.write(`Prepared release metadata for ${version}\n`);
