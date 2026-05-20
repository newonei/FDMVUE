import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';

import { computed, ref, shallowRef } from 'vue';

import {
  getDataJustPattern,
  getDataJustPatternPage,
} from '#/api/fdmdata/datajustpattern';

const SEARCH_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function skuLabel(row: { itemCode?: string; productName?: string }) {
  const code = row.itemCode ?? '';
  const name = row.productName ?? '';
  return `${code}｜${name}`;
}

/** 图案 SKU（fdm_data_just_pattern）远程搜索，用于定制组合「选择图案系列」等 */
export function usePatternSkuRemoteSelect(
  getSelectedId?: () => number | undefined,
) {
  const patternSkuLoading = ref(false);
  const patternSkuRows = shallowRef<FdmdataDataJustPatternApi.Pattern[]>([]);
  const patternKeyword = ref('');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function mergeSelectedRow(
    list: FdmdataDataJustPatternApi.Pattern[],
    selected: FdmdataDataJustPatternApi.Pattern | null,
  ) {
    if (!selected) {
      return list;
    }
    if (list.some((p) => p.id === selected.id)) {
      return list;
    }
    return [selected, ...list];
  }

  async function fetchSelectedRow(
    id: number | undefined,
  ): Promise<FdmdataDataJustPatternApi.Pattern | null> {
    if (id === undefined || id === null) {
      return null;
    }
    const cached = patternSkuRows.value.find((p) => p.id === id);
    if (cached) {
      return cached;
    }
    try {
      return (await getDataJustPattern(id)) ?? null;
    } catch {
      return null;
    }
  }

  async function loadPatternSkuOptions(keyword?: string) {
    const kw = (keyword ?? patternKeyword.value ?? '').trim();
    const selectedId = getSelectedId?.();
    patternSkuLoading.value = true;
    try {
      if (!kw) {
        const selected = await fetchSelectedRow(selectedId);
        patternSkuRows.value = selected ? [selected] : [];
        return;
      }
      const page = await getDataJustPatternPage({
        pageNo: 1,
        pageSize: SEARCH_PAGE_SIZE,
        keyword: kw,
      });
      const selected = await fetchSelectedRow(selectedId);
      patternSkuRows.value = mergeSelectedRow(page?.list ?? [], selected);
    } finally {
      patternSkuLoading.value = false;
    }
  }

  function onPatternSkuSearch(val: string) {
    patternKeyword.value = val;
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    searchTimer = setTimeout(() => {
      void loadPatternSkuOptions(val);
    }, SEARCH_DEBOUNCE_MS);
  }

  function onPatternSkuDropdownOpen(open: boolean) {
    if (!open) {
      return;
    }
    const kw = patternKeyword.value.trim();
    if (kw) {
      void loadPatternSkuOptions(kw);
    } else {
      void loadPatternSkuOptions();
    }
  }

  function resetPatternSkuSelect() {
    patternKeyword.value = '';
    patternSkuRows.value = [];
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
  }

  async function ensureSelectedPatternSku(id: number | undefined) {
    if (id === undefined || id === null) {
      return;
    }
    const row = await fetchSelectedRow(id);
    if (row) {
      patternSkuRows.value = mergeSelectedRow(patternSkuRows.value, row);
    }
  }

  const patternSkuSelectOptions = computed(() =>
    patternSkuRows.value.map((r) => ({
      value: r.id,
      label: skuLabel(r),
    })),
  );

  return {
    patternSkuLoading,
    patternSkuRows,
    patternSkuSelectOptions,
    patternKeyword,
    loadPatternSkuOptions,
    onPatternSkuSearch,
    onPatternSkuDropdownOpen,
    resetPatternSkuSelect,
    ensureSelectedPatternSku,
  };
}
