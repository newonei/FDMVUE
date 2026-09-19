<script setup lang="ts">
import type { Contract, Directory } from '#/api/fdmplatform';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Input, Modal, Space, Table } from 'ant-design-vue';

import { getBusinessPage, getDirectory } from '#/api/fdmplatform';

import { contractQuickActionReason } from '../components/contract-workflow';
import { errorText, label, money } from '../data';
import { actionTitle } from './model';
const props = defineProps<{ action?: string; open: boolean }>();
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
const operation = computed(() =>
  props.action ? actionTitle(props.action) : '新建关联单据',
);
function canSelect(contract: Contract) {
  return !unavailableReason(contract);
}
function unavailableReason(contract: Contract) {
  return props.action
    ? contractQuickActionReason(contract, props.action)
    : undefined;
}
function select(contract: Contract) {
  if (!loading.value && canSelect(contract)) emit('select', contract);
}
async function load() {
  const current = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    directory.value ??= await getDirectory(0);
    if (current !== sequence || !props.open) return;
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
  () => [props.open, props.action],
  () => {
    ++sequence;
    if (props.open) {
      pageNo.value = 1;
      void load();
    } else {
      loading.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
const columns = [
  { key: 'contract', title: '合同', width: 250 },
  { key: 'customerName', dataIndex: 'customerName', title: '客户' },
  { key: 'companyName', dataIndex: 'companyName', title: '订单所属公司' },
  { key: 'amount', title: '金额' },
  { key: 'status', title: '状态' },
  { key: 'action', title: '选择', width: 165 },
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
      <p>选择本次「{{ operation }}」对应的合同，自动带入客户和订单所属公司。</p>
      <Input.Search
        v-model:value="keyword"
        placeholder="合同编号 / 名称 / 客户"
        allow-clear
        autofocus
        @search="search"
      /><Alert v-if="pageError" :message="pageError" type="error" show-icon>
        <template #action><Button @click="load">重试</Button></template>
</Alert><Table
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
        <template #emptyText>
          <Space direction="vertical" class="py-6">
            <span>{{
              keyword.trim()
                ? '没有找到匹配的合同，可缩短关键词重试'
                : '暂无可选择的合同'
            }}</span>
            <Button
              v-if="keyword.trim()"
              @click="
                keyword = '';
                search();
              "
            >
              清除关键词
            </Button>
          </Space>
        </template>
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
          }}</span>
          <div v-else-if="column.key === 'action'">
            <Button
              type="link"
              :disabled="loading || !canSelect(record as Contract)"
              @click="select(record as Contract)"
            >
              {{
                canSelect(record as Contract) ? '选择并继续' : '当前不可办理'
              }}
            </Button>
            <div
              v-if="!canSelect(record as Contract)"
              class="text-muted-foreground text-xs"
            >
              {{ unavailableReason(record as Contract) }}
            </div>
          </div>
        </template>
      </Table>
    </Space>
  </Modal>
</template>
