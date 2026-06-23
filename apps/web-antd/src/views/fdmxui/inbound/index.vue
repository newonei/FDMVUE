<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiInboundApi } from '#/api/fdmxui/inbound';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getFdmxuiInboundPage,
  syncFdmxuiInbound,
} from '#/api/fdmxui/inbound';

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
          getFdmxuiInboundPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmxuiInboundApi.Inbound>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <div class="fdmxui-inbound-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
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
        </div>
      </header>

      <div class="fdmxui-inbound-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="fdmxui-inbound-vxe-wrapper"
          grid-class="fdmxui-inbound-vxe-grid"
          table-title="3XUI节点"
        />
      </div>
    </div>
  </Page>
</template>

<style scoped>
.fdmxui-inbound-page,
.fdmxui-inbound-grid {
  min-height: 0;
}

.fdmxui-inbound-page {
  height: 100%;
}

.fdmxui-inbound-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.fdmxui-inbound-grid :deep(.fdmxui-inbound-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.fdmxui-inbound-grid :deep(.fdmxui-inbound-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.fdmxui-inbound-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .fdmxui-inbound-grid {
    min-height: 520px;
  }
}
</style>
