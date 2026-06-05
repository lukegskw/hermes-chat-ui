import { AppConfig } from "../types";

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

// A ordem de precedência é: window.APP_CONFIG (produção) > import.meta.env (desenvolvimento)
export const envConfig: AppConfig = {
  HERMES_API_URL:
    window.APP_CONFIG?.HERMES_API_URL ||
    import.meta.env.VITE_HERMES_API_URL ||
    "",
  HERMES_API_KEY:
    window.APP_CONFIG?.HERMES_API_KEY ||
    import.meta.env.VITE_HERMES_API_KEY ||
    "",
  HERMES_PROXY_PORT:
    window.APP_CONFIG?.HERMES_PROXY_PORT ||
    import.meta.env.VITE_HERMES_PROXY_PORT ||
    "8643",
};

export const getApiUrl = () => {
  if (envConfig.HERMES_API_URL) {
    return envConfig.HERMES_API_URL.replace(/\/$/, "");
  }
  const urlObj = new URL(window.location.origin);
  urlObj.port = envConfig.HERMES_PROXY_PORT || "8643";
  return urlObj.toString().replace(/\/$/, "");
};
