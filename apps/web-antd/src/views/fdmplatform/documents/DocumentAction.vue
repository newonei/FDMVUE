<script setup lang="ts">
import type { ActionDefinition } from '../data';
import type { DocumentKind } from './model';

import type {
  AttachmentView,
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
  MasterRecord,
} from '#/api/fdmplatform';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  message,
  Modal,
  Space,
  Spin,
} from 'ant-design-vue';

import {
  getAttachments,
  getContract,
  getDirectory,
  getMasterData,
  requestAiReview,
} from '#/api/fdmplatform';
import { getContractStockPools } from '#/api/fdmplatform/stock';
import { contractActionWithAttachments } from '#/api/fdmplatform/submissions';

import ActionDialog from '../components/ActionDialog.vue';
import AttachmentPanel from '../components/AttachmentPanel.vue';
import CreationAttachments from '../components/CreationAttachments.vue';
import { errorText } from '../data';
import { withDirectory, withEvidence } from '../directory';
import ContractPicker from './ContractPicker.vue';
import { documentActionDataNeeds } from './data-needs';
import { currentDocument, documentActionDefinition } from './model';
const props = defineProps<{
  action?: string;
  contractId?: string;
  kind: DocumentKind;
  lockContract?: boolean;
  open: boolean;
  row?: DocumentRow;
}>();
const emit = defineEmits<{ close: []; updated: [contract: Contract] }>();
const pickerOpen = ref(false);
const actionOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const pageError = ref('');
const contract = ref<Contract>();
const directory = ref<Directory>();
const master = ref<MasterRecord[]>([]);
const pools = ref<BusinessRecord[]>([]);
const definition = ref<ActionDefinition>();
const attachments = ref<AttachmentView>();
const attachmentError = ref('');
const draftFiles = ref<File[]>([]);
const attachmentBusy = ref(false);
const lockedContractId = computed(
  () => props.contractId ?? props.row?.contractId,
);
const supportsAttachments = computed(() =>
  [
    'ASSIGN_FULFILLMENT',
    'BIND_ALLOCATION',
    'CREATE_COST',
    'CREATE_INVOICE',
    'CREATE_QUOTE',
    'CREATE_RECEIPT',
    'CREATE_REQUEST',
    'GENERATE_ORDERS',
    'RECORD_ARRIVAL',
    'RETURN_ARRIVAL',
    'REVERSE_RECEIPT',
    'SAVE_PLAN',
    'STOCK_RECEIVE',
    'STOCK_RELEASE',
    'STOCK_RESERVE',
    'STOCK_RETURN',
    'STOCK_SHIP',
    'UPDATE_CONTRACT',
    'UPDATE_PRODUCTION',
  ].includes(props.action ?? ''),
);
const attachmentLoading = ref(false);
let sequence = 0;
const needsEvidence = computed(() =>
  [
    ...(definition.value?.fields ?? []),
    ...(definition.value?.lineFields ?? []),
  ].some((field) =>
    ['attachmentIds', 'evidenceIds', 'evidenceRef'].includes(field.key),
  ),
);
const decorated = computed(() =>
  definition.value
    ? withEvidence(
        withDirectory(definition.value, directory.value),
        attachments.value?.items ?? [],
      )
    : undefined,
);
const company = computed(
  () =>
    directory.value?.companies.find(
      (entry) => entry.companyId === contract.value?.companyId,
    )?.companyName ??
    contract.value?.companyName ??
    '',
);
function finishClose() {
  draftFiles.value = [];
  ++sequence;
  pickerOpen.value = false;
  actionOpen.value = false;
  emit('close');
}
function close() {
  if (saving.value || attachmentBusy.value) return;
  if (draftFiles.value.length > 0)
    Modal.confirm({
      title: '关闭当前办理？',
      content: `${draftFiles.value.length} 个待上传附件尚未保存，关闭后将清除。`,
      okText: '关闭',
      onOk: finishClose,
    });
  else finishClose();
}
async function prepare(id: string) {
  if (!props.open || (props.lockContract && id !== lockedContractId.value))
    return;
  const current = ++sequence;
  const action = props.action;
  const kind = props.kind;
  const row = props.row;
  pickerOpen.value = false;
  actionOpen.value = false;
  loading.value = true;
  pageError.value = '';
  try {
    if (props.lockContract && row && row.contractId !== id)
      throw new Error('当前单据不属于此合同，请关闭后重新选择单据');
    const needs = documentActionDataNeeds(action);
    const [loaded, people, suppliers, warehouses, stock, files] =
      await Promise.all([
        getContract(id),
        getDirectory(0),
        needs.suppliers ? getMasterData(0, 'SUPPLIER') : Promise.resolve([]),
        needs.warehouses ? getMasterData(0, 'WAREHOUSE') : Promise.resolve([]),
        needs.stock
          ? getContractStockPools(id)
          : Promise.resolve({ pools: [] }),
        getAttachments(id),
      ]);
    if (current !== sequence || !props.open) return;
    if (loaded.id !== id) throw new Error('返回的资料不属于当前合同，请重试');
    if (!action || !loaded.allowedActions.includes(action))
      throw new Error('当前合同状态不支持此操作，请核对合同和前置单据');
    contract.value = loaded;
    directory.value = people;
    master.value = [...suppliers, ...warehouses];
    pools.value = stock.pools;
    attachments.value = files;
    const record = row ? currentDocument(loaded, kind, row.id) : undefined;
    definition.value = documentActionDefinition(
      loaded,
      kind,
      action,
      master.value,
      pools.value,
      record,
    );
    actionOpen.value = true;
  } catch (error) {
    if (current === sequence) pageError.value = errorText(error);
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [
    props.open,
    props.contractId,
    props.row?.contractId,
    props.row?.id,
    props.kind,
    props.action,
    props.lockContract,
  ],
  () => {
    ++sequence;
    actionOpen.value = false;
    pickerOpen.value = false;
    attachmentBusy.value = false;
    if (!props.open) {
      pickerOpen.value = false;
      actionOpen.value = false;
      loading.value = false;
      return;
    }
    pageError.value = '';
    draftFiles.value = [];
    contract.value = undefined;
    definition.value = undefined;
    attachments.value = undefined;
    attachmentError.value = '';
    const id = props.lockContract
      ? lockedContractId.value
      : (props.row?.contractId ?? props.contractId);
    if (id) void prepare(id);
    else if (props.lockContract)
      pageError.value = '当前合同未加载，请关闭后重试';
    else pickerOpen.value = true;
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
async function loadAttachments() {
  if (!contract.value) return;
  const id = contract.value.id;
  const current = sequence;
  attachmentLoading.value = true;
  attachmentError.value = '';
  try {
    const result = await getAttachments(id);
    if (current === sequence && props.open && contract.value?.id === id)
      attachments.value = result;
  } catch (error) {
    if (current === sequence) attachmentError.value = errorText(error);
  } finally {
    if (current === sequence) attachmentLoading.value = false;
  }
}
async function execute(input: Record<string, unknown>, key: string) {
  const current = contract.value;
  const action = props.action;
  if (
    saving.value ||
    attachmentBusy.value ||
    !props.open ||
    !current ||
    !action ||
    !definition.value
  )
    return;
  if (props.lockContract && current.id !== lockedContractId.value) return;
  const run = sequence;
  saving.value = true;
  pageError.value = '';
  try {
    let payload = { ...input };
    if (action === 'CREATE_RECEIPT')
      payload.currency = String(payload.currency ?? '')
        .trim()
        .toUpperCase();
    if (action === 'CREATE_QUOTE') {
      payload.evidenceIds = Array.isArray(payload.evidenceIds)
        ? payload.evidenceIds
        : String(payload.evidenceIds ?? '')
            .split(/[,，\n]/)
            .map((entry) => entry.trim())
            .filter(Boolean);
      payload.confirmed = true;
      payload.supplierName = master.value.find(
        (item) => item.id === payload.supplierId,
      )?.name;
    }
    if (action === 'SAVE_PLAN') {
      payload.risks = String(payload.riskNotes ?? '')
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean);
      delete payload.riskNotes;
    }
    if (action === 'CREATE_COST') payload.includesCategories ??= [];
    if (action.startsWith('STOCK_')) {
      const pool = pools.value.find((item) => item.id === payload.poolId);
      if (!pool || pool.version === undefined)
        throw new Error('库存池版本未加载，请关闭后重新办理');
      const { poolId, planId, planVersion, planLineId, ...command } = payload;
      if (action === 'STOCK_RECEIVE' || action === 'STOCK_RESERVE')
        command.contractId = current.id;
      if (action === 'STOCK_RECEIVE') {
        command.sourceType = 'PRODUCTION';
        command.sourceId = command.assignmentId;
        command.sourceLineId = command.contractItemId;
        delete command.assignmentId;
      }
      payload = {
        poolId,
        poolVersion: pool.version,
        command,
        ...(action === 'STOCK_RESERVE'
          ? { planId, planVersion, planLineId }
          : {}),
      };
    }
    if (action === 'REQUEST_AI_REVIEW') {
      await requestAiReview(current.id, {
        ...payload,
        expectedVersion: current.version,
        idempotencyKey: key,
      });
      const latest = await getContract(current.id);
      if (run !== sequence || !props.open) return;
      emit('updated', latest);
    } else {
      const latest = await contractActionWithAttachments(
        current.id,
        action,
        current.version,
        key,
        payload,
        draftFiles.value,
      );
      if (run !== sequence || !props.open) return;
      emit('updated', latest);
    }
    message.success(`${definition.value.title}成功`);
    finishClose();
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <ContractPicker
    :open="pickerOpen && open && !lockContract"
    @close="close"
    @select="(selected) => prepare(selected.id)"
  /><Modal
    :open="open && !pickerOpen && !actionOpen"
    title="准备办理"
    :footer="null"
    @cancel="close"
  >
    <Spin v-if="loading" /><Alert
      v-if="pageError"
      :message="pageError"
      type="error"
      show-icon
    /><Space v-if="!loading">
      <Button @click="close">关闭</Button><Button v-if="lockedContractId" @click="prepare(lockedContractId)">
        重试当前合同
</Button><Button v-if="!lockContract" @click="pickerOpen = true">
        重新选择合同
      </Button>
    </Space>
</Modal><ActionDialog
    :open="open && actionOpen"
    :definition="decorated"
    :saving="saving || attachmentBusy"
    :error="pageError"
    :evidence-ready="draftFiles.length > 0"
    @close="close"
    @submit="execute"
  >
    <template #attachments>
      <CreationAttachments
        v-if="supportsAttachments"
        v-model:files="draftFiles"
        :disabled="saving"
      />
    </template>
    <template #context>
      <Descriptions v-if="contract" bordered size="small" :column="2">
        <Descriptions.Item label="关联合同">
          {{ contract.code }} · {{ contract.name }}
</Descriptions.Item><Descriptions.Item label="客户">
          {{ contract.customerName }}
</Descriptions.Item><Descriptions.Item label="订单所属公司">
          {{ company }}
</Descriptions.Item><Descriptions.Item label="当前办理">
          {{ props.row ? '已锁定当前单据' : '新建单据' }}
        </Descriptions.Item>
</Descriptions><Collapse v-if="contract && needsEvidence">
        <Collapse.Panel key="files" header="已上传凭据：可继续选择已有文件">
          <AttachmentPanel
            :contract-id="contract.id"
            :view="attachments"
            :categories="attachments?.uploadCategories ?? []"
            :loading="attachmentLoading"
            :error="attachmentError"
            @refresh="loadAttachments"
            @busy="(value) => (attachmentBusy = value)"
          />
        </Collapse.Panel>
      </Collapse>
    </template>
  </ActionDialog>
</template>
