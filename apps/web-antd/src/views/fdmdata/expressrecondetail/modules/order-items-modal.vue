<script lang="ts" setup>
import type { FdmdataExpressReconDetailApi } from '#/api/fdmdata/expressrecondetail';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Table } from 'ant-design-vue';

import { getExpressReconOrderItemList } from '#/api/fdmdata/expressrecondetail';

defineOptions({ name: 'ExpressReconOrderItemsModal' });

const waybillNo = ref('');
const loading = ref(false);
const rows = ref<FdmdataExpressReconDetailApi.ExpressOrderItem[]>([]);

function formatWeight(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : String(value);
}

const columns = [
  {
    title: '商品编码',
    dataIndex: 'skuCode',
    key: 'skuCode',
    width: 140,
    ellipsis: true,
  },
  {
    title: '商品名称',
    dataIndex: 'productName',
    key: 'productName',
    ellipsis: true,
  },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    width: 80,
    align: 'right' as const,
  },
  {
    title: '商品资料设置重量',
    dataIndex: 'materialWeight',
    key: 'materialWeight',
    width: 140,
    align: 'right' as const,
    customRender: ({ text }: { text: unknown }) => formatWeight(text),
  },
];

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      waybillNo.value = '';
      rows.value = [];
      return;
    }
    const data = modalApi.getData() as
      | {
          batchId?: number;
          waybillNo?: string;
        }
      | null
      | undefined;
    waybillNo.value = String(data?.waybillNo ?? '').trim();
    const batchId = Number(data?.batchId);
    if (!batchId || !waybillNo.value) {
      rows.value = [];
      return;
    }
    loading.value = true;
    try {
      rows.value = await getExpressReconOrderItemList({
        batchId,
        waybillNo: waybillNo.value,
      });
    } finally {
      loading.value = false;
    }
  },
});
</script>

<template>
  <Modal
    :title="waybillNo ? `运单商品 · ${waybillNo}` : '运单商品'"
    :show-confirm-button="false"
    class="w-[760px] max-w-[calc(100vw-2rem)]"
  >
    <div class="px-1 pb-2">
      <Table
        size="small"
        :loading="loading"
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        row-key="id"
        bordered
      />
    </div>
  </Modal>
</template>
