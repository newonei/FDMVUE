<script setup lang="ts">
import type { DocumentKind } from '../documents/model';
import type { DetailTab, WorkspaceKey } from '../workspaces';
import type { ContractDocumentKind } from './contract-document-launcher';
import type { MainlineAction } from './contract-mainline';
import type { WorkboardLaunch } from './contract-workboard';

import type {
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
  MasterRecord,
  PageResource,
} from '#/api/fdmplatform';
import type { ContractFileListing } from '#/api/fdmplatform/contract-files';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Input,
  message,
  Modal,
  Space,
  TabPane,
  Tabs,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  contractAction,
  getContractAudit,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import { getContractFiles } from '#/api/fdmplatform/contract-files';
import { getContractRelatedSummary } from '#/api/fdmplatform/contract-progress';
import { getCustomsSummary } from '#/api/fdmplatform/customs';
import { downloadContractProductAttachment } from '#/api/fdmplatform/products';

import { productCategoryLabel } from '../contract-categories';
import { errorText, label, rows } from '../data';
import { departmentLabel, personLabel, personName } from '../directory';
import DocumentAction from '../documents/DocumentAction.vue';
import ImportedContractCompletion from '../documents/ImportedContractCompletion.vue';
import { nativeMoney } from '../documents/migration-display';
import MigrationSource from '../documents/MigrationSource.vue';
import { documentDefinitions } from '../documents/model';
import { entityTarget } from '../documents/navigation';
import RecordDetail from '../documents/RecordDetail.vue';
import RelatedLink from '../documents/RelatedLink.vue';
import FinanceDocument from '../finance/procurement/components/FinanceDocument.vue';
import ContractEditor from '../products/components/ContractEditor.vue';
import { detailTabFor } from '../workspaces';
import { contractMainline, contractNextStep } from './contract-mainline';
import { contractItemPipeline } from './contract-progress';
import { contractWorkboard, workboardDocumentRow } from './contract-workboard';
import { contractQuickActionReason } from './contract-workflow';
import ContractDocumentDialog from './ContractDocumentDialog.vue';
import ContractFilesPanel from './ContractFilesPanel.vue';
import ContractMainline from './ContractMainline.vue';
import ContractWorkboard from './ContractWorkboard.vue';
import RecordTable from './RecordTable.vue';

const props = defineProps<{
  /** 打开后自动办理主线的“下一步”（列表行上的办理按钮） */
  autoNext?: boolean;
  contract?: Contract;
  directory?: Directory;
  initialTab: DetailTab;
  loading: boolean;
  master: MasterRecord[];
  open: boolean;
  pools: BusinessRecord[];
  recordContext?: { record: BusinessRecord; resource: PageResource };
  workspace: WorkspaceKey;
}>();
const emit = defineEmits<{
  autoNextDone: [];
  close: [];
  copy: [value: Contract];
  refresh: [];
  updated: [value: Contract];
}>();
const documentKind = ref<ContractDocumentKind>();
const documentMode = ref<'create' | 'list'>();
const documentsOpen = ref(false);
const workLaunch = ref<WorkboardLaunch>();
const workRow = ref<DocumentRow>();
const attachmentBusy = ref(false);
const terminating = ref(false);
const terminateAction = ref<'CANCEL_CONTRACT' | 'CLOSE_CONTRACT'>();
const terminateReason = ref('');
let terminateKey = newIdempotencyKey();
const childOpen = computed(
  () =>
    documentsOpen.value ||
    editorOpen.value ||
    completionOpen.value ||
    reimbursementOpen.value ||
    !!workLaunch.value ||
    activating.value ||
    attachmentBusy.value ||
    !!terminateAction.value,
);
/** 各部门页签底部的“全部单据”入口；到货、采购退货、自产进度已改到工序库存，不再列出 */
const departmentLists: Record<
  'delivery' | 'finance' | 'purchase',
  DocumentKind[]
> = {
  purchase: ['requests', 'tasks', 'quotes', 'plans', 'orders'],
  delivery: ['shipments', 'salesReturns'],
  finance: ['receipts', 'refunds', 'invoices', 'allocations', 'costs'],
};
function quickActionReason(action: string) {
  if (props.loading) return '正在刷新合同，请稍后再试';
  if (childOpen.value) return '请先完成或关闭当前办理窗口';
  return contractQuickActionReason(props.contract, action);
}
function openQuickDocument(entry: { action: string; kind: DocumentKind }) {
  const reason = quickActionReason(entry.action);
  if (reason) {
    message.warning(reason);
    return;
  }
  startWork({ kind: entry.kind, action: entry.action });
}
const activeTab = ref<DetailTab>('products');
const editorOpen = ref(false);
const completionOpen = ref(false);
const reimbursementOpen = ref(false);
const activating = ref(false);
let activationKey = newIdempotencyKey();
const attachments = ref<ContractFileListing>();
const attachmentError = ref('');
const attachmentLoading = ref(false);
const audit = ref<BusinessRecord[]>([]);
const auditError = ref('');
const customs = ref<Awaited<ReturnType<typeof getCustomsSummary>>>();
const customsError = ref('');
const related = ref<Awaited<ReturnType<typeof getContractRelatedSummary>>>();
const relatedError = ref('');
let summarySequence = 0;
const company = computed(
  () =>
    props.directory?.companies.find(
      (item) => item.companyId === props.contract?.companyId,
    )?.companyName ??
    props.contract?.companyName ??
    '',
);
const standardFiles = computed(() => [
  ...new Map(
    (props.contract?.items ?? []).flatMap((item) =>
      (item.productAttachmentRefs ?? []).map(
        (file) => [file.id, { ...file, skuName: item.skuName }] as const,
      ),
    ),
  ).values(),
]);
const pipeline = computed(() => contractItemPipeline(props.contract));
/** 主线只给第一项；全部可办理事项收在下面，可展开逐项办理 */
const allTasks = computed(() =>
  props.contract
    ? contractWorkboard(props.contract).reduce(
        (sum, group) => sum + group.records.length,
        0,
      )
    : 0,
);
const ended = computed(() =>
  ['CANCELLED', 'CLOSED'].includes(props.contract?.status ?? ''),
);
const allowed = (action: string) =>
  Boolean(props.contract?.allowedActions.includes(action));
const summary = computed(() => props.contract?.financeSummary);
const moneyCells = computed(() => {
  const contract = props.contract;
  const value = (key: string) => {
    const amount = summary.value?.[key];
    return amount === null || amount === undefined
      ? '待核对'
      : nativeMoney(amount, contract?.currency).replace(
          `${contract?.currency} `,
          '',
        );
  };
  return [
    {
      label: '合同额',
      value: nativeMoney(contract?.amount, contract?.currency),
    },
    { label: '已确认回款', value: value('confirmedReceipts') },
    {
      label: '待财务确认',
      value: value('pendingReceipts'),
      tone: Number(summary.value?.pendingReceipts) > 0 ? 'pending' : '',
    },
    { label: '未收', value: value('unpaidAmount') },
    { label: '已开票', value: value('effectiveInvoices') },
  ];
});
const totalQuantity = computed(() => {
  const units = new Set(pipeline.value.map((item) => item.unit));
  const sum = pipeline.value.reduce(
    (total, item) => total + Number(item.quantity ?? 0),
    0,
  );
  return units.size === 1
    ? `${sum.toLocaleString('en-US')} ${[...units][0] ?? ''}`
    : `${pipeline.value.length} 项`;
});
const purchaseRows = computed(() => {
  const contract = props.contract;
  if (!contract) return { requests: [], orders: [], quotes: [], tasks: [] };
  return {
    requests: rows(contract.requests).filter(
      (row) => row.status !== 'CANCELLED',
    ),
    tasks: rows(contract.assignments).filter(
      (row) => row.status !== 'CANCELLED',
    ),
    quotes: rows(contract.quotes),
    orders: rows(contract.purchaseOrders),
  };
});
const shipmentRows = computed(() => rows(props.contract?.shipments));
const receiptRows = computed(() => rows(props.contract?.finance?.receipts));
const invoiceRows = computed(() => rows(props.contract?.finance?.invoices));
const itemName = (id: unknown) =>
  props.contract?.items.find((item) => item.id === id)?.skuName ?? '未匹配明细';
function orderProgress(order: BusinessRecord) {
  let quantity = 0;
  let arrived = 0;
  for (const line of rows(order.lines)) {
    quantity +=
      Number(line.quantity ?? 0) - Number(line.cancelledQuantity ?? 0);
    arrived += Number(line.arrivedQuantity ?? 0);
  }
  return `${arrived.toLocaleString('en-US')} / ${quantity.toLocaleString('en-US')}`;
}
function requestDue(request: BusinessRecord) {
  const dates = rows(request.items)
    .map((item) => String(item.requiredDate ?? ''))
    .filter(Boolean)
    .toSorted();
  return dates[0] ?? '未填写';
}
const auditRows = computed(() =>
  audit.value.map((row) => ({
    ...row,
    action: label(row.action),
    actor_id: personLabel(props.directory, row.actor_id),
    created_at: String(row.created_at ?? '')
      .replace('T', ' ')
      .slice(0, 16),
  })),
);
const columns = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title! };
  });
async function loadFiles() {
  if (!props.contract) return;
  const id = props.contract.id;
  attachmentLoading.value = true;
  attachmentError.value = '';
  try {
    const result = await getContractFiles(id);
    if (id === props.contract?.id) attachments.value = result;
  } catch (error) {
    attachmentError.value = errorText(error);
  } finally {
    attachmentLoading.value = false;
  }
}
async function loadSummary() {
  if (!props.contract) return;
  const id = props.contract.id;
  const run = ++summarySequence;
  customsError.value = '';
  relatedError.value = '';
  related.value = undefined;
  customs.value = undefined;
  const [customsResult, relatedResult] = await Promise.allSettled([
    getCustomsSummary(id),
    getContractRelatedSummary(id),
  ]);
  if (run !== summarySequence || id !== props.contract?.id || !props.open)
    return;
  if (customsResult.status === 'fulfilled') customs.value = customsResult.value;
  else customsError.value = errorText(customsResult.reason);
  if (relatedResult.status === 'fulfilled') related.value = relatedResult.value;
  else
    relatedError.value = `关联单据统计未读取：${errorText(relatedResult.reason)}`;
}
async function loadAudit() {
  if (!props.contract) return;
  const id = props.contract.id;
  auditError.value = '';
  try {
    const result = await getContractAudit(id);
    if (id === props.contract?.id)
      audit.value = result.map((item, index) => ({
        ...item,
        id: String(index),
      }));
  } catch (error) {
    auditError.value = errorText(error);
  }
}
let autoRanFor: string | undefined;
function runAutoNext() {
  const contract = props.contract;
  if (
    !props.autoNext ||
    !contract ||
    props.loading ||
    autoRanFor === contract.id
  )
    return;
  autoRanFor = contract.id;
  emit('autoNextDone');
  const next = contractNextStep(
    contract,
    contractMainline(contract),
    contractWorkboard(contract),
  );
  if (next.action) runNext(next.action);
}
watch(
  () => [props.open, props.contract?.id],
  () => {
    ++summarySequence;
    activationKey = newIdempotencyKey();
    documentsOpen.value = false;
    editorOpen.value = false;
    completionOpen.value = false;
    reimbursementOpen.value = false;
    workLaunch.value = undefined;
    workRow.value = undefined;
    terminateAction.value = undefined;
    related.value = undefined;
    if (!props.open) autoRanFor = undefined;
    if (props.open && props.contract) {
      activeTab.value = detailTabFor(props.workspace, props.initialTab);
      attachments.value = undefined;
      audit.value = [];
      customs.value = undefined;
      void loadFiles();
      void loadSummary();
      if (activeTab.value === 'audit') void loadAudit();
    }
  },
  { immediate: true },
);
watch(
  () => [props.autoNext, props.contract?.id, props.loading, props.open],
  () => {
    if (props.open) runAutoNext();
  },
  { immediate: true },
);
watch(
  () => props.contract?.version,
  () => {
    if (props.open) void loadSummary();
  },
);
watch(activeTab, (tab) => {
  if (tab === 'audit') void loadAudit();
});
function openDocuments(kind: ContractDocumentKind, mode?: 'create' | 'list') {
  if (!props.contract || childOpen.value) return;
  documentKind.value = kind;
  documentMode.value = mode;
  documentsOpen.value = true;
}
function startWork(launch: WorkboardLaunch) {
  if (!props.contract || props.loading || childOpen.value) return;
  try {
    if (launch.action && !props.contract.allowedActions.includes(launch.action))
      throw new Error('此操作当前不可用，请刷新订单后重试');
    workRow.value = launch.recordId
      ? workboardDocumentRow(props.contract, launch.kind, launch.recordId)
      : undefined;
    workLaunch.value = launch;
  } catch (error) {
    message.warning(errorText(error));
  }
}
function documentUpdated(value: Contract) {
  if (value.id !== props.contract?.id) return;
  emit('updated', value);
  void loadSummary();
  void loadFiles();
  if (activeTab.value === 'audit') void loadAudit();
}
async function activateContract() {
  const current = props.contract;
  if (
    !current ||
    childOpen.value ||
    props.loading ||
    current.status !== 'DRAFT' ||
    !current.allowedActions.includes('CONFIRM_CONTRACT')
  )
    return;
  activating.value = true;
  try {
    const result = await contractAction(
      current.id,
      'CONFIRM_CONTRACT',
      current.version,
      activationKey,
      {},
    );
    if (props.contract?.id !== current.id) return;
    activationKey = newIdempotencyKey();
    documentUpdated(result);
    message.success('合同已生效，可以继续办理采购、交付和收付款');
  } catch (error) {
    message.error(errorText(error));
  } finally {
    activating.value = false;
  }
}
function startTerminate(action: 'CANCEL_CONTRACT' | 'CLOSE_CONTRACT') {
  if (!props.contract || childOpen.value || props.loading) return;
  terminateReason.value = '';
  terminateKey = newIdempotencyKey();
  terminateAction.value = action;
}
async function terminate() {
  const current = props.contract;
  const action = terminateAction.value;
  if (!current || !action) return;
  const reason = terminateReason.value.trim();
  if (!reason) {
    message.warning(
      action === 'CANCEL_CONTRACT' ? '请填写取消原因' : '请填写结案说明',
    );
    return;
  }
  terminating.value = true;
  try {
    const result = await contractAction(
      current.id,
      action,
      current.version,
      terminateKey,
      { reason },
    );
    terminateAction.value = undefined;
    documentUpdated(result);
    message.success(action === 'CANCEL_CONTRACT' ? '合同已取消' : '合同已结案');
  } catch (error) {
    message.error(errorText(error));
  } finally {
    terminating.value = false;
  }
}
const router = useRouter();
function runNext(action: MainlineAction) {
  if (!props.contract || props.loading || childOpen.value) return;
  switch (action.type) {
    case 'activate': {
      void activateContract();
      break;
    }
    case 'complete': {
      completionOpen.value = true;
      break;
    }
    case 'documents': {
      openDocuments(action.kind, 'list');
      break;
    }
    case 'edit': {
      editorOpen.value = true;
      break;
    }
    case 'launch': {
      startWork(action.launch);
      break;
    }
    case 'quick': {
      openQuickDocument({ kind: action.kind, action: action.action });
      break;
    }
    case 'route': {
      void router.push({ path: action.path, query: action.query });
      break;
    }
  }
}
function close() {
  if (!childOpen.value) emit('close');
}
async function download(file: { id: string; name: string }) {
  if (!props.contract) return;
  try {
    const blob = await downloadContractProductAttachment(
      props.contract.id,
      file.id,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    message.error(errorText(error));
  }
}
</script>
<template>
  <Drawer
    :open="open"
    :title="
      contract
        ? [contract.code, contract.name].filter(Boolean).join(' · ')
        : '合同详情'
    "
    width="min(1150px,96vw)"
    :closable="!childOpen"
    :mask-closable="!childOpen"
    :keyboard="!childOpen"
    @close="close"
  >
    <template #extra>
      <Space>
        <Button
          :loading="loading"
          :disabled="childOpen"
          @click="emit('refresh')"
        >
          刷新合同
        </Button>
        <Button
          v-if="contract?.allowedActions.includes('UPDATE_CONTRACT')"
          :disabled="childOpen || loading"
          @click="editorOpen = true"
        >
          编辑合同
        </Button>
      </Space>
    </template>
    <div v-if="contract" class="contract-detail">
      <div class="identity">
        <div class="identity-tags">
          <Tag
            :color="
              ended
                ? 'default'
                : contract.status === 'DRAFT'
                  ? 'default'
                  : 'blue'
            "
            >
{{ label(contract.status) }}
</Tag>
          <Tag>{{ productCategoryLabel(contract.productCategory) }}</Tag>
          <Tag v-if="contract.businessType">
{{
            label(contract.businessType)
          }}
</Tag>
        </div>
        <p class="identity-line">
          <RelatedLink :target="entityTarget('customer', contract.customerId)">
            {{ contract.customerName }}
          </RelatedLink>
          <span>{{ company || '订单公司待补齐' }}</span>
          <span>{{ personLabel(directory, contract.ownerUserId) }}</span>
          <span>签订 {{ contract.signedDate ?? '未填写' }}</span>
        </p>
        <div class="identity-actions">
          <Button
            size="small"
            :disabled="childOpen"
            @click="emit('copy', contract)"
          >
            复制为新合同
          </Button>
          <Button
            v-if="allowed('CLOSE_CONTRACT')"
            size="small"
            :disabled="childOpen || loading"
            @click="startTerminate('CLOSE_CONTRACT')"
          >
            结案
          </Button>
          <Button
            v-if="allowed('CANCEL_CONTRACT')"
            size="small"
            danger
            :disabled="childOpen || loading"
            @click="startTerminate('CANCEL_CONTRACT')"
          >
            取消合同
          </Button>
        </div>
      </div>

      <div class="moneybar" aria-label="金额">
        <div v-for="cell in moneyCells" :key="cell.label">
          <span>{{ cell.label }}</span><b :class="cell.tone">{{ cell.value }}</b>
        </div>
      </div>

      <Button
        v-if="
          contract.allowedActions.includes('COMPLETE_IMPORTED_CONTRACT') &&
          !contract.blockReasons?.length
        "
        :disabled="childOpen || loading"
        @click="completionOpen = true"
      >
        补齐办理资料
      </Button>
      <MigrationSource
        :migration="contract.migration"
        :block-reasons="contract.blockReasons"
        :native-source="{ kind: 'CONTRACT', nativeId: contract.id }"
      />
      <ContractMainline
        :contract="contract"
        :busy="activating"
        :disabled="childOpen"
        :loading="loading"
        @next="runNext"
      />
      <details v-if="allTasks > 0" class="other-tasks">
        <summary>全部待办（{{ allTasks }} 项）</summary>
        <ContractWorkboard
          :contract="contract"
          :disabled="childOpen"
          :loading="loading"
          @launch="startWork"
        />
      </details>

      <Tabs v-model:active-key="activeTab">
        <TabPane key="products" tab="产品与进度">
          <div class="products-layout">
            <div class="ptable" role="table" aria-label="产品明细">
              <div class="pr th" role="row">
                <span>产品 / 规格</span><span class="r">数量</span><span class="r">单价</span><span class="r">金额</span><span>交期</span><span>申请 · 下单 · 到货</span><span class="r">已发</span>
              </div>
              <div
                v-for="item in pipeline"
                :key="item.id"
                class="pr"
                role="row"
              >
                <div class="prod">
                  <img
                    v-if="item.productImageUrl"
                    :src="item.productImageUrl"
                    alt=""
                    class="thumb"
                  />
                  <div class="prod-text">
                    <span class="strong" :title="item.skuName">{{
                      item.skuName
                    }}</span>
                    <span class="sub" :title="item.specification">{{
                      item.specification || item.size || '—'
                    }}</span>
                  </div>
                </div>
                <span class="r">{{ Number(item.quantity).toLocaleString('en-US') }}
                  {{ item.unit }}</span>
                <span class="r">{{ item.unitPrice ?? '待定价' }}</span>
                <span class="r">{{
                  item.lineAmount
                    ? Number(item.lineAmount).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })
                    : '—'
                }}</span>
                <span>{{ item.requiredDate ?? '未约定' }}</span>
                <span class="sub">{{ item.requestedQuantity ?? '待核对' }} ·
                  {{ item.orderedQuantity ?? '—' }} ·
                  {{ item.arrivedQuantity ?? '—' }}</span>
                <span class="r" :class="{ done: item.deliveryComplete }">{{
                  item.shippedQuantity ?? '待核对'
                }}</span>
              </div>
              <div class="pr foot" role="row">
                <span>合计 {{ pipeline.length }} 项</span><span class="r">{{ totalQuantity }}</span><span></span><span class="r">{{
                  nativeMoney(contract.amount, contract.currency)
                }}</span><span class="sub" style="grid-column: span 3">{{
                  Number(contract.additionalAmount) > 0
                    ? `含附加费用 ${nativeMoney(contract.additionalAmount, contract.currency)}`
                    : '没有附加费用'
                }}</span>
              </div>
              <p class="note">
                <Tooltip
                  title="数量只统计已匹配到本合同明细的单据；未匹配或独立单据计入关联总数。数量缺失时显示待核对，不按零判定完成。"
                >
                  <span tabindex="0">数量口径说明</span>
                </Tooltip>
              </p>
            </div>
            <aside class="side">
              <Card size="small" title="合同资料">
                <dl class="kv">
                  <dt>所属公司</dt>
                  <dd>{{ company || '待补齐' }}</dd>
                  <dt>业务部门</dt>
                  <dd>
                    {{ departmentLabel(directory, contract.departmentId) }}
                  </dd>
                  <dt>付款条件</dt>
                  <dd :class="{ muted: !contract.paymentTerms }">
                    {{ contract.paymentTerms || '未填写' }}
                  </dd>
                  <dt>交付要求</dt>
                  <dd :class="{ muted: !contract.deliveryRequirement }">
                    {{ contract.deliveryRequirement || '未填写' }}
                  </dd>
                  <dt>阿里信保</dt>
                  <dd>
                    {{
                      contract.alibabaTradeAssuranceNo ||
                      (contract.useTradeAssurance ? '是' : '否')
                    }}
                  </dd>
                </dl>
                <div v-if="contract.salesCharges?.length" class="charges">
                  <div
                    v-for="charge in contract.salesCharges"
                    :key="charge.name"
                    class="charge"
                  >
                    <span>{{ charge.name }}</span><span>{{
                      nativeMoney(charge.amount, contract.currency)
                    }}</span>
                  </div>
                </div>
              </Card>
              <Card
                v-if="standardFiles.length"
                size="small"
                title="产品标准资料"
              >
                <Button
                  v-for="file in standardFiles"
                  :key="file.id"
                  type="link"
                  size="small"
                  class="file-link"
                  @click="download(file)"
                >
                  {{ file.skuName }} · {{ file.name }}
                </Button>
              </Card>
            </aside>
          </div>
        </TabPane>

        <TabPane
          key="purchase"
          :tab="`采购${related?.requests?.total ? ` ${related.requests.total}` : ''}`"
        >
          <div class="dept">
            <div class="dept-actions">
              <span
                v-for="entry in [
                  {
                    action: 'CREATE_REQUEST',
                    kind: 'requests' as DocumentKind,
                    title: '新建采购申请',
                  },
                ]"
                :key="entry.action"
                :title="quickActionReason(entry.action)"
              >
                <Button
                  type="primary"
                  :disabled="Boolean(quickActionReason(entry.action))"
                  @click="openQuickDocument(entry)"
                  >{{ entry.title }}</Button>
              </span>
            </div>
            <h4>采购申请</h4>
            <div v-if="purchaseRows.requests.length" class="mini-table">
              <div
                v-for="request in purchaseRows.requests"
                :key="request.id"
                class="mini-row"
              >
                <span class="strong">{{
                  request.code || request.name || '采购申请'
                }}</span>
                <span>{{ rows(request.items).length }} 项 · 需求
                  {{ requestDue(request) }}</span>
                <span>{{ label(request.assignmentStatus) }}</span>
              </div>
            </div>
            <p v-else class="muted">还没有采购申请</p>
            <h4>采购任务与报价</h4>
            <div v-if="purchaseRows.tasks.length" class="mini-table">
              <div
                v-for="task in purchaseRows.tasks"
                :key="task.id"
                class="mini-row"
              >
                <span class="strong">{{ itemName(task.contractItemId) }}</span>
                <span>{{ label(task.method) }} {{ task.quantity }} ·
                  {{ personName(directory, task.ownerUserId) }}</span>
                <span>{{
                  purchaseRows.quotes.filter(
                    (quote) => quote.assignmentId === task.id,
                  ).length
                    ? `${purchaseRows.quotes.filter((quote) => quote.assignmentId === task.id).length} 份报价`
                    : '还没报价'
                }}</span>
              </div>
            </div>
            <p v-else class="muted">采购还没接单</p>
            <h4>采购单</h4>
            <div v-if="purchaseRows.orders.length" class="mini-table">
              <div
                v-for="order in purchaseRows.orders"
                :key="order.id"
                class="mini-row"
              >
                <span class="strong">{{ order.code || '采购单' }} ·
                  {{ order.supplierName || '供应商未注明' }}</span>
                <span>{{ nativeMoney(order.amount, order.currency) }}</span>
                <span>到货 {{ orderProgress(order) }} ·
                  {{ label(order.status) }}</span>
              </div>
            </div>
            <p v-else class="muted">还没有采购单</p>
            <div class="all-links">
              <span class="muted">全部单据：</span>
              <Button
                v-for="kind in departmentLists.purchase"
                :key="kind"
                size="small"
                :disabled="childOpen"
                @click="openDocuments(kind, 'list')"
              >
                {{ documentDefinitions[kind].title }}
              </Button>
            </div>
          </div>
        </TabPane>

        <TabPane key="delivery" tab="发货与报关">
          <div class="dept">
            <div class="dept-actions">
              <Button
                type="primary"
                :disabled="ended || childOpen"
                @click="
                  router.push({
                    path: '/gongchang/stage-stock',
                    query: { tab: 'trade' },
                  })
                "
              >
                去工序库存安排出货
              </Button>
              <span class="muted">出货在工厂「工序库存」从已包装成品办理，数量自动记到本合同。</span>
            </div>
            <h4>发货记录</h4>
            <div v-if="shipmentRows.length" class="mini-table">
              <div
                v-for="shipment in shipmentRows"
                :key="shipment.id"
                class="mini-row"
              >
                <span class="strong">{{
                  itemName(shipment.contractItemId)
                }}</span>
                <span>{{ shipment.kind === 'RETURN' ? '退回 ' : ''
                  }}{{ shipment.quantity }}</span>
                <span>{{
                  String(
                    shipment.shippedDate ?? shipment.occurredAt ?? '',
                  ).slice(0, 10) || '日期未填'
                }}</span>
              </div>
            </div>
            <p v-else class="muted">还没有发货记录</p>
            <h4>报关</h4>
            <p v-if="customs" class="muted">
              {{
                customs.total
                  ? `${customs.completed} / ${customs.total} 批已完成，${customs.pending} 批办理中`
                  : '还没有报关批次'
              }}
            </p>
            <Alert v-if="customsError" :message="customsError" type="warning" />
            <div class="all-links">
              <span class="muted">全部单据：</span>
              <Button
                v-for="kind in departmentLists.delivery"
                :key="kind"
                size="small"
                :disabled="childOpen"
                @click="openDocuments(kind, 'list')"
              >
                {{ documentDefinitions[kind].title }}
              </Button>
              <Button
                size="small"
                :disabled="childOpen"
                @click="openDocuments('customs', 'list')"
                >
报关跟进
</Button>
            </div>
          </div>
        </TabPane>

        <TabPane
          key="finance"
          :tab="`收款与开票${receiptRows.length ? ` ${receiptRows.length}` : ''}`"
        >
          <div class="dept">
            <div class="dept-actions">
              <span
                v-for="entry in [
                  {
                    action: 'CREATE_RECEIPT',
                    kind: 'receipts' as DocumentKind,
                    title: '登记回款',
                  },
                  {
                    action: 'CREATE_INVOICE',
                    kind: 'invoices' as DocumentKind,
                    title: '开票办理',
                  },
                ]"
                :key="entry.action"
                :title="quickActionReason(entry.action)"
              >
                <Button
                  :type="
                    entry.action === 'CREATE_RECEIPT' ? 'primary' : 'default'
                  "
                  :disabled="Boolean(quickActionReason(entry.action))"
                  @click="openQuickDocument(entry)"
                  >{{ entry.title }}</Button>
              </span>
              <Button
                :disabled="childOpen || ended"
                @click="reimbursementOpen = true"
                >
费用报销
</Button>
            </div>
            <h4>回款</h4>
            <div v-if="receiptRows.length" class="mini-table">
              <div
                v-for="receipt in receiptRows"
                :key="receipt.id"
                class="mini-row"
              >
                <span class="strong">{{ receipt.receivedAt ?? '日期未填' }} ·
                  {{ label(receipt.kind) }}</span>
                <span>{{ nativeMoney(receipt.amount, receipt.currency)
                  }}{{
                    receipt.rmbAmount
                      ? ` · 折 CNY ${Number(receipt.rmbAmount).toLocaleString('en-US')}`
                      : ''
                  }}</span>
                <span><Tag
                    :color="receipt.status === 'CONFIRMED' ? 'green' : 'orange'"
                    >{{ label(receipt.status) }}</Tag></span>
              </div>
            </div>
            <p v-else class="muted">还没有登记回款</p>
            <h4>发票</h4>
            <div v-if="invoiceRows.length" class="mini-table">
              <div
                v-for="invoice in invoiceRows"
                :key="invoice.id"
                class="mini-row"
              >
                <span class="strong">{{ invoice.invoiceNumber || '发票号未填' }} ·
                  {{ label(invoice.type) }}</span>
                <span>{{ nativeMoney(invoice.amount, invoice.currency) }}</span>
                <span>{{ invoice.issuedAt ?? '' }}
                  {{ label(invoice.status) }}</span>
              </div>
            </div>
            <p v-else class="muted">还没有开票</p>
            <div class="all-links">
              <span class="muted">全部单据：</span>
              <Button
                v-for="kind in departmentLists.finance"
                :key="kind"
                size="small"
                :disabled="childOpen"
                @click="openDocuments(kind, 'list')"
              >
                {{ documentDefinitions[kind].title }}
              </Button>
            </div>
          </div>
        </TabPane>

        <TabPane key="attachments" tab="合同附件">
          <ContractFilesPanel
            :contract-id="contract.id"
            :listing="attachments"
            :directory="directory"
            :error="attachmentError"
            :loading="attachmentLoading"
            uploadable
            @refresh="loadFiles"
            @busy="(value) => (attachmentBusy = value)"
          />
        </TabPane>
        <TabPane key="audit" tab="操作记录">
          <Alert v-if="auditError" :message="auditError" type="error" />
          <RecordTable
            :data="auditRows"
            :columns="
              columns(
                'action|业务动作',
                'actor_id|操作人',
                'created_at|时间',
                'document_version|保存版本',
              )
            "
          />
        </TabPane>
      </Tabs>
      <Alert v-if="relatedError" :message="relatedError" type="warning">
        <template #action>
          <Button size="small" @click="loadSummary">重新读取</Button>
        </template>
      </Alert>
    </div>
  </Drawer>
  <Modal
    :open="open && !!terminateAction"
    :title="terminateAction === 'CANCEL_CONTRACT' ? '取消合同' : '合同结案'"
    :confirm-loading="terminating"
    :ok-text="terminateAction === 'CANCEL_CONTRACT' ? '确认取消' : '确认结案'"
    :ok-button-props="{ danger: terminateAction === 'CANCEL_CONTRACT' }"
    :mask-closable="!terminating"
    :closable="!terminating"
    :z-index="2100"
    @cancel="!terminating && (terminateAction = undefined)"
    @ok="terminate"
  >
    <p class="terminate-note">
      {{
        terminateAction === 'CANCEL_CONTRACT'
          ? '取消后合同只能查看，不能再办理采购、发货和收款。还有采购单、到货或回款时系统会拒绝取消。'
          : '结案前系统会核对发货、采购和收款都已办完。'
      }}
      系统要核对库存和财务单据，可能需要等一会儿。
    </p>
    <Input.TextArea
      v-model:value="terminateReason"
      :rows="3"
      :maxlength="1000"
      :disabled="terminating"
      :placeholder="
        terminateAction === 'CANCEL_CONTRACT'
          ? '取消原因（必填）'
          : '结案说明（必填）'
      "
    />
  </Modal>
  <ContractDocumentDialog
    :open="open && documentsOpen"
    :kind="documentKind"
    :mode="documentMode"
    :contract="contract"
    @close="documentsOpen = false"
    @updated="documentUpdated"
  /><ContractEditor
    :open="editorOpen"
    :contract="contract"
    :directory="directory"
    :master="master"
    @close="editorOpen = false"
    @saved="
      (value) => {
        editorOpen = false;
        emit('updated', value);
      }
    "
  /><ImportedContractCompletion
    :open="completionOpen && open"
    :contract="contract"
    :directory="directory"
    @close="completionOpen = false"
    @saved="(value) => emit('updated', value)"
  /><FinanceDocument
    :open="open && reimbursementOpen"
    type="REIMBURSEMENT"
    :context="{ contractId: contract?.id, currency: contract?.currency }"
    @close="reimbursementOpen = false"
    @updated="emit('refresh')"
  />
  <DocumentAction
    v-if="workLaunch?.action"
    :open="open"
    :kind="workLaunch.kind"
    :action="workLaunch.action"
    :contract-id="contract?.id"
    :row="workRow"
    :source="workLaunch.source"
    lock-contract
    @close="workLaunch = undefined"
    @updated="documentUpdated"
  />
  <RecordDetail
    v-if="workLaunch && !workLaunch.action"
    :open="open"
    :kind="workLaunch.kind"
    :row="workRow"
    embedded
    @close="workLaunch = undefined"
    @updated="emit('refresh')"
  />
</template>
<style scoped>
.contract-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 16px;
  align-items: center;
}

.identity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.identity-line {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1;
  gap: 4px 14px;
  margin: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.identity-actions {
  display: flex;
  grid-row: 1 / span 2;
  grid-column: 2;
  gap: 6px;
}

.moneybar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.moneybar div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px 14px;
}

.moneybar div + div {
  border-left: 1px solid hsl(var(--border));
}

.moneybar span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.moneybar b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.moneybar b.pending {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.other-tasks > summary {
  padding: 4px 0;
  font-size: 13px;
  color: hsl(var(--primary));
  cursor: pointer;
}

.products-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 14px;
}

.ptable {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.pr {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) 0.8fr 0.55fr 0.9fr 0.8fr 1.15fr 0.5fr;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  font-size: 12.5px;
  border-top: 1px solid hsl(var(--border));
}

.pr.th {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 50%);
  border-top: 0;
}

.pr.foot {
  font-weight: 600;
  background: hsl(var(--muted) / 50%);
}

.pr .r {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.pr .done {
  color: hsl(var(--success));
}

.prod {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.thumb {
  flex: none;
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: 6px;
}

.prod-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  white-space: nowrap;
}

.sub {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.note {
  padding: 6px 12px;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--primary));
  cursor: help;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 12.5px;
}

.kv dt,
.muted {
  color: hsl(var(--muted-foreground));
}

.kv dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.charges {
  padding-top: 6px;
  margin-top: 8px;
  border-top: 1px dashed hsl(var(--border));
}

.charge {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
}

.file-link {
  display: block;
  height: auto;
  padding: 2px 0;
  white-space: normal;
}

.dept {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dept h4 {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.dept-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.mini-table {
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.mini-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 7px 12px;
  font-size: 12.5px;
}

.mini-row + .mini-row {
  border-top: 1px solid hsl(var(--border));
}

.all-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px dashed hsl(var(--border));
}

.terminate-note {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 900px) {
  .products-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .moneybar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .identity {
    grid-template-columns: minmax(0, 1fr);
  }

  .identity-actions {
    grid-row: auto;
    grid-column: 1;
  }
}
</style>
