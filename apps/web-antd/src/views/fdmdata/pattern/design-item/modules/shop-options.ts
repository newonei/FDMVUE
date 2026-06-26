import type { PatternDesignItemShopOption } from '../data';

import { onBeforeUnmount, ref } from 'vue';

import { getFdmdataPatternDesignItemShopNameOptions } from '#/api/fdmdata/pattern/design-item';

function toShopNameOptions(names: string[]): PatternDesignItemShopOption[] {
  return names
    .map((name) => String(name ?? '').trim())
    .filter(Boolean)
    .map((name) => ({ label: name, value: name }));
}

function mergeCurrentShopNameOption(
  options: PatternDesignItemShopOption[],
  shopName: unknown,
) {
  const value = String(shopName ?? '').trim();
  if (!value || options.some((item) => item.value === value)) return options;
  return [{ label: value, value }, ...options];
}

export function usePatternDesignItemShopOptions(
  getCurrentShopName?: () => Promise<unknown> | unknown,
) {
  const shopNameOptions = ref<PatternDesignItemShopOption[]>([]);
  const shopNameOptionsLoading = ref(false);
  let shopNameFetchSeq = 0;
  let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

  async function fetchShopNameOptions(keyword = '') {
    const seq = ++shopNameFetchSeq;
    shopNameOptionsLoading.value = true;
    try {
      const names = await getFdmdataPatternDesignItemShopNameOptions({
        keyword: keyword.trim() || undefined,
        limit: 50,
      });
      if (seq !== shopNameFetchSeq) return;
      const current = getCurrentShopName ? await getCurrentShopName() : '';
      shopNameOptions.value = mergeCurrentShopNameOption(
        toShopNameOptions(names),
        current,
      );
    } catch (error) {
      if (seq !== shopNameFetchSeq) return;
      console.error('Load pattern design item shop options failed', error);
      shopNameOptions.value = [];
    } finally {
      if (seq === shopNameFetchSeq) {
        shopNameOptionsLoading.value = false;
      }
    }
  }

  function handleShopNameSearch(keyword = '') {
    if (shopNameSearchTimer) {
      clearTimeout(shopNameSearchTimer);
    }
    shopNameSearchTimer = setTimeout(() => {
      void fetchShopNameOptions(keyword);
    }, 250);
  }

  function resetShopNameOptions() {
    shopNameFetchSeq++;
    shopNameOptions.value = [];
    shopNameOptionsLoading.value = false;
  }

  function ensureShopNameOption(shopName: unknown) {
    shopNameOptions.value = mergeCurrentShopNameOption(
      shopNameOptions.value,
      shopName,
    );
  }

  onBeforeUnmount(() => {
    if (shopNameSearchTimer) {
      clearTimeout(shopNameSearchTimer);
    }
  });

  return {
    ensureShopNameOption,
    fetchShopNameOptions,
    handleShopNameSearch,
    resetShopNameOptions,
    shopNameOptions,
    shopNameOptionsLoading,
  };
}
