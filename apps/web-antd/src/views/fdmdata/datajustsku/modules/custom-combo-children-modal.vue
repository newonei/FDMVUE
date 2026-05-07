<script lang="ts" setup>
import type { FdmdataCustomComboApi } from '#/api/fdmdata/datajustsku';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Table } from 'ant-design-vue';

import { getCustomComboChildList } from '#/api/fdmdata/datajustsku';

const titleItemCode = ref<string>('');
const loading = ref(false);
const rows = ref<FdmdataCustomComboApi.CustomComboChildRow[]>([]);

const columns = [
  {
    title: '子商品编码',
    dataIndex: 'srcSkuId',
    key: 'srcSkuId',
    ellipsis: true,
  },
  {
    title: '数量',
    dataIndex: 'qty',
    key: 'qty',
    width: 80,
  },
  {
    title: '子项售价',
    dataIndex: 'salePrice',
    key: 'salePrice',
    width: 100,
  },
];

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      titleItemCode.value = '';
      rows.value = [];
      return;
    }
    const data = modalApi.getData() as Record<string, unknown> | null | undefined;
    titleItemCode.value = String(data?.itemCode ?? '').trim();
    const comboId = Number(data?.comboId);
    if (!comboId) {
      rows.value = [];
      return;
    }
    loading.value = true;
    try {
      rows.value = await getCustomComboChildList(comboId);
    } finally {
      loading.value = false;
    }
  },
});
</script>

<template>
  <Modal
    :title="titleItemCode ? `子商品 · ${titleItemCode}` : '子商品'"
    :show-confirm-button="false"
    class="w-[640px]"
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
