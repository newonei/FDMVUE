<script lang="ts" setup>
import type { FdmProcurementPurchaseOrderHandoffApi } from '#/api/fdmprocurement/purchase-order-handoff';
import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { ProductSelectionValue } from '#/views/fdmproduct/shared/product-selection';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Input,
  message,
  Modal,
  Skeleton,
  Table,
  Tag,
  Timeline,
} from 'ant-design-vue';

import {
  getPurchaseOrderHandoffExecutionFacts,
  getPurchaseOrderHandoffLifecycleEvents,
  getPurchaseOrderHandoffProjectionState,
  getPurchaseOrderHandoffs,
  retryPurchaseOrderHandoff,
  retryPurchaseOrderHandoffProjection,
} from '#/api/fdmprocurement/purchase-order-handoff';
import {
  bindProcurementRequisitionProductSku,
  getProcurementRequisition,
  getProcurementRequisitionApprovalState,
  preValidateProcurementRequisition,
  submitProcurementRequisition,
  withdrawProcurementRequisition,
} from '#/api/fdmprocurement/requisition';
import { evaluateProcurementSourcing } from '#/api/fdmprocurement/sourcing';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import {
  TradeDetailLayout,
  TradeRelatedDocuments,
} from '#/views/fdm-trade-shared/components';
import { fdmTradeDocumentRoute } from '#/views/fdm-trade-shared/document-links';
import { ProductSelectionModal } from '#/views/fdmproduct/shared';

import { sourcingGenerationRouteQuery } from '../../sourcing/generation-route';
import {
  clearStableCommandKey,
  getStableCommandKey,
} from '../command-idempotency';
import {
  isProcurementVersionConflict,
  shouldClearProductBindingCommandKey,
} from '../concurrency';
import {
  canLoadExecutionFacts,
  canLoadLifecycleHistory,
  canRetryHandoff,
  canRetryProjection,
  erpLifecycleActionMeta,
  erpLifecycleEventResultMeta,
  erpLifecycleNotice,
  erpLifecycleStatusMeta,
  executionActionMeta,
  executionDocumentTypeMeta,
  executionEventResultMeta,
  executionPostingStateMeta,
  handoffStatusMeta,
  projectionStateNotice,
  projectionStatusMeta,
  validateProjectionRetryReason,
} from '../handoff-policy';
import {
  authoritativeSelectedAssessmentRef,
  canBindUnmappedProductSku,
  canUseRequisitionAction,
  hasAllActionPermissions,
  hasValidSelectedAssessmentRef,
  requisitionStatusMeta,
  validationStatusMeta,
} from '../policy';
import { buildRequisitionRelationLinks } from '../relation-links';

defineOptions({ name: 'FdmProcurementRequisitionDetail' });

const props = defineProps<{ id?: number | string }>();

interface LifecycleHistoryState {
  events: FdmProcurementPurchaseOrderHandoffApi.LifecycleEvent[];
  failed: boolean;
  loaded: boolean;
  loading: boolean;
  requestSequence: number;
}

interface ExecutionFactsState {
  documents: FdmProcurementPurchaseOrderHandoffApi.ExecutionDocument[];
  failed: boolean;
  loaded: boolean;
  loading: boolean;
  requestSequence: number;
}

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const userStore = useUserStore();

const detail = ref<FdmProcurementRequisitionApi.Requisition>();
const approvalState = ref<FdmProcurementRequisitionApi.ApprovalState>();
const validation = ref<FdmProcurementRequisitionApi.ValidationResult>();
const loading = ref(false);
const actionLoading = ref('');
const approvalLoadFailed = ref(false);
const handoffLoading = ref(false);
const handoffLoadFailed = ref(false);
const handoffs = ref<FdmProcurementPurchaseOrderHandoffApi.Handoff[]>([]);
const projectionLoading = ref(false);
const projectionLoadFailed = ref(false);
const projectionState =
  ref<FdmProcurementPurchaseOrderHandoffApi.ProjectionState>();
const lifecycleHistoryByHandoff = ref<Record<string, LifecycleHistoryState>>(
  {},
);
const expandedLifecycleHandoffIds = ref<string[]>([]);
const executionFactsByHandoff = ref<Record<string, ExecutionFactsState>>({});
const expandedExecutionHandoffIds = ref<string[]>([]);
const projectionRetryOpen = ref(false);
const projectionRetryReason = ref('');
const projectionRetryError = ref('');
const submitComment = ref('');
const withdrawReason = ref('');
const productBindingOpen = ref(false);
const productPickerOpen = ref(false);
const productBindingReason = ref('');
const productBindingItem = ref<FdmProcurementRequisitionApi.RequisitionItem>();
const selectedProduct = ref<ProductSelectionValue>();
const productBindingSaving = ref(false);
let requestSequence = 0;
let handoffRequestSequence = 0;
let lifecycleHistoryEpoch = 0;
let lifecycleHistoryRequestSequence = 0;
let executionFactsEpoch = 0;
let executionFactsRequestSequence = 0;
let disposed = false;

const requisitionId = computed(() =>
  String(props.id || route.params.id || route.query.id || ''),
);
const selectedAssessmentRef = computed(() =>
  authoritativeSelectedAssessmentRef(detail.value, approvalState.value),
);
const selectedAssessmentId = computed(
  () => selectedAssessmentRef.value.assessmentId,
);
const selectedAssessmentInputHash = computed(
  () => selectedAssessmentRef.value.inputHash,
);
const currentUserId = computed(() =>
  String(userStore.userInfo?.id ?? userStore.userInfo?.userId ?? ''),
);
const hasPermission = (code: string) => hasAccessByCodes([code]);
const hasPreValidatePermission = computed(() =>
  hasAllActionPermissions('PRE_VALIDATE', hasPermission),
);
const hasSourcingPermission = computed(() =>
  hasAllActionPermissions('SOURCING', hasPermission),
);
const hasAiSourcingPermission = computed(() =>
  hasAllActionPermissions('AI_SOURCING', hasPermission),
);
const hasSubmitPermission = computed(() =>
  hasAllActionPermissions('SUBMIT', hasPermission),
);
const hasWithdrawPermission = computed(() =>
  hasAllActionPermissions('WITHDRAW', hasPermission),
);
const hasApprovalWorkspacePermission = computed(() =>
  hasAllActionPermissions('APPROVAL_WORKSPACE', hasPermission),
);
const hasHandoffQueryPermission = computed(() =>
  hasPermission('fdmprocurement:purchase-order-handoff:query'),
);
const hasReviewPermission = computed(() =>
  hasAllActionPermissions('EDIT', hasPermission),
);
const canQueryContract = computed(() =>
  hasPermission('fdmwaimao:contract-order:query'),
);
const canQueryFulfillmentPlan = computed(() =>
  hasPermission('fdmwaimao:demand-plan:query'),
);
const canQueryRequisition = computed(() =>
  hasPermission('fdmprocurement:requisition:query'),
);
const canQueryShipment = computed(() =>
  hasPermission('fdmwaimao:shipment:query'),
);
const sourceContractReference = computed(
  () => detail.value?.traceability?.sourceContract,
);
const sourceFulfillmentPlanReference = computed(
  () => detail.value?.traceability?.sourceFulfillmentPlan,
);
const canOpenSourceContract = computed(
  () =>
    canQueryContract.value &&
    sourceContractReference.value?.accessible === true &&
    Boolean(sourceContractReference.value.id),
);
const canOpenSourceFulfillmentPlan = computed(
  () =>
    canQueryFulfillmentPlan.value &&
    sourceFulfillmentPlanReference.value?.accessible === true &&
    Boolean(sourceFulfillmentPlanReference.value.id),
);
const sourceContractLabel = computed(() => {
  const reference = sourceContractReference.value;
  if (!reference?.accessible || !reference.id) {
    return '暂无可查看的合同编号';
  }
  return reference.documentNo?.trim() || `合同 ${reference.id}`;
});
const sourceFulfillmentPlanLabel = computed(() => {
  const reference = sourceFulfillmentPlanReference.value;
  if (!reference?.accessible || !reference.id) {
    return '暂无可查看的履约计划编号';
  }
  return reference.documentNo?.trim() || `履约计划 ${reference.id}`;
});
const relationLinks = computed(() =>
  detail.value
    ? buildRequisitionRelationLinks(detail.value, {
        contract: canQueryContract.value,
        fulfillmentPlan: canQueryFulfillmentPlan.value,
        requisition: canQueryRequisition.value,
        shipment: canQueryShipment.value,
      })
    : [],
);
const canPreValidate = computed(() =>
  detail.value
    ? canUseRequisitionAction(
        detail.value,
        'PRE_VALIDATE',
        hasPermission,
        approvalState.value,
      )
    : false,
);
const canSourcing = computed(() =>
  detail.value
    ? canUseRequisitionAction(
        detail.value,
        'SOURCING',
        hasPermission,
        approvalState.value,
      )
    : false,
);
const canAiSourcing = computed(() =>
  detail.value
    ? canUseRequisitionAction(
        detail.value,
        'AI_SOURCING',
        hasPermission,
        approvalState.value,
      )
    : false,
);
const canSubmit = computed(() =>
  detail.value
    ? canUseRequisitionAction(
        detail.value,
        'SUBMIT',
        hasPermission,
        approvalState.value,
      ) &&
      hasValidSelectedAssessmentRef(
        selectedAssessmentId.value,
        selectedAssessmentInputHash.value,
      )
    : false,
);
const canWithdraw = computed(() =>
  detail.value
    ? canUseRequisitionAction(
        detail.value,
        'WITHDRAW',
        hasPermission,
        approvalState.value,
        currentUserId.value,
      )
    : false,
);
const canOpenApproval = computed(() =>
  detail.value
    ? canUseRequisitionAction(
        detail.value,
        'APPROVAL_WORKSPACE',
        hasPermission,
        approvalState.value,
      )
    : false,
);

useFdmWaimaoAiContext(() => ({
  businessId: requisitionId.value || undefined,
  companyId: detail.value?.companyId,
  context: {
    approval: {
      processStarted: Boolean(approvalState.value?.processInstanceId),
      submittedVersion: approvalState.value?.submittedVersion,
    },
    loading: loading.value,
    requisition: detail.value
      ? {
          id: detail.value.id,
          itemCount: detail.value.items.length,
          requisitionNo: detail.value.requisitionNo,
          sourcePlanId: detail.value.sourcePlanId,
          sourcePlanVersion: detail.value.sourcePlanVersion,
          status: detail.value.status,
          validationStatus: detail.value.validationStatus,
          version: detail.value.version,
        }
      : undefined,
    validation: validation.value
      ? {
          blockerCount: validation.value.issues.filter(
            (issue) => issue.severity === 'BLOCKER',
          ).length,
          issueCount: validation.value.issues.length,
          status: validation.value.validationStatus,
          warningCount: validation.value.issues.filter(
            (issue) => issue.severity === 'WARNING',
          ).length,
        }
      : undefined,
  },
  contextMode: 'detail',
  entityLabel: detail.value?.requisitionNo,
  surfaceKey: 'procurement-requisition',
}));
const projectionMeta = computed(() =>
  projectionState.value
    ? projectionStatusMeta(projectionState.value.status)
    : undefined,
);
const projectionNotice = computed(() =>
  projectionState.value
    ? projectionStateNotice(projectionState.value, {
        handoffListLoaded: !handoffLoading.value && !handoffLoadFailed.value,
        visibleHandoffCount: handoffs.value.length,
      })
    : undefined,
);
const canRetryProjectionState = computed(() =>
  projectionState.value
    ? canRetryProjection(projectionState.value, hasPermission)
    : false,
);

const itemColumns = [
  { dataIndex: 'lineNo', key: 'lineNo', title: '行', width: 60 },
  { key: 'product', title: '产品快照', width: 260 },
  { key: 'mapping', title: '产品映射', width: 120 },
  { dataIndex: 'purchaseUnit', key: 'unit', title: '采购单位', width: 100 },
  { dataIndex: 'requestedQty', key: 'quantity', title: '申请数量', width: 120 },
  {
    dataIndex: 'requiredDate',
    key: 'requiredDate',
    title: '要求日期',
    width: 120,
  },
  { key: 'lineage', title: '行级血缘', width: 230 },
];

function canBindProductSku(item: FdmProcurementRequisitionApi.RequisitionItem) {
  return detail.value
    ? canBindUnmappedProductSku(detail.value, item, hasPermission)
    : false;
}

function asRequisitionItem(record: Record<string, unknown>) {
  return record as unknown as FdmProcurementRequisitionApi.RequisitionItem;
}

function openProductBinding(
  item: FdmProcurementRequisitionApi.RequisitionItem,
) {
  if (!canBindProductSku(item)) return;
  productBindingItem.value = item;
  selectedProduct.value = undefined;
  productBindingReason.value = '';
  productBindingOpen.value = true;
}

function selectBindingProduct(value: ProductSelectionValue) {
  selectedProduct.value = value;
}

function closeProductBinding(force = false) {
  if (productBindingSaving.value && !force) return;
  productBindingOpen.value = false;
  productPickerOpen.value = false;
  productBindingItem.value = undefined;
  selectedProduct.value = undefined;
  productBindingReason.value = '';
}

async function bindProductSku() {
  const requisition = detail.value;
  const item = productBindingItem.value;
  const product = selectedProduct.value;
  const reason = productBindingReason.value.trim();
  if (!requisition || !item || !product || !canBindProductSku(item)) return;
  if (!reason) {
    message.warning('必须填写本次人工绑定原因。');
    return;
  }
  const commandIdentity = [
    requisition.id,
    requisition.version,
    item.id,
    item.version,
    product.productId,
    product.skuId,
    product.versionToken,
    reason,
  ].join('|');
  productBindingSaving.value = true;
  try {
    await bindProcurementRequisitionProductSku({
      expectedVersion: requisition.version,
      id: requisition.id,
      idempotencyKey: getStableCommandKey('bind-product-sku', commandIdentity),
      itemExpectedVersion: item.version,
      itemId: item.id,
      productId: product.productId,
      productVersionToken: product.versionToken,
      reason,
      skuId: product.skuId,
    });
    clearStableCommandKey('bind-product-sku', commandIdentity);
    message.success('产品中心 SKU 已绑定，正在读取最新申请版本');
    closeProductBinding(true);
    await load();
  } catch (error) {
    if (isProcurementVersionConflict(error)) {
      if (shouldClearProductBindingCommandKey(error)) {
        clearStableCommandKey('bind-product-sku', commandIdentity);
      }
      message.error('采购申请或明细版本已变化，已刷新最新数据，请重新选择。');
      closeProductBinding(true);
      await load();
    } else {
      message.error('绑定失败；已保留同一幂等键，可直接重试。');
    }
  } finally {
    productBindingSaving.value = false;
  }
}

const handoffLineColumns = [
  { key: 'product', title: '产品与 ERP 映射', width: 230 },
  { key: 'quantity', title: '采购数量 → ERP 基础数量', width: 220 },
  { key: 'price', title: '报价、税率与人民币净价', width: 270 },
  { key: 'schedule', title: '交付日期', width: 160 },
  { key: 'lineage', title: '供应决策血缘', width: 250 },
  { key: 'erpItem', title: 'ERP 明细回执', width: 150 },
];

const executionLineColumns = [
  { key: 'line', title: '执行行 / 业务血缘', width: 280 },
  { key: 'quantity', title: '单据数量 / 净入库数量', width: 240 },
  { key: 'amount', title: '单价、金额与税额', width: 240 },
  { key: 'state', title: '当前过账事实', width: 220 },
];

function executionLineRowKey(
  line: FdmProcurementPurchaseOrderHandoffApi.ExecutionLine,
) {
  return (
    line.purchaseInItemId ||
    line.purchaseReturnItemId ||
    `${line.purchaseOrderItemId}:${line.lineRef}`
  );
}

function executionLineIdentity(documentType: string, rawLine: unknown) {
  // Ant Design Vue types scoped-slot records as a generic Record even though
  // dataSource is strongly typed. Narrow it once at this display-only edge.
  const line = rawLine as FdmProcurementPurchaseOrderHandoffApi.ExecutionLine;
  return documentType === 'PURCHASE_RETURN'
    ? `退货行 ${line.purchaseReturnItemId || '—'}`
    : `入库行 ${line.purchaseInItemId || '—'}`;
}

function displayValue(value?: null | number | string) {
  return value === undefined || value === null || value === ''
    ? '—'
    : String(value);
}

function displayDateTime(
  value?: FdmProcurementPurchaseOrderHandoffApi.DateTimeValue | null,
) {
  return displayValue(value).replace('T', ' ');
}

function resetLifecycleHistories() {
  ++lifecycleHistoryEpoch;
  lifecycleHistoryByHandoff.value = {};
  expandedLifecycleHandoffIds.value = [];
}

function resetExecutionFacts() {
  ++executionFactsEpoch;
  executionFactsByHandoff.value = {};
  expandedExecutionHandoffIds.value = [];
}

function resetHandoffEvidence() {
  resetLifecycleHistories();
  resetExecutionFacts();
}

function lifecycleHistoryState(handoffId: string) {
  return lifecycleHistoryByHandoff.value[handoffId];
}

function lifecyclePanelActiveKey(handoffId: string) {
  return expandedLifecycleHandoffIds.value.includes(handoffId)
    ? ['lifecycle-history']
    : [];
}

function isLifecyclePanelExpanded(activeKey: unknown) {
  const values = Array.isArray(activeKey) ? activeKey : [activeKey];
  return values.some((value) => String(value) === 'lifecycle-history');
}

function isCurrentLifecycleHistoryRequest(
  handoffId: string,
  pageSequence: number,
  epoch: number,
  historySequence: number,
) {
  return (
    !disposed &&
    canLoadLifecycleHistory(
      handoffId,
      handoffs.value,
      hasHandoffQueryPermission.value,
    ) &&
    pageSequence === requestSequence &&
    epoch === lifecycleHistoryEpoch &&
    requisitionId.value !== '' &&
    lifecycleHistoryByHandoff.value[handoffId]?.requestSequence ===
      historySequence
  );
}

async function loadLifecycleHistory(handoffId: string) {
  if (
    !canLoadLifecycleHistory(
      handoffId,
      handoffs.value,
      hasHandoffQueryPermission.value,
    )
  ) {
    return;
  }
  const current = lifecycleHistoryByHandoff.value[handoffId];
  if (current?.loading || current?.loaded) return;

  const pageSequence = requestSequence;
  const epoch = lifecycleHistoryEpoch;
  const historySequence = ++lifecycleHistoryRequestSequence;
  lifecycleHistoryByHandoff.value[handoffId] = {
    events: current?.events ?? [],
    failed: false,
    loaded: false,
    loading: true,
    requestSequence: historySequence,
  };
  try {
    const events = await getPurchaseOrderHandoffLifecycleEvents(handoffId);
    if (
      !isCurrentLifecycleHistoryRequest(
        handoffId,
        pageSequence,
        epoch,
        historySequence,
      )
    ) {
      return;
    }
    lifecycleHistoryByHandoff.value[handoffId] = {
      events,
      failed: false,
      loaded: true,
      loading: false,
      requestSequence: historySequence,
    };
  } catch {
    if (
      !isCurrentLifecycleHistoryRequest(
        handoffId,
        pageSequence,
        epoch,
        historySequence,
      )
    ) {
      return;
    }
    lifecycleHistoryByHandoff.value[handoffId] = {
      events: [],
      failed: true,
      loaded: false,
      loading: false,
      requestSequence: historySequence,
    };
  }
}

function handleLifecyclePanelChange(handoffId: string, activeKey: unknown) {
  const expanded = isLifecyclePanelExpanded(activeKey);
  const next = new Set(expandedLifecycleHandoffIds.value);
  if (expanded) {
    next.add(handoffId);
    void loadLifecycleHistory(handoffId);
  } else {
    next.delete(handoffId);
  }
  expandedLifecycleHandoffIds.value = [...next];
}

function executionFactsState(handoffId: string) {
  return executionFactsByHandoff.value[handoffId];
}

function executionPanelActiveKey(handoffId: string) {
  return expandedExecutionHandoffIds.value.includes(handoffId)
    ? ['execution-facts']
    : [];
}

function isExecutionPanelExpanded(activeKey: unknown) {
  const values = Array.isArray(activeKey) ? activeKey : [activeKey];
  return values.some((value) => String(value) === 'execution-facts');
}

function isCurrentExecutionFactsRequest(
  handoffId: string,
  pageSequence: number,
  epoch: number,
  factsSequence: number,
) {
  return (
    !disposed &&
    canLoadExecutionFacts(
      handoffId,
      handoffs.value,
      hasHandoffQueryPermission.value,
    ) &&
    pageSequence === requestSequence &&
    epoch === executionFactsEpoch &&
    requisitionId.value !== '' &&
    executionFactsByHandoff.value[handoffId]?.requestSequence === factsSequence
  );
}

async function loadExecutionFacts(handoffId: string) {
  if (
    !canLoadExecutionFacts(
      handoffId,
      handoffs.value,
      hasHandoffQueryPermission.value,
    )
  ) {
    return;
  }
  const current = executionFactsByHandoff.value[handoffId];
  if (current?.loading || current?.loaded) return;

  const pageSequence = requestSequence;
  const epoch = executionFactsEpoch;
  const factsSequence = ++executionFactsRequestSequence;
  executionFactsByHandoff.value[handoffId] = {
    documents: current?.documents ?? [],
    failed: false,
    loaded: false,
    loading: true,
    requestSequence: factsSequence,
  };
  try {
    const documents = await getPurchaseOrderHandoffExecutionFacts(handoffId);
    if (
      !isCurrentExecutionFactsRequest(
        handoffId,
        pageSequence,
        epoch,
        factsSequence,
      )
    ) {
      return;
    }
    executionFactsByHandoff.value[handoffId] = {
      documents,
      failed: false,
      loaded: true,
      loading: false,
      requestSequence: factsSequence,
    };
  } catch {
    if (
      !isCurrentExecutionFactsRequest(
        handoffId,
        pageSequence,
        epoch,
        factsSequence,
      )
    ) {
      return;
    }
    executionFactsByHandoff.value[handoffId] = {
      documents: [],
      failed: true,
      loaded: false,
      loading: false,
      requestSequence: factsSequence,
    };
  }
}

function handleExecutionPanelChange(handoffId: string, activeKey: unknown) {
  const expanded = isExecutionPanelExpanded(activeKey);
  const next = new Set(expandedExecutionHandoffIds.value);
  if (expanded) {
    next.add(handoffId);
    void loadExecutionFacts(handoffId);
  } else {
    next.delete(handoffId);
  }
  expandedExecutionHandoffIds.value = [...next];
}

async function loadApprovalState(id: string, sequence: number) {
  try {
    const result = await getProcurementRequisitionApprovalState(id);
    if (disposed || sequence !== requestSequence || id !== requisitionId.value)
      return;
    approvalState.value = result;
  } catch {
    if (disposed || sequence !== requestSequence || id !== requisitionId.value)
      return;
    approvalState.value = undefined;
    approvalLoadFailed.value = true;
  }
}

function isCurrentHandoffRequest(
  id: string,
  pageSequence: number,
  handoffSequence: number,
) {
  return (
    !disposed &&
    pageSequence === requestSequence &&
    handoffSequence === handoffRequestSequence &&
    id === requisitionId.value
  );
}

async function loadHandoffState(
  id: string,
  status: string,
  pageSequence = requestSequence,
) {
  const handoffSequence = ++handoffRequestSequence;
  resetHandoffEvidence();
  handoffLoadFailed.value = false;
  handoffs.value = [];
  projectionLoadFailed.value = false;
  projectionState.value = undefined;
  handoffLoading.value = false;
  projectionLoading.value = false;
  if (!hasHandoffQueryPermission.value || status !== 'APPROVED') return;
  handoffLoading.value = true;
  projectionLoading.value = true;
  try {
    const [projectionResult, handoffResult] = await Promise.allSettled([
      getPurchaseOrderHandoffProjectionState(id),
      getPurchaseOrderHandoffs(id),
    ]);
    if (!isCurrentHandoffRequest(id, pageSequence, handoffSequence)) return;
    if (projectionResult.status === 'fulfilled') {
      projectionState.value = projectionResult.value;
    } else {
      projectionLoadFailed.value = true;
    }
    if (handoffResult.status === 'fulfilled') {
      handoffs.value = handoffResult.value;
    } else {
      handoffLoadFailed.value = true;
    }
  } finally {
    if (isCurrentHandoffRequest(id, pageSequence, handoffSequence)) {
      handoffLoading.value = false;
      projectionLoading.value = false;
    }
  }
}

async function load() {
  const id = requisitionId.value;
  const sequence = ++requestSequence;
  ++handoffRequestSequence;
  resetHandoffEvidence();
  loading.value = Boolean(id);
  detail.value = undefined;
  validation.value = undefined;
  approvalState.value = undefined;
  approvalLoadFailed.value = false;
  handoffs.value = [];
  handoffLoadFailed.value = false;
  projectionState.value = undefined;
  projectionLoadFailed.value = false;
  projectionRetryOpen.value = false;
  projectionRetryReason.value = '';
  projectionRetryError.value = '';
  handoffLoading.value = false;
  projectionLoading.value = false;
  if (!id) return;
  try {
    const result = await getProcurementRequisition(id);
    if (disposed || sequence !== requestSequence || id !== requisitionId.value)
      return;
    detail.value = result;
    await Promise.all([
      loadApprovalState(id, sequence),
      loadHandoffState(id, result.status, sequence),
    ]);
  } finally {
    if (
      !disposed &&
      sequence === requestSequence &&
      id === requisitionId.value
    ) {
      loading.value = false;
    }
  }
}

async function refreshHandoffs() {
  if (!detail.value) return;
  await loadHandoffState(detail.value.id, detail.value.status);
}

async function retryHandoff(
  handoff: FdmProcurementPurchaseOrderHandoffApi.Handoff,
) {
  if (!canRetryHandoff(handoff, hasPermission)) return;
  actionLoading.value = `handoff:${handoff.id}`;
  try {
    await retryPurchaseOrderHandoff({
      expectedVersion: handoff.version,
      id: handoff.id,
    });
    message.success('已重新进入 ERP 草稿采购单发送队列');
    await refreshHandoffs();
  } finally {
    actionLoading.value = '';
  }
}

function openProjectionRetry() {
  if (!canRetryProjectionState.value) return;
  projectionRetryReason.value = '';
  projectionRetryError.value = '';
  projectionRetryOpen.value = true;
}

function closeProjectionRetry() {
  if (actionLoading.value === 'projection-retry') return;
  projectionRetryOpen.value = false;
  projectionRetryReason.value = '';
  projectionRetryError.value = '';
}

async function retryProjection() {
  const state = projectionState.value;
  const requisition = detail.value;
  if (
    actionLoading.value === 'projection-retry' ||
    !state ||
    !requisition ||
    !canRetryProjection(state, hasPermission) ||
    !state.outboxId ||
    state.outboxVersion === null ||
    state.outboxVersion === undefined
  ) {
    return;
  }
  const validated = validateProjectionRetryReason(projectionRetryReason.value);
  if (!validated.valid) {
    projectionRetryError.value = validated.error;
    return;
  }

  const requestedRequisitionId = requisition.id;
  actionLoading.value = 'projection-retry';
  projectionRetryError.value = '';
  try {
    await retryPurchaseOrderHandoffProjection({
      expectedVersion: state.outboxVersion,
      outboxId: state.outboxId,
      reason: validated.reason,
      requisitionId: requestedRequisitionId,
    });
    if (disposed || requestedRequisitionId !== requisitionId.value) return;
    projectionRetryOpen.value = false;
    projectionRetryReason.value = '';
    message.success('审批投影已恢复到等待投递，将由后端任务继续处理');
    await refreshHandoffs();
  } finally {
    actionLoading.value = '';
  }
}

async function runPreValidation() {
  if (!detail.value || !canPreValidate.value) return;
  actionLoading.value = 'validate';
  try {
    validation.value = await preValidateProcurementRequisition({
      expectedVersion: detail.value.version,
      id: detail.value.id,
    });
    message.success(
      validation.value.validationStatus === 'PASSED'
        ? '数据预检已通过'
        : '数据预检完成，请处理阻断项',
    );
    await load();
  } finally {
    actionLoading.value = '';
  }
}

async function startSourcing() {
  if (!detail.value || !canSourcing.value) return;
  actionLoading.value = 'sourcing';
  try {
    const assessment = await evaluateProcurementSourcing({
      expectedRequisitionVersion: detail.value.version,
      requisitionId: detail.value.id,
    });
    void router.push({
      path: `/fdmprocurement/sourcing/${assessment.id}`,
      query: { requisitionId: detail.value.id },
    });
  } finally {
    actionLoading.value = '';
  }
}

function startAiSourcing() {
  if (!detail.value || !canAiSourcing.value) return;
  void router.push({
    path: '/fdmprocurement/sourcing/generate',
    query: sourcingGenerationRouteQuery(detail.value.id, detail.value.version),
  });
}

async function submit() {
  if (!detail.value || !canSubmit.value) return;
  const commandIdentity = [
    detail.value.id,
    detail.value.version,
    selectedAssessmentId.value,
    selectedAssessmentInputHash.value,
    submitComment.value.trim(),
  ].join('|');
  actionLoading.value = 'submit';
  try {
    const result = await submitProcurementRequisition({
      comment: submitComment.value.trim() || undefined,
      expectedAssessmentInputHash: selectedAssessmentInputHash.value,
      expectedVersion: detail.value.version,
      id: detail.value.id,
      idempotencyKey: getStableCommandKey('submit', commandIdentity),
      selectedAssessmentId: selectedAssessmentId.value,
    });
    clearStableCommandKey('submit', commandIdentity);
    message.success(
      result.idempotent ? '该申请已提交，无需重复操作' : '采购申请已提交审批',
    );
    submitComment.value = '';
    await load();
  } finally {
    actionLoading.value = '';
  }
}

async function withdraw() {
  if (!detail.value || !canWithdraw.value) return;
  const reason = withdrawReason.value.trim();
  if (!reason) {
    message.warning('请填写撤回原因');
    return;
  }
  const commandIdentity = [detail.value.id, detail.value.version, reason].join(
    '|',
  );
  actionLoading.value = 'withdraw';
  try {
    const result = await withdrawProcurementRequisition({
      expectedVersion: detail.value.version,
      id: detail.value.id,
      idempotencyKey: getStableCommandKey('withdraw', commandIdentity),
      reason,
    });
    clearStableCommandKey('withdraw', commandIdentity);
    message.success(result.idempotent ? '该申请已撤回' : '采购申请已撤回');
    withdrawReason.value = '';
    await load();
  } finally {
    actionLoading.value = '';
  }
}

function openReview() {
  if (detail.value) {
    void router.push(`/fdmprocurement/requisition/edit/${detail.value.id}`);
  }
}

function openSourcePlan() {
  const reference = sourceFulfillmentPlanReference.value;
  if (!reference?.id || !canOpenSourceFulfillmentPlan.value) return;
  void router.push(fdmTradeDocumentRoute('demand-plan', reference.id));
}

function openSourceOrder() {
  const reference = sourceContractReference.value;
  if (!reference?.id || !canOpenSourceContract.value) return;
  void router.push(fdmTradeDocumentRoute('contract-order', reference.id));
}

function openApprovalWorkspace() {
  const processInstanceId = approvalState.value?.processInstanceId;
  if (!processInstanceId || !canOpenApproval.value) return;
  void router.push({
    name: 'BpmProcessInstanceDetail',
    query: { id: processInstanceId },
  });
}

function back() {
  void router.push('/fdmprocurement/requisition');
}

onBeforeUnmount(() => {
  disposed = true;
  ++requestSequence;
  ++handoffRequestSequence;
  resetHandoffEvidence();
  projectionRetryOpen.value = false;
});

watch(requisitionId, load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      detail
        ? `来源需求计划 ${
            detail.traceability?.sourceFulfillmentPlan?.documentNo ||
            detail.sourcePlanId
          }`
        : '采购申请详情'
    "
    :title="detail?.requisitionNo || '采购申请详情'"
  >
    <template #extra>
      <Button v-if="!props.id" @click="back">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
        返回列表
      </Button>
      <Tag :color="requisitionStatusMeta(detail?.status).color">
        {{ requisitionStatusMeta(detail?.status).label }}
      </Tag>
      <Button v-if="hasReviewPermission" @click="openReview">校核字段</Button>
      <Button
        v-if="hasPreValidatePermission"
        :disabled="!canPreValidate"
        :loading="actionLoading === 'validate'"
        @click="runPreValidation"
      >
        重新预检
      </Button>
      <Button
        v-if="hasSourcingPermission"
        :disabled="!canSourcing"
        :loading="actionLoading === 'sourcing'"
        type="primary"
        @click="startSourcing"
      >
        规则寻源
      </Button>
      <Button
        v-if="hasAiSourcingPermission"
        :disabled="!canAiSourcing"
        type="primary"
        @click="startAiSourcing"
      >
        AI 寻源
      </Button>
    </template>

    <Skeleton v-if="loading" active :paragraph="{ rows: 14 }" />
    <Empty v-else-if="!detail" description="采购申请不存在或无权查看" />
    <div v-else class="requisition-detail">
      <Alert
        v-if="detail.status === 'DATA_INCOMPLETE'"
        message="来源或产品主数据不完整。预检会明确列出阻断项，系统不会把 UNKNOWN 当作 0。"
        show-icon
        type="warning"
      />
      <Alert
        v-if="approvalLoadFailed"
        message="审批状态暂时无法读取；页面不会据此开放审批或撤回操作。"
        show-icon
        type="warning"
      />

      <TradeDetailLayout
        aside-label="合同、履约需求、采购申请与发货关联单据"
        main-label="采购申请单据内容"
      >
        <Card title="单据概览" size="small">
          <Descriptions :column="3" size="small">
            <Descriptions.Item label="申请编号">
              {{ detail.requisitionNo }}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag :color="requisitionStatusMeta(detail.status).color">
                {{ requisitionStatusMeta(detail.status).label }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="数据版本">
              v{{ detail.version }}
            </Descriptions.Item>
            <Descriptions.Item label="数据公司">
              {{ detail.companyId }}
            </Descriptions.Item>
            <Descriptions.Item label="负责人">
              {{ detail.ownerUserId }}
            </Descriptions.Item>
            <Descriptions.Item label="要求日期">
              {{ detail.requiredDate || '未提供' }}
            </Descriptions.Item>
            <Descriptions.Item label="数据预检">
              <Tag :color="validationStatusMeta(detail.validationStatus).color">
                {{ validationStatusMeta(detail.validationStatus).label }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="生成来源">
              {{
                detail.generationRunId
                  ? `AI Run ${detail.generationRunId}`
                  : '确定性来源物化'
              }}
            </Descriptions.Item>
            <Descriptions.Item label="提案版本">
              {{
                detail.proposalVersion
                  ? `P${detail.proposalVersion}`
                  : '无 AI 提案'
              }}
            </Descriptions.Item>
            <Descriptions.Item label="备注" :span="3">
              {{ detail.remark || '未填写' }}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="来源血缘" size="small">
          <div class="lineage-chain">
            <button :disabled="!canOpenSourceContract" @click="openSourceOrder">
              <span>01</span>
              <strong>外贸合同</strong>
              <small>
                {{ sourceContractLabel }}
                · v{{ detail.sourceOrderVersion }}
              </small>
            </button>
            <IconifyIcon icon="lucide:arrow-right" />
            <button
              :disabled="!canOpenSourceFulfillmentPlan"
              @click="openSourcePlan"
            >
              <span>02</span>
              <strong>已确认履约计划</strong>
              <small>
                {{ sourceFulfillmentPlanLabel }}
                · v{{ detail.sourcePlanVersion }}
              </small>
            </button>
            <IconifyIcon icon="lucide:arrow-right" />
            <div>
              <span>03</span>
              <strong>采购申请</strong>
              <small>{{ detail.requisitionNo }} · v{{ detail.version }}</small>
            </div>
          </div>
          <p class="lineage-hash">
            来源确认快照：{{ detail.sourceSnapshotHash }}
          </p>
        </Card>

        <Card title="采购明细与行级血缘" size="small">
          <Table
            :columns="itemColumns"
            :data-source="detail.items"
            :pagination="false"
            row-key="id"
            :scroll="{ x: 1150 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'product'">
                <div class="requisition-detail__stack">
                  <strong>{{ record.productName }}</strong>
                  <span>{{ record.productCode || '无产品编码' }} ·
                    {{ record.specification || '无规格' }}</span>
                  <span v-if="record.customization">定制：{{ record.customization }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'mapping'">
                <div class="requisition-detail__stack">
                  <Tag
                    :color="
                      record.productMappingStatus === 'MAPPED'
                        ? 'green'
                        : 'orange'
                    "
                  >
                    {{ record.productMappingStatus || 'UNKNOWN' }}
                  </Tag>
                  <Button
                    v-if="canBindProductSku(asRequisitionItem(record))"
                    size="small"
                    type="link"
                    @click="openProductBinding(asRequisitionItem(record))"
                  >
                    绑定产品中心 SKU
                  </Button>
                </div>
              </template>
              <template v-else-if="column.key === 'lineage'">
                <div class="requisition-detail__stack">
                  <span>合同产品行 {{ record.sourceContractLineId }}</span>
                  <span>需求计划行 {{ record.sourcePlanLineId }}</span>
                  <span>采购申请行 {{ record.id }} · v{{ record.version }}</span>
                </div>
              </template>
            </template>
          </Table>
        </Card>

        <Card title="预检规则" size="small">
          <Alert
            v-if="validation && validation.validationStatus !== 'PASSED'"
            :message="`发现 ${validation.issues.length} 项规则问题`"
            show-icon
            type="warning"
          />
          <div
            v-if="validation?.issues.length"
            class="requisition-detail__issues"
          >
            <div
              v-for="issue in validation.issues"
              :key="`${issue.code}:${issue.fieldPath}`"
            >
              <Tag :color="issue.severity === 'BLOCKER' ? 'red' : 'orange'">
                {{ issue.severity }}
              </Tag>
              <strong>{{ issue.code }}</strong>
              <span>{{ issue.fieldPath || '单据级' }} · {{ issue.message }}</span>
            </div>
          </div>
          <Empty
            v-else
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="
              detail.validationStatus === 'PASSED'
                ? '服务端最近一次预检已通过'
                : '点击“重新预检”读取服务端字段级规则结果'
            "
          />
        </Card>

        <Card title="提交与审批" size="small">
          <Alert
            message="AI 和寻源评估都不能直接提交或审批。提交后必须由 BPM 人工任务完成通过或驳回。"
            show-icon
            type="info"
          />
          <div
            v-if="hasSubmitPermission && detail.status !== 'SUBMITTED'"
            class="action-panel"
          >
            <Input.TextArea
              v-model:value="submitComment"
              :maxlength="1000"
              placeholder="提交说明（可选）"
              show-count
              :rows="2"
            />
            <Button
              :disabled="!canSubmit"
              :loading="actionLoading === 'submit'"
              type="primary"
              @click="submit"
            >
              提交 BPM 审批
            </Button>
            <span v-if="!canSubmit">仅 READY 且预检 PASSED 的申请可提交</span>
            <span
              v-if="
                !hasValidSelectedAssessmentRef(
                  selectedAssessmentId,
                  selectedAssessmentInputHash,
                )
              "
            >
              请先完成寻源评估并人工确认供应方案
            </span>
          </div>
          <div v-if="hasWithdrawPermission && canWithdraw" class="action-panel">
            <Input.TextArea
              v-model:value="withdrawReason"
              :maxlength="1000"
              placeholder="撤回原因（必填）"
              show-count
              :rows="2"
            />
            <Button
              :disabled="!canWithdraw"
              :loading="actionLoading === 'withdraw'"
              danger
              @click="withdraw"
            >
              撤回申请
            </Button>
          </div>
          <Descriptions v-if="approvalState" :column="2" size="small">
            <Descriptions.Item label="流程定义">
              {{ approvalState.processDefinitionKey || '未绑定' }}
              <template v-if="approvalState.processDefinitionVersion">
                · v{{ approvalState.processDefinitionVersion }}
              </template>
            </Descriptions.Item>
            <Descriptions.Item label="流程实例">
              {{ approvalState.processInstanceId || '尚未创建' }}
            </Descriptions.Item>
            <Descriptions.Item label="提交人 / 时间">
              {{ approvalState.submittedBy || '—' }} /
              {{ approvalState.submittedAt || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="终态决定">
              {{ approvalState.terminalDecisionType || '审批中或未提交' }}
            </Descriptions.Item>
            <Descriptions.Item
              v-if="approvalState.terminalReason"
              label="终态原因"
              :span="2"
            >
              {{ approvalState.terminalReason }}
            </Descriptions.Item>
          </Descriptions>
          <Button
            v-if="hasApprovalWorkspacePermission && !props.id"
            :disabled="!canOpenApproval"
            @click="openApprovalWorkspace"
          >
            进入 BPM 人工任务
          </Button>
          <Timeline
            v-if="approvalState?.audits.length"
            class="approval-timeline"
          >
            <Timeline.Item
              v-for="audit in approvalState.audits"
              :key="audit.eventId || `${audit.operation}:${audit.versionAfter}`"
            >
              <strong>{{ audit.operation }}</strong>
              <p>{{ audit.fromStatus || '—' }} → {{ audit.toStatus || '—' }}</p>
              <small>{{ audit.actorType || 'SYSTEM' }}
                {{ audit.actorUserId || '' }} ·
                {{ audit.createTime || '—' }}</small>
              <p v-if="audit.reason">{{ audit.reason }}</p>
            </Timeline.Item>
          </Timeline>
        </Card>

        <Card
          v-if="hasHandoffQueryPermission && detail.status === 'APPROVED'"
          title="ERP 采购单交接与生命周期"
          size="small"
        >
          <template #extra>
            <Button
              :loading="handoffLoading || projectionLoading"
              size="small"
              @click="refreshHandoffs"
            >
              刷新交接状态
            </Button>
          </template>
          <Alert
            message="采购申请审批通过后，系统仅使用审批冻结快照创建 ERP 草稿采购单。创建交付状态与 ERP 单据生命周期分开记录，ERP 确认、反确认或取消后只读回传。"
            show-icon
            type="info"
          />
          <Alert
            v-if="projectionLoadFailed"
            class="handoff-alert"
            message="审批事件投递状态暂时无法读取。页面不会把读取失败误报为尚未创建或投递成功。"
            show-icon
            type="warning"
          />
          <Skeleton
            v-if="projectionLoading && !projectionState"
            active
            :paragraph="{ rows: 2 }"
          />
          <div v-else-if="projectionState" class="projection-state">
            <Alert
              v-if="projectionNotice"
              :description="projectionNotice.description"
              :message="projectionNotice.message"
              show-icon
              :type="projectionNotice.type"
            />
            <div v-if="canRetryProjectionState" class="projection-retry-action">
              <span>
                恢复操作只把当前死信事件重新放回投递队列，不会在浏览器中直接执行投影或创建交接台账。
              </span>
              <Button danger size="small" @click="openProjectionRetry">
                人工恢复投影
              </Button>
            </div>
            <Descriptions :column="3" size="small">
              <Descriptions.Item label="投递状态">
                <Tag :color="projectionMeta?.color">
                  {{ projectionMeta?.label }}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Outbox ID">
                {{ projectionState.outboxId || '尚未创建' }}
              </Descriptions.Item>
              <Descriptions.Item label="Outbox 版本">
                {{ displayValue(projectionState.outboxVersion) }}
              </Descriptions.Item>
              <Descriptions.Item label="重试次数">
                {{ projectionState.retryCount }}
              </Descriptions.Item>
              <Descriptions.Item label="可处理 / 自动重试时间">
                {{ displayDateTime(projectionState.availableAt) }}
              </Descriptions.Item>
              <Descriptions.Item label="发布时间">
                {{ displayDateTime(projectionState.publishedAt) }}
              </Descriptions.Item>
              <Descriptions.Item label="死信时间">
                {{ displayDateTime(projectionState.deadLetterAt) }}
              </Descriptions.Item>
              <Descriptions.Item label="投影 / 当前交接数">
                {{ projectionState.handoffCount }} / {{ handoffs.length }}
              </Descriptions.Item>
              <Descriptions.Item
                v-if="
                  projectionState.lastErrorCode ||
                  projectionState.lastErrorMessage
                "
                label="投递最近错误"
                :span="2"
              >
                <Tag color="red">
                  {{ projectionState.lastErrorCode || 'PROJECTION_FAILED' }}
                </Tag>
                {{ projectionState.lastErrorMessage || '未提供脱敏错误摘要' }}
              </Descriptions.Item>
            </Descriptions>
          </div>
          <Alert
            v-if="handoffLoadFailed"
            class="handoff-alert"
            message="交接台账暂时无法读取。页面不会把读取失败误报成尚未生成，请稍后重试。"
            show-icon
            type="warning"
          />
          <Skeleton
            v-if="handoffLoading && !handoffs.length"
            active
            :paragraph="{ rows: 4 }"
          />
          <Empty
            v-else-if="!handoffLoadFailed && !handoffs.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="当前没有 ERP 采购单交接台账，请以上方审批事件投递状态为准。"
          />
          <div v-else class="handoff-list">
            <Card
              v-for="handoff in handoffs"
              :key="handoff.id"
              class="handoff-card"
              size="small"
            >
              <template #title>
                <div class="handoff-card__title">
                  <strong>供应商 {{ handoff.supplierId }} ·
                    {{ handoff.quoteCurrency }}</strong>
                  <span>{{
                    handoff.erpPurchaseOrderNo || '尚未取得 ERP 单号'
                  }}</span>
                </div>
              </template>
              <template #extra>
                <Button
                  v-if="canRetryHandoff(handoff, hasPermission)"
                  :loading="actionLoading === `handoff:${handoff.id}`"
                  danger
                  size="small"
                  @click="retryHandoff(handoff)"
                >
                  人工重试
                </Button>
              </template>

              <div class="handoff-state-strip">
                <div class="handoff-state-strip__item">
                  <span class="handoff-state-strip__label">FDM → ERP 创建交付</span>
                  <Tag :color="handoffStatusMeta(handoff.status).color">
                    {{ handoffStatusMeta(handoff.status).label }}
                  </Tag>
                  <small>完成时间 {{ displayDateTime(handoff.completedAt) }}</small>
                </div>
                <div
                  class="handoff-state-strip__item"
                  :class="{
                    'handoff-state-strip__item--cancelled':
                      handoff.erpPurchaseOrderStatus === 'CANCELLED',
                  }"
                >
                  <span class="handoff-state-strip__label">ERP 单据生命周期</span>
                  <Tag
                    :color="
                      erpLifecycleStatusMeta(handoff.erpPurchaseOrderStatus)
                        .color
                    "
                  >
                    {{
                      erpLifecycleStatusMeta(handoff.erpPurchaseOrderStatus)
                        .label
                    }}
                  </Tag>
                  <small>状态更新
                    {{ displayDateTime(handoff.erpStatusUpdatedAt) }}</small>
                </div>
              </div>

              <Alert
                v-if="erpLifecycleNotice(handoff)"
                class="handoff-lifecycle-alert"
                :description="erpLifecycleNotice(handoff)?.description"
                :message="erpLifecycleNotice(handoff)?.message"
                show-icon
                :type="erpLifecycleNotice(handoff)?.type"
              />

              <Descriptions :column="3" size="small">
                <Descriptions.Item label="公司 / ERP 供应商">
                  {{ handoff.companyId }} / {{ handoff.erpSupplierId }}
                </Descriptions.Item>
                <Descriptions.Item label="ERP 采购单号">
                  {{ handoff.erpPurchaseOrderNo || '尚未取得回执' }}
                </Descriptions.Item>
                <Descriptions.Item label="ERP 单据 ID">
                  {{ handoff.erpPurchaseOrderId || '—' }}
                </Descriptions.Item>
                <Descriptions.Item label="ERP 生命周期版本">
                  {{ displayValue(handoff.erpLifecycleVersion) }}
                </Descriptions.Item>
                <Descriptions.Item label="ERP 状态更新时间">
                  {{ displayDateTime(handoff.erpStatusUpdatedAt) }}
                </Descriptions.Item>
                <Descriptions.Item label="ERP 最近动作 / 操作人">
                  {{ handoff.erpLastAction || '—' }} /
                  {{ handoff.erpLastActorUserId || '—' }}
                </Descriptions.Item>
                <Descriptions.Item label="冻结汇率">
                  1 {{ handoff.quoteCurrency }} =
                  {{ handoff.exchangeRateToCny }} CNY
                </Descriptions.Item>
                <Descriptions.Item label="请求日 / 生效日">
                  {{ handoff.rateRequestedDate }} /
                  {{ handoff.rateEffectiveDate }}
                </Descriptions.Item>
                <Descriptions.Item label="汇率来源">
                  {{ handoff.rateProvider }}
                  <Tag v-if="handoff.rateFallbackUsed" color="orange">
                    使用回退汇率
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="汇率获取时间">
                  {{ displayDateTime(handoff.rateRetrievedAt) }}
                </Descriptions.Item>
                <Descriptions.Item label="尝试次数 / 下次重试">
                  {{ handoff.attemptCount }} /
                  {{ displayDateTime(handoff.nextRetryAt) }}
                </Descriptions.Item>
                <Descriptions.Item label="最近尝试 / 完成时间">
                  {{ displayDateTime(handoff.lastAttemptAt) }} /
                  {{ displayDateTime(handoff.completedAt) }}
                </Descriptions.Item>
                <Descriptions.Item
                  v-if="handoff.lastErrorCode || handoff.lastErrorMessage"
                  label="最近错误"
                  :span="3"
                >
                  <Tag color="red">
                    {{ handoff.lastErrorCode || 'ERP_HANDOFF_FAILED' }}
                  </Tag>
                  {{ handoff.lastErrorMessage || '未提供脱敏错误摘要' }}
                </Descriptions.Item>
                <Descriptions.Item label="审批快照" :span="3">
                  ID {{ handoff.approvalSnapshotId }} ·
                  {{ handoff.approvalSnapshotHash }}
                </Descriptions.Item>
                <Descriptions.Item label="寻源决策" :span="3">
                  评估 {{ handoff.sourcingAssessmentId }} ·
                  {{ handoff.sourcingInputHash }}
                </Descriptions.Item>
                <Descriptions.Item label="ERP 幂等命令" :span="3">
                  {{ handoff.erpCommandId }} ·
                  {{ handoff.erpPayloadHash || '尚未生成载荷哈希' }}
                </Descriptions.Item>
              </Descriptions>

              <Collapse
                class="handoff-lifecycle-history"
                ghost
                :active-key="lifecyclePanelActiveKey(handoff.id)"
                @change="handleLifecyclePanelChange(handoff.id, $event)"
              >
                <Collapse.Panel key="lifecycle-history" header="生命周期记录">
                  <Skeleton
                    v-if="lifecycleHistoryState(handoff.id)?.loading"
                    active
                    :paragraph="{ rows: 2 }"
                  />
                  <Alert
                    v-else-if="lifecycleHistoryState(handoff.id)?.failed"
                    message="生命周期记录暂时无法读取，交接状态和 ERP 当前状态仍以上方数据为准。"
                    show-icon
                    type="warning"
                  />
                  <Empty
                    v-else-if="
                      lifecycleHistoryState(handoff.id)?.loaded &&
                      !lifecycleHistoryState(handoff.id)?.events.length
                    "
                    :image="Empty.PRESENTED_IMAGE_SIMPLE"
                    description="暂无 ERP 确认、反确认或取消记录"
                  />
                  <Timeline
                    v-else-if="lifecycleHistoryState(handoff.id)?.events.length"
                    class="handoff-lifecycle-timeline"
                  >
                    <Timeline.Item
                      v-for="event in lifecycleHistoryState(handoff.id)?.events"
                      :key="event.eventId"
                      :color="erpLifecycleActionMeta(event.action).color"
                    >
                      <div class="handoff-lifecycle-event__header">
                        <strong>
                          v{{ event.lifecycleVersion }} ·
                          {{ erpLifecycleActionMeta(event.action).label }}
                        </strong>
                        <Tag
                          :color="
                            erpLifecycleEventResultMeta(event.result).color
                          "
                        >
                          {{ erpLifecycleEventResultMeta(event.result).label }}
                        </Tag>
                      </div>
                      <div class="handoff-lifecycle-event__transition">
                        <Tag
                          :color="
                            erpLifecycleStatusMeta(event.fromStatus).color
                          "
                        >
                          {{ erpLifecycleStatusMeta(event.fromStatus).label }}
                        </Tag>
                        <IconifyIcon icon="lucide:arrow-right" />
                        <Tag
                          :color="erpLifecycleStatusMeta(event.toStatus).color"
                        >
                          {{ erpLifecycleStatusMeta(event.toStatus).label }}
                        </Tag>
                      </div>
                      <p>
                        发生时间 {{ displayDateTime(event.occurredAt) }} ·
                        操作人
                        {{
                          event.actorUserId
                            ? `ERP 用户 ${event.actorUserId}`
                            : 'ERP 系统（未提供用户 ID）'
                        }}
                      </p>
                      <p>原因：{{ event.reason?.trim() || '未填写原因' }}</p>
                    </Timeline.Item>
                  </Timeline>
                </Collapse.Panel>
              </Collapse>

              <Collapse
                class="handoff-execution-facts"
                ghost
                :active-key="executionPanelActiveKey(handoff.id)"
                @change="handleExecutionPanelChange(handoff.id, $event)"
              >
                <Collapse.Panel
                  key="execution-facts"
                  header="采购收货与退货执行事实"
                >
                  <Alert
                    class="execution-facts-alert"
                    message="这里只读取 ERP 已回传并由后端投影的采购入库、采购退货和净入库事实；页面不会推断付款、虚构单据或补造数量。"
                    show-icon
                    type="info"
                  />
                  <Skeleton
                    v-if="executionFactsState(handoff.id)?.loading"
                    active
                    :paragraph="{ rows: 3 }"
                  />
                  <Alert
                    v-else-if="executionFactsState(handoff.id)?.failed"
                    message="采购执行事实暂时无法读取。读取失败不代表没有入库、退货或过账记录，请稍后重试。"
                    show-icon
                    type="warning"
                  />
                  <Empty
                    v-else-if="
                      executionFactsState(handoff.id)?.loaded &&
                      !executionFactsState(handoff.id)?.documents.length
                    "
                    :image="Empty.PRESENTED_IMAGE_SIMPLE"
                    description="暂无 ERP 采购入库或退货执行事实"
                  />
                  <div
                    v-else-if="
                      executionFactsState(handoff.id)?.documents.length
                    "
                    class="execution-document-list"
                  >
                    <section
                      v-for="document in executionFactsState(handoff.id)
                        ?.documents"
                      :key="`${document.documentType}:${document.documentId}`"
                      class="execution-document"
                    >
                      <div class="execution-document__header">
                        <div>
                          <strong>{{ document.documentNo }}</strong>
                          <span>
                            {{
                              executionDocumentTypeMeta(document.documentType)
                                .label
                            }}
                            · {{ document.documentType }} · ID
                            {{ document.documentId }}
                          </span>
                        </div>
                        <Tag
                          :color="
                            executionPostingStateMeta(document.postingState)
                              .color
                          "
                        >
                          {{
                            executionPostingStateMeta(document.postingState)
                              .label
                          }}
                        </Tag>
                      </div>

                      <Descriptions :column="3" size="small">
                        <Descriptions.Item label="单据版本 / 时间">
                          v{{ document.documentVersion }} /
                          {{ displayDateTime(document.documentTime) }}
                        </Descriptions.Item>
                        <Descriptions.Item label="最近动作 / 操作人">
                          {{ executionActionMeta(document.lastAction).label }} /
                          {{
                            document.lastActorUserId
                              ? `ERP 用户 ${document.lastActorUserId}`
                              : 'ERP 系统（未提供用户 ID）'
                          }}
                        </Descriptions.Item>
                        <Descriptions.Item label="最近发生时间">
                          {{ displayDateTime(document.lastOccurredAt) }}
                        </Descriptions.Item>
                        <Descriptions.Item label="最近原因" :span="2">
                          {{ document.lastReason?.trim() || '未填写原因' }}
                        </Descriptions.Item>
                        <Descriptions.Item label="最近事件">
                          {{ document.lastEventId }}
                        </Descriptions.Item>
                      </Descriptions>

                      <Table
                        :columns="executionLineColumns"
                        :data-source="document.lines"
                        :pagination="false"
                        :row-key="executionLineRowKey"
                        size="small"
                        :scroll="{ x: 930 }"
                      >
                        <template #bodyCell="{ column, record }">
                          <template v-if="column.key === 'line'">
                            <div class="requisition-detail__stack">
                              <strong>{{ record.lineRef }}</strong>
                              <span>
                                {{
                                  executionLineIdentity(
                                    document.documentType,
                                    record,
                                  )
                                }}
                                · 采购单行
                                {{ record.purchaseOrderItemId }}
                              </span>
                              <span>
                                申请行 {{ record.requisitionItemId }} · 分配
                                {{ record.sourcingAllocationId }}
                              </span>
                              <span>
                                产品 {{ record.productId }} · 仓库
                                {{ record.warehouseId }}
                              </span>
                            </div>
                          </template>
                          <template v-else-if="column.key === 'quantity'">
                            <div class="requisition-detail__stack">
                              <span>本单数量 {{ record.quantity }}</span>
                              <span>当前有效 {{ record.activeQuantity }}</span>
                              <template
                                v-if="record.netReceivedQuantity !== undefined"
                              >
                                <span>
                                  累计入库
                                  {{ record.receivedQuantity ?? '—' }} ·
                                  累计退货
                                  {{ record.returnedQuantity ?? '—' }}
                                </span>
                                <strong>净入库
                                  {{
                                    record.netReceivedQuantity ?? '—'
                                  }}</strong>
                              </template>
                            </div>
                          </template>
                          <template v-else-if="column.key === 'amount'">
                            <div class="requisition-detail__stack">
                              <span>单价 {{ record.productPrice }}</span>
                              <strong>总额 {{ record.totalPrice }}</strong>
                              <span>
                                税率
                                {{
                                  record.taxPercent === null
                                    ? '未提供'
                                    : `${record.taxPercent}%`
                                }}
                                · 税额
                                {{
                                  record.taxPrice === null
                                    ? '未提供'
                                    : record.taxPrice
                                }}
                              </span>
                            </div>
                          </template>
                          <template v-else-if="column.key === 'state'">
                            <div class="requisition-detail__stack">
                              <Tag
                                :color="
                                  executionPostingStateMeta(record.postingState)
                                    .color
                                "
                              >
                                {{
                                  executionPostingStateMeta(record.postingState)
                                    .label
                                }}
                              </Tag>
                              <span>单据版本 v{{
                                  record.lastDocumentVersion
                                }}</span>
                              <span>事件 {{ record.lastEventId }}</span>
                              <span>{{
                                displayDateTime(record.lastOccurredAt)
                              }}</span>
                            </div>
                          </template>
                        </template>
                      </Table>

                      <Empty
                        v-if="!document.events.length"
                        :image="Empty.PRESENTED_IMAGE_SIMPLE"
                        :description="`该${executionDocumentTypeMeta(document.documentType).label}单暂无过账或反过账事件`"
                      />
                      <Timeline v-else class="execution-event-timeline">
                        <Timeline.Item
                          v-for="event in document.events"
                          :key="event.eventId"
                          :color="executionActionMeta(event.action).color"
                        >
                          <div class="execution-event__header">
                            <strong>
                              v{{ event.documentVersion }} ·
                              {{ executionActionMeta(event.action).label }}
                            </strong>
                            <Tag
                              :color="
                                executionEventResultMeta(event.result).color
                              "
                            >
                              {{ executionEventResultMeta(event.result).label }}
                            </Tag>
                          </div>
                          <div class="execution-event__transition">
                            <Tag
                              :color="
                                executionPostingStateMeta(
                                  event.fromPostingState,
                                ).color
                              "
                            >
                              {{
                                executionPostingStateMeta(
                                  event.fromPostingState,
                                ).label
                              }}
                            </Tag>
                            <IconifyIcon icon="lucide:arrow-right" />
                            <Tag
                              :color="
                                executionPostingStateMeta(event.postingState)
                                  .color
                              "
                            >
                              {{
                                executionPostingStateMeta(event.postingState)
                                  .label
                              }}
                            </Tag>
                          </div>
                          <p>
                            发生时间 {{ displayDateTime(event.occurredAt) }} ·
                            操作人
                            {{
                              event.actorUserId
                                ? `ERP 用户 ${event.actorUserId}`
                                : 'ERP 系统（未提供用户 ID）'
                            }}
                          </p>
                          <p>
                            原因：{{ event.reason?.trim() || '未填写原因' }}
                          </p>
                          <p v-if="event.reversesEventId">
                            被反转事件：{{ event.reversesEventId }}
                          </p>
                        </Timeline.Item>
                      </Timeline>
                    </section>
                  </div>
                </Collapse.Panel>
              </Collapse>

              <Table
                :columns="handoffLineColumns"
                :data-source="handoff.lines"
                :pagination="false"
                row-key="id"
                size="small"
                :scroll="{ x: 1280 }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'product'">
                    <div class="requisition-detail__stack">
                      <strong>产品 {{ record.productId }} / SKU
                        {{ record.skuId }}</strong>
                      <span>ERP 商品 {{ record.erpProductId }}</span>
                      <span>产品版本 {{ record.productVersionToken }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'quantity'">
                    <div class="requisition-detail__stack">
                      <strong>{{ record.purchaseQuantity }}
                        {{ record.purchaseUnit }}</strong>
                      <span>
                        × {{ record.erpUnitsPerPurchaseUnit }} =
                        {{ record.erpQuantity }} ERP 基础单位
                      </span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'price'">
                    <div class="requisition-detail__stack">
                      <strong>{{ record.quotedUnitPrice }}
                        {{ handoff.quoteCurrency }} /
                        {{ record.purchaseUnit }}</strong>
                      <span>
                        {{ record.quoteTaxIncluded ? '含税' : '未税' }} · 税率
                        {{ record.taxPercent }}%
                      </span>
                      <span>外币基础单位净价
                        {{ record.originalBaseUnitPrice }}</span>
                      <span>人民币基础单位净价 ¥{{ record.cnyBaseUnitPrice }}</span>
                      <span v-if="String(record.unitFreightAmount) !== '0'">
                        单位运费 {{ record.unitFreightAmount }}（需人工处理）
                      </span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'schedule'">
                    <div class="requisition-detail__stack">
                      <span>要求 {{ record.requiredDate }}</span>
                      <span>承诺 {{ record.promisedDate }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'lineage'">
                    <div class="requisition-detail__stack">
                      <span>申请行 {{ record.requisitionItemId }}</span>
                      <span>分配 {{ record.sourcingAllocationId }} · 候选
                        {{ record.sourcingCandidateId }}</span>
                      <span>报价 {{ record.quoteVersionRef }} · 阶梯
                        {{ record.quoteTierId }}</span>
                      <span>供应商产品 {{ record.supplierProductId }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'erpItem'">
                    {{ record.erpPurchaseOrderItemId || '尚未取得明细回执' }}
                  </template>
                </template>
              </Table>
            </Card>
          </div>
        </Card>

        <template #aside>
          <TradeRelatedDocuments
            empty-text="暂无可查看的业务链关联单据"
            :items="relationLinks"
            title="业务链关联单据"
          />
          <Alert
            description="蓝色编号来自服务端返回的真实可见单据，可直接打开；发货单按发货行与采购申请行共同的履约计划行追溯，并非采购申请直接生成发货单。灰色项表示尚未生成、服务端未返回可见引用或当前账号没有对应权限。"
            message="合同 → 履约需求 → 采购申请 → 发货"
            show-icon
            type="info"
          />
        </template>
      </TradeDetailLayout>
    </div>

    <Modal
      v-model:open="productBindingOpen"
      :cancel-button-props="{ disabled: productBindingSaving }"
      :confirm-loading="productBindingSaving"
      :mask-closable="false"
      ok-text="确认绑定"
      title="恢复未映射产品行"
      @cancel="closeProductBinding()"
      @ok="bindProductSku"
    >
      <Alert
        description="仅用于恢复来源未携带产品中心身份的 PRODUCT_UNMAPPED 行；普通编辑仍不能改变商品身份。提交时会同时校验申请版本、行版本和产品版本令牌。"
        message="受控商品身份恢复"
        show-icon
        type="warning"
      />
      <div class="product-binding-form">
        <p>
          申请行 {{ productBindingItem?.lineNo || '—' }} ·
          {{ productBindingItem?.productName || '未命名来源产品' }} · 行版本
          {{ productBindingItem?.version ?? '—' }}
        </p>
        <div class="product-binding-selection">
          <div>
            <strong>{{
              selectedProduct?.productName || '尚未选择产品中心 SKU'
            }}</strong>
            <span v-if="selectedProduct">
              {{ selectedProduct.productCode }} /
              {{ selectedProduct.skuCode }} ·
              {{ selectedProduct.versionToken }}
            </span>
          </div>
          <Button
            :disabled="productBindingSaving"
            @click="productPickerOpen = true"
          >
            选择并校验 SKU
          </Button>
        </div>
        <Input.TextArea
          v-model:value="productBindingReason"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          :maxlength="1000"
          placeholder="必填：记录人工核对来源产品与产品中心 SKU 的依据"
          show-count
        />
      </div>
    </Modal>
    <ProductSelectionModal
      v-model:open="productPickerOpen"
      :company-id="detail?.companyId"
      title="为未映射采购行选择产品中心 SKU"
      @select="selectBindingProduct"
    />

    <Modal
      v-model:open="projectionRetryOpen"
      :cancel-button-props="{
        disabled: actionLoading === 'projection-retry',
      }"
      :closable="actionLoading !== 'projection-retry'"
      :confirm-loading="actionLoading === 'projection-retry'"
      destroy-on-close
      :mask-closable="false"
      ok-text="确认恢复"
      title="人工恢复审批投影"
      @cancel="closeProjectionRetry"
      @ok="retryProjection"
    >
      <Alert
        message="本操作只把当前 DEAD_LETTER 事件恢复为 PENDING，后续仍由后端任务投影。请记录已核实的修复事实，不要粘贴旧错误全文或业务载荷。"
        show-icon
        type="warning"
      />
      <p class="projection-retry-context">
        采购申请 {{ projectionState?.requisitionId || '—' }} · Outbox
        {{ projectionState?.outboxId || '—' }} · 版本
        {{ displayValue(projectionState?.outboxVersion) }}
      </p>
      <Input.TextArea
        v-model:value="projectionRetryReason"
        :auto-size="{ minRows: 3, maxRows: 7 }"
        placeholder="请填写人工恢复原因（trim 后 1–500 个字符，不得包含控制字符）"
        show-count
        @input="projectionRetryError = ''"
      />
      <p v-if="projectionRetryError" class="projection-retry-error">
        {{ projectionRetryError }}
      </p>
    </Modal>
  </Page>
</template>

<style scoped>
.requisition-detail {
  display: grid;
  gap: 14px;
}

.product-binding-form,
.product-binding-selection,
.product-binding-selection > div {
  display: grid;
  gap: 8px;
}

.product-binding-form {
  margin-top: 14px;
}

.product-binding-selection {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: 12px;
  background: hsl(var(--muted) / 35%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.product-binding-selection span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.lineage-chain {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.lineage-chain button,
.lineage-chain > div {
  display: grid;
  gap: 4px;
  padding: 14px;
  text-align: left;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.lineage-chain button {
  cursor: pointer;
}

.lineage-chain button:disabled {
  color: #94a3b8;
  cursor: not-allowed;
  background: #f8fafc;
  opacity: 0.72;
}

.lineage-chain span,
.lineage-chain small,
.lineage-hash,
.requisition-detail__stack span,
.action-panel > span,
.approval-timeline p,
.approval-timeline small {
  font-size: 12px;
  color: #64748b;
}

.lineage-hash {
  margin: 12px 0 0;
  overflow-wrap: anywhere;
}

.requisition-detail__stack {
  display: grid;
  gap: 3px;
}

.requisition-detail__issues {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.requisition-detail__issues > div {
  display: grid;
  grid-template-columns: auto minmax(120px, auto) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: #fff7e6;
  border-radius: 8px;
}

.action-panel {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin: 14px 0;
}

.approval-timeline {
  margin-top: 18px;
}

.approval-timeline p {
  margin: 2px 0;
}

.handoff-alert {
  margin-top: 12px;
}

.handoff-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.projection-state {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.projection-state :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
}

.projection-retry-action {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  color: rgb(127 29 29);
  background: rgb(254 242 242);
  border: 1px solid rgb(254 202 202);
  border-radius: 8px;
}

.projection-retry-action span {
  flex: 1 1 420px;
  font-size: 12px;
}

.projection-retry-context {
  margin: 14px 0 8px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.projection-retry-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgb(220 38 38);
}

.handoff-card__title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.handoff-card__title span {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.handoff-state-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.handoff-state-strip__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  align-items: center;
  padding: 10px 12px;
  background: hsl(var(--muted) / 35%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.handoff-state-strip__item--cancelled {
  background: rgb(254 242 242);
  border-color: rgb(254 202 202);
}

.handoff-state-strip__label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.handoff-state-strip__item small {
  grid-column: 1 / -1;
  color: hsl(var(--muted-foreground));
}

.handoff-lifecycle-alert {
  margin-bottom: 12px;
}

.handoff-execution-facts,
.handoff-lifecycle-history {
  margin: 4px 0 12px;
  border-top: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.handoff-execution-facts :deep(.ant-collapse-header),
.handoff-lifecycle-history :deep(.ant-collapse-header) {
  padding-inline: 2px;
  font-weight: 600;
}

.handoff-execution-facts :deep(.ant-collapse-content-box),
.handoff-lifecycle-history :deep(.ant-collapse-content-box) {
  padding-inline: 8px;
}

.handoff-lifecycle-timeline {
  padding-top: 8px;
}

.handoff-lifecycle-event__header,
.handoff-lifecycle-event__transition {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.handoff-lifecycle-event__transition {
  margin: 6px 0;
}

.handoff-lifecycle-event__header p,
.handoff-lifecycle-timeline p {
  margin: 3px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.execution-facts-alert {
  margin-bottom: 12px;
}

.execution-document-list {
  display: grid;
  gap: 12px;
}

.execution-document {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.execution-document__header,
.execution-event__header,
.execution-event__transition {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.execution-document__header {
  justify-content: space-between;
}

.execution-document__header > div {
  display: grid;
  gap: 2px;
}

.execution-document__header span,
.execution-event-timeline p {
  margin: 3px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.execution-event__transition {
  margin: 6px 0;
}

.execution-event-timeline {
  padding-top: 8px;
}

.handoff-card :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .lineage-chain {
    grid-template-columns: 1fr;
  }

  .lineage-chain > svg {
    transform: rotate(90deg);
  }

  .action-panel {
    grid-template-columns: 1fr;
  }

  .handoff-state-strip {
    grid-template-columns: 1fr;
  }
}
</style>
