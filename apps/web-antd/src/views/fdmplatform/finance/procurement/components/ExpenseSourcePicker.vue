<script setup lang="ts">
import type { ExpenseSourceRow } from '#/api/fdmplatform/expense';

import { ref, watch } from 'vue';

import { Alert, Input, Modal, Table } from 'ant-design-vue';

import { getExpenseSources } from '#/api/fdmplatform/expense';

import { errorText } from '../../../data';

/** 报销关联合同或采购单。全员都能用，所以只查编号和名称，不看金额和客户。 */
const props = defineProps<{ open: boolean; type: 'CONTRACT' | 'ORDER' }>();
const emit = defineEmits<{ close: []; select: [row: ExpenseSourceRow] }>();
const keyword = ref('');
const page = ref(1);
const total = ref(0);
const records = ref<ExpenseSourceRow[]>([]);
const loading = ref(false);
const pageError = ref('');
let sequence = 0;

async function load(reset = false) {
  if (reset) page.value = 1;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getExpenseSources({
      keyword: keyword.value.trim() || undefined,
      pageNo: page.value,
      pageSize: 10,
      type: props.type,
    });
    if (run !== sequence) return;
    records.value = result.list;
    total.value = result.total;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  () => [props.open, props.type],
  () => {
    if (!props.open) return;
    keyword.value = '';
    void load(true);
  },
);
</script>

<template>
  <Modal
    :open="open"
    :title="type === 'ORDER' ? '选择采购单' : '选择合同'"
    :footer="null"
    width="640px"
    @cancel="emit('close')"
  >
    <Input.Search
      v-model:value="keyword"
      allow-clear
      :placeholder="
        type === 'ORDER' ? '搜索合同编号或供应商' : '搜索合同编号或名称'
      "
      @search="load(true)"
    />
    <Alert v-if="pageError" type="error" :message="pageError" show-icon />
    <Table
      :data-source="records"
      :loading="loading"
      row-key="id"
      size="small"
      :pagination="{ current: page, pageSize: 10, total }"
      :columns="
        type === 'ORDER'
          ? [
              { title: '供应商', dataIndex: 'supplierName' },
              { title: '合同', dataIndex: 'contractCode' },
              { title: '', key: 'action', width: 70 },
            ]
          : [
              { title: '合同编号', dataIndex: 'code' },
              { title: '名称', dataIndex: 'name' },
              { title: '', key: 'action', width: 70 },
            ]
      "
      @change="
        (value) => {
          page = value.current ?? 1;
          load();
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <a
          v-if="column.key === 'action'"
          @click="emit('select', record as ExpenseSourceRow)"
          >选择</a>
      </template>
    </Table>
  </Modal>
</template>
