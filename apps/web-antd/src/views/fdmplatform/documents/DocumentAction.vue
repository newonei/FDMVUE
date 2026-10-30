<script setup lang="ts">
import type { ActionDefinition } from '../data';
import type { SalesChannel } from '../sales-channel';
import type { DocumentKind } from './model';
import type { RelatedDocumentSource } from './related-creation';

import type {
  AttachmentView,
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
  MasterRecord,
} from '#/api/fdmplatform';
import type { ReceiptDraft } from '#/api/fdmplatform/receipt-drafts';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  message,
  Modal,
  Space,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  getAttachments,
  getContract,
  getDirectory,
  getMasterData,
} from '#/api/fdmplatform';
import {
  deleteReceiptDraft,
  getReceiptDrafts,
  saveReceiptDraft,
} from '#/api/fdmplatform/receipt-drafts';
import { getContractStockPools } from '#/api/fdmplatform/stock';
import { contractActionWithAttachments } from '#/api/fdmplatform/submissions';

import ActionDialog from '../components/ActionDialog.vue';
import AttachmentPanel from '../components/AttachmentPanel.vue';
import CreationAttachments from '../components/CreationAttachments.vue';
import { errorText, statusLabels } from '../data';
import { withDirectory, withEvidence } from '../directory';
import RequestAssignDialog from '../purchase/tasks/RequestAssignDialog.vue';
import ContractPicker from './ContractPicker.vue';
import { documentActionDataNeeds } from './data-needs';
import { currentDocument, documentActionDefinition } from './model';
import { relatedActionDefinition } from './related-creation';
const props = defineProps<{
  action?: string;
  contractId?: string;
  kind: DocumentKind;
  lockContract?: boolean;
  open: boolean;
  row?: DocumentRow;
  /** 新建时选合同只列出该业务线 */
  salesChannel?: SalesChannel;
  source?: RelatedDocumentSource;
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
/** 新建回款时可先保存草稿，之后从这里继续编辑并提交 */
const receiptDrafts = ref<ReceiptDraft[]>([]);
const activeDraft = ref<ReceiptDraft>();
const usesReceiptDrafts = computed(() => props.action === 'CREATE_RECEIPT');
const lockedContractId = computed(
  () => props.contractId ?? props.row?.contractId,
);
/**
 * 分派采购任务只分单（采购部门约定）：任何入口都弹出「分派采购申请」，
 * 只选采购员，不再填申请明细、采购方式和数量。
 */
const assigning = computed(() => props.action === 'ASSIGN_FULFILLMENT');
const assignContractId = ref<string>();
const assignRequestId = computed(() => {
  if (props.source?.kind === 'requests') return props.source.id;
  if (props.kind === 'requests' && props.row) return String(props.row.id);
  return undefined;
});
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
    'SUBMIT_PLAN',
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
const decorated = computed(() => {
  if (!definition.value) return undefined;
  const base = withEvidence(
    withDirectory(definition.value, directory.value),
    attachments.value?.items ?? [],
  );
  if (!usesReceiptDrafts.value) return base;
  return {
    ...base,
    draftLabel: '保存草稿',
    initialValues: activeDraft.value
      ? { ...base.initialValues, ...activeDraft.value.values }
      : base.initialValues,
  };
});
function draftSummary(draft: ReceiptDraft) {
  const values = draft.values;
  const method = values.paymentMethod
    ? (statusLabels[values.paymentMethod] ?? values.paymentMethod)
    : '';
  return (
    [
      values.amount ? `${values.amount} ${values.currency ?? ''}`.trim() : '',
      values.receivedAt ? `到账 ${values.receivedAt}` : '',
      method,
    ]
      .filter(Boolean)
      .join(' · ') || '未填写金额'
  );
}
function draftTime(draft: ReceiptDraft) {
  return draft.updatedAt
    ? new Date(draft.updatedAt).toLocaleString('zh-CN', { hour12: false })
    : '';
}
async function loadReceiptDrafts(id: string) {
  try {
    receiptDrafts.value = await getReceiptDrafts(id);
  } catch {
    // 草稿只是便利功能，读取失败不影响直接登记回款
    receiptDrafts.value = [];
  }
}
/** 载入草稿后重新打开表单，让弹窗按草稿内容初始化 */
async function useDraft(draft?: ReceiptDraft) {
  activeDraft.value = draft;
  actionOpen.value = false;
  await nextTick();
  actionOpen.value = true;
}
function removeDraft(draft: ReceiptDraft) {
  const current = contract.value;
  if (!current) return;
  Modal.confirm({
    title: '删除回款草稿',
    content: `确定删除「${draftSummary(draft)}」这份草稿吗？`,
    okText: '删除',
    okButtonProps: { danger: true },
    zIndex: 2100,
    async onOk() {
      try {
        await deleteReceiptDraft(current.id, draft.id);
        receiptDrafts.value = receiptDrafts.value.filter(
          (entry) => entry.id !== draft.id,
        );
        if (activeDraft.value?.id === draft.id) await useDraft(undefined);
        message.success('草稿已删除');
      } catch (error) {
        message.error(errorText(error));
      }
    },
  });
}
async function saveDraft(values: Record<string, unknown>) {
  const current = contract.value;
  if (!current || saving.value || !usesReceiptDrafts.value) return;
  const run = sequence;
  saving.value = true;
  pageError.value = '';
  try {
    const saved = await saveReceiptDraft(current.id, values, activeDraft.value);
    if (run !== sequence || !props.open) return;
    message.success(
      draftFiles.value.length > 0
        ? '草稿已保存。附件不随草稿保存，提交时请重新添加'
        : '草稿已保存，可稍后在「新建回款记录」里继续编辑并提交',
    );
    activeDraft.value = saved;
    finishClose();
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
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
function close(hasChanges = false) {
  if (saving.value || attachmentBusy.value) return;
  if (hasChanges || draftFiles.value.length > 0)
    Modal.confirm({
      title: '当前填写内容尚未保存',
      content:
        draftFiles.value.length > 0
          ? `当前填写内容和 ${draftFiles.value.length} 个待上传附件尚未保存。继续填写可保留内容，放弃后需重新填写。`
          : '继续填写可保留当前内容，放弃后需重新填写。',
      okText: '放弃并关闭',
      cancelText: '继续填写',
      autoFocusButton: 'cancel',
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
  const source = props.source;
  pickerOpen.value = false;
  actionOpen.value = false;
  loading.value = true;
  pageError.value = '';
  try {
    if (source && (!props.lockContract || !lockedContractId.value || row))
      throw new Error('关联建单需锁定来源合同，请关闭后重新办理');
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
    if (action === 'CREATE_RECEIPT') await loadReceiptDrafts(id);
    if (current !== sequence || !props.open) return;
    const record = row ? currentDocument(loaded, kind, row.id) : undefined;
    definition.value = source
      ? relatedActionDefinition(
          loaded,
          kind,
          action,
          source,
          master.value,
          pools.value,
        )
      : documentActionDefinition(
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
    props.source?.kind,
    props.source?.id,
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
    receiptDrafts.value = [];
    activeDraft.value = undefined;
    contract.value = undefined;
    definition.value = undefined;
    attachments.value = undefined;
    attachmentError.value = '';
    const id = props.lockContract
      ? lockedContractId.value
      : (props.row?.contractId ?? props.contractId);
    assignContractId.value = undefined;
    if (assigning.value) {
      if (id) assignContractId.value = id;
      else if (props.lockContract)
        pageError.value = '当前合同未加载，请关闭后重试';
      else pickerOpen.value = true;
      return;
    }
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
    if (action === 'CREATE_RECEIPT') {
      payload.currency = String(payload.currency ?? '')
        .trim()
        .toUpperCase();
      if (activeDraft.value) payload.draftId = activeDraft.value.id;
    }
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
        throw new Error('库存版本未加载，请关闭后重新办理');
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
    :action="action"
    :sales-channel="salesChannel"
    @close="close"
    @select="
      (selected) =>
        assigning
          ? ((pickerOpen = false), (assignContractId = selected.id))
          : prepare(selected.id)
    "
  /><RequestAssignDialog
    v-if="assigning"
    :open="open && !!assignContractId"
    :contract-id="assignContractId"
    :request-id="assignRequestId"
    @close="finishClose"
    @saved="
      (value) => {
        emit('updated', value);
        finishClose();
      }
    "
  /><Modal
    :open="
      open && !pickerOpen && !actionOpen && !(assigning && assignContractId)
    "
    title="准备办理"
    :footer="null"
    @cancel="close()"
  >
    <Spin v-if="loading" /><Alert
      v-if="pageError"
      :message="pageError"
      type="error"
      show-icon
    /><Space v-if="!loading">
      <Button @click="close()">关闭</Button><Button v-if="lockedContractId" @click="prepare(lockedContractId)">
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
    @draft="saveDraft"
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
      <Alert
        v-if="usesReceiptDrafts && (activeDraft || receiptDrafts.length > 0)"
        type="warning"
        show-icon
      >
        <template #message>
          <span v-if="activeDraft">
            正在编辑草稿（{{ draftTime(activeDraft) }}
            保存），提交后草稿自动删除。
            <Button type="link" size="small" @click="useDraft(undefined)">
              改为新建
            </Button>
          </span>
          <span v-else>你在这个合同有 {{ receiptDrafts.length }} 份回款草稿：</span>
        </template>
        <template v-if="!activeDraft" #description>
          <div
            v-for="draft in receiptDrafts"
            :key="draft.id"
            class="receipt-draft-row"
          >
            <Tag>草稿</Tag>
            <span>{{ draftSummary(draft) }}</span>
            <span class="receipt-draft-time">{{ draftTime(draft) }}</span>
            <Button type="link" size="small" @click="useDraft(draft)">
              继续编辑
            </Button>
            <Button type="link" size="small" danger @click="removeDraft(draft)">
              删除
            </Button>
          </div>
        </template>
      </Alert>
      <Descriptions v-if="contract" bordered size="small" :column="2">
        <Descriptions.Item label="关联合同">
          {{ contract.code }} · {{ contract.name }}
</Descriptions.Item><Descriptions.Item label="客户">
          {{ contract.customerName }}
</Descriptions.Item><Descriptions.Item label="订单所属公司">
          {{ company }}
</Descriptions.Item><Descriptions.Item label="当前办理">
          {{
            props.source
              ? '已带入来源单据'
              : props.row
                ? '已锁定当前单据'
                : '新建单据'
          }}
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

<style scoped>
.receipt-draft-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.receipt-draft-time {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}
</style>
