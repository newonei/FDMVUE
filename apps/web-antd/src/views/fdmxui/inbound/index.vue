<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiInboundApi } from '#/api/fdmxui/inbound';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { cleanupFdmxuiInbound, deleteFdmxuiInbound, getFdmxuiInboundPage, syncFdmxuiInbound } from '#/api/fdmxui/inbound';

import { useGridColumns, useGridFormSchema } from './data';

defineOptions({ name: 'FdmxuiInbound' });

async function handleSync() {
  const formValues = await gridApi.formApi.getValues();
  const panelId = Number(formValues.panelId);
  if (!panelId) {
    message.warning('请先在搜索条件中选择面板');
    return;
  }
  const hideLoading = message.loading({
    content: '正在同步3XUI节点',
    duration: 0,
  });
  try {
    const count = await syncFdmxuiInbound(panelId);
    message.success(`同步完成，共返回 ${count} 个节点`);
    gridApi.query();
  } finally {
    hideLoading();
  }
}
async function handleCleanup() {
  const formValues = await gridApi.formApi.getValues();
  const panelId = Number(formValues.panelId);
  if (!panelId) { message.warning('请先在搜索条件中选择面板'); return; }
  const count = await cleanupFdmxuiInbound(panelId);
  message.success(`已清理 ${count} 个失效节点`);
  gridApi.query();
}
async function handleDelete(row: FdmxuiInboundApi.Inbound) {
  if (!row.id) return;
  await deleteFdmxuiInbound(row.id);
  message.success('节点已删除');
  await gridApi.query();
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: '600px',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getFdmxuiInboundPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            available: formValues.available ?? true,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmxuiInboundApi.Inbound>,
});
</script>

<template>
  <Page auto-content-height>
    <div>
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">3XUI节点</h2>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="primary" @click="handleSync">
            <template #icon>
              <IconifyIcon icon="lucide:refresh-cw" />
            </template>
            同步节点
          </Button>
          <Button @click="handleCleanup">清理失效节点</Button>
        </div>
      </header>

      <Grid table-title="3XUI节点">
        <template #actions="{ row }">
          <TableAction
            :actions="[
              {
                label: '删除',
                type: 'link',
                danger: true,
                icon: ACTION_ICON.DELETE,
                auth: ['fdmxui:inbound:delete'],
                popConfirm: {
                  title: `确认删除节点 ${row.remark || row.tag || row.xuiInboundId || row.id}？`,
                  confirm: handleDelete.bind(null, row),
                },
              },
            ]"
          />
        </template>
      </Grid>
    </div>
  </Page>
</template>
