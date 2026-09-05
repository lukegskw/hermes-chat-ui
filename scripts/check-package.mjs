import { spawn, execFileSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const packageMetadata = JSON.parse(
  await readFile(join(projectRoot, "package.json"), "utf8"),
);
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "hermes-chat-ui-package-"),
);
const npmEnvironment = { ...process.env };
for (const name of [
  "npm_config_manage_package_manager_versions",
  "npm_config_npm_globalconfig",
  "npm_config_verify_deps_before_run",
  "npm_config__jsr_registry",
]) {
  delete npmEnvironment[name];
}

async function availablePort() {
  const listener = createServer();
  await new Promise((resolveListen, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolveListen);
  });
  const address = listener.address();
  if (address === null || typeof address === "string") {
    listener.close();
    throw new Error("Unable to reserve a local test port");
  }
  await new Promise((resolveClose, reject) =>
    listener.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function waitForHealth(url, child, logs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged CLI exited early.\n${logs()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The packaged server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for packaged CLI.\n${logs()}`);
}

let child;
try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryDirectory],
    { cwd: projectRoot, encoding: "utf8", env: npmEnvironment },
  );
  const packed = JSON.parse(packOutput);
  const filename = packed[0]?.filename;
  if (typeof filename !== "string") {
    throw new Error("npm pack did not return a tarball filename");
  }
  const tarballPath = join(temporaryDirectory, filename);
  const npmExecVersion = execFileSync(
    "npm",
    [
      "exec",
      "--yes",
      `--package=${tarballPath}`,
      "--",
      "hermes-chat-ui",
      "--version",
    ],
    { cwd: temporaryDirectory, encoding: "utf8", env: npmEnvironment },
  ).trim();
  if (npmExecVersion !== packageMetadata.version) {
    throw new Error(
      `npm exec reported ${npmExecVersion}, expected ${packageMetadata.version}`,
    );
  }

  const installDirectory = join(temporaryDirectory, "install");
  await mkdir(installDirectory);
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      installDirectory,
      tarballPath,
    ],
    { cwd: projectRoot, stdio: "pipe", env: npmEnvironment },
  );

  const executable = join(
    installDirectory,
    "node_modules",
    ".bin",
    "hermes-chat-ui",
  );
  await access(executable, constants.X_OK);
  const reportedVersion = execFileSync(executable, ["--version"], {
    encoding: "utf8",
    env: npmEnvironment,
  }).trim();
  if (reportedVersion !== packageMetadata.version) {
    throw new Error(
      `Packaged CLI reported ${reportedVersion}, expected ${packageMetadata.version}`,
    );
  }

  const port = await availablePort();
  const dataDirectory = join(temporaryDirectory, "data");
  const homeDirectory = join(temporaryDirectory, "home");
  const hermesDirectory = join(homeDirectory, ".hermes");
  await mkdir(hermesDirectory, { recursive: true });
  await writeFile(
    join(hermesDirectory, ".env"),
    "API_SERVER_KEY=package-smoke-key\n",
    { mode: 0o600 },
  );
  let stdout = "";
  let stderr = "";
  child = spawn(
    executable,
    ["--port", String(port), "--data-dir", dataDirectory],
    {
      env: {
        ...npmEnvironment,
        API_SERVER_KEY: "",
        HERMES_API_URL: "http://127.0.0.1:1",
        HERMES_API_KEY: "",
        HERMES_PROXY_HOST: "127.0.0.1",
        HOME: homeDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const response = await waitForHealth(
    `http://127.0.0.1:${port}/api/health`,
    child,
    () => `${stdout}${stderr}`,
  );
  const health = await response.json();
  if (health.status !== "ok" || health.service !== "hermes-chat-ui") {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }
  const page = await fetch(`http://127.0.0.1:${port}/`);
  if (!page.ok || !(await page.text()).includes("Hermes Chat")) {
    throw new Error("Packaged CLI did not serve the built web application");
  }

  process.stdout.write(
    `Package smoke test passed for ${packageMetadata.name}@${packageMetadata.version}\n`,
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      child.once("exit", resolveExit);
      setTimeout(resolveExit, 5_000).unref();
    });
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
