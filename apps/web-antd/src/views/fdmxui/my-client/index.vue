<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { ref } from 'vue';

import { Page } from '@vben/common-ui';

import { TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getMyFdmxuiClientLinks,
  getMyFdmxuiClientPage,
} from '#/api/fdmxui/client';
import { getSimpleFdmxuiPanelList } from '#/api/fdmxui/panel';
import { getRangePickerDefaultProps } from '#/utils';

import LinkDetailModal from '../client/modules/link-detail-modal.vue';

defineOptions({ name: 'FdmxuiMyClient' });

const linkDetailOpen = ref(false);
const linkDetailClient = ref<FdmxuiClientApi.Client>();

const CLIENT_STATUS_OPTIONS = [
  { label: '正常', value: 1 },
  { label: '已回收', value: 2 },
  { label: '异常', value: 3 },
];

function formatStatus({ cellValue }: { cellValue: unknown }) {
  return (
    CLIENT_STATUS_OPTIONS.find((item) => item.value === cellValue)?.label ??
    '未知'
  );
}

function formatQuota({ cellValue }: { cellValue: unknown }) {
  const value = Number(cellValue || 0);
  return value > 0 ? `${value} GB` : '不限';
}

function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'panelId',
      label: '面板',
      component: 'ApiSelect',
      componentProps: {
        api: getSimpleFdmxuiPanelList,
        labelField: 'panelName',
        valueField: 'id',
        allowClear: true,
        placeholder: '请选择面板',
      },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: CLIENT_STATUS_OPTIONS,
      },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

function useGridColumns(): VxeTableGridOptions<FdmxuiClientApi.Client>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'panelName',
      title: '面板',
      minWidth: 150,
      showOverflow: 'tooltip',
    },
    {
      field: 'inboundNames',
      title: '节点',
      minWidth: 220,
      showOverflow: 'tooltip',
    },
    {
      field: 'xuiEmail',
      title: '客户端标识',
      minWidth: 200,
      showOverflow: 'tooltip',
    },
    {
      field: 'totalGb',
      title: '流量限制',
      minWidth: 100,
      formatter: formatQuota,
    },
    {
      field: 'expireTime',
      title: '过期时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'status',
      title: '状态',
      minWidth: 90,
      formatter: formatStatus,
    },
    {
      field: 'subscriptionUrl',
      title: 'SUB',
      minWidth: 260,
      showOverflow: 'tooltip',
    },
    {
      field: 'lastSyncTime',
      title: '最后同步时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'lastSyncError',
      title: '最后错误',
      minWidth: 220,
      showOverflow: 'tooltip',
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}

async function handleShowLinks(row: FdmxuiClientApi.Client) {
  if (!row.id) return;
  linkDetailClient.value = await getMyFdmxuiClientLinks(row.id);
  linkDetailOpen.value = true;
}

const [Grid] = useVbenVxeGrid({
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
          getMyFdmxuiClientPage({
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
    <LinkDetailModal v-model:open="linkDetailOpen" :client="linkDetailClient" />

    <div
      class="fdmxui-my-client-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4"
    >
      <header
        class="flex flex-shrink-0 items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            我的3XUI订阅
          </h2>
        </div>
      </header>

      <div class="fdmxui-my-client-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="fdmxui-my-client-vxe-wrapper"
          grid-class="fdmxui-my-client-vxe-grid"
          table-title="我的3XUI订阅"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '订阅信息',
                  type: 'link',
                  icon: 'lucide:qr-code',
                  onClick: handleShowLinks.bind(null, row),
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
.fdmxui-my-client-page,
.fdmxui-my-client-grid {
  min-height: 0;
}

.fdmxui-my-client-page {
  height: 100%;
}

.fdmxui-my-client-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.fdmxui-my-client-grid :deep(.fdmxui-my-client-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.fdmxui-my-client-grid :deep(.fdmxui-my-client-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.fdmxui-my-client-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .fdmxui-my-client-grid {
    min-height: 520px;
  }
}
</style>
