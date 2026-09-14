<script setup lang="ts">
import type { Contract, Directory } from '#/api/fdmplatform';

import { ref, watch } from 'vue';

import { Alert, Button, Input, Modal, Space, Table } from 'ant-design-vue';

import { getBusinessPage, getDirectory } from '#/api/fdmplatform';

import { errorText, label, money } from '../data';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; select: [contract: Contract] }>();
const keyword = ref('');
const directory = ref<Directory>();
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const records = ref<Contract[]>([]);
const loading = ref(false);
const pageError = ref('');
let sequence = 0;
async function load() {
  const current = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    directory.value ??= await getDirectory(0);
    const result = await getBusinessPage<Contract>('contracts', {
      companyId: 0,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    });
    if (current === sequence) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (current === sequence) pageError.value = errorText(error);
  } finally {
    if (current === sequence) loading.value = false;
  }
}
function search() {
  pageNo.value = 1;
  void load();
}
watch(
  () => props.open,
  (open) => {
    if (open) {
      pageNo.value = 1;
      void load();
    }
  },
);
const columns = [
  { key: 'contract', title: '合同', width: 250 },
  { key: 'customerName', dataIndex: 'customerName', title: '客户' },
  { key: 'companyName', dataIndex: 'companyName', title: '订单所属公司' },
  { key: 'amount', title: '金额' },
  { key: 'status', title: '状态' },
  { key: 'action', title: '选择', width: 85 },
];
</script>
<template>
  <Modal
    :open="open"
    title="选择关联合同"
    :width="1050"
    :footer="null"
    @cancel="emit('close')"
  >
    <Space direction="vertical" style="width: 100%">
      <p>搜索合同编号、名称或客户。选定后自动带入客户和订单所属公司。</p>
      <Input.Search
        v-model:value="keyword"
        placeholder="合同编号 / 名称 / 客户"
        allow-clear
        @search="search"
      /><Alert
        v-if="pageError"
        :message="pageError"
        type="error"
        show-icon
      /><Table
        :loading="loading"
        :columns="columns"
        :data-source="records"
        row-key="id"
        :scroll="{ x: 900 }"
        :pagination="{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => `共 ${count} 份合同`,
        }"
        @change="
          (pagination) => {
            pageNo = pagination.current ?? 1;
            pageSize = pagination.pageSize ?? 10;
            load();
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'contract'">{{ record.code }}<br />{{ record.name }}</span><span v-else-if="column.key === 'companyName'">{{
            directory?.companies.find(
              (company) => company.companyId === record.companyId,
            )?.companyName ??
            record.companyName ??
            `公司 #${record.companyId}`
          }}</span><span v-else-if="column.key === 'amount'">{{
            money(record.amount, record.currency)
          }}</span><span v-else-if="column.key === 'status'">{{
            label(record.status)
          }}</span><Button
            v-else-if="column.key === 'action'"
            type="link"
            @click="emit('select', record as Contract)"
          >
            选择
          </Button>
        </template>
      </Table>
    </Space>
  </Modal>
</template>
