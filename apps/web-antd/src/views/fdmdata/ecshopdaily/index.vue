<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { nextTick, ref, watch } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart, isEmpty } from '@vben/utils';

import { Collapse, message, Segmented } from 'ant-design-vue';

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

// destroyOnClose 已移除：
// 每次销毁再重建会导致新实例的 onOpenChange(true) 在 getData() 同步前触发，
// 出现空表单 + 自动弹出锁定弹窗的连锁 bug。
// 表单值通过 onOpenChange 中的 setValues 手动重置，不依赖组件销毁。
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

function handleTaobaoImport() {
  taobaoImportModalApi.open();
}

function handleJdImport() {
  jdImportModalApi.open();
}

const dashboardRef = ref<InstanceType<typeof EcShopDailyDashboard> | null>(
  null,
);

const viewModeOptions = [
  { label: '数据看板', value: 'dashboard' },
  { label: '数据表格', value: 'table' },
] as const;

/** 默认打开「数据看板」 */
const activeTab = ref<'dashboard' | 'table'>('dashboard');

/** 懒挂载：避免看板与宽表同时初始化抢主线程 */
const dashboardMounted = ref(true);
const tableMounted = ref(false);

/** 创建店铺日汇总 */
function handleCreate() {
  formModalApi.setData(null).open();
}

/** 编辑店铺日汇总 */
function handleEdit(row: FdmdataEcShopDailyApi.EcShopDaily) {
  formModalApi.setData(row).open();
}

/** 删除店铺日汇总 */
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

/** 批量删除店铺日汇总 */
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

const checkedIds = ref<number[]>([]);
function handleRowCheckboxChange({
  records,
}: {
  records: FdmdataEcShopDailyApi.EcShopDaily[];
}) {
  checkedIds.value = records.map((item) => item.id!);
}

/** 导出表格 */
async function handleExport() {
  const data = await exportEcShopDaily(await gridApi.formApi.getValues());
  downloadFileFromBlobPart({ fileName: '店铺日汇总.xls', source: data });
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    /** 列表只读展示+弹窗编辑，关闭行快照以减轻 Vxe 勾选/刷新开销 */
    keepSource: false,
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
  if (key !== 'table') {
    return;
  }
  tableMounted.value = true;
  await refreshTableLayoutOnly();
});

function handleRefresh() {
  if (tableMounted.value) {
    gridApi.query();
  }
  if (activeTab.value === 'dashboard' && dashboardRef.value) {
    void dashboardRef.value.reload?.();
  }
}

function getGridFormValuesForDashboard() {
  if (!tableMounted.value) {
    return Promise.resolve({});
  }
  return gridApi.formApi.getValues();
}
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="handleRefresh" />
    <TaobaoImportModalComp @success="handleRefresh" />
    <JdImportModalComp @success="handleRefresh" />

    <div class="ec-shop-daily-page flex min-h-0 flex-1 flex-col px-4 pb-4">
      <!-- 页头：标题 + 内容模式切换（与系统多页签区分） -->
      <header
        class="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 py-3"
      >
        <h2 class="mb-0 text-lg font-semibold text-foreground">
          店铺后台日汇总管理
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <TableAction
            :actions="[
              {
                label: $t('ui.actionTitle.create', ['店铺日汇总']),
                type: 'primary',
                icon: ACTION_ICON.ADD,
                auth: ['fdmdata:ec-shop-daily:create'],
                onClick: handleCreate,
              },
            ]"
          />
          <Segmented
            v-model:value="activeTab"
            :options="[...viewModeOptions]"
            class="ec-shop-daily-segmented"
          />
        </div>
      </header>

      <!-- 统计说明：默认收起，减少首屏占用 -->
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

      <div
        v-if="tableMounted"
        v-show="activeTab === 'table'"
        class="ec-shop-daily-grid min-h-0 flex-1 overflow-hidden"
      >
        <Grid class="h-full min-h-0 flex-1" table-title="店铺日汇总">
          <template #toolbar-tools>
            <TableAction
              :actions="[
                {
                  label: $t('ui.actionTitle.create', ['店铺日汇总']),
                  type: 'primary',
                  icon: ACTION_ICON.ADD,
                  auth: ['fdmdata:ec-shop-daily:create'],
                  onClick: handleCreate,
                },
                {
                  label: '淘宝 Excel 导入',
                  type: 'default',
                  icon: 'lucide:upload',
                  auth: ['fdmdata:ec-shop-daily:create'],
                  onClick: handleTaobaoImport,
                },
                {
                  label: '京东 Excel 导入',
                  type: 'default',
                  icon: 'lucide:upload',
                  auth: ['fdmdata:ec-shop-daily:create'],
                  onClick: handleJdImport,
                },
                {
                  label: $t('ui.actionTitle.export'),
                  type: 'default',
                  icon: ACTION_ICON.DOWNLOAD,
                  auth: ['fdmdata:ec-shop-daily:export'],
                  onClick: handleExport,
                },
                {
                  label: $t('ui.actionTitle.deleteBatch'),
                  type: 'primary',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:ec-shop-daily:delete'],
                  disabled: isEmpty(checkedIds),
                  onClick: handleDeleteBatch,
                },
              ]"
            />
          </template>
          <template #actions="{ row }">
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
  background: hsl(var(--muted) / 50%);
}

.ec-shop-daily-notice :deep(.ant-collapse-header) {
  padding: 4px 0 !important;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.ec-shop-daily-notice :deep(.ant-collapse-content-box) {
  padding: 0 0 8px !important;
}

.ec-shop-daily-grid {
  display: flex;
  flex-direction: column;
}

.ec-shop-daily-grid :deep(.vben-vxe-grid) {
  flex: 1 1 0;
  min-height: 0;
}
</style>
