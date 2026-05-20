import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';

import { computed, ref, shallowRef } from 'vue';

import {
  getDataJustPatternCost,
  getDataJustPatternCostPage,
} from '#/api/fdmdata/datajustpattern';

const SEARCH_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/** 图案对照远程搜索 Select（方案 A：关键词 OR 查询，不全量加载） */
export function usePatternCostRemoteSelect(
  getSelectedId?: () => number | undefined,
) {
  const patternCostLoading = ref(false);
  const patternCostList = shallowRef<FdmdataDataJustPatternApi.PatternCost[]>(
    [],
  );
  const patternKeyword = ref('');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function mergeSelectedRow(
    list: FdmdataDataJustPatternApi.PatternCost[],
    selected: FdmdataDataJustPatternApi.PatternCost | null,
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
  ): Promise<FdmdataDataJustPatternApi.PatternCost | null> {
    if (id === undefined || id === null) {
      return null;
    }
    const cached = patternCostList.value.find((p) => p.id === id);
    if (cached) {
      return cached;
    }
    try {
      return (await getDataJustPatternCost(id)) ?? null;
    } catch {
      return null;
    }
  }

  async function loadPatternCostList(keyword?: string) {
    const kw = (keyword ?? patternKeyword.value ?? '').trim();
    const selectedId = getSelectedId?.();
    patternCostLoading.value = true;
    try {
      if (!kw) {
        const selected = await fetchSelectedRow(selectedId);
        patternCostList.value = selected ? [selected] : [];
        return;
      }
      const page = await getDataJustPatternCostPage({
        pageNo: 1,
        pageSize: SEARCH_PAGE_SIZE,
        keyword: kw,
      });
      const selected = await fetchSelectedRow(selectedId);
      patternCostList.value = mergeSelectedRow(page?.list ?? [], selected);
    } finally {
      patternCostLoading.value = false;
    }
  }

  function onPatternSearch(val: string) {
    patternKeyword.value = val;
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    searchTimer = setTimeout(() => {
      void loadPatternCostList(val);
    }, SEARCH_DEBOUNCE_MS);
  }

  function onPatternDropdownOpen(open: boolean) {
    if (!open) {
      return;
    }
    const kw = patternKeyword.value.trim();
    if (kw) {
      void loadPatternCostList(kw);
    } else {
      void loadPatternCostList();
    }
  }

  function resetPatternCostSelect() {
    patternKeyword.value = '';
    patternCostList.value = [];
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
  }

  async function ensureSelectedOption(id: number | undefined) {
    if (id === undefined || id === null) {
      return;
    }
    const row = await fetchSelectedRow(id);
    if (row) {
      patternCostList.value = mergeSelectedRow(patternCostList.value, row);
    }
  }

  const patternCostSelectOptions = computed(() =>
    patternCostList.value.map((p) => ({
      value: p.id,
      label: `${p.patternName}（${p.itemCode}）`,
    })),
  );

  return {
    patternCostLoading,
    patternCostList,
    patternKeyword,
    patternCostSelectOptions,
    loadPatternCostList,
    onPatternSearch,
    onPatternDropdownOpen,
    resetPatternCostSelect,
    ensureSelectedOption,
  };
}
