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
  getSelectedId?: () => number | number[] | undefined,
) {
  const patternSkuLoading = ref(false);
  const patternSkuRows = shallowRef<FdmdataDataJustPatternApi.Pattern[]>([]);
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
    list: FdmdataDataJustPatternApi.Pattern[],
    selected: FdmdataDataJustPatternApi.Pattern[],
  ) {
    const missing = selected.filter((s) => !list.some((p) => p.id === s.id));
    return missing.length > 0 ? [...missing, ...list] : list;
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

  async function fetchSelectedRows(
    ids: number | number[] | undefined,
  ): Promise<FdmdataDataJustPatternApi.Pattern[]> {
    const rows = await Promise.all(
      toIdList(ids).map((id) => fetchSelectedRow(id)),
    );
    return rows.filter(
      (r): r is FdmdataDataJustPatternApi.Pattern => r !== null,
    );
  }

  async function loadPatternSkuOptions(keyword?: string) {
    const kw = (keyword ?? patternKeyword.value ?? '').trim();
    const selectedIds = getSelectedId?.();
    patternSkuLoading.value = true;
    try {
      if (!kw) {
        patternSkuRows.value = await fetchSelectedRows(selectedIds);
        return;
      }
      const page = await getDataJustPatternPage({
        pageNo: 1,
        pageSize: SEARCH_PAGE_SIZE,
        keyword: kw,
      });
      const selected = await fetchSelectedRows(selectedIds);
      patternSkuRows.value = mergeSelectedRows(page?.list ?? [], selected);
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

  async function ensureSelectedPatternSku(ids: number | number[] | undefined) {
    const rows = await fetchSelectedRows(ids);
    if (rows.length > 0) {
      patternSkuRows.value = mergeSelectedRows(patternSkuRows.value, rows);
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
