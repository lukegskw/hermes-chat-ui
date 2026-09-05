import path from "node:path";

export type ServerConfig = {
  host: string;
  port: number;
  staticDir: string;
  dataDir: string;
  hermesApiUrl: string;
  hermesApiKey: string;
  hermesConfigPath: string;
  subscriptionsFile: string;
  vapidKeysFile: string;
  vapidSubject: string;
  pushApiKey: string;
  proactiveRequestsFile: string;
  dashboardUrl: string;
  dashboardAuthProvider: string;
  dashboardUsername: string;
  dashboardPassword: string;
  attachmentsDir: string;
  attachmentsIndexFile: string;
};

const value = (environment: NodeJS.ProcessEnv, name: string): string =>
  environment[name]?.trim() ?? "";

export const loadServerConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig => {
  const dataDir = value(environment, "HERMES_UI_DATA_DIR") || "/app/data";
  const configuredPort = Number(
    value(environment, "HERMES_PROXY_PORT") ||
      value(environment, "PORT") ||
      8643,
  );
  return {
    host: value(environment, "HERMES_PROXY_HOST") || "0.0.0.0",
    port: Number.isInteger(configuredPort) ? configuredPort : 8643,
    staticDir: value(environment, "HERMES_STATIC_DIR") || "/app/static",
    dataDir,
    hermesApiUrl: (
      value(environment, "HERMES_API_URL") || "http://127.0.0.1:8642"
    ).replace(/\/$/, ""),
    hermesApiKey:
      value(environment, "API_SERVER_KEY") ||
      value(environment, "HERMES_API_KEY"),
    hermesConfigPath:
      value(environment, "HERMES_UI_HERMES_CONFIG") ||
      "/hermes-config/config.yaml",
    subscriptionsFile:
      value(environment, "SUBSCRIPTIONS_FILE") ||
      path.join(dataDir, "push_subscriptions.json"),
    vapidKeysFile:
      value(environment, "VAPID_KEYS_FILE") ||
      path.join(dataDir, "vapid_keys.json"),
    vapidSubject:
      value(environment, "VAPID_SUBJECT") || "mailto:push@example.com",
    pushApiKey: value(environment, "HERMES_PUSH_API_KEY"),
    proactiveRequestsFile:
      value(environment, "PROACTIVE_REQUESTS_FILE") ||
      path.join(dataDir, "proactive_requests.json"),
    dashboardUrl: value(environment, "HERMES_DASHBOARD_URL").replace(/\/$/, ""),
    dashboardAuthProvider:
      value(environment, "HERMES_DASHBOARD_AUTH_PROVIDER") || "basic",
    dashboardUsername: value(
      environment,
      "HERMES_DASHBOARD_BASIC_AUTH_USERNAME",
    ),
    dashboardPassword: value(
      environment,
      "HERMES_DASHBOARD_BASIC_AUTH_PASSWORD",
    ),
    attachmentsDir:
      value(environment, "ATTACHMENTS_DIR") ||
      path.join(dataDir, "attachments", "blobs"),
    attachmentsIndexFile:
      value(environment, "ATTACHMENTS_INDEX_FILE") ||
      path.join(dataDir, "attachments", "index.json"),
  };
};
