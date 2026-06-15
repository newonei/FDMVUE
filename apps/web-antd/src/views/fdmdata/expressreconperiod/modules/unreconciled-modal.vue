<script lang="ts" setup>
import type { FdmdataExpressReconPeriodApi } from '#/api/fdmdata/expressreconperiod';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, Table } from 'ant-design-vue';

import {
  exportUnreconciledWaybillsExcel,
  getUnreconciledWaybills,
} from '#/api/fdmdata/expressreconperiod';

defineOptions({ name: 'ExpressReconUnreconciledModal' });

const periodId = ref<number | undefined>();
const periodName = ref('');
const loading = ref(false);
const rows = ref<FdmdataExpressReconPeriodApi.UnreconciledWaybill[]>([]);

function formatWeight(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : String(value);
}

const columns = [
  { title: '运单号', dataIndex: 'waybillNo', key: 'waybillNo', width: 160, ellipsis: true },
  { title: '店铺', dataIndex: 'shopName', key: 'shopName', width: 140, ellipsis: true },
  { title: '省份', dataIndex: 'provinceName', key: 'provinceName', width: 90 },
  { title: '订单快递（参考）', dataIndex: 'expressCompany', key: 'expressCompany', width: 130, ellipsis: true },
  { title: '内部订单号', dataIndex: 'internalOrderNo', key: 'internalOrderNo', width: 150, ellipsis: true },
  { title: '订单行数', dataIndex: 'orderLineCount', key: 'orderLineCount', width: 90, align: 'right' as const },
  {
    title: '汇总重量',
    dataIndex: 'estimatedWeight',
    key: 'estimatedWeight',
    width: 100,
    align: 'right' as const,
    customRender: ({ text }: { text: unknown }) => formatWeight(text),
  },
];

async function handleExport() {
  if (!periodId.value) return;
  const data = await exportUnreconciledWaybillsExcel(periodId.value);
  downloadFileFromBlobPart({ fileName: '未对账运单.xls', source: data });
}

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      periodId.value = undefined;
      periodName.value = '';
      rows.value = [];
      return;
    }
    const data = modalApi.getData() as
      | { periodId?: number; periodName?: string }
      | null
      | undefined;
    periodId.value = Number(data?.periodId) || undefined;
    periodName.value = String(data?.periodName ?? '').trim();
    if (!periodId.value) {
      rows.value = [];
      return;
    }
    loading.value = true;
    try {
      rows.value = await getUnreconciledWaybills(periodId.value);
    } finally {
      loading.value = false;
    }
  },
});
</script>

<template>
  <Modal
    :title="periodName ? `未对账运单 · ${periodName}` : '未对账运单'"
    :show-confirm-button="false"
    class="w-[920px] max-w-[calc(100vw-2rem)]"
  >
    <div class="px-1 pb-2">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs text-muted-foreground">
          账期订单池中尚未被任何快递账单对账的运单（共 {{ rows.length }} 单）。
        </span>
        <Button size="small" :disabled="rows.length === 0" @click="handleExport">
          <template #icon>
            <IconifyIcon icon="lucide:download" />
          </template>
          导出
        </Button>
      </div>
      <Table
        size="small"
        :loading="loading"
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        :scroll="{ y: 460 }"
        row-key="waybillNo"
        bordered
      />
    </div>
  </Modal>
</template>
