<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressReconBatchApi } from '#/api/fdmdata/expressreconbatch';

import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteExpressReconBatch,
  exportExpressReconBatchExcel,
  getExpressReconBatch,
  getExpressReconBatchPage,
  recalculateExpressReconBatch,
} from '#/api/fdmdata/expressreconbatch';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import ImportModal from './modules/import-modal.vue';

defineOptions({ name: 'FdmdataExpressReconBatch' });

const router = useRouter();
const [ImportModalComp, importModalApi] = useVbenModal({
  connectedComponent: ImportModal,
});

const pollTimers = new Map<number, number>();

async function handleDelete(row: FdmdataExpressReconBatchApi.ExpressReconBatch) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteExpressReconBatch(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleRecalculate(
  row: FdmdataExpressReconBatchApi.ExpressReconBatch,
) {
  if (!row.id) return;
  const hideLoading = message.loading({ content: '正在重新计算...', duration: 0 });
  try {
    const res = await recalculateExpressReconBatch(row.id);
    message.success(
      `重算完成：总运单 ${res.totalWaybillCount}，差额 ${Number(
        res.diffAmount ?? 0,
      ).toFixed(2)}`,
    );
    gridApi.query();
  } finally {
    hideLoading();
  }
}

function handleViewDetail(row: FdmdataExpressReconBatchApi.ExpressReconBatch) {
  if (!row.id) return;
  router.push({
    path: '/fdmdata/express-recon/detail',
    query: { batchId: row.id },
  });
}

async function handleExport() {
  const formValues = await gridApi.formApi.getValues();
  const data = await exportExpressReconBatchExcel(formValues);
  downloadFileFromBlobPart({
    fileName: '快递费对账批次.xls',
    source: data,
  });
}

function handleImportSubmitted(batchId?: number) {
  gridApi.query();
  if (batchId) {
    startPollImportBatch(batchId);
  }
}

function startPollImportBatch(batchId: number) {
  stopPollImportBatch(batchId);
  const startedAt = Date.now();
  const timer = window.setInterval(async () => {
    try {
      const batch = await getExpressReconBatch(batchId);
      gridApi.query();

      if (batch.status === 'RECONCILED') {
        stopPollImportBatch(batchId);
        message.success(`导入对账完成：${batch.batchNo}`);
        return;
      }

      if (batch.status === 'FAILED') {
        stopPollImportBatch(batchId);
        message.error(batch.remark || `导入对账失败：${batch.batchNo}`);
        return;
      }

      if (Date.now() - startedAt > 60 * 60 * 1000) {
        stopPollImportBatch(batchId);
        message.warning(`导入仍在后台处理：${batch.batchNo}`);
      }
    } catch {
      stopPollImportBatch(batchId);
      message.error('导入状态查询失败，请刷新批次列表查看结果');
    }
  }, 3000);
  pollTimers.set(batchId, timer);
}

function stopPollImportBatch(batchId: number) {
  const timer = pollTimers.get(batchId);
  if (!timer) {
    return;
  }
  window.clearInterval(timer);
  pollTimers.delete(batchId);
}

onBeforeUnmount(() => {
  pollTimers.forEach((timer) => window.clearInterval(timer));
  pollTimers.clear();
});

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: '100%',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getExpressReconBatchPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataExpressReconBatchApi.ExpressReconBatch>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <ImportModalComp @success="handleImportSubmitted" />

    <div class="express-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            快递费对账批次
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            导入订单明细和快递账单，按运单号汇总重量并计算预估费用。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button @click="handleExport">
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            导出批次
          </Button>
          <Button type="primary" @click="importModalApi.open()">
            <template #icon>
              <IconifyIcon icon="lucide:upload" />
            </template>
            导入并对账
          </Button>
        </div>
      </header>

      <div class="express-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="express-vxe-wrapper"
          grid-class="express-vxe-grid"
          table-title="对账批次"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '明细',
                  type: 'link',
                  icon: 'lucide:list-checks',
                  auth: ['fdmdata:express-recon-detail:query'],
                  onClick: handleViewDetail.bind(null, row),
                },
                {
                  label: '重算',
                  type: 'link',
                  icon: 'lucide:refresh-cw',
                  auth: ['fdmdata:express-recon-batch:create'],
                  popConfirm: {
                    title: '确认按当前计费规则重新计算该批次？',
                    confirm: handleRecalculate.bind(null, row),
                  },
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:express-recon-batch:delete'],
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
.express-page,
.express-grid {
  min-height: 0;
}

.express-page {
  height: 100%;
}

.express-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.express-grid :deep(.express-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.express-grid :deep(.express-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.express-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .express-grid {
    min-height: 520px;
  }
}
</style>
