import { z } from 'zod';

export interface AppConfig {
  HERMES_API_URL?: string;
  HERMES_API_KEY?: string;
  HERMES_PROXY_PORT?: string;
}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

const envSchema = z.object({
  HERMES_API_URL: z.string().url("A variável HERMES_API_URL deve ser uma URL válida"),
  HERMES_API_KEY: z.string().optional().default(""),
  HERMES_PROXY_PORT: z.string().default("8643"),
});

// A ordem de precedência é: window.APP_CONFIG (produção) > import.meta.env (desenvolvimento)
const rawConfig = {
  HERMES_API_URL: window.APP_CONFIG?.HERMES_API_URL || import.meta.env.VITE_HERMES_API_URL,
  HERMES_API_KEY: window.APP_CONFIG?.HERMES_API_KEY || import.meta.env.VITE_HERMES_API_KEY,
  HERMES_PROXY_PORT: window.APP_CONFIG?.HERMES_PROXY_PORT || import.meta.env.VITE_HERMES_PROXY_PORT,
};

const parsed = envSchema.safeParse(rawConfig);

if (!parsed.success) {
  console.error("❌ Erro de Configuração de Ambiente:");
  console.error(parsed.error.format());
  throw new Error("Variáveis de ambiente ausentes ou inválidas. O aplicativo não pode iniciar.");
}

export const envConfig = parsed.data;

export const getApiUrl = () => {
  const urlObj = new URL(envConfig.HERMES_API_URL);
  urlObj.port = envConfig.HERMES_PROXY_PORT;
  return urlObj.toString().replace(/\/$/, "");
};
