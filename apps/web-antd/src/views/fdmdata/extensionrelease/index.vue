<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExtensionReleaseApi } from '#/api/fdmdata/extensionrelease';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteExtensionRelease, getExtensionReleasePage } from '#/api/fdmdata/extensionrelease';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'FdmdataExtensionRelease' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataExtensionReleaseApi.ExtensionRelease) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataExtensionReleaseApi.ExtensionRelease) {
  if (!row.id) return;
  const hide = message.loading({ content: $t('ui.actionMessage.deleting', [row.id]), duration: 0 });
  try {
    await deleteExtensionRelease(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hide();
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
        query: async ({ page }, formValues) => getExtensionReleasePage({
          pageNo: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataExtensionReleaseApi.ExtensionRelease>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />
    <div class="flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2">
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">插件版本管理</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            发布新版本并控制 Chrome、Edge、灰度比例和强制更新。下载地址发布后会显示在插件弹窗中。
          </p>
        </div>
        <Button type="primary" @click="handleCreate">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增版本
        </Button>
      </header>
      <div class="min-h-[420px] flex-1 overflow-hidden">
        <Grid table-title="插件版本">
          <template #actions="{ row }">
            <TableAction :actions="[
              { label: $t('common.edit'), type: 'link', icon: ACTION_ICON.EDIT, auth: ['fdmdata:extension-release:update'], onClick: handleEdit.bind(null, row) },
              { label: $t('common.delete'), type: 'link', danger: true, icon: ACTION_ICON.DELETE, auth: ['fdmdata:extension-release:delete'], popConfirm: { title: $t('ui.actionMessage.deleteConfirm', [row.id]), confirm: handleDelete.bind(null, row) } },
            ]" />
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>
