<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { ref } from 'vue';

import { Page } from '@vben/common-ui';

import { message } from 'ant-design-vue';

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
      width: 280,
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

function handleImportClashVerge(row: FdmxuiClientApi.Client) {
  if (row.status === 2) return;

  const subscriptionUrl = row.clashSubscriptionUrl?.trim();
  if (!subscriptionUrl) {
    message.warning('暂无 Clash 订阅地址，请联系管理员刷新订阅链接');
    return;
  }

  try {
    const { protocol } = new URL(subscriptionUrl);
    if (protocol !== 'http:' && protocol !== 'https:') {
      message.warning('Clash 订阅地址必须是 HTTP 或 HTTPS 链接');
      return;
    }
  } catch {
    message.warning('Clash 订阅地址格式不正确，请联系管理员刷新订阅链接');
    return;
  }

  // 直接在点击事件中唤起客户端，避免异步请求导致浏览器丢失用户激活状态。
  window.location.assign(
    `clash-verge://install-config?url=${encodeURIComponent(subscriptionUrl)}`,
  );
  message.info(
    '已发起导入，请允许浏览器打开 Clash Verge；若未打开，可在订阅信息中复制 CLASH 链接手动导入',
    8,
  );
}

const [Grid] = useVbenVxeGrid({
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
  <Page auto-content-height>
    <LinkDetailModal v-model:open="linkDetailOpen" :client="linkDetailClient" />

    <div>
      <header
        class="flex flex-shrink-0 items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            我的3XUI订阅
          </h2>
          <p class="m-0 text-sm text-muted-foreground">
            安装 Clash Verge 后，点击“导入 Clash Verge”即可导入对应订阅配置。
          </p>
        </div>
      </header>

      <Grid table-title="我的3XUI订阅">
        <template #actions="{ row }">
          <TableAction
            :actions="[
              {
                label: '导入 Clash Verge',
                type: 'link',
                icon: 'lucide:download',
                disabled: row.status === 2,
                tooltip: row.status === 2 ? '已回收的订阅无法导入' : undefined,
                onClick: handleImportClashVerge.bind(null, row),
              },
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
  </Page>
</template>
