import { AppConfig } from "../types";

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

// A ordem de precedência é: window.APP_CONFIG (produção) > import.meta.env (desenvolvimento)
const rawConfig: AppConfig = {
  ...(window.APP_CONFIG || {}),
};

export const envConfig: AppConfig = {
  HERMES_API_URL:
    rawConfig.HERMES_API_URL || import.meta.env.VITE_HERMES_API_URL || "",
  HERMES_API_KEY:
    rawConfig.HERMES_API_KEY || import.meta.env.VITE_HERMES_API_KEY || "",
  HERMES_PROXY_PORT:
    rawConfig.HERMES_PROXY_PORT ||
    import.meta.env.VITE_HERMES_PROXY_PORT ||
    "8643",
  // Spread all other config keys so the full APP_CONFIG is accessible
  ...rawConfig,
};

// Export the raw config for consumers that need any env var
export const getEnvVar = (name: string): string | undefined => {
  return rawConfig[name];
};

export const getApiUrl = () => {
  if (envConfig.HERMES_API_URL) {
    return envConfig.HERMES_API_URL.replace(/\/$/, "");
  }
  const urlObj = new URL(window.location.origin);
  urlObj.port = envConfig.HERMES_PROXY_PORT || "8643";
  return urlObj.toString().replace(/\/$/, "");
};
