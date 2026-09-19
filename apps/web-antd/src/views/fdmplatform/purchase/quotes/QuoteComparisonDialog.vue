<script setup lang="ts">
import type { DocumentKind } from '../../documents/model';
import type { RelatedDocumentSource } from '../../documents/related-creation';

import type { Contract, DocumentRow } from '#/api/fdmplatform';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Modal, Spin } from 'ant-design-vue';

import { getContract } from '#/api/fdmplatform';

import { errorText } from '../../data';
import DocumentAction from '../../documents/DocumentAction.vue';
import { resolveDocumentRow } from '../../documents/navigation';
import RecordDetail from '../../documents/RecordDetail.vue';
import QuoteComparison from './QuoteComparison.vue';

import '../components/procurement.css';

const props = defineProps<{
  contractId?: string;
  open: boolean;
  sourceQuoteId?: string;
}>();
const emit = defineEmits<{ close: []; updated: [] }>();
const contract = ref<Contract>();
const loading = ref(false);
const pageError = ref('');
const actionOpen = ref(false);
const actionKind = ref<DocumentKind>('quotes');
const action = ref<string>();
const actionSource = ref<RelatedDocumentSource>();
const detailOpen = ref(false);
const detailRow = ref<DocumentRow>();
const childOpen = computed(() => actionOpen.value || detailOpen.value);
let sequence = 0;

async function load() {
  const run = ++sequence;
  pageError.value = '';
  loading.value = true;
  try {
    if (!props.contractId || !props.sourceQuoteId)
      throw new Error('报价来源不完整，请从采购任务重新打开');
    const current = await getContract(props.contractId);
    if (run !== sequence || !props.open) return;
    if (current.id !== props.contractId)
      throw new Error('返回的资料不属于当前订单');
    resolveDocumentRow(current, 'quotes', props.sourceQuoteId);
    contract.value = current;
  } catch (error) {
    if (run === sequence)
      pageError.value = `报价资料未刷新：${errorText(error)}`;
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function close() {
  if (childOpen.value) return;
  ++sequence;
  emit('close');
}
function launch(
  kind: DocumentKind,
  actionName: string,
  source: RelatedDocumentSource,
) {
  if (loading.value || pageError.value || !contract.value || childOpen.value)
    return;
  actionKind.value = kind;
  action.value = actionName;
  actionSource.value = source;
  actionOpen.value = true;
}
function detail(id: string) {
  if (!contract.value) return;
  detailRow.value = resolveDocumentRow(contract.value, 'quotes', id);
  detailOpen.value = true;
}
function saved(updated: Contract) {
  actionOpen.value = false;
  if (updated?.id === props.contractId) contract.value = updated;
  emit('updated');
  void load();
}
function detailsUpdated() {
  emit('updated');
  void load();
}
watch(
  () => [props.open, props.contractId, props.sourceQuoteId],
  () => {
    ++sequence;
    actionOpen.value = false;
    detailOpen.value = false;
    contract.value = undefined;
    pageError.value = '';
    if (props.open) void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
</script>

<template>
  <Modal
    :open="open"
    title="比较供应商报价"
    width="min(1180px, 96vw)"
    :footer="null"
    :mask-closable="!childOpen"
    :keyboard="!childOpen"
    :closable="!childOpen"
    :destroy-on-close="true"
    @cancel="close"
  >
    <div class="procurement-workspace comparison-dialog-content">
      <Alert v-if="pageError" type="error" show-icon :message="pageError">
        <template #action>
          <Button size="small" :loading="loading" @click="load"> 重试 </Button>
        </template>
      </Alert>
      <Spin :spinning="loading">
        <QuoteComparison
          v-if="contract && sourceQuoteId"
          :contract="contract"
          :quote-id="sourceQuoteId"
          :disabled="loading || Boolean(pageError)"
          @detail="detail"
          @new-quote="
            (id) => launch('quotes', 'CREATE_QUOTE', { kind: 'tasks', id })
          "
          @plan="(id) => launch('plans', 'SAVE_PLAN', { kind: 'quotes', id })"
        />
        <p v-else class="procurement-muted comparison-dialog-loading">
          {{
            loading ? '正在读取同一任务的全部供应商报价…' : '报价资料暂不可用'
          }}
        </p>
      </Spin>
    </div>
  </Modal>
  <DocumentAction
    :open="open && actionOpen"
    :kind="actionKind"
    :action="action"
    :contract-id="contractId"
    :lock-contract="true"
    :source="actionSource"
    @close="actionOpen = false"
    @updated="saved"
  />
  <RecordDetail
    :open="open && detailOpen"
    kind="quotes"
    :row="detailRow"
    @close="detailOpen = false"
    @updated="detailsUpdated"
  />
</template>

<style scoped>
.comparison-dialog-content {
  max-height: calc(100vh - 180px);
  padding: 12px 0;
  overflow-y: auto;
  border: 0;
}

.comparison-dialog-content > .ant-alert {
  margin-bottom: 16px;
}

.comparison-dialog-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
</style>
