<script setup lang="ts">
import type { Contract, Directory, DocumentRow } from '#/api/fdmplatform';
import type { ApprovalTask } from '#/api/fdmplatform/approval-inbox';
import type { ProcurementFinanceType } from '#/api/fdmplatform/procurement-finance';

import { onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Modal, Space, Spin } from 'ant-design-vue';

import { getContract } from '#/api/fdmplatform';
import { getProcurementFinance } from '#/api/fdmplatform/procurement-finance';

import ContractDetail from '../components/ContractDetail.vue';
import { errorText } from '../data';
import { resolveDocumentRow } from '../documents/navigation';
import RecordDetail from '../documents/RecordDetail.vue';
import FinanceDocument from '../finance/procurement/components/FinanceDocument.vue';

const props = defineProps<{
  directory?: Directory;
  open: boolean;
  task?: ApprovalTask;
}>();
const emit = defineEmits<{ close: []; updated: [] }>();
const contract = ref<Contract>();
const planRow = ref<DocumentRow>();
const financeType = ref<ProcurementFinanceType>();
const loading = ref(false);
const loadError = ref('');
let sequence = 0;

async function load() {
  const run = ++sequence;
  const task = props.task;
  if (!props.open || !task) return;
  loading.value = true;
  loadError.value = '';
  try {
    if (task.sourceKind === 'PROC_FINANCE') {
      const record = await getProcurementFinance(task.sourceId);
      if (run !== sequence || !props.open) return;
      if (record.id !== task.sourceId)
        throw new Error('来源单据不匹配，请刷新待办后重试');
      financeType.value = record.type;
    } else if (['CONTRACT_REVIEW', 'PURCHASE_PLAN'].includes(task.sourceKind)) {
      if (!task.contractId)
        throw new Error('此待办缺少关联合同，请核对来源单据');
      const value = await getContract(task.contractId);
      if (run !== sequence || !props.open) return;
      if (value.id !== task.contractId)
        throw new Error('来源合同不匹配，请刷新待办后重试');
      if (task.sourceKind === 'PURCHASE_PLAN')
        planRow.value = resolveDocumentRow(value, 'plans', task.sourceId);
      contract.value = value;
    } else throw new Error('暂不支持此类待办，请核对来源单据类型');
  } catch (error) {
    if (run === sequence) loadError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  () => [
    props.open,
    props.task?.id,
    props.task?.sourceId,
    props.task?.sourceKind,
    props.task?.contractId,
  ],
  () => {
    ++sequence;
    contract.value = undefined;
    planRow.value = undefined;
    financeType.value = undefined;
    loadError.value = '';
    loading.value = false;
    if (props.open) void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
async function refreshContract() {
  await load();
  if (props.open) emit('updated');
}
function contractUpdated(value: Contract) {
  if (value.id === props.task?.contractId) contract.value = value;
  emit('updated');
}
</script>

<template>
  <Modal
    :open="open && (!!loadError || (!contract && !financeType))"
    :title="task?.title || '办理审批事项'"
    :footer="null"
    @cancel="emit('close')"
  >
    <Spin v-if="loading" tip="正在读取当前单据" />
    <Alert v-else-if="loadError" type="error" :message="loadError" show-icon />
    <Space v-if="loadError" class="mt-4">
      <Button @click="load">重新读取</Button>
      <Button @click="emit('close')">返回待办</Button>
    </Space>
  </Modal>
  <RecordDetail
    v-if="planRow && task?.sourceKind === 'PURCHASE_PLAN'"
    :open="open && !loadError"
    :row="planRow"
    kind="plans"
    @close="emit('close')"
    @updated="emit('updated')"
  />
  <FinanceDocument
    v-if="financeType && task?.sourceKind === 'PROC_FINANCE'"
    :open="open && !loadError"
    :record-id="task.sourceId"
    :type="financeType"
    @close="emit('close')"
    @updated="emit('updated')"
  />
  <ContractDetail
    v-if="contract && task?.sourceKind === 'CONTRACT_REVIEW'"
    :open="open && !loadError"
    :contract="contract"
    :directory="directory"
    :loading="loading"
    :master="[]"
    :pools="[]"
    initial-tab="overview"
    workspace="trade-contracts"
    @close="emit('close')"
    @refresh="refreshContract"
    @updated="contractUpdated"
  />
</template>
