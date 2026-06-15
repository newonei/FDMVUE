<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressReconPeriodApi } from '#/api/fdmdata/expressreconperiod';

import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message, Tag } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteExpressReconPeriod,
  getExpressReconPeriod,
  getExpressReconPeriodPage,
} from '#/api/fdmdata/expressreconperiod';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import ImportOrdersModal from './modules/import-orders-modal.vue';
import UnreconciledModal from './modules/unreconciled-modal.vue';

defineOptions({ name: 'FdmdataExpressReconPeriod' });

const router = useRouter();
const [ImportOrdersModalComp, importOrdersModalApi] = useVbenModal({
  connectedComponent: ImportOrdersModal,
});
const [UnreconciledModalComp, unreconciledModalApi] = useVbenModal({
  connectedComponent: UnreconciledModal,
});

const pollTimers = new Map<number, number>();

function handleImported(periodId?: number) {
  gridApi.query();
  if (periodId) {
    startPollImportPeriod(periodId);
  }
}

function startPollImportPeriod(periodId: number) {
  stopPollImportPeriod(periodId);
  const startedAt = Date.now();
  const timer = window.setInterval(async () => {
    try {
      const period = await getExpressReconPeriod(periodId);
      gridApi.query();
      if (period.status === 'READY') {
        stopPollImportPeriod(periodId);
        message.success(`订单导入完成：${period.periodNo}`);
        return;
      }
      if (period.status === 'FAILED') {
        stopPollImportPeriod(periodId);
        message.error(period.remark || `订单导入失败：${period.periodNo}`);
        return;
      }
      if (Date.now() - startedAt > 60 * 60 * 1000) {
        stopPollImportPeriod(periodId);
      }
    } catch {
      stopPollImportPeriod(periodId);
    }
  }, 3000);
  pollTimers.set(periodId, timer);
}

function stopPollImportPeriod(periodId: number) {
  const timer = pollTimers.get(periodId);
  if (!timer) return;
  window.clearInterval(timer);
  pollTimers.delete(periodId);
}

onBeforeUnmount(() => {
  pollTimers.forEach((timer) => window.clearInterval(timer));
  pollTimers.clear();
});

function handleReconcile(row: FdmdataExpressReconPeriodApi.ExpressReconPeriod) {
  if (!row.id) return;
  if (row.status !== 'READY') {
    message.warning('账期订单尚未导入完成，暂不能对账');
    return;
  }
  router.push({
    path: '/fdmdata/express-recon/batch',
    query: { periodId: row.id },
  });
}

function handleUnreconciled(row: FdmdataExpressReconPeriodApi.ExpressReconPeriod) {
  if (!row.id) return;
  unreconciledModalApi
    .setData({ periodId: row.id, periodName: row.periodName })
    .open();
}

async function handleDelete(row: FdmdataExpressReconPeriodApi.ExpressReconPeriod) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.periodName]),
    duration: 0,
  });
  try {
    await deleteExpressReconPeriod(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.periodName]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

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
          getExpressReconPeriodPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataExpressReconPeriodApi.ExpressReconPeriod>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <ImportOrdersModalComp @success="handleImported" />
    <UnreconciledModalComp />

    <div class="express-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">对账账期</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            整月订单导入一次形成账期，再在账期下分别上传多家快递公司的对账单进行对账。
          </p>
        </div>
        <Button type="primary" @click="importOrdersModalApi.open()">
          <template #icon>
            <IconifyIcon icon="lucide:upload" />
          </template>
          导入当月订单
        </Button>
      </header>

      <div class="express-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="express-vxe-wrapper"
          grid-class="express-vxe-grid"
          table-title="对账账期"
        >
          <template #colUnreconciled="{ row }">
            <Tag
              v-if="(row.unreconciledWaybillCount ?? 0) > 0"
              color="warning"
              class="cursor-pointer"
              @click="handleUnreconciled(row)"
            >
              {{ row.unreconciledWaybillCount }}
            </Tag>
            <span v-else>0</span>
          </template>
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '快递对账',
                  type: 'link',
                  icon: 'lucide:truck',
                  auth: ['fdmdata:express-recon-batch:reconcile'],
                  onClick: handleReconcile.bind(null, row),
                },
                {
                  label: '未对账运单',
                  type: 'link',
                  icon: 'lucide:file-warning',
                  auth: ['fdmdata:express-recon-period:query'],
                  onClick: handleUnreconciled.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:express-recon-period:delete'],
                  popConfirm: {
                    title: '删除账期会同时删除其下所有快递对账与订单池，确认删除？',
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
</style>
