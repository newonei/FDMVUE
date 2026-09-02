import type { AiModelOption } from './types';

import { computed, ref } from 'vue';

export function compatibleAiModels(
  models: readonly AiModelOption[],
  requiredCapabilities: readonly string[] | string = ['STRUCTURED_OUTPUT'],
) {
  const capabilities = (
    Array.isArray(requiredCapabilities)
      ? requiredCapabilities
      : [requiredCapabilities]
  ).map((item) => item.toUpperCase());
  return models.filter(
    (model) =>
      model.enabled &&
      capabilities.every((capability) =>
        model.capabilities.some((item) => item.toUpperCase() === capability),
      ),
  );
}

export function useAiModelCatalog(options: {
  actionCode: string;
  load: () => Promise<AiModelOption[]>;
  requiredCapabilities?: readonly string[];
  requiredCapability?: string;
  userIdentity: () => string;
}) {
  const models = ref<AiModelOption[]>([]);
  const selectedModelId = ref<string>();
  const loading = ref(false);
  const errorMessage = ref('');
  let requestVersion = 0;

  const compatibleModels = computed(() =>
    compatibleAiModels(
      models.value,
      options.requiredCapabilities ??
        options.requiredCapability ?? ['STRUCTURED_OUTPUT'],
    ),
  );

  async function load() {
    const version = ++requestVersion;
    loading.value = true;
    errorMessage.value = '';
    try {
      const result = await options.load();
      if (version !== requestVersion) return;
      models.value = Array.isArray(result) ? result : [];
      // High-impact document generation always requires a fresh, visible choice.
      // Do not restore a remembered model or silently select the first catalog item.
      selectedModelId.value = undefined;
    } catch (error) {
      if (version !== requestVersion) return;
      models.value = [];
      selectedModelId.value = undefined;
      errorMessage.value =
        error instanceof Error && error.message.trim()
          ? error.message
          : '模型列表加载失败，请稍后重试。';
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }

  return {
    compatibleModels,
    error: errorMessage,
    load,
    loading,
    models,
    selectedModelId,
  };
}
