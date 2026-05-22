<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyBrushApi } from '#/api/fdmdata/ecshopdailybrush';

import { computed, shallowRef } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcShopDailyBrush,
  getEcShopDailyBrushPage,
} from '#/api/fdmdata/ecshopdailybrush';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

// ─── Modal ─────────────────────────────────────────────────────────────────────

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });

// ─── Checkbox state ────────────────────────────────────────────────────────────

const checkedIds = shallowRef<number[]>([]);
const checkedCount = computed(() => checkedIds.value.length);

function sameIdList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const sa = [...a].toSorted((x, y) => x - y);
  const sb = [...b].toSorted((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

const checkedIdsMemoKey = computed(() =>
  [...checkedIds.value].toSorted((a, b) => a - b).join(','),
);

function handleRowCheckboxChange({
  records,
}: {
  records: FdmdataEcShopDailyBrushApi.EcShopDailyBrush[];
}) {
  const next = records.map((item) => item.id!);
  if (sameIdList(checkedIds.value, next)) return;
  checkedIds.value = next;
}

// ─── CRUD handlers ─────────────────────────────────────────────────────────────

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataEcShopDailyBrushApi.EcShopDailyBrush) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataEcShopDailyBrushApi.EcShopDailyBrush) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteEcShopDailyBrush(row.id!);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getEcShopDailyBrushPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />

    <div class="brush-page flex min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            店铺刷单记录管理
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            记录各店铺刷单明细，看板计算真实销售额时将自动扣除刷单本金
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button type="primary" @click="handleCreate">新增</Button>
        </div>
      </header>

      <div class="brush-grid min-h-0 flex-1">
        <Grid table-title="刷单记录">
          <template #toolbar-tools>
            <div
              v-memo="[checkedIdsMemoKey]"
              class="inline-flex items-center gap-2"
            >
              <span
                v-if="checkedCount > 0"
                class="text-xs text-muted-foreground"
              >
                已选 {{ checkedCount }} 条
              </span>
            </div>
          </template>

          <template #actions="{ row }">
            <div v-memo="[row.id]">
              <TableAction
                :actions="[
                  {
                    label: $t('common.edit'),
                    type: 'link',
                    icon: ACTION_ICON.EDIT,
                    auth: ['fdmdata:ec-shop-daily-brush:update'],
                    onClick: handleEdit.bind(null, row),
                  },
                  {
                    label: $t('common.delete'),
                    type: 'link',
                    danger: true,
                    icon: ACTION_ICON.DELETE,
                    auth: ['fdmdata:ec-shop-daily-brush:delete'],
                    popConfirm: {
                      title: $t('ui.actionMessage.deleteConfirm', [row.id]),
                      confirm: handleDelete.bind(null, row),
                    },
                  },
                ]"
              />
            </div>
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.brush-page {
  min-height: 0;
}

.brush-grid {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.brush-grid :deep(.vben-vxe-grid) {
  flex: 1 1 0;
  min-height: 0;
}
</style>
