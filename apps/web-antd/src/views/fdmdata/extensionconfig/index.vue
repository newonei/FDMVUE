<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExtensionConfigApi } from '#/api/fdmdata/extensionconfig';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteExtensionConfig, getExtensionConfigPage } from '#/api/fdmdata/extensionconfig';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'FdmdataExtensionConfig' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataExtensionConfigApi.ExtensionConfig) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataExtensionConfigApi.ExtensionConfig) {
  if (!row.id) return;
  const hide = message.loading({ content: $t('ui.actionMessage.deleting', [row.id]), duration: 0 });
  try {
    await deleteExtensionConfig(row.id);
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
        query: async ({ page }, formValues) => getExtensionConfigPage({
          pageNo: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataExtensionConfigApi.ExtensionConfig>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />
    <div class="flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2">
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">插件云配置</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            配置会被插件定时缓存，只允许保存非敏感 JSON 数据，不能包含可执行脚本、Token 或密码。
          </p>
        </div>
        <Button type="primary" @click="handleCreate">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增配置
        </Button>
      </header>
      <div class="min-h-[420px] flex-1 overflow-hidden">
        <Grid table-title="插件云配置">
          <template #actions="{ row }">
            <TableAction :actions="[
              { label: $t('common.edit'), type: 'link', icon: ACTION_ICON.EDIT, auth: ['fdmdata:extension-config:update'], onClick: handleEdit.bind(null, row) },
              { label: $t('common.delete'), type: 'link', danger: true, icon: ACTION_ICON.DELETE, auth: ['fdmdata:extension-config:delete'], popConfirm: { title: $t('ui.actionMessage.deleteConfirm', [row.id]), confirm: handleDelete.bind(null, row) } },
            ]" />
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>
