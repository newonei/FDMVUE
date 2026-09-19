<script setup lang="ts">
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  Modal,
  Space,
  Table,
  TabPane,
  Tabs,
} from 'ant-design-vue';

import { getProcurementFinancePage } from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import { hasPayableBalance, payableBalance } from '../model';
const props = defineProps<{ open: boolean; reimbursementOnly?: boolean }>();
const emit = defineEmits<{
  close: [];
  selected: [record: ProcurementFinanceRecord];
}>();
const type = ref<'REIMBURSEMENT' | 'REQUEST'>('REQUEST');
const rows = ref<ProcurementFinanceRecord[]>([]);
const page = ref(1);
const keyword = ref('');
const total = ref(0);
const loading = ref(false);
const pageError = ref('');
let sequence = 0;
async function load() {
  const run = ++sequence;
  loading.value = true;
  try {
    const result = await getProcurementFinancePage({
      type: type.value,
      status: 'APPROVED',
      keyword: keyword.value || undefined,
      pageNo: page.value,
      pageSize: 10,
    });
    if (run === sequence) {
      rows.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  () => [props.open, type.value],
  () => {
    if (props.open) {
      if (props.reimbursementOnly) type.value = 'REIMBURSEMENT';
      page.value = 1;
      void load();
    } else sequence++;
  },
);
</script>
<template>
  <Modal
    :open="open"
    title="选择已生效来源单据"
    width="900px"
    :footer="null"
    @cancel="emit('close')"
  >
    <Space direction="vertical" style="width: 100%">
      <Input.Search
        v-model:value="keyword"
        placeholder="搜索单据号或名称"
        @search="
          page = 1;
          load();
        "
      /><Tabs v-if="!reimbursementOnly" v-model:active-key="type">
        <TabPane key="REQUEST" tab="采购请款" /><TabPane
          key="REIMBURSEMENT"
          tab="费用报销"
        />
</Tabs><Alert v-if="pageError" type="error" :message="pageError" /><Table
        :data-source="rows"
        :loading="loading"
        row-key="id"
        :pagination="{ current: page, pageSize: 10, total }"
        :columns="[
          { title: '单据号', dataIndex: 'code' },
          { title: '名称', dataIndex: 'name' },
          { title: '金额', dataIndex: 'amount' },
          { title: '币种', dataIndex: 'currency' },
          { title: '可付款余额', key: 'balance' },
          { title: '操作', key: 'action' },
        ]"
        @change="
          (value) => {
            page = value.current ?? 1;
            load();
          }
        "
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'balance'">{{
            payableBalance(record as ProcurementFinanceRecord)
          }}</span><Button
            v-else-if="column.key === 'action'"
            :disabled="
              !reimbursementOnly &&
              !hasPayableBalance(record.summary?.availablePaymentAmount)
            "
            type="link"
            @click="emit('selected', record as ProcurementFinanceRecord)"
          >
            选择
          </Button>
        </template>
      </Table>
    </Space>
  </Modal>
</template>
