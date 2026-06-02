import { useState, useEffect } from "react";
import { fetchModels, logger } from "../utils";
import { Conversation, Model } from "../types";

export const useModels = (
  endpoint: string,
  activeConversationId: string,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
) => {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string>("");
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);

  const checkConnectionAndFetchModels = async () => {
    try {
      setIsFetchingModels(true);
      const fetched = await fetchModels(endpoint);
      setModels(fetched.models);
      setIsConnected(true);
      setConnectionError("");

      if (fetched.defaultModel) {
        setSelectedModel(fetched.defaultModel);
      } else if (fetched.models.length > 0) {
        setSelectedModel(fetched.models[0].id);
      }
    } catch (err: unknown) {
      logger.error({ error: err }, "Failed to connect to Hermes API server");
      setIsConnected(false);
      setConnectionError(err instanceof Error ? err.message : "Falha de rede.");
      setModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkConnectionAndFetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const handleSelectModel = (modelId: string) => {
    if (!modelId) return;
    setSelectedModel(modelId);

    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId ? { ...c, modelId } : c,
        ),
      );
    }
  };

  const handleConversationModelChange = (modelId: string) => {
    if (!activeConversationId) {
      setPendingModelId(modelId);
      return;
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversationId ? { ...c, modelId } : c)),
    );
  };

  return {
    models,
    selectedModel,
    pendingModelId,
    isConnected,
    isFetchingModels,
    connectionError,
    handleSelectModel,
    handleConversationModelChange,
    checkConnectionAndFetchModels,
  };
};
