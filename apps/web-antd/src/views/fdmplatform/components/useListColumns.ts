import type { ComputedRef, MaybeRefOrGetter } from 'vue';

import type { LineColumn, LineTableSetting } from './line-table-model';

import { computed, ref, toValue, watch } from 'vue';

import { useAccessStore, useUserStore } from '@vben/stores';

import { getActivePinia } from 'pinia';

import {
  clampWidth,
  clearSetting,
  DEFAULT_WIDTH,
  defaultSetting,
  loadSetting,
  MAX_WIDTH,
  MIN_WIDTH,
  saveSetting,
  tableWidth,
} from './line-table-model';

export function useListColumns<T extends LineColumn & { fixed?: 'right' }>(
  table: MaybeRefOrGetter<string>,
  source: ComputedRef<T[]>,
) {
  const pinia = getActivePinia();
  const access = pinia ? useAccessStore(pinia) : undefined;
  const user = pinia ? useUserStore(pinia) : undefined;
  const key = computed(() => {
    const userId = user?.userInfo?.id ?? user?.userInfo?.userId ?? 'anonymous';
    return `fdm-list-table:${toValue(table)}:${access?.tenantId ?? ''}:${userId}`;
  });
  const settingsColumns = computed(() =>
    source.value.filter((column) => column.fixed !== 'right'),
  );
  const setting = ref(defaultSetting(settingsColumns.value));
  const settingsOpen = ref(false);
  const columnKeys = computed(() =>
    JSON.stringify(
      settingsColumns.value.map(({ key, locked, optional }) => [
        key,
        locked,
        optional,
      ]),
    ),
  );
  watch(
    [key, columnKeys],
    () => {
      setting.value = loadSetting(settingsColumns.value, key.value);
      settingsOpen.value = false;
    },
    { immediate: true },
  );
  const columns = computed(() => {
    const byKey = new Map(source.value.map((column) => [column.key, column]));
    const fixed = source.value.filter((column) => column.fixed === 'right');
    const shown = setting.value.keys.flatMap((name) => {
      const column = byKey.get(name);
      return column
        ? [
            {
              ...column,
              width:
                setting.value.widths[name] ?? column.width ?? DEFAULT_WIDTH,
              resizable: true,
              minWidth: MIN_WIDTH,
              maxWidth: MAX_WIDTH,
            },
          ]
        : [];
    });
    return [...shown, ...fixed];
  });
  const listWidth = computed(() =>
    tableWidth(
      columns.value.map((column) => ({ width: column.width ?? DEFAULT_WIDTH })),
    ),
  );
  function saveColumns(value: LineTableSetting) {
    setting.value = value;
    if (
      JSON.stringify(value) ===
      JSON.stringify(defaultSetting(settingsColumns.value))
    ) {
      clearSetting(key.value);
    } else {
      saveSetting(key.value, value);
    }
  }
  function resizeColumn(width: number, column: { key?: unknown }) {
    const name = String(column.key);
    saveColumns({
      ...setting.value,
      widths: { ...setting.value.widths, [name]: clampWidth(width) },
    });
  }
  return {
    columns,
    listWidth,
    settingsColumns,
    setting,
    settingsOpen,
    saveColumns,
    resizeColumn,
  };
}
