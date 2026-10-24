import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { ref, watch } from 'vue';

import { getAiCheckLevels } from '#/api/fdmaicheck';

/**
 * 列表风险列：按当前页的单据编号批量取风险等级。读取失败时不显示标记，不影响列表。
 */
export function useAiRiskLevels(
  docType: FdmAiCheckApi.DocType,
  ids: () => string[],
) {
  const levels = ref<Record<string, FdmAiCheckApi.Severity>>({});
  let seq = 0;
  async function load(list: string[]) {
    const current = ++seq;
    if (list.length === 0) {
      levels.value = {};
      return;
    }
    try {
      const result = await getAiCheckLevels(docType, list);
      if (current === seq) levels.value = result ?? {};
    } catch {
      if (current === seq) levels.value = {};
    }
  }
  watch(
    () => ids().filter(Boolean).join('\n'),
    (key) => load(key ? [...new Set(key.split('\n'))] : []),
    { immediate: true },
  );
  return {
    levels,
    reload: () => load([...new Set(ids().filter(Boolean))]),
  };
}
