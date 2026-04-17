<script lang="ts" setup>
import type { FdmdataCustomComboApi } from '#/api/fdmdata/datajustsku';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Table } from 'ant-design-vue';

import { getCustomComboChildList } from '#/api/fdmdata/datajustsku';

const comboId = ref<number>(0);
const itemCode = ref<string>('');
const loading = ref(false);
const rows = ref<FdmdataCustomComboApi.CustomComboChildRow[]>([]);

const columns = [
  {
    title: '子商品编码',
    dataIndex: 'srcSkuId',
    key: 'srcSkuId',
    ellipsis: true,
  },
];

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      comboId.value = 0;
      itemCode.value = '';
      rows.value = [];
      return;
    }
    const data = modalApi.getData() as
      | null
      | undefined
      | { comboId: number; itemCode?: string };
    comboId.value = data?.comboId ?? 0;
    itemCode.value = (data?.itemCode ?? '').trim();
    if (!comboId.value) {
      rows.value = [];
      return;
    }
    loading.value = true;
    try {
      rows.value = await getCustomComboChildList(comboId.value);
    } finally {
      loading.value = false;
    }
  },
});
</script>

<template>
  <Modal
    :title="itemCode ? `子商品 · ${itemCode}` : '子商品'"
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
