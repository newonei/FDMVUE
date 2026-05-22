<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, nextTick, ref, shallowRef, watch } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  Collapse,
  Dropdown,
  Menu,
  message,
  Segmented,
} from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcShopDaily,
  deleteEcShopDailyList,
  exportEcShopDaily,
  getEcShopDailyPage,
} from '#/api/fdmdata/ecshopdaily';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import EcShopDailyDashboard from './modules/ec-shop-daily-dashboard.vue';
import Form from './modules/form.vue';
import JdImportModal from './modules/jd-import-modal.vue';
import TaobaoImportModal from './modules/taobao-import-modal.vue';

// ─── Modals ────────────────────────────────────────────────────────────────────

// destroyOnClose intentionally omitted for FormModal — see form.vue for explanation.
const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
});

const [TaobaoImportModalComp, taobaoImportModalApi] = useVbenModal({
  connectedComponent: TaobaoImportModal,
  destroyOnClose: true,
});

const [JdImportModalComp, jdImportModalApi] = useVbenModal({
  connectedComponent: JdImportModal,
  destroyOnClose: true,
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

/** 懒挂载：避免看板与宽表同时初始化抢主线程 */
const dashboardMounted = ref(true);
const tableMounted = ref(false);

// ─── Checkbox state ────────────────────────────────────────────────────────────

/**
 * shallowRef 避免对 id 数组做深度响应追踪，防止每次勾选触发整树重绘。
 * 参考 data-just-sku 同款实现。
 */
const checkedIds = shallowRef<number[]>([]);
const checkedCount = computed(() => checkedIds.value.length);

function sameIdList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const sa = [...a].toSorted((x, y) => x - y);
  const sb = [...b].toSorted((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/**
 * 仅当选中集合真正发生变化时才更新，防止 Vxe 内部 checkboxAll/checkboxChange
 * 因为引用变化反复触发 v-memo 重算。
 */
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
  await confirm($t('ui.actionMessage.deleteBatchConfirm'));
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

async function handleExport() {
  const data = await exportEcShopDaily(await gridApi.formApi.getValues());
  downloadFileFromBlobPart({ fileName: '店铺日汇总.xls', source: data });
}

function handleTaobaoImport() {
  taobaoImportModalApi.open();
}

function handleJdImport() {
  jdImportModalApi.open();
}

// ─── Toolbar menu click handlers ───────────────────────────────────────────────

function handleImportMenuClick({ key }: { key: number | string }) {
  if (key === 'taobao') handleTaobaoImport();
  else if (key === 'jd') handleJdImport();
}

async function handleMoreMenuClick({ key }: { key: number | string }) {
  if (key === 'export') await handleExport();
  else if (key === 'delete-batch') await handleDeleteBatch();
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    /** 关闭行源快照：勾选/刷新时 Vxe 无需维护全量 original 数据 */
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getEcShopDailyPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});

/** 表格显示后仅让 Vxe 重算布局，不触发全局 resize（避免隐藏中的 ECharts 连锁重绘） */
async function refreshTableLayoutOnly() {
  await nextTick();
  await nextTick();
  const $grid = (
    gridApi as { grid?: { recalculate?: (refull?: boolean) => void } }
  ).grid;
  $grid?.recalculate?.(true);
}

watch(activeTab, async (key) => {
  if (key !== 'table') return;
  tableMounted.value = true;
  await refreshTableLayoutOnly();
});

function handleRefresh() {
  if (tableMounted.value) gridApi.query();
  if (activeTab.value === 'dashboard' && dashboardRef.value) {
    void dashboardRef.value.reload?.();
  }
}

function getGridFormValuesForDashboard() {
  if (!tableMounted.value) return Promise.resolve({});
  return gridApi.formApi.getValues();
}
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="handleRefresh" />
    <TaobaoImportModalComp @success="handleRefresh" />
    <JdImportModalComp @success="handleRefresh" />

    <div class="ec-shop-daily-page flex min-h-0 flex-1 flex-col px-4 pb-4">
      <!-- 页头：标题 + 新增按钮 + 视图切换 -->
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            店铺后台日汇总管理
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            按店铺统计每日成交、退款、流量与营销投放数据
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button type="primary" @click="handleCreate"> 新增 </Button>
          <Segmented
            v-model:value="activeTab"
            :options="[...viewModeOptions]"
            class="ec-shop-daily-segmented"
          />
        </div>
      </header>

      <!-- 统计说明：默认收起，减少首屏占用（仅看板 tab 显示） -->
      <Collapse
        v-if="activeTab === 'dashboard'"
        ghost
        class="ec-shop-daily-notice mb-3 flex-shrink-0"
      >
        <Collapse.Panel key="stats-hint" header="统计说明（看板数据如何汇总）">
          <p class="mb-0 text-sm text-muted-foreground">
            看板按当前筛选条件分页拉取后，在前端按「统计日」合并（多店同日相加）。单次最多约
            8000 条；超出部分不计入图表，请缩小日期范围或由后端提供聚合接口。
          </p>
        </Collapse.Panel>
      </Collapse>

      <!-- 数据看板 -->
      <div
        v-if="dashboardMounted"
        v-show="activeTab === 'dashboard'"
        class="min-h-0 flex-1 overflow-auto"
      >
        <EcShopDailyDashboard
          ref="dashboardRef"
          :get-grid-form-values="getGridFormValuesForDashboard"
        />
      </div>

      <!-- 数据表格（懒挂载） -->
      <div
        v-if="tableMounted"
        v-show="activeTab === 'table'"
        class="ec-shop-daily-grid min-h-0 flex-1"
      >
        <Grid table-title="店铺日汇总">
          <template #toolbar-tools>
            <!--
              v-memo：只有选中集合真正发生变化时才重新渲染工具栏按钮，
              避免 Vxe 内部高频事件触发不必要的 TableAction 重建。
            -->
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
              <!-- 导入下拉 -->
              <Dropdown>
                <Button>导入</Button>
                <template #overlay>
                  <Menu @click="handleImportMenuClick">
                    <Menu.Item key="taobao">淘宝 Excel 导入</Menu.Item>
                    <Menu.Item key="jd">京东 Excel 导入</Menu.Item>
                  </Menu>
                </template>
              </Dropdown>
              <!-- 更多（导出 / 批量删除） -->
              <Dropdown>
                <Button>更多</Button>
                <template #overlay>
                  <Menu @click="handleMoreMenuClick">
                    <Menu.Item key="export">导出</Menu.Item>
                    <Menu.Item
                      key="delete-batch"
                      :disabled="checkedCount === 0"
                    >
                      <span :class="checkedCount > 0 ? 'text-red-500' : ''">
                        批量删除
                      </span>
                    </Menu.Item>
                  </Menu>
                </template>
              </Dropdown>
            </div>
          </template>

          <template #actions="{ row }">
            <!--
              v-memo="[row.id]"：行数据本身（尤其是 id）不变时跳过重渲。
              这是消除 isHover 触发 Popconfirm arrowContent 警告的关键：
              hover 状态变化不再导致每行 TableAction 重建。
            -->
            <div v-memo="[row.id]">
              <TableAction
                :actions="[
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
      </div>
    </div>
  </Page>
</template>

<style scoped>
.ec-shop-daily-page {
  min-height: 0;
}

.ec-shop-daily-segmented :deep(.ant-segmented) {
  background: hsl(var(--muted) / 45%);
}

.ec-shop-daily-notice :deep(.ant-collapse-header) {
  padding: 4px 0 !important;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.ec-shop-daily-notice :deep(.ant-collapse-content-box) {
  padding: 0 0 8px !important;
}

/* 与 data-just-sku 相同的表格容器布局策略 */
.ec-shop-daily-grid {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ec-shop-daily-grid :deep(.vben-vxe-grid) {
  flex: 1 1 0;
  min-height: 0;
}
</style>
