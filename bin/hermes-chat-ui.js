#!/usr/bin/env node

import { access, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageMetadata = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);

const usage = `Hermes Chat UI ${packageMetadata.version}

Usage:
  hermes-chat-ui [options]

Options:
  --hermes-url <url>   Hermes API URL (default: http://127.0.0.1:8642)
  --hermes-env <file>  Read API_SERVER_KEY from a Hermes .env file
  --host <host>        UI bind address (default: 127.0.0.1)
  --port <port>        UI port (default: 8643)
  --data-dir <path>    UI data directory (default: ~/.hermes-chat-ui)
  --help               Show this help
  --version            Print the installed version

The CLI reads API_SERVER_KEY or HERMES_API_KEY from the environment. If neither
is set, it tries ~/.hermes/.env and the native Windows Hermes data directory.
`;

let values;
try {
  ({ values } = parseArgs({
    allowPositionals: false,
    strict: true,
    options: {
      "data-dir": { type: "string" },
      help: { type: "boolean", short: "h" },
      host: { type: "string" },
      "hermes-env": { type: "string" },
      "hermes-url": { type: "string" },
      port: { type: "string" },
      version: { type: "boolean", short: "v" },
    },
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Run hermes-chat-ui --help for usage.");
  process.exit(1);
}

if (values.help) {
  process.stdout.write(usage);
  process.exit(0);
}
if (values.version) {
  process.stdout.write(`${packageMetadata.version}\n`);
  process.exit(0);
}

const port = Number(values.port ?? process.env.HERMES_PROXY_PORT ?? 8643);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error("--port must be an integer between 1 and 65535.");
  process.exit(1);
}

const host =
  values.host?.trim() || process.env.HERMES_PROXY_HOST || "127.0.0.1";
const hermesApiUrl =
  values["hermes-url"]?.trim() ||
  process.env.HERMES_API_URL?.trim() ||
  "http://127.0.0.1:8642";
try {
  const parsedUrl = new URL(hermesApiUrl);
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== ""
  ) {
    throw new Error();
  }
} catch {
  console.error(
    "--hermes-url must be an HTTP(S) URL without credentials, query, or fragment.",
  );
  process.exit(1);
}

const dataDir = path.resolve(
  values["data-dir"] ||
    process.env.HERMES_UI_DATA_DIR ||
    path.join(homedir(), ".hermes-chat-ui"),
);
const staticDir = path.join(packageRoot, "dist");
try {
  await access(path.join(staticDir, "index.html"));
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
} catch (error) {
  console.error(
    `Unable to initialize Hermes Chat UI: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const explicitHermesEnv = values["hermes-env"]
  ? path.resolve(values["hermes-env"])
  : undefined;
const defaultHermesEnvFiles = [
  path.join(homedir(), ".hermes", ".env"),
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "hermes", ".env")
    : undefined,
].filter((candidate) => candidate !== undefined);

let hermesApiKey =
  process.env.API_SERVER_KEY?.trim() ||
  process.env.HERMES_API_KEY?.trim() ||
  "";
let keySource = hermesApiKey === "" ? "" : "the process environment";
for (const envFile of explicitHermesEnv
  ? [explicitHermesEnv]
  : defaultHermesEnvFiles) {
  if (hermesApiKey !== "") break;
  try {
    const parsed = parseEnv(await readFile(envFile, "utf8"));
    hermesApiKey =
      parsed.API_SERVER_KEY?.trim() || parsed.HERMES_API_KEY?.trim() || "";
    if (hermesApiKey !== "") keySource = envFile;
  } catch (error) {
    if (explicitHermesEnv) {
      console.error(
        `Unable to read --hermes-env: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }
}

if (hermesApiKey.length < 8) {
  console.error(
    "Hermes API key not found. Set API_SERVER_KEY or pass --hermes-env <file>.",
  );
  process.exit(1);
}

process.env.API_SERVER_KEY = hermesApiKey;
process.env.HERMES_API_URL = hermesApiUrl.replace(/\/$/, "");
process.env.HERMES_PROXY_HOST = host;
process.env.HERMES_PROXY_PORT = String(port);
process.env.HERMES_STATIC_DIR = staticDir;
process.env.HERMES_UI_DATA_DIR = dataDir;

console.info(`Connecting to Hermes at ${process.env.HERMES_API_URL}`);
console.info(`Using Hermes API key from ${keySource}`);
console.info(`Storing UI data in ${dataDir}`);
if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
  console.warn(
    "The UI has no built-in login. Protect non-loopback access with a private network or authenticated proxy.",
  );
}

await import("../dist-server/index.js");
