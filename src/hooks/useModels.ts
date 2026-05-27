import { useState, useEffect } from 'react';
import { Model, fetchModels } from '../utils/api';
import { logger } from '../utils/logger';
import { Conversation } from '../components/Sidebar';

export function useModels(
  endpoint: string,
  apiKey: string,
  proxyPort: string,
  activeConversationId: string,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string>("");

  const checkConnectionAndFetchModels = async () => {
    try {
      setIsFetchingModels(true);
      const fetched = await fetchModels(endpoint, apiKey, proxyPort);
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
    if (endpoint && apiKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      checkConnectionAndFetchModels();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, apiKey, proxyPort]);

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
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversationId ? { ...c, modelId } : c)),
    );
  };

  return {
    models,
    selectedModel,
    isConnected,
    isFetchingModels,
    connectionError,
    handleSelectModel,
    handleConversationModelChange,
    checkConnectionAndFetchModels
  };
}
