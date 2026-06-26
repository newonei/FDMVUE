<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressReconDetailApi } from '#/api/fdmdata/expressrecondetail';

import { useRoute } from 'vue-router';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, Tag } from 'ant-design-vue';

import { TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  exportExpressReconDetailExcel,
  getExpressReconDetailPage,
} from '#/api/fdmdata/expressrecondetail';

import { useGridColumns, useGridFormSchema } from './data';
import OrderItemsModal from './modules/order-items-modal.vue';

defineOptions({ name: 'FdmdataExpressReconDetail' });

const route = useRoute();
const [OrderItemsModalComp, orderItemsModalApi] = useVbenModal({
  connectedComponent: OrderItemsModal,
});

function getRouteBatchId() {
  const raw = route.query.batchId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function handleOpenOrderItems(row: FdmdataExpressReconDetailApi.ExpressReconDetail) {
  const batchId = row.batchId ?? getRouteBatchId();
  if (!batchId || !row.waybillNo) return;
  orderItemsModalApi
    .setData({
      batchId,
      waybillNo: row.waybillNo,
    })
    .open();
}

async function handleExport() {
  const formValues = await gridApi.formApi.getValues();
  const data = await exportExpressReconDetailExcel({
    ...formValues,
    batchId: formValues.batchId ?? getRouteBatchId(),
  });
  downloadFileFromBlobPart({
    fileName: '快递费对账明细.xls',
    source: data,
  });
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
          getExpressReconDetailPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            batchId: formValues.batchId ?? getRouteBatchId(),
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    rowClassName: ({ row }) => {
      if (row.duplicateBilled === 1) return 'express-row-duplicate';
      if (row.weightWarning === 1) return 'express-row-weight-warning';
      return '';
    },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataExpressReconDetailApi.ExpressReconDetail>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <OrderItemsModalComp />

    <div class="express-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            快递费对账明细
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            按运单号查看订单重量、账单重量、预估费用、实际费用和差额。
          </p>
        </div>
        <Button @click="handleExport">
          <template #icon>
            <IconifyIcon icon="lucide:download" />
          </template>
          导出明细
        </Button>
      </header>

      <div class="express-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="express-vxe-wrapper"
          grid-class="express-vxe-grid"
          table-title="对账明细"
        >
          <template #colOrderItems="{ row }">
            <TableAction
              :actions="[
                {
                  label: '查看',
                  type: 'link',
                  auth: ['fdmdata:express-recon-detail:query'],
                  onClick: () => handleOpenOrderItems(row),
                },
              ]"
            />
          </template>
          <template #colDuplicate="{ row }">
            <Tag v-if="row.duplicateBilled === 1" color="error">重复</Tag>
            <span v-else>-</span>
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

.express-grid :deep(.express-row-duplicate) {
  background-color: #fff1f0;
}

.express-grid :deep(.express-row-weight-warning) {
  background-color: #fff7e6;
}

@media (max-width: 768px) {
  .express-grid {
    min-height: 520px;
  }
}
</style>
