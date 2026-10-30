<script lang="ts" setup>
import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { formatDateTime } from '@vben/utils';

import { Empty, Table } from 'ant-design-vue';

import { getEcFloorPriceLogs } from '#/api/fdmdata/ecfloorprice';

import { seriesLabel } from '../data';
import { formatPrice } from '../model';

defineOptions({ name: 'EcFloorPriceLogModal' });

const ACTION_TEXT: Record<FdmdataEcFloorPriceApi.PriceLog['action'], string> = {
  CREATE: '新增',
  UPDATE: '修改',
  IMPORT: '导入',
  DELETE: '删除',
};

const title = ref('改价记录');
const logs = ref<FdmdataEcFloorPriceApi.PriceLog[]>([]);
const loading = ref(false);

const columns = [
  { title: '时间', key: 'createTime', width: 160 },
  { title: '操作', key: 'action', width: 70 },
  { title: '操作人', dataIndex: 'creatorName', width: 100 },
  { title: '公司底价', key: 'floor' },
  { title: '平台参考价', key: 'ref' },
];

function change(oldValue: unknown, newValue: unknown) {
  const a = formatPrice(oldValue);
  const b = formatPrice(newValue);
  return a === b ? b : `${a} → ${b}`;
}

const [Modal, modalApi] = useVbenModal({
  footer: false,
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      logs.value = [];
      return;
    }
    const row = modalApi.getData() as FdmdataEcFloorPriceApi.FloorPrice;
    title.value = `改价记录 · ${seriesLabel(row.seriesCode)} ${row.specText ?? ''}`;
    loading.value = true;
    try {
      logs.value = await getEcFloorPriceLogs(row.id!);
    } finally {
      loading.value = false;
    }
  },
});
</script>

<template>
  <Modal :title="title" class="w-[720px] max-w-[calc(100vw-2rem)]">
    <Table
      :columns="columns"
      :data-source="logs"
      :loading="loading"
      :pagination="false"
      :scroll="{ y: 420 }"
      row-key="id"
      size="small"
    >
      <template #emptyText>
        <Empty description="还没有改价记录" />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'createTime'">
          {{ formatDateTime(record.createTime) }}
        </template>
        <template v-else-if="column.key === 'action'">
          {{ ACTION_TEXT[(record as FdmdataEcFloorPriceApi.PriceLog).action] }}
        </template>
        <template v-else-if="column.key === 'floor'">
          {{ change(record.oldFloorPrice, record.newFloorPrice) }}
        </template>
        <template v-else-if="column.key === 'ref'">
          {{ change(record.oldRefPrice, record.newRefPrice) }}
        </template>
      </template>
    </Table>
  </Modal>
</template>
