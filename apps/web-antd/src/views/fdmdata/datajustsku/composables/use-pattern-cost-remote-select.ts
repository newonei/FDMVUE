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
  getSelectedId?: () => number | number[] | undefined,
) {
  const patternCostLoading = ref(false);
  const patternCostList = shallowRef<FdmdataDataJustPatternApi.PatternCost[]>(
    [],
  );
  const patternKeyword = ref('');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function toIdList(value: number | number[] | undefined | null): number[] {
    if (value === undefined || value === null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  /** 已选项不在搜索结果中时补到列表前面，保证 Select 能显示已选标签 */
  function mergeSelectedRows(
    list: FdmdataDataJustPatternApi.PatternCost[],
    selected: FdmdataDataJustPatternApi.PatternCost[],
  ) {
    const missing = selected.filter((s) => !list.some((p) => p.id === s.id));
    return missing.length > 0 ? [...missing, ...list] : list;
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

  async function fetchSelectedRows(
    ids: number | number[] | undefined,
  ): Promise<FdmdataDataJustPatternApi.PatternCost[]> {
    const rows = await Promise.all(
      toIdList(ids).map((id) => fetchSelectedRow(id)),
    );
    return rows.filter(
      (r): r is FdmdataDataJustPatternApi.PatternCost => r !== null,
    );
  }

  async function loadPatternCostList(keyword?: string) {
    const kw = (keyword ?? patternKeyword.value ?? '').trim();
    const selectedIds = getSelectedId?.();
    patternCostLoading.value = true;
    try {
      if (!kw) {
        patternCostList.value = await fetchSelectedRows(selectedIds);
        return;
      }
      const page = await getDataJustPatternCostPage({
        pageNo: 1,
        pageSize: SEARCH_PAGE_SIZE,
        keyword: kw,
      });
      const selected = await fetchSelectedRows(selectedIds);
      patternCostList.value = mergeSelectedRows(page?.list ?? [], selected);
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

  async function ensureSelectedOption(ids: number | number[] | undefined) {
    const rows = await fetchSelectedRows(ids);
    if (rows.length > 0) {
      patternCostList.value = mergeSelectedRows(patternCostList.value, rows);
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
