<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcInvoiceApply,
  exportEcInvoiceApplyExcel,
  getEcInvoiceApplyPage,
} from '#/api/fdmdata/ecinvoiceapply';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'EcInvoiceApply' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteEcInvoiceApply(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleExport() {
  const formValues = await gridApi.formApi.getValues();
  const data = await exportEcInvoiceApplyExcel(formValues);
  downloadFileFromBlobPart({
    fileName: '电商发票申请.xls',
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
          getEcInvoiceApplyPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataEcInvoiceApplyApi.EcInvoiceApply>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />

    <div class="invoice-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            电商发票申请
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            管理电商平台发票申请、开票状态和付款方开票信息。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button @click="handleExport">
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            导出
          </Button>
          <Button type="primary" @click="handleCreate">
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增
          </Button>
        </div>
      </header>

      <div class="invoice-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="invoice-vxe-wrapper"
          grid-class="invoice-vxe-grid"
          table-title="电商发票申请"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmdata:ecinvoiceapply:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:ecinvoiceapply:delete'],
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
.invoice-page,
.invoice-grid {
  min-height: 0;
}

.invoice-page {
  height: 100%;
}

.invoice-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.invoice-grid :deep(.invoice-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.invoice-grid :deep(.invoice-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.invoice-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .invoice-grid {
    min-height: 520px;
  }
}
</style>
