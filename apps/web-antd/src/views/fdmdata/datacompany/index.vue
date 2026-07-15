<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataDataCompanyApi } from '#/api/fdmdata/datacompany';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteDataCompany,
  getDataCompanyPage,
} from '#/api/fdmdata/datacompany';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'FdmdataDataCompany' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataDataCompanyApi.DataCompany) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataDataCompanyApi.DataCompany) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteDataCompany(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
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
          getDataCompanyPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataDataCompanyApi.DataCompany>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />

    <div class="company-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            公司主体管理
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            维护开票公司名称、税号、默认税率和开票资料，供店铺主体关联和电商发票筛选使用。
          </p>
        </div>
        <Button type="primary" @click="handleCreate">
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          新增公司
        </Button>
      </header>

      <div class="company-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="company-vxe-wrapper"
          grid-class="company-vxe-grid"
          table-title="公司主体"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmdata:data-company:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:data-company:delete'],
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
.company-page,
.company-grid {
  min-height: 0;
}

.company-page {
  height: 100%;
}

.company-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.company-grid :deep(.company-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.company-grid :deep(.company-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.company-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .company-grid {
    min-height: 520px;
  }
}
</style>
