<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { computed, onBeforeUnmount, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { useClipboard } from '@vueuse/core';
import { Alert, Button, message, Modal, Select, Spin } from 'ant-design-vue';

import { TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getMyFdmxuiClientLinks,
  getMyFdmxuiClientPage,
  prepareMyClashImport,
  getFdmxuiSelfOptions,
  selfAssignFdmxuiClient,
} from '#/api/fdmxui/client';
import { getSimpleFdmxuiPanelList } from '#/api/fdmxui/panel';
import { getRangePickerDefaultProps } from '#/utils';

import LinkDetailModal from '../client/modules/link-detail-modal.vue';

defineOptions({ name: 'FdmxuiMyClient' });

const linkDetailOpen = ref(false);
const linkDetailClient = ref<FdmxuiClientApi.Client>();
const clashImportOpen = ref(false);
const clashImportLoading = ref(false);
const clashImportError = ref('');
const clashImportClient = ref<FdmxuiClientApi.Client>();
const clashImportRow = ref<FdmxuiClientApi.Client>();
const clashImportAttempted = ref(false);
const { copy } = useClipboard({ legacy: true });
let clashImportSequence = 0;
const selfAssignOpen = ref(false);
const selfAssignLoading = ref(false);
const selfOptions = ref<FdmxuiClientApi.SelfOption[]>([]);
const selfPanelId = ref<number>();
const selfInboundIds = ref<number[]>([]);
const selfInbounds = computed(() => selfOptions.value.find((x) => x.panelId === selfPanelId.value)?.inbounds || []);
let refreshMyGrid: () => Promise<void> = async () => {};

async function openSelfAssign() {
  selfPanelId.value = undefined;
  selfInboundIds.value = [];
  selfOptions.value = [];
  selfAssignOpen.value = true; selfAssignLoading.value = true;
  try { selfOptions.value = await getFdmxuiSelfOptions(); }
  finally { selfAssignLoading.value = false; }
}
async function submitSelfAssign() {
  if (!selfPanelId.value || selfInboundIds.value.length === 0) { message.warning('请选择面板和节点'); return; }
  selfAssignLoading.value = true;
  try { const client = await selfAssignFdmxuiClient({ panelId: selfPanelId.value, inboundIds: selfInboundIds.value }); message.success('订阅已生效'); selfAssignOpen.value = false; await refreshMyGrid(); if (client?.lastSyncError) message.warning(client.lastSyncError); }
  finally { selfAssignLoading.value = false; }
}

const clashImportUrl = computed(() => {
  const url = clashImportClient.value?.clashSubscriptionUrl;
  return url
    ? `clash://install-config?url=${encodeURIComponent(url)}`
    : undefined;
});

const CLIENT_STATUS_OPTIONS = [
  { label: '正常', value: 1 },
  { label: '已回收', value: 2 },
  { label: '异常', value: 3 },
  { label: '已替换', value: 4 },
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
  Object.assign(row, linkDetailClient.value);
  linkDetailOpen.value = true;
}

async function handleImportClashVerge(row: FdmxuiClientApi.Client) {
  if (!row.id || row.status === 2 || clashImportLoading.value) return;

  const sequence = ++clashImportSequence;
  clashImportRow.value = row;
  clashImportClient.value = undefined;
  clashImportError.value = '';
  clashImportAttempted.value = false;
  clashImportLoading.value = true;
  clashImportOpen.value = true;

  try {
    const client = await prepareMyClashImport(row.id);
    if (sequence !== clashImportSequence) return;

    const subscriptionUrl = client.clashSubscriptionUrl?.trim();
    if (!subscriptionUrl) {
      throw new Error('暂无 Clash 订阅地址，请联系管理员检查面板配置');
    }
    const { protocol } = new URL(subscriptionUrl);
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error('Clash 订阅地址必须是 HTTP 或 HTTPS 链接');
    }
    clashImportClient.value = { ...client, clashSubscriptionUrl: subscriptionUrl };
    Object.assign(row, client);

    // 检查耗时较长时，保留原生链接按钮，让用户重新点击以唤起客户端。
    if (navigator.userActivation?.isActive && clashImportUrl.value) {
      window.location.assign(clashImportUrl.value);
      clashImportAttempted.value = true;
    }
  } catch (error) {
    if (sequence !== clashImportSequence) return;
    const detail = error as {
      message?: string;
      msg?: string;
      response?: { data?: { msg?: string } };
    } | null;
    clashImportError.value =
      detail?.response?.data?.msg ||
      detail?.msg ||
      detail?.message ||
      '订阅检查失败，请稍后重试或联系管理员';
  } finally {
    if (sequence === clashImportSequence) clashImportLoading.value = false;
  }
}

function closeClashImport() {
  ++clashImportSequence;
  clashImportOpen.value = false;
  clashImportLoading.value = false;
}

onBeforeUnmount(closeClashImport);

async function copyClashSubscription() {
  const url = clashImportClient.value?.clashSubscriptionUrl;
  if (!url) return;
  try {
    await copy(url);
    message.success('Clash 订阅地址已复制');
  } catch {
    message.error('复制失败，请在订阅信息中手动复制 CLASH 链接');
  }
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
refreshMyGrid = async () => { await gridApi.query(); };
</script>

<template>
  <Page auto-content-height>
    <LinkDetailModal v-model:open="linkDetailOpen" :client="linkDetailClient" />
    <Modal v-model:open="selfAssignOpen" title="领取 / 切换 3XUI 订阅" :confirm-loading="selfAssignLoading" @ok="submitSelfAssign">
      <Spin :spinning="selfAssignLoading">
        <div class="space-y-4 py-2">
          <div><div class="mb-1 text-sm">面板</div><Select v-model:value="selfPanelId" class="w-full" placeholder="请选择面板" @change="() => (selfInboundIds = [])"><Select.Option v-for="item in selfOptions" :key="item.panelId" :value="item.panelId">{{ item.panelName }}</Select.Option></Select></div>
          <div><div class="mb-1 text-sm">节点</div><Select v-model:value="selfInboundIds" mode="multiple" class="w-full" :disabled="!selfPanelId" placeholder="请选择节点"><Select.Option v-for="item in selfInbounds" :key="item.id" :value="item.id">{{ item.remark || item.tag || item.id }} / {{ item.protocol || '-' }}:{{ item.port || '-' }}</Select.Option></Select></div>
          <Alert type="info" message="流量、IP 限制和过期时间使用系统默认策略" show-icon />
        </div>
      </Spin>
    </Modal>
    <Modal
      :open="clashImportOpen"
      title="导入 Clash Verge"
      @cancel="closeClashImport"
    >
      <div v-if="clashImportLoading" class="flex items-center gap-3 py-6">
        <Spin />
        <span>正在获取最新订阅并检查配置，请稍候…</span>
      </div>
      <Alert
        v-else-if="clashImportError"
        type="error"
        message="订阅检查失败，尚未导入"
        :description="clashImportError"
        show-icon
      />
      <div v-else-if="clashImportClient" class="space-y-3">
        <Alert
          type="info"
          :message="
            clashImportAttempted
              ? '已请求打开客户端，请在 Clash Verge 中确认导入结果'
              : '订阅检查通过，点击下方按钮打开 Clash Verge'
          "
          show-icon
        />
        <p class="m-0 text-sm text-muted-foreground">
          默认使用兼容模式导入，浏览器提示时请选择允许打开应用。若客户端未响应，可复制地址后在客户端导入。
        </p>
        <div class="flex flex-wrap gap-2">
          <Button @click="copyClashSubscription">复制订阅地址</Button>
        </div>
      </div>
      <template #footer>
        <Button @click="closeClashImport">关闭</Button>
        <Button
          v-if="clashImportError && clashImportRow"
          type="primary"
          @click="handleImportClashVerge(clashImportRow)"
        >
          重新检查
        </Button>
        <Button
          v-if="clashImportUrl && !clashImportLoading && !clashImportError"
          :href="clashImportUrl"
          type="primary"
          @click="clashImportAttempted = true"
        >
          打开 Clash Verge 并导入
        </Button>
      </template>
    </Modal>

    <div>
      <header
        class="flex flex-shrink-0 items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            我的3XUI订阅
          </h2>
          <p class="m-0 text-sm text-muted-foreground">
            点击“导入 Clash Verge”检查订阅配置，并打开本机客户端导入。
          </p>
        </div>
        <Button type="primary" @click="openSelfAssign">领取 / 切换订阅</Button>
      </header>

      <Grid table-title="我的3XUI订阅">
        <template #actions="{ row }">
          <TableAction
            :actions="[
              {
                label: '导入 Clash Verge',
                type: 'link',
                icon: 'lucide:download',
                disabled: row.status === 2 || clashImportLoading,
                loading: clashImportLoading && clashImportRow?.id === row.id,
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
