<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiPanelApi } from '#/api/fdmxui/panel';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  checkFdmxuiPanelConnection,
  deleteFdmxuiPanel,
  exportFdmxuiPanelExcel,
  getFdmxuiPanelPage,
} from '#/api/fdmxui/panel';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'FdmxuiPanel' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmxuiPanelApi.Panel) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: FdmxuiPanelApi.Panel) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteFdmxuiPanel(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleCheckConnection(row: FdmxuiPanelApi.Panel) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: `正在检测 ${row.panelName || row.id} 的连接`,
    duration: 0,
  });
  try {
    await checkFdmxuiPanelConnection(row.id);
    message.success('连接检测成功');
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleExport() {
  const formValues = await gridApi.formApi.getValues();
  const data = await exportFdmxuiPanelExcel(formValues);
  downloadFileFromBlobPart({
    fileName: '3XUI面板.xls',
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
          getFdmxuiPanelPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmxuiPanelApi.Panel>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />

    <div class="fdmxui-panel-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">3XUI面板</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            维护多个自建3XUI面板的地址、API令牌、订阅地址和连接状态。
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
            新增面板
          </Button>
        </div>
      </header>

      <div class="fdmxui-panel-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="fdmxui-panel-vxe-wrapper"
          grid-class="fdmxui-panel-vxe-grid"
          table-title="3XUI面板"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '检测连接',
                  type: 'link',
                  icon: 'lucide:refresh-cw',
                  auth: ['fdmxui:panel:update'],
                  onClick: handleCheckConnection.bind(null, row),
                },
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmxui:panel:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmxui:panel:delete'],
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
.fdmxui-panel-page,
.fdmxui-panel-grid {
  min-height: 0;
}

.fdmxui-panel-page {
  height: 100%;
}

.fdmxui-panel-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.fdmxui-panel-grid :deep(.fdmxui-panel-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.fdmxui-panel-grid :deep(.fdmxui-panel-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.fdmxui-panel-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .fdmxui-panel-grid {
    min-height: 520px;
  }
}
</style>
