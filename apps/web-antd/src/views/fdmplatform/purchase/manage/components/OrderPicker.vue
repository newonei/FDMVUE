<script setup lang="ts">
import type { DocumentRow } from '#/api/fdmplatform';

import { ref, watch } from 'vue';

import { Alert, Button, Input, Modal, Space, Table } from 'ant-design-vue';

import { getBusinessPage } from '#/api/fdmplatform';

import { errorText } from '../../../data';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; selected: [row: DocumentRow] }>();
const records = ref<DocumentRow[]>([]);
const keyword = ref('');
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const pageError = ref('');
let sequence = 0;
async function load(reset = false) {
  if (reset) page.value = 1;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getBusinessPage<DocumentRow>('purchase-orders', {
      companyId: 0,
      pageNo: page.value,
      pageSize: 10,
      keyword: keyword.value || undefined,
    });
    if (run === sequence) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  () => props.open,
  (open) => {
    if (open) void load(true);
    else sequence++;
  },
);
</script>
<template>
  <Modal
    :open="open"
    title="选择关联采购单"
    :footer="null"
    width="950px"
    @cancel="emit('close')"
  >
    <Space direction="vertical" style="width: 100%">
      <Input.Search
        v-model:value="keyword"
        placeholder="搜索合同编号、客户或采购单供应商"
        @search="load(true)"
      /><Alert v-if="pageError" type="error" :message="pageError" /><Table
        :data-source="records"
        :loading="loading"
        row-key="id"
        :pagination="{ current: page, pageSize: 10, total }"
        :columns="[
          { title: '采购单供应商', key: 'supplier' },
          { title: '关联合同', dataIndex: 'contractCode' },
          { title: '合同名称', dataIndex: 'contractName' },
          { title: '选择', key: 'action' },
        ]"
        @change="
          (value) => {
            page = value.current ?? 1;
            load();
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'supplier'">{{
            record.record.supplierName
          }}</span><Button
            v-else-if="column.key === 'action'"
            type="link"
            @click="emit('selected', record as DocumentRow)"
          >
            选择此采购单
          </Button>
        </template>
      </Table>
    </Space>
  </Modal>
</template>
