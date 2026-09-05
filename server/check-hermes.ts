import { loadServerConfig } from "./config.js";
import { checkHermes } from "./diagnostics.js";

const results = await checkHermes(loadServerConfig());
for (const result of results) {
  console.log(
    `${result.ok ? "PASS" : "FAIL"} ${result.check}: ${result.message}`,
  );
}
if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
} else {
  console.log(
    "Read-only checks passed. Send a message in the UI to verify your model and streaming.",
  );
}
