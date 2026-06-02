import { z } from "zod";
import { AppConfig } from "../types";
import { logger } from "../utils";

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

const envSchema = z.object({
  HERMES_API_URL: z.string().optional().default(""),
  HERMES_API_KEY: z.string().optional().default(""),
  HERMES_PROXY_PORT: z.string().default("8643"),
});

// A ordem de precedência é: /api/config (unified) > window.APP_CONFIG (produção) > import.meta.env (desenvolvimento)
export let envConfig: AppConfig = {
  HERMES_API_URL: "",
  HERMES_API_KEY: "",
  HERMES_PROXY_PORT: "8643",
};

export const initConfig = async () => {
  let rawConfig: Record<string, string | undefined> = {
    HERMES_API_URL:
      window.APP_CONFIG?.HERMES_API_URL || import.meta.env.VITE_HERMES_API_URL,
    HERMES_API_KEY:
      window.APP_CONFIG?.HERMES_API_KEY || import.meta.env.VITE_HERMES_API_KEY,
    HERMES_PROXY_PORT:
      window.APP_CONFIG?.HERMES_PROXY_PORT ||
      import.meta.env.VITE_HERMES_PROXY_PORT,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const res = await fetch("/api/config", { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const serverConfig = await res.json();
      rawConfig = { ...rawConfig, ...serverConfig };
    }
  } catch (e) {
    // Ignore fetch errors or timeouts, fallback to env/window
    logger.warn(
      { error: e },
      "Failed to fetch /api/config, falling back to local env variables.",
    );
  }

  const parsed = envSchema.safeParse(rawConfig);

  if (!parsed.success) {
    logger.error(
      { error: parsed.error.format() },
      "Erro de Configuração de Ambiente",
    );
    throw new Error(
      "Variáveis de ambiente ausentes ou inválidas. O aplicativo não pode iniciar.",
    );
  }

  envConfig = parsed.data;
};

export const getApiUrl = () => {
  const urlObj = new URL(envConfig.HERMES_API_URL || window.location.origin);
  urlObj.port = envConfig.HERMES_PROXY_PORT || "8643";
  return urlObj.toString().replace(/\/$/, "");
};
