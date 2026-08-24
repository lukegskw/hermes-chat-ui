import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { fetchModels, logger, updateConversationModel } from "../utils";
import {
  Conversation,
  ModelProvider,
  NewConversationModelSelection,
} from "../types";
import type { SelectFieldGroup } from "../components/SelectField";

const RUNTIME_STORAGE_KEY = "hermes_session_runtime";
const NEW_CONVERSATION_MODEL_STORAGE_KEY = "hermes_new_conversation_model";
const HERMES_VIRTUAL_MODELS = new Set(["default", "hermes-agent"]);

export const resolveActiveModelId = (
  activeModelId: string | null | undefined,
  storedModelId: string | undefined,
  defaultModelId: string,
) =>
  storedModelId ||
  (activeModelId && HERMES_VIRTUAL_MODELS.has(activeModelId)
    ? defaultModelId
    : activeModelId) ||
  defaultModelId;

export const resolveNewConversationSelection = (
  usesHermesDefault: boolean,
  hermesDefaultSelection: NewConversationModelSelection | null,
  selected: NewConversationModelSelection | null,
) =>
  usesHermesDefault
    ? hermesDefaultSelection || undefined
    : selected || undefined;

export const resolveActiveProviderId = (
  providers: ModelProvider[],
  activeModelId: string,
  storedProviderId: string | undefined,
  defaultSelection: NewConversationModelSelection | null,
) => {
  if (storedProviderId) return storedProviderId;
  if (
    defaultSelection?.modelId === activeModelId &&
    providers.some(
      (provider) =>
        provider.id === defaultSelection.providerId &&
        provider.models.some((model) => model.id === activeModelId),
    )
  ) {
    return defaultSelection.providerId;
  }
  const matches = providers.filter((provider) =>
    provider.models.some((model) => model.id === activeModelId),
  );
  return matches.length === 1 ? matches[0].id : "";
};

type StoredRuntime = {
  modelId: string;
  providerId: string;
  reasoningEffort?: string;
};

const readStoredRuntimes = (): Record<string, StoredRuntime | undefined> => {
  try {
    return JSON.parse(
      localStorage.getItem(RUNTIME_STORAGE_KEY) || "{}",
    ) as Record<string, StoredRuntime | undefined>;
  } catch {
    return {};
  }
};

const readNewConversationModel = (): NewConversationModelSelection | null => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(NEW_CONVERSATION_MODEL_STORAGE_KEY) || "null",
    );
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as NewConversationModelSelection).providerId ===
        "string" &&
      typeof (parsed as NewConversationModelSelection).modelId === "string"
    ) {
      return parsed as NewConversationModelSelection;
    }
  } catch {
    // A stale browser preference must not prevent Hermes' defaults from loading.
  }
  return null;
};

const makeOptionValue = (selection: NewConversationModelSelection) =>
  JSON.stringify(selection);

const parseOptionValue = (
  value: string,
): NewConversationModelSelection | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as NewConversationModelSelection).providerId ===
        "string" &&
      typeof (parsed as NewConversationModelSelection).modelId === "string"
    ) {
      return parsed as NewConversationModelSelection;
    }
  } catch {
    // Ignore malformed values rather than accepting a provider/model pair we did not render.
  }
  return null;
};

const includesSelection = (
  providers: ModelProvider[],
  selection: NewConversationModelSelection,
) =>
  providers.some(
    (provider) =>
      provider.id === selection.providerId &&
      provider.models.some((model) => model.id === selection.modelId),
  );

export const useModels = (
  endpoint: string,
  activeConversationId: string,
  activeConversationModelId: string | null | undefined,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
) => {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [reasoningEfforts, setReasoningEfforts] = useState<string[]>([]);
  const [unconfirmedReasoningEfforts, setUnconfirmedReasoningEfforts] =
    useState<string[]>([]);
  const [reasoningDefaults, setReasoningDefaults] = useState<
    Partial<Record<string, Record<string, string>>>
  >({});
  const [modelOptionGroups, setModelOptionGroups] = useState<
    SelectFieldGroup[]
  >([]);
  const [newConversationSelection, setNewConversationSelection] =
    useState<NewConversationModelSelection | null>(null);
  const [
    usesHermesDefaultForNewConversation,
    setUsesHermesDefaultForNewConversation,
  ] = useState(true);
  const [hermesDefaultModel, setHermesDefaultModel] = useState("");
  const [hermesDefaultSelection, setHermesDefaultSelection] =
    useState<NewConversationModelSelection | null>(null);
  const [isUpdatingConversationModel, setIsUpdatingConversationModel] =
    useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const catalogCacheRef = useRef<{
    endpoint: string;
    catalog: Awaited<ReturnType<typeof fetchModels>>;
  } | null>(null);
  const catalogRequestRef = useRef<{
    endpoint: string;
    promise: Promise<Awaited<ReturnType<typeof fetchModels>>>;
  } | null>(null);
  const selectionRequestRef = useRef(0);

  const checkConnectionAndFetchModels = async () => {
    const requestId = ++selectionRequestRef.current;
    const cached = catalogCacheRef.current;
    try {
      if (cached?.endpoint !== endpoint) setIsFetchingModels(true);
      const fetched =
        cached?.endpoint === endpoint
          ? cached.catalog
          : await (() => {
              const inFlight = catalogRequestRef.current;
              if (inFlight?.endpoint === endpoint) return inFlight.promise;
              const promise = fetchModels(endpoint);
              catalogRequestRef.current = { endpoint, promise };
              void promise.then(
                () => {
                  if (catalogRequestRef.current?.promise === promise) {
                    catalogRequestRef.current = null;
                  }
                },
                () => {
                  if (catalogRequestRef.current?.promise === promise) {
                    catalogRequestRef.current = null;
                  }
                },
              );
              return promise;
            })();
      if (requestId !== selectionRequestRef.current) return;
      catalogCacheRef.current = { endpoint, catalog: fetched };
      const fetchedProviders = fetched.providers;
      const matchingDefaultProviders = fetchedProviders.filter((provider) =>
        provider.models.some((model) => model.id === fetched.defaultModel),
      );
      const declaredDefaultProvider = fetchedProviders.find(
        (provider) =>
          provider.id === fetched.defaultProvider &&
          provider.models.some((model) => model.id === fetched.defaultModel),
      );
      const defaultProvider =
        declaredDefaultProvider?.id ||
        (matchingDefaultProviders.length === 1
          ? matchingDefaultProviders[0].id
          : "");
      const defaultModel =
        defaultProvider && fetched.defaultModel ? fetched.defaultModel : "";
      const defaultSelection =
        defaultProvider && defaultModel
          ? { providerId: defaultProvider, modelId: defaultModel }
          : null;
      const rawStoredRuntime = activeConversationId
        ? readStoredRuntimes()[activeConversationId]
        : undefined;
      const storedRuntime =
        rawStoredRuntime &&
        includesSelection(fetchedProviders, rawStoredRuntime)
          ? rawStoredRuntime
          : undefined;
      if (rawStoredRuntime && !storedRuntime && activeConversationId) {
        const runtimes = readStoredRuntimes();
        delete runtimes[activeConversationId];
        localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimes));
      }
      const savedNewConversationModel = readNewConversationModel();

      setProviders(fetchedProviders);
      setReasoningEfforts(fetched.reasoningEfforts);
      setUnconfirmedReasoningEfforts(fetched.unconfirmedReasoningEfforts);
      setReasoningDefaults(fetched.reasoningDefaults);
      setIsConnected(true);
      setConnectionError("");
      setHermesDefaultModel(defaultModel);
      setHermesDefaultSelection(defaultSelection);

      const shouldResolveVirtualModel = Boolean(
        !storedRuntime?.modelId &&
        activeConversationModelId &&
        HERMES_VIRTUAL_MODELS.has(activeConversationModelId),
      );
      const activeModel = resolveActiveModelId(
        activeConversationModelId,
        storedRuntime?.modelId,
        defaultModel,
      );
      const activeProvider = resolveActiveProviderId(
        fetchedProviders,
        activeModel,
        storedRuntime?.providerId,
        defaultSelection,
      );
      let confirmedRuntime = storedRuntime;
      if (
        shouldResolveVirtualModel &&
        activeConversationId &&
        activeModel &&
        activeProvider
      ) {
        try {
          await updateConversationModel(endpoint, activeConversationId, {
            modelId: activeModel,
            providerId: activeProvider,
          });
          if (requestId !== selectionRequestRef.current) return;
          confirmedRuntime = {
            modelId: activeModel,
            providerId: activeProvider,
          };
          const runtimes = readStoredRuntimes();
          runtimes[activeConversationId] = confirmedRuntime;
          localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimes));
        } catch (error: unknown) {
          logger.error(
            { error },
            "Failed to migrate a virtual Hermes session runtime",
          );
          toast.error(t("errors.sessionModelUpdateFailed"));
        }
      }
      if (requestId !== selectionRequestRef.current) return;
      const activeModels =
        fetchedProviders.find((provider) => provider.id === activeProvider)
          ?.models || [];
      setSelectedProvider(activeProvider);
      setSelectedModel(activeModel || activeModels[0]?.id || "");
      if (
        activeConversationId &&
        (confirmedRuntime?.modelId || shouldResolveVirtualModel)
      ) {
        const resolvedRuntime = confirmedRuntime || {
          modelId: activeModel,
          providerId: activeProvider,
        };
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === activeConversationId
              ? { ...conversation, ...resolvedRuntime }
              : conversation,
          ),
        );
      }

      const optionGroups = fetchedProviders.flatMap((provider) => {
        const options = provider.models.map((model) => {
          const selection = { providerId: provider.id, modelId: model.id };
          return {
            value: makeOptionValue(selection),
            label: model.label || model.id,
          };
        });
        return options.length > 0 ? [{ label: provider.label, options }] : [];
      });
      setModelOptionGroups(optionGroups);
      if (
        savedNewConversationModel &&
        includesSelection(fetchedProviders, savedNewConversationModel)
      ) {
        setNewConversationSelection(savedNewConversationModel);
        setUsesHermesDefaultForNewConversation(false);
      } else {
        setNewConversationSelection(defaultSelection);
        setUsesHermesDefaultForNewConversation(true);
        localStorage.removeItem(NEW_CONVERSATION_MODEL_STORAGE_KEY);
      }
    } catch (err: unknown) {
      if (requestId !== selectionRequestRef.current) return;
      logger.error({ error: err }, "Failed to connect to Hermes API server");
      setIsConnected(false);
      setConnectionError(err instanceof Error ? err.message : "Falha de rede.");
      setProviders([]);
      setReasoningEfforts([]);
      setUnconfirmedReasoningEfforts([]);
      setReasoningDefaults({});
      setModelOptionGroups([]);
      setHermesDefaultSelection(null);
    } finally {
      if (requestId === selectionRequestRef.current) {
        setIsFetchingModels(false);
      }
    }
  };

  useEffect(() => {
    // The current session can change independently of the catalog; loading it
    // here also restores its locally confirmed provider/model pair.
    // The state updates occur after the external Hermes catalog request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkConnectionAndFetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, activeConversationId]);

  const persistSelection = async (
    modelId: string,
    providerId: string,
    reasoningEffort?: string,
    failureMessage = t("errors.sessionModelUpdateFailed"),
  ): Promise<boolean> => {
    if (!modelId || !providerId || !activeConversationId) return false;
    setIsUpdatingConversationModel(true);
    try {
      await updateConversationModel(endpoint, activeConversationId, {
        modelId,
        providerId,
        reasoningEffort,
      });
      const runtimes = readStoredRuntimes();
      runtimes[activeConversationId] = {
        modelId,
        providerId,
        reasoningEffort,
      };
      localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimes));
      setSelectedProvider(providerId);
      setSelectedModel(modelId);
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                modelId,
                providerId,
                reasoningEffort: reasoningEffort || null,
              }
            : conversation,
        ),
      );
      return true;
    } catch (error: unknown) {
      logger.error({ error }, "Failed to update Hermes session model");
      toast.error(failureMessage);
      return false;
    } finally {
      setIsUpdatingConversationModel(false);
    }
  };

  const handleConversationModelChange = async (value: string) => {
    const selection = parseOptionValue(value);
    if (!selection || !includesSelection(providers, selection)) return false;
    return persistSelection(selection.modelId, selection.providerId);
  };

  const handleReasoningEffortChange = async (reasoningEffort: string) => {
    if (!selectedModel || !selectedProvider) return false;
    return persistSelection(
      selectedModel,
      selectedProvider,
      reasoningEffort || undefined,
      t("errors.reasoningUpdateFailed", {
        effort: reasoningEffort || t("chat.hermesDefault"),
        model: selectedModel,
      }),
    );
  };

  const handleNewConversationModelChange = (value: string) => {
    if (!value) {
      localStorage.removeItem(NEW_CONVERSATION_MODEL_STORAGE_KEY);
      setUsesHermesDefaultForNewConversation(true);
      setNewConversationSelection(hermesDefaultSelection);
      return;
    }
    const selection = parseOptionValue(value);
    if (!selection || !includesSelection(providers, selection)) return;
    localStorage.setItem(
      NEW_CONVERSATION_MODEL_STORAGE_KEY,
      JSON.stringify(selection),
    );
    setNewConversationSelection(selection);
    setUsesHermesDefaultForNewConversation(false);
  };

  const registerNewConversationSelection = (
    conversationId: string,
    selection: NewConversationModelSelection,
  ) => {
    if (!conversationId || !includesSelection(providers, selection)) return;
    const runtimes = readStoredRuntimes();
    runtimes[conversationId] = {
      modelId: selection.modelId,
      providerId: selection.providerId,
    };
    localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimes));
    setSelectedProvider(selection.providerId);
    setSelectedModel(selection.modelId);
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              modelId: selection.modelId,
              providerId: selection.providerId,
            }
          : conversation,
      ),
    );
  };

  const newConversationModelValue =
    !usesHermesDefaultForNewConversation && newConversationSelection
      ? makeOptionValue(newConversationSelection)
      : "";
  const conversationModelValue =
    selectedProvider && selectedModel
      ? makeOptionValue({
          providerId: selectedProvider,
          modelId: selectedModel,
        })
      : "";

  return {
    providers,
    selectedProvider,
    selectedModel,
    reasoningEfforts,
    unconfirmedReasoningEfforts,
    reasoningDefaults,
    modelOptionGroups,
    newConversationModelValue,
    conversationModelValue,
    hermesDefaultModel,
    newConversationSelection: resolveNewConversationSelection(
      usesHermesDefaultForNewConversation,
      hermesDefaultSelection,
      newConversationSelection,
    ),
    isUpdatingConversationModel,
    isConnected,
    isFetchingModels,
    connectionError,
    handleConversationModelChange,
    handleReasoningEffortChange,
    handleNewConversationModelChange,
    registerNewConversationSelection,
    checkConnectionAndFetchModels,
  };
};
