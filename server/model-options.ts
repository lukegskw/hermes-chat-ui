import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { ServerConfig } from "./config.js";
import { proxyHermes } from "./hermes-client.js";

export const KNOWN_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

const UNCONFIRMED_SESSION_REASONING_EFFORTS = new Set(["max", "ultra"]);
const PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "xai",
  "cohere",
  "perplexity",
  "together",
  "fireworks",
  "deepseek",
];
const AGGREGATORS = ["openrouter", "opencode", "fireworks", "groq", "together"];

type JsonObject = Record<string, unknown>;
type ReasoningConfig = { enabled: boolean; effort?: string };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseReasoningEffort = (
  value: unknown,
): ReasoningConfig | undefined => {
  if (value === false) return { enabled: false };
  if (value === null || value === undefined || value === true) return undefined;
  const effort = String(value).trim().toLowerCase();
  if (!effort) return undefined;
  if (["none", "false", "disabled"].includes(effort)) {
    return { enabled: false };
  }
  if ((KNOWN_REASONING_EFFORTS as readonly string[]).includes(effort)) {
    return { enabled: true, effort };
  }
  return undefined;
};

export const canonicalModelVariants = (model: string): string[] => {
  const variants: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      variants.push(candidate);
    }
  };
  const addDerivatives = (value: string) => {
    const dashed = value.replaceAll(".", "-");
    const dotted = value.replaceAll("-", ".");
    [
      value,
      dashed,
      dotted,
      value.replace(/(\d)-(\d)/g, "$1.$2"),
      value.replace(/(\d)\.(\d)/g, "$1-$2"),
      dashed.replace(/(\d)-(\d)/g, "$1.$2"),
      dotted.replace(/(\d)\.(\d)/g, "$1-$2"),
    ].forEach(add);
  };

  addDerivatives(model);
  const parts = model.split("/");
  if (parts.length >= 2) addDerivatives(parts.at(-1) ?? "");
  if (parts.length >= 3) addDerivatives(parts.slice(1).join("/"));
  for (const variant of [...variants].filter((item) => !item.includes("/"))) {
    for (const provider of PROVIDERS) add(`${provider}/${variant}`);
  }
  for (const variant of [...variants].filter(
    (item) => item.split("/").length === 2,
  )) {
    for (const aggregator of AGGREGATORS) add(`${aggregator}/${variant}`);
  }
  return variants;
};

const resolveReasoningConfig = (
  config: JsonObject,
  model: string,
): ReasoningConfig | undefined => {
  const agent = isObject(config.agent) ? config.agent : {};
  const overrides = isObject(agent.reasoning_overrides)
    ? agent.reasoning_overrides
    : undefined;
  if (overrides) {
    for (const variant of canonicalModelVariants(model)) {
      if (variant in overrides) {
        const parsed = parseReasoningEffort(overrides[variant]);
        if (parsed) return parsed;
      }
    }
  }
  return parseReasoningEffort(agent.reasoning_effort);
};

export const effectiveReasoningDefault = (
  config: JsonObject,
  model: string,
): string => {
  const reasoning = resolveReasoningConfig(config, model);
  if (!reasoning) return "provider";
  if (!reasoning.enabled) return "none";
  return reasoning.effort?.trim() || "provider";
};

const loadHermesConfig = async (config: ServerConfig): Promise<JsonObject> => {
  try {
    const payload: unknown = parseYaml(
      await readFile(config.hermesConfigPath, "utf8"),
    );
    return isObject(payload) ? payload : {};
  } catch {
    return {};
  }
};

export const catalogReasoningDefaults = async (
  serverConfig: ServerConfig,
  payload: JsonObject,
): Promise<Record<string, Record<string, string>>> => {
  const hermesConfig = await loadHermesConfig(serverConfig);
  if (!Array.isArray(payload.providers)) return {};
  const defaults: Record<string, Record<string, string>> = {};
  for (const item of payload.providers) {
    if (
      !isObject(item) ||
      typeof item.slug !== "string" ||
      !Array.isArray(item.models)
    ) {
      continue;
    }
    defaults[item.slug] = {};
    for (const model of item.models) {
      if (typeof model === "string") {
        defaults[item.slug][model] = effectiveReasoningDefault(
          hermesConfig,
          model,
        );
      }
    }
  }
  return defaults;
};

export const modelOptionsResponse = async (
  config: ServerConfig,
): Promise<Response> => {
  const upstream = await proxyHermes(config, "GET", "/api/model/options");
  if (upstream.status !== 200) return upstream;
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!isObject(payload)) return Response.json(payload);
  const advertised = Array.isArray(payload.reasoning_efforts)
    ? new Set(
        payload.reasoning_efforts.filter(
          (effort): effort is string =>
            typeof effort === "string" &&
            (KNOWN_REASONING_EFFORTS as readonly string[]).includes(effort),
        ),
      )
    : new Set(
        KNOWN_REASONING_EFFORTS.filter(
          (effort) => !UNCONFIRMED_SESSION_REASONING_EFFORTS.has(effort),
        ),
      );
  if (advertised.size === 0) {
    for (const effort of KNOWN_REASONING_EFFORTS) {
      if (!UNCONFIRMED_SESSION_REASONING_EFFORTS.has(effort))
        advertised.add(effort);
    }
  }
  payload.reasoning_efforts = [...KNOWN_REASONING_EFFORTS];
  payload.reasoning_unconfirmed_efforts = KNOWN_REASONING_EFFORTS.filter(
    (effort) => !advertised.has(effort),
  );
  payload.reasoning_defaults = await catalogReasoningDefaults(config, payload);
  return Response.json(payload, { status: upstream.status });
};
