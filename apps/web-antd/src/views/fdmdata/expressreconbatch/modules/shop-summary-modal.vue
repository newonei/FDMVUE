<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, Table } from 'ant-design-vue';

import type { FdmdataExpressReconBatchApi } from '#/api/fdmdata/expressreconbatch';

import {
  exportExpressReconShopSummaryExcel,
  getExpressReconShopSummary,
} from '#/api/fdmdata/expressreconbatch';

defineOptions({ name: 'ExpressReconShopSummaryModal' });

const rows = ref<FdmdataExpressReconBatchApi.ShopSummary[]>([]);
const loading = ref(false);
const filters = ref<Record<string, unknown>>({});

const columns: TableColumnsType = [
  { title: '店铺', dataIndex: 'shopName', width: 180 },
  { title: '运单数', dataIndex: 'waybillCount', align: 'right', width: 90 },
  {
    title: '重复计费',
    dataIndex: 'duplicateWaybillCount',
    align: 'right',
    width: 100,
  },
  {
    title: '重量预警',
    dataIndex: 'weightWarningCount',
    align: 'right',
    width: 100,
  },
  {
    title: '预计费用',
    dataIndex: 'estimatedAmount',
    align: 'right',
    width: 110,
  },
  { title: '账单金额', dataIndex: 'actualAmount', align: 'right', width: 110 },
  {
    title: '重复金额',
    dataIndex: 'duplicateAmount',
    align: 'right',
    width: 110,
  },
  { title: '应付金额', dataIndex: 'payableAmount', align: 'right', width: 110 },
];

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      rows.value = [];
      filters.value = {};
      return;
    }
    filters.value = (modalApi.getData() as Record<string, unknown>) || {};
    await loadSummary();
  },
});

async function loadSummary() {
  loading.value = true;
  try {
    rows.value = await getExpressReconShopSummary(filters.value);
  } finally {
    loading.value = false;
  }
}

function formatAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
}

async function handleExport() {
  const data = await exportExpressReconShopSummaryExcel(filters.value);
  downloadFileFromBlobPart({ fileName: '店铺运费汇总.xls', source: data });
}
</script>

<template>
  <Modal title="店铺运费汇总" class="w-[1040px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-3">
      <div class="flex justify-end">
        <Button @click="handleExport">
          <template #icon>
            <IconifyIcon icon="lucide:download" />
          </template>
          导出汇总
        </Button>
      </div>
      <Table
        row-key="shopName"
        size="small"
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1010, y: 420 }"
      >
        <template #bodyCell="{ column, text }">
          <template
            v-if="
              [
                'estimatedAmount',
                'actualAmount',
                'duplicateAmount',
                'payableAmount',
              ].includes(String(column.dataIndex))
            "
          >
            {{ formatAmount(text) }}
          </template>
        </template>
      </Table>
    </div>
  </Modal>
</template>
