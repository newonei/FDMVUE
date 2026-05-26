<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, ref, shallowRef } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';

import { Button, message, Segmented } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcShopDaily,
  deleteEcShopDailyList,
  getEcShopDailyPage,
} from '#/api/fdmdata/ecshopdaily';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import BrushForm from './modules/brush-form.vue';
import DetailModal from './modules/detail-modal.vue';
import EcShopDailyDashboard from './modules/ec-shop-daily-dashboard.vue';
import Form from './modules/form.vue';

// ─── Modal ─────────────────────────────────────────────────────────────────────

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });
const [BrushModal, brushModalApi] = useVbenModal({
  connectedComponent: BrushForm,
});
const [Detail, detailModalApi] = useVbenModal({
  connectedComponent: DetailModal,
});

// ─── View mode ─────────────────────────────────────────────────────────────────

const dashboardRef = ref<InstanceType<typeof EcShopDailyDashboard> | null>(
  null,
);

const viewModeOptions = [
  { label: '数据看板', value: 'dashboard' },
  { label: '数据表格', value: 'table' },
] as const;

const activeTab = ref<'dashboard' | 'table'>('dashboard');

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
  records: FdmdataEcShopDailyApi.EcShopDaily[];
}) {
  const next = records.map((item) => item.id!);
  if (sameIdList(checkedIds.value, next)) return;
  checkedIds.value = next;
}

// ─── CRUD handlers ─────────────────────────────────────────────────────────────

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataEcShopDailyApi.EcShopDaily) {
  formModalApi.setData(row).open();
}

function handleBrush(row: FdmdataEcShopDailyApi.EcShopDaily) {
  brushModalApi.setData(row).open();
}

function handleDetail(row: FdmdataEcShopDailyApi.EcShopDaily) {
  detailModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataEcShopDailyApi.EcShopDaily) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteEcShopDaily(row.id!);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

async function handleDeleteBatch() {
  if (checkedIds.value.length === 0) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deletingBatch'),
    duration: 0,
  });
  try {
    await deleteEcShopDailyList(checkedIds.value);
    checkedIds.value = [];
    message.success($t('ui.actionMessage.deleteSuccess'));
    handleRefresh();
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
    autoResize: true,
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getEcShopDailyPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});

function handleRefresh() {
  gridApi.query();
  if (activeTab.value === 'dashboard' && dashboardRef.value) {
    void dashboardRef.value.reload?.();
  }
}
</script>

<template>
  <!--
    布局策略（关键，吃过亏）：
    - <Page auto-content-height> 已经会撑满可用高度并把内容区设成 flex
    - 直接把 <Grid> 放进 <Page>（与 vben 模板生成的简单页面一致）才能让 vxe-table 的
      height: 'auto' 拿到正确父高度
    - 视图切换用 v-show（始终保留 DOM），避免懒挂载时 ResizeObserver 错过初次尺寸
    - dashboard 区域只占可视层级，不参与 Grid 的高度计算
  -->
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />
    <BrushModal @success="handleRefresh" />
    <Detail />

    <!-- 顶部工具栏：标题 + Tab 切换 + 新增按钮 -->
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="mb-1 text-lg font-semibold text-foreground">
          店铺后台日汇总管理
        </h2>
        <p class="mb-0 text-xs text-muted-foreground">
          按店铺统计每日成交、退款、流量与营销投放数据
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          v-if="activeTab === 'table'"
          type="primary"
          @click="handleCreate"
        >
          新增
        </Button>
        <Segmented
          v-model:value="activeTab"
          :options="[...viewModeOptions]"
          class="ec-shop-daily-segmented"
        />
      </div>
    </div>

    <!-- 数据看板（始终挂载，仅 v-show 切显示） -->
    <div v-show="activeTab === 'dashboard'">
      <EcShopDailyDashboard ref="dashboardRef" />
    </div>

    <!-- 数据表格（始终挂载，与简单参考页一致结构） -->
    <Grid v-show="activeTab === 'table'" table-title="店铺日汇总">
      <template #toolbar-tools>
        <div
          v-memo="[checkedIdsMemoKey]"
          class="inline-flex flex-wrap items-center gap-2"
        >
          <span
            v-if="checkedCount > 0"
            class="mr-1 text-xs text-muted-foreground"
          >
            已选 {{ checkedCount }} 条
          </span>
          <Button
            v-if="checkedCount > 0"
            danger
            size="small"
            @click="handleDeleteBatch"
          >
            批量删除
          </Button>
        </div>
      </template>

      <template #actions="{ row }">
        <div v-memo="[row.id]">
          <TableAction
            :actions="[
              {
                label: '详情',
                type: 'link',
                icon: ACTION_ICON.VIEW,
                onClick: handleDetail.bind(null, row),
              },
              {
                label: '刷单',
                type: 'link',
                icon: ACTION_ICON.EDIT,
                onClick: handleBrush.bind(null, row),
              },
            ]"
            :drop-down-actions="[
              {
                label: $t('common.edit'),
                type: 'link',
                icon: ACTION_ICON.EDIT,
                auth: ['fdmdata:ec-shop-daily:update'],
                onClick: handleEdit.bind(null, row),
              },
              {
                label: $t('common.delete'),
                type: 'link',
                danger: true,
                icon: ACTION_ICON.DELETE,
                auth: ['fdmdata:ec-shop-daily:delete'],
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
  </Page>
</template>

<style scoped>
.ec-shop-daily-segmented :deep(.ant-segmented) {
  background: hsl(var(--muted) / 45%);
}
</style>
