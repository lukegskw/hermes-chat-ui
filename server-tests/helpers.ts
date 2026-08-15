import { loadServerConfig, type ServerConfig } from "../server/config.js";

export const testConfig = (
  overrides: Partial<ServerConfig> = {},
): ServerConfig => ({
  ...loadServerConfig({}),
  staticDir: "/missing-static",
  ...overrides,
});
