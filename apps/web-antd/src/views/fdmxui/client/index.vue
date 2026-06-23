<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getFdmxuiClient,
  getFdmxuiClientPage,
  recycleFdmxuiClient,
  refreshFdmxuiClientLinks,
} from '#/api/fdmxui/client';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';
import LinkDetailModal from './modules/link-detail-modal.vue';

defineOptions({ name: 'FdmxuiClient' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });
const linkDetailOpen = ref(false);
const linkDetailClient = ref<FdmxuiClientApi.Client>();

function handleCreate() {
  formModalApi.setData(null).open();
}

async function handleRefreshLinks(row: FdmxuiClientApi.Client) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: '正在刷新订阅链接',
    duration: 0,
  });
  try {
    await refreshFdmxuiClientLinks(row.id);
    message.success('订阅链接刷新成功');
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleShowLinks(row: FdmxuiClientApi.Client) {
  if (!row.id) return;
  linkDetailClient.value = await getFdmxuiClient(row.id);
  linkDetailOpen.value = true;
}

async function handleRecycle(row: FdmxuiClientApi.Client) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: '正在回收3XUI客户端',
    duration: 0,
  });
  try {
    await recycleFdmxuiClient(row.id);
    message.success('3XUI客户端已回收');
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
          getFdmxuiClientPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmxuiClientApi.Client>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />
    <LinkDetailModal v-model:open="linkDetailOpen" :client="linkDetailClient" />

    <div class="fdmxui-client-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">3XUI客户端</h2>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="primary" @click="handleCreate">
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增客户端
          </Button>
        </div>
      </header>

      <div class="fdmxui-client-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="fdmxui-client-vxe-wrapper"
          grid-class="fdmxui-client-vxe-grid"
          table-title="3XUI客户端"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '协议链接',
                  type: 'link',
                  icon: 'lucide:qr-code',
                  auth: ['fdmxui:client:query'],
                  onClick: handleShowLinks.bind(null, row),
                },
                {
                  label: '刷新',
                  type: 'link',
                  icon: 'lucide:refresh-cw',
                  auth: ['fdmxui:client:refresh-links'],
                  disabled: row.status === 2,
                  onClick: handleRefreshLinks.bind(null, row),
                },
                {
                  label: '回收',
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmxui:client:recycle'],
                  disabled: row.status === 2,
                  popConfirm: {
                    title: `确认回收客户端 ${row.xuiEmail || row.id}？`,
                    confirm: handleRecycle.bind(null, row),
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
.fdmxui-client-page,
.fdmxui-client-grid {
  min-height: 0;
}

.fdmxui-client-page {
  height: 100%;
}

.fdmxui-client-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.fdmxui-client-grid :deep(.fdmxui-client-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.fdmxui-client-grid :deep(.fdmxui-client-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.fdmxui-client-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .fdmxui-client-grid {
    min-height: 520px;
  }
}
</style>
