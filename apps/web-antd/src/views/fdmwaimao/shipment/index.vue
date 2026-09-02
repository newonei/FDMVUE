<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { ShipmentConfirmationCommandIdentity } from './confirmation-actions';
import type { ShipmentHandoffRecoveryCommandIdentity } from './handoff-recovery-actions';
import type { ShipmentReadinessCommandIdentity } from './readiness-command';
import type {
  ReadinessPollIdentity,
  ReadinessPollState,
} from './readiness-polling';
import type {
  ShipmentReservationAction,
  ShipmentReservationCommandIdentity,
  ShipmentReservationCommandKind,
} from './reservation-actions';

import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Menu,
  message,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getDemandPlan, getDemandPlanPage } from '#/api/fdmwaimao/demand-plan';
import {
  cancelShipmentDraft,
  cancelShipmentReadinessGeneration,
  confirmShipment,
  createShipmentDraft,
  getShipment,
  getShipmentPage,
  getShipmentReadinessGenerationJob,
  getShipmentReadinessGenerationOptions,
  materializeShipmentReadinessGeneration,
  recoverShipmentWmsHandoff,
  regenerateShipmentReadinessGeneration,
  releaseShipmentStockReservation,
  reserveShipmentStock,
  retryShipmentReadinessGeneration,
  startShipmentReadinessGeneration,
  updateShipmentDraft,
} from '#/api/fdmwaimao/shipment';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import { TradeBusinessLink } from '#/views/fdm-trade-shared/components';
import { fdmTradeDocumentRoute } from '#/views/fdm-trade-shared/document-links';

import {
  canConfirmShipment,
  ensureShipmentConfirmationCommand,
  isExpectedShipmentConfirmationResult,
  isShipmentConfirmationCommandCurrent,
} from './confirmation-actions';
import {
  canRecoverShipmentHandoff,
  ensureShipmentHandoffRecoveryCommand,
  isExpectedShipmentHandoffRecoveryResult,
  isShipmentHandoffRecoveryCommandCurrent,
} from './handoff-recovery-actions';
import { ensureShipmentReadinessCommand } from './readiness-command';
import { canMaterializeReadinessJob } from './readiness-materialization';
import {
  canApplyReadinessPollResponse,
  isExpectedReadinessJob,
  isReadinessPollContextCurrent,
  READINESS_POLL_MAX_FAILURES,
  READINESS_POLL_SUCCESS_DELAY_MS,
  transitionReadinessPoll,
} from './readiness-polling';
import {
  availableShipmentReservationAction,
  ensureShipmentReservationCommand,
  isExpectedShipmentReservationResult,
  isShipmentDraftEditable,
  isShipmentReservationCommandCurrent,
  reservationCommandKind,
} from './reservation-actions';

defineOptions({ name: 'FdmWaimaoShipment' });

interface DraftFormState {
  bookingNo: string;
  carrierName: string;
  eta?: Dayjs;
  etd?: Dayjs;
  fulfillmentPlanId?: string;
  idempotencyKey: string;
  remark: string;
  transportMode?: FdmWaimaoShipmentApi.TransportMode;
}

interface UpdateFormState {
  bookingNo: string;
  carrierName: string;
  eta?: Dayjs;
  etd?: Dayjs;
  remark: string;
  transportMode?: FdmWaimaoShipmentApi.TransportMode;
}

interface ReadinessFormState {
  instruction: string;
  modelId?: string;
  warehouseId?: string;
}

const { hasAccessByCodes } = useAccess();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const records = ref<FdmWaimaoShipmentApi.PageItem[]>([]);
const total = ref(0);
const query = reactive<FdmWaimaoShipmentApi.PageReq>({
  keyword: '',
  pageNo: 1,
  pageSize: 20,
});
const relationQueryLabels = reactive({
  contractOrderNo: '',
  customerName: '',
  fulfillmentPlanNo: '',
});

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<FdmWaimaoShipmentApi.Detail>();
let detailRequestVersion = 0;

const createOpen = ref(false);
const creating = ref(false);
const planLoading = ref(false);
const planOptions = ref<FdmWaimaoDemandPlanApi.PageItem[]>([]);
const selectedPlan = ref<FdmWaimaoDemandPlanApi.Detail>();
let planSearchSequence = 0;
const createForm = reactive<DraftFormState>(freshDraftForm());

const updateOpen = ref(false);
const updating = ref(false);
const updateForm = reactive<UpdateFormState>(freshUpdateForm());

const cancelOpen = ref(false);
const cancelling = ref(false);
const cancelReason = ref('');

const reservationSubmitting = ref(false);
const pendingReservationCommand = ref<ShipmentReservationCommandIdentity>();
const releaseReservationOpen = ref(false);
const releaseReservationReason = ref('');
const confirmationSubmitting = ref(false);
const pendingConfirmationCommand = ref<ShipmentConfirmationCommandIdentity>();
const handoffRecoveryOpen = ref(false);
const handoffRecoveryReason = ref('');
const handoffRecoverySubmitting = ref(false);
const pendingHandoffRecoveryCommand =
  ref<ShipmentHandoffRecoveryCommandIdentity>();

const readinessOpen = ref(false);
const readinessLoading = ref(false);
const readinessSubmitting = ref(false);
const readinessOptions = ref<FdmWaimaoShipmentApi.ReadinessGenerationOptions>();
const readinessJob = ref<FdmWaimaoShipmentApi.ReadinessGenerationJob>();
const readinessPollPaused = ref(false);
const readinessSourceId = ref<FdmWaimaoShipmentApi.JavaLongString>();
const readinessMaterializationResult =
  ref<FdmWaimaoShipmentApi.ReadinessMaterializeResult>();
const pendingReadinessCommand = ref<ShipmentReadinessCommandIdentity>();
const readinessForm = reactive<ReadinessFormState>({
  instruction: '',
});
let readinessPollTimer: ReturnType<typeof setTimeout> | undefined;
let readinessPollSession = 0;
let readinessPollState: ReadinessPollState = {
  failureCount: 0,
  nextDelayMs: READINESS_POLL_SUCCESS_DELAY_MS,
  paused: false,
};

const canQuery = computed(() => hasAccessByCodes(['fdmwaimao:shipment:query']));
const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);
const canQueryContract = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:query']),
);
const canQueryDemandPlan = computed(() =>
  hasAccessByCodes(['fdmwaimao:demand-plan:query']),
);
const canCreate = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:update']),
);
const canCancel = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:cancel']),
);
const canReserveInventory = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:reserve']),
);
const canConfirm = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:confirm']),
);
const canAiGenerate = computed(() =>
  [
    'fdmwaimao:shipment:query',
    'fdmwaimao:shipment:update',
    'fdmwaimao:shipment:ai-generate',
    'fdmwaimao:ai:use',
  ].every((code) => hasAccessByCodes([code])),
);
const canMaterializeReadiness = computed(() => {
  const current = detail.value;
  const job = readinessJob.value;
  return (
    canAiGenerate.value &&
    current?.status === 'DRAFT' &&
    !current.readinessMaterialized &&
    readinessSourceId.value === current.id &&
    job?.sourceId === current.id &&
    job.sourceVersion === String(current.version) &&
    canMaterializeReadinessJob(job)
  );
});
const detailReservationAction = computed(() =>
  availableShipmentReservationAction(detail.value, canReserveInventory.value),
);
const detailCanConfirm = computed(() =>
  canConfirmShipment(detail.value, canConfirm.value),
);
const detailCanRecoverHandoff = computed(() =>
  canRecoverShipmentHandoff(detail.value, canConfirm.value),
);
const activeRelationFilters = computed(() => {
  const firstMatch = records.value[0];
  return [
    query.customerId
      ? {
          key: 'customerId',
          label: '客户',
          value:
            firstMatch?.customerId === query.customerId
              ? firstMatch.customerName || query.customerId
              : relationQueryLabels.customerName || query.customerId,
        }
      : undefined,
    query.contractOrderId
      ? {
          key: 'contractOrderId',
          label: '合同',
          value:
            firstMatch?.contractOrderId === query.contractOrderId
              ? firstMatch.contractOrderNo || query.contractOrderId
              : relationQueryLabels.contractOrderNo || query.contractOrderId,
        }
      : undefined,
    query.fulfillmentPlanId
      ? {
          key: 'fulfillmentPlanId',
          label: '履约计划',
          value:
            firstMatch?.fulfillmentPlanId === query.fulfillmentPlanId
              ? firstMatch.fulfillmentPlanNo || query.fulfillmentPlanId
              : relationQueryLabels.fulfillmentPlanNo ||
                query.fulfillmentPlanId,
        }
      : undefined,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string }>;
});

const transportOptions = [
  { label: '海运', value: 'SEA' },
  { label: '空运', value: 'AIR' },
  { label: '公路', value: 'ROAD' },
  { label: '铁路', value: 'RAIL' },
  { label: '国际快递', value: 'COURIER' },
  { label: '多式联运', value: 'MULTIMODAL' },
  { label: '其他', value: 'OTHER' },
] satisfies Array<{
  label: string;
  value: FdmWaimaoShipmentApi.TransportMode;
}>;

const columns = [
  { key: 'shipment', title: '发货单 / 来源', width: 240 },
  { key: 'customer', title: '客户 / 公司', width: 190 },
  { key: 'trade', title: '贸易与履约约束', width: 210 },
  { key: 'schedule', title: '运输计划', width: 190 },
  { key: 'readiness', title: '发货准备度', width: 180 },
  { key: 'status', title: '状态', width: 100 },
  { fixed: 'right' as const, key: 'actions', title: '操作', width: 150 },
];

const lineColumns = [
  { dataIndex: 'lineNo', key: 'lineNo', title: '行号', width: 70 },
  { key: 'product', title: '产品 / SKU', width: 250 },
  { key: 'quantity', title: '计划发货', width: 150 },
  { key: 'outbound', title: '实际出库', width: 140 },
  { key: 'source', title: '权威来源', width: 180 },
];

const proposalColumns = [
  { key: 'product', title: 'AI 建议产品', width: 240 },
  { key: 'warehouse', title: '执行仓库', width: 130 },
  { key: 'quantity', title: '建议发货 / 上限', width: 180 },
  {
    dataIndex: 'requiredDate',
    key: 'requiredDate',
    title: '要求日期',
    width: 120,
  },
  { key: 'evidence', title: '权威证据', width: 360 },
  { dataIndex: 'reason', key: 'reason', title: '建议理由', width: 220 },
];

const wmsOrderColumns = [
  { dataIndex: 'wmsShipmentOrderNo', key: 'no', title: 'WMS 出库单号' },
  { dataIndex: 'warehouseId', key: 'warehouse', title: '仓库', width: 130 },
  { dataIndex: 'lineCount', key: 'lineCount', title: '行数', width: 90 },
  { key: 'status', title: '状态', width: 120 },
  { key: 'time', title: '交接时间', width: 190 },
];

const terminalGenerationStatuses =
  new Set<FdmWaimaoShipmentApi.GenerationJobStatus>([
    'CANCELLED',
    'EXPIRED',
    'FAILED',
    'MATERIALIZED',
    'READY',
    'RULE_BLOCKED',
    'STALE',
  ]);

useFdmWaimaoAiContext(() => ({
  businessId: detailOpen.value ? detail.value?.id : undefined,
  companyId: detailOpen.value ? detail.value?.companyId : undefined,
  context: detailOpen.value
    ? { detail: detail.value, loading: detailLoading.value }
    : {
        loading: loading.value,
        query: { ...query },
        records: records.value,
        total: total.value,
      },
  contextMode: detailOpen.value ? 'detail' : 'list',
  entityLabel: detailOpen.value ? '发货计划详情' : '发货计划列表',
  surfaceKey: 'shipment',
}));

function freshDraftForm(): DraftFormState {
  return {
    bookingNo: '',
    carrierName: '',
    eta: undefined,
    etd: undefined,
    idempotencyKey: nextIdempotencyKey(),
    remark: '',
  };
}

function freshUpdateForm(): UpdateFormState {
  return {
    bookingNo: '',
    carrierName: '',
    eta: undefined,
    etd: undefined,
    remark: '',
  };
}

function nextIdempotencyKey() {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `shipment-draft:${uuid}`;
}

function nextReadinessIdempotencyKey(action: 'regenerate' | 'start') {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `shipment-readiness:${action}:${uuid}`;
}

function nextReservationIdempotencyKey(kind: ShipmentReservationCommandKind) {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `shipment-reservation:${kind.toLowerCase()}:${uuid}`;
}

function nextConfirmationIdempotencyKey() {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `shipment-confirm:${uuid}`;
}

function nextHandoffRecoveryIdempotencyKey() {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `shipment-handoff-recovery:${uuid}`;
}

function clean(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}

function date(value?: Dayjs) {
  return value?.format('YYYY-MM-DD');
}

function dateTimeText(
  value: FdmWaimaoShipmentApi.DateTimeValue | null | undefined,
) {
  return value === null || value === undefined || value === ''
    ? '未记录'
    : String(value);
}

function transportLabel(value: null | string | undefined) {
  return (
    transportOptions.find((item) => item.value === value)?.label || '未安排'
  );
}

function statusLabel(value: FdmWaimaoShipmentApi.ShipmentStatus) {
  if (value === 'DRAFT') return '草稿';
  if (value === 'CONFIRMED') return '已确认';
  return '已取消';
}

function statusColor(value: FdmWaimaoShipmentApi.ShipmentStatus) {
  if (value === 'DRAFT') return 'blue';
  if (value === 'CONFIRMED') return 'green';
  return 'default';
}

function reservationStatusLabel(
  value: FdmWaimaoShipmentApi.ReservationStatus | null | undefined,
) {
  const labels: Record<FdmWaimaoShipmentApi.ReservationStatus, string> = {
    ACTIVE: '已预留',
    CONSUMED: '已消费',
    EXPIRED: '已过期',
    HANDED_OFF: '已交接',
    HANDOFF_PENDING: '等待 WMS 交接',
    RELEASED: '已释放',
  };
  return value ? labels[value] : '未预留';
}

function reservationStatusColor(
  value: FdmWaimaoShipmentApi.ReservationStatus | null | undefined,
) {
  if (value === 'ACTIVE') return 'green';
  if (value === 'EXPIRED') return 'orange';
  if (value === 'HANDOFF_PENDING') return 'processing';
  if (value === 'HANDED_OFF' || value === 'CONSUMED') return 'blue';
  return 'default';
}

function reservationActionLabel(action: ShipmentReservationAction | undefined) {
  if (action === 'RELEASE') return '释放预留';
  if (action === 'RERESERVE') return '重新预留';
  return action === 'RESERVE' ? '预留库存' : '';
}

function fulfillmentLabel(value: null | string | undefined) {
  if (value === 'DIRECT_SHIP') return '直发';
  if (value === 'MIXED') return '混合履约';
  if (value === 'STANDARD') return '标准履约';
  return value || '未提供';
}

function nextActionLabel(value: null | string | undefined) {
  if (
    value === 'READINESS_TO_SHIPMENT' ||
    value === 'RUN_READINESS_TO_SHIPMENT'
  ) {
    return '等待 AI 发货准备建议';
  }
  if (value === 'RESERVE_WMS_STOCK') return '等待显式预留真实 WMS 库存';
  if (value === 'RE_RESERVE_WMS_STOCK') return '预留已终止，可重新预留';
  if (value === 'SHIPMENT_CONFIRMATION') {
    return '库存已预留；等待人工确认发货';
  }
  if (value === 'WMS_HANDOFF') return '等待后端 WMS 交接';
  if (value === 'WMS_HANDOFF_PENDING') return '发货已确认；正在交接 WMS';
  if (value === 'WMS_HANDOFF_RECOVERY_REQUIRED') {
    return 'WMS 交接已停止自动重试，需要人工恢复';
  }
  if (value === 'WMS_OUTBOUND_PENDING') return 'WMS 出库单已建立，等待整单出库';
  if (value === 'WMS_OUTBOUND_COMPLETED') return 'WMS 已完成整单物理出库';
  if (value === 'CANCELLED') return '草稿已取消';
  return value || '等待服务端判断';
}

function lifecycleMessage(source: FdmWaimaoShipmentApi.Detail) {
  if (source.nextRequiredAction === 'WMS_HANDOFF_RECOVERY_REQUIRED') {
    return 'WMS 交接需要人工恢复';
  }
  if (source.reservationStatus === 'CONSUMED') return 'WMS 整单出库已完成';
  if (source.reservationStatus === 'HANDED_OFF') return 'WMS 出库单已建立';
  if (source.reservationStatus === 'HANDOFF_PENDING') {
    return '发货已确认，等待 WMS 交接';
  }
  if (source.reservationStatus === 'ACTIVE') return '真实 WMS 库存已预留';
  return source.readinessMaterialized
    ? '发货准备证据已冻结'
    : '当前仍是发货空壳草稿';
}

function lifecycleAlertType(
  source: FdmWaimaoShipmentApi.Detail,
): 'error' | 'info' | 'success' | 'warning' {
  if (source.nextRequiredAction === 'WMS_HANDOFF_RECOVERY_REQUIRED') {
    return 'error';
  }
  if (
    source.reservationStatus === 'ACTIVE' ||
    source.reservationStatus === 'CONSUMED' ||
    source.reservationStatus === 'HANDED_OFF'
  ) {
    return 'success';
  }
  return source.readinessMaterialized ? 'info' : 'warning';
}

function reservationBoundaryMessage(source: FdmWaimaoShipmentApi.Detail) {
  if (source.reservationStatus === 'ACTIVE') return '预留不是确认或出库';
  if (source.reservationStatus === 'HANDOFF_PENDING')
    return '已冻结交接，正在异步建单';
  if (source.reservationStatus === 'HANDED_OFF')
    return 'WMS 已接管，尚未物理出库';
  if (source.reservationStatus === 'CONSUMED')
    return '真实库存与预留已整单扣减';
  return '终态预留凭证仅作审计保留';
}

function reservationBoundaryDescription(source: FdmWaimaoShipmentApi.Detail) {
  if (source.reservationStatus === 'ACTIVE') {
    return '当前只冻结 WMS reserved_quantity。发货仍未确认，未扣减在手库存，也未创建或完成 WMS 出库单。';
  }
  if (source.reservationStatus === 'HANDOFF_PENDING') {
    return '发货确认与交接事件已提交，预留不再允许释放或过期；系统正在用冻结凭证幂等创建 WMS 出库单。';
  }
  if (source.reservationStatus === 'HANDED_OFF') {
    return 'WMS 已按仓建立 PREPARE 出库单，reserved_quantity 仍保持冻结；只有整单完成后才扣减真实在手库存。';
  }
  if (source.reservationStatus === 'CONSUMED') {
    return '同一预留尝试下的全部仓库出库单已原子完成，quantity 与 reserved_quantity 已按冻结明细同步扣减。';
  }
  return '该凭证已终止，不再占用真实 WMS 库存；重新预留会生成新尝试并重新校验全部权威事实。';
}

function generationStatusLabel(
  value: FdmWaimaoShipmentApi.GenerationJobStatus | undefined,
) {
  const labels: Partial<
    Record<FdmWaimaoShipmentApi.GenerationJobStatus, string>
  > = {
    CANCELLED: '已取消',
    CONTEXT_BUILDING: '正在重建权威上下文',
    CREATED: '已创建',
    EXPIRED: '已过期',
    FAILED: '生成失败',
    GENERATING: '模型生成中',
    MATERIALIZED: '已物化',
    PARSING: '解析中',
    QUEUED: '排队中',
    READY: '提案就绪',
    RULE_BLOCKED: '规则拦截',
    STALE: '来源已变化',
    VALIDATING: '权威校验中',
  };
  return value ? labels[value] || value : '尚未启动';
}

function generationStatusColor(
  value: FdmWaimaoShipmentApi.GenerationJobStatus | undefined,
) {
  if (value === 'READY') return 'green';
  if (value === 'FAILED' || value === 'RULE_BLOCKED' || value === 'STALE') {
    return 'red';
  }
  if (value === 'CANCELLED' || value === 'EXPIRED') return 'default';
  return 'blue';
}

function blockerLabel(code: string) {
  const labels: Record<string, string> = {
    ETD_IN_PAST: '预计离港日期早于当前上海业务日期，请先修改运输计划。',
    ETD_REQUIRED: '请先填写预计离港日期。',
    MODEL_NOT_AVAILABLE: '当前公司没有为本流程授权可选大模型。',
    WAREHOUSE_AUTHORITY_NOT_AVAILABLE:
      '没有有效且覆盖 ETD 整个业务日的公司仓库授权。',
  };
  return labels[code] || code;
}

function isGenerationTerminal(
  status: FdmWaimaoShipmentApi.GenerationJobStatus | undefined,
) {
  return !!status && terminalGenerationStatuses.has(status);
}

function clearReadinessPoll() {
  if (readinessPollTimer) clearTimeout(readinessPollTimer);
  readinessPollTimer = undefined;
}

function invalidateReadinessPollSession() {
  clearReadinessPoll();
  readinessPollSession += 1;
  readinessPollState = transitionReadinessPoll(readinessPollState, 'SUCCESS');
  readinessPollPaused.value = false;
  return readinessPollSession;
}

function readinessPollContext() {
  return {
    open: readinessOpen.value,
    runId: readinessJob.value?.id,
    session: readinessPollSession,
    sourceId: readinessSourceId.value,
  };
}

function activeReadinessPollIdentity(
  session = readinessPollSession,
): ReadinessPollIdentity | undefined {
  const runId = readinessJob.value?.id;
  const sourceId = readinessSourceId.value;
  if (!readinessOpen.value || !runId || !sourceId) return undefined;
  return { runId, session, sourceId };
}

function isReadinessSessionCurrent(session: number, sourceId: string) {
  return (
    readinessOpen.value &&
    readinessPollSession === session &&
    readinessSourceId.value === sourceId
  );
}

function scheduleReadinessPoll(
  identity: ReadinessPollIdentity,
  delay = READINESS_POLL_SUCCESS_DELAY_MS,
  allowTerminal = false,
) {
  if (
    readinessPollPaused.value ||
    !isReadinessPollContextCurrent(identity, readinessPollContext()) ||
    (!allowTerminal && isGenerationTerminal(readinessJob.value?.status))
  ) {
    return;
  }
  clearReadinessPoll();
  readinessPollTimer = setTimeout(
    () => void pollReadinessJob(identity),
    Math.max(0, delay),
  );
}

function acceptReadinessJobResponse(
  session: number,
  sourceId: string,
  response: FdmWaimaoShipmentApi.ReadinessGenerationJob,
  runId?: string,
) {
  if (!isReadinessSessionCurrent(session, sourceId)) return false;
  if (!isExpectedReadinessJob(response, sourceId, runId)) {
    readinessPollPaused.value = true;
    readinessPollState = {
      failureCount: READINESS_POLL_MAX_FAILURES,
      nextDelayMs: null,
      paused: true,
    };
    message.error('AI 任务身份与当前发货草稿不一致，状态查询已暂停');
    return false;
  }
  readinessJob.value = response;
  readinessPollState = transitionReadinessPoll(readinessPollState, 'SUCCESS');
  readinessPollPaused.value = false;
  return true;
}

function scheduleAcceptedReadinessJob(session: number) {
  const identity = activeReadinessPollIdentity(session);
  if (identity) scheduleReadinessPoll(identity);
}

function resumeReadinessPollAfterUncertainTransition(
  session: number,
  sourceId: string,
) {
  if (!isReadinessSessionCurrent(session, sourceId)) return;
  const identity = activeReadinessPollIdentity(session);
  if (!identity) return;
  readinessPollState = transitionReadinessPoll(readinessPollState, 'CONTINUE');
  readinessPollPaused.value = false;
  message.warning('操作结果暂未确认，已恢复任务状态查询');
  scheduleReadinessPoll(identity, 0, true);
}

async function pollReadinessJob(identity: ReadinessPollIdentity) {
  if (!isReadinessPollContextCurrent(identity, readinessPollContext())) return;
  try {
    const response = await getShipmentReadinessGenerationJob(identity.runId);
    if (
      !canApplyReadinessPollResponse(identity, readinessPollContext(), response)
    ) {
      if (isReadinessPollContextCurrent(identity, readinessPollContext())) {
        acceptReadinessJobResponse(
          identity.session,
          identity.sourceId,
          response,
          identity.runId,
        );
      }
      return;
    }
    if (
      !acceptReadinessJobResponse(
        identity.session,
        identity.sourceId,
        response,
        identity.runId,
      )
    ) {
      return;
    }
    if (!isGenerationTerminal(response.status)) {
      scheduleReadinessPoll(
        identity,
        readinessPollState.nextDelayMs ?? READINESS_POLL_SUCCESS_DELAY_MS,
      );
    }
  } catch {
    if (!isReadinessPollContextCurrent(identity, readinessPollContext()))
      return;
    readinessPollState = transitionReadinessPoll(readinessPollState, 'FAILURE');
    readinessPollPaused.value = readinessPollState.paused;
    if (readinessPollState.failureCount === 1) {
      message.warning('AI 任务状态暂时获取失败，系统将自动重试');
    }
    if (readinessPollState.paused) {
      message.error(
        `AI 任务状态连续 ${READINESS_POLL_MAX_FAILURES} 次获取失败，轮询已暂停`,
      );
      return;
    }
    scheduleReadinessPoll(
      identity,
      readinessPollState.nextDelayMs ?? READINESS_POLL_SUCCESS_DELAY_MS,
    );
  }
}

function continueReadinessPoll() {
  const job = readinessJob.value;
  const sourceId = readinessSourceId.value;
  if (!job || !sourceId) return;
  const session = invalidateReadinessPollSession();
  readinessPollState = transitionReadinessPoll(readinessPollState, 'CONTINUE');
  readinessPollPaused.value = false;
  const identity = activeReadinessPollIdentity(session);
  if (identity) scheduleReadinessPoll(identity, 0, true);
}

async function openReadiness() {
  if (readinessSubmitting.value) return;
  const current = detail.value;
  if (
    !current ||
    current.status !== 'DRAFT' ||
    current.readinessMaterialized ||
    !canAiGenerate.value
  ) {
    return;
  }
  const session = invalidateReadinessPollSession();
  readinessSourceId.value = current.id;
  readinessOpen.value = true;
  readinessLoading.value = true;
  readinessOptions.value = undefined;
  readinessJob.value = undefined;
  Object.assign(readinessForm, {
    instruction: '',
    modelId: undefined,
    warehouseId: undefined,
  });
  try {
    const options = await getShipmentReadinessGenerationOptions(
      current.id,
      current.version,
    );
    if (!isReadinessSessionCurrent(session, current.id)) return;
    if (
      options.shipmentId !== current.id ||
      options.shipmentVersion !== current.version
    ) {
      throw new Error('发货草稿已变化，请刷新详情后重试');
    }
    readinessOptions.value = options;
    // The user must explicitly choose the model for every readiness run.
    readinessForm.modelId = undefined;
    readinessForm.warehouseId = options.warehouses[0]?.warehouseId;
  } finally {
    if (isReadinessSessionCurrent(session, current.id)) {
      readinessLoading.value = false;
    }
  }
}

async function startReadiness() {
  if (readinessSubmitting.value) return;
  const current = detail.value;
  const options = readinessOptions.value;
  if (!current || !options || options.blockers.length > 0) return;
  if (!readinessForm.modelId || !readinessForm.warehouseId) {
    message.warning('请选择执行仓库和大模型');
    return;
  }
  const sourceId = current.id;
  const command = ensureShipmentReadinessCommand(
    pendingReadinessCommand.value,
    {
      action: 'start',
      expectedVersion: current.version,
      instruction: clean(readinessForm.instruction),
      modelId: readinessForm.modelId,
      shipmentId: current.id,
      warehouseId: readinessForm.warehouseId,
    },
    nextReadinessIdempotencyKey,
  );
  pendingReadinessCommand.value = command;
  const session = invalidateReadinessPollSession();
  readinessSourceId.value = sourceId;
  readinessSubmitting.value = true;
  try {
    const response = await startShipmentReadinessGeneration({
      expectedShipmentVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      instruction: command.instruction,
      modelId: command.modelId,
      shipmentId: command.shipmentId,
      warehouseId: command.warehouseId,
    });
    if (acceptReadinessJobResponse(session, sourceId, response)) {
      pendingReadinessCommand.value = undefined;
      scheduleAcceptedReadinessJob(session);
    }
  } finally {
    if (isReadinessSessionCurrent(session, sourceId)) {
      readinessSubmitting.value = false;
    }
  }
}

async function retryReadiness() {
  if (readinessSubmitting.value) return;
  const job = readinessJob.value;
  const sourceId = readinessSourceId.value;
  if (!job || !sourceId || job.status !== 'FAILED') return;
  const session = invalidateReadinessPollSession();
  readinessSubmitting.value = true;
  try {
    const response = await retryShipmentReadinessGeneration({
      expectedVersion: job.version,
      id: job.id,
    });
    if (acceptReadinessJobResponse(session, sourceId, response, job.id)) {
      scheduleAcceptedReadinessJob(session);
    }
  } catch {
    resumeReadinessPollAfterUncertainTransition(session, sourceId);
  } finally {
    if (isReadinessSessionCurrent(session, sourceId)) {
      readinessSubmitting.value = false;
    }
  }
}

async function regenerateReadiness() {
  if (readinessSubmitting.value) return;
  const job = readinessJob.value;
  const sourceId = readinessSourceId.value;
  if (
    !job ||
    !sourceId ||
    !readinessForm.modelId ||
    !readinessForm.warehouseId
  ) {
    return;
  }
  const command = ensureShipmentReadinessCommand(
    pendingReadinessCommand.value,
    {
      action: 'regenerate',
      expectedVersion: job.version,
      generationRunId: job.id,
      instruction: clean(readinessForm.instruction),
      modelId: readinessForm.modelId,
      shipmentId: sourceId,
      warehouseId: readinessForm.warehouseId,
    },
    nextReadinessIdempotencyKey,
  );
  pendingReadinessCommand.value = command;
  const session = invalidateReadinessPollSession();
  readinessSubmitting.value = true;
  try {
    const response = await regenerateShipmentReadinessGeneration({
      expectedVersion: command.expectedVersion,
      id: command.generationRunId!,
      idempotencyKey: command.idempotencyKey,
      instruction: command.instruction,
      modelId: command.modelId,
      warehouseId: command.warehouseId,
    });
    if (acceptReadinessJobResponse(session, sourceId, response, job.id)) {
      pendingReadinessCommand.value = undefined;
      scheduleAcceptedReadinessJob(session);
    }
  } catch {
    resumeReadinessPollAfterUncertainTransition(session, sourceId);
  } finally {
    if (isReadinessSessionCurrent(session, sourceId)) {
      readinessSubmitting.value = false;
    }
  }
}

async function cancelReadiness() {
  if (readinessSubmitting.value) return;
  const job = readinessJob.value;
  const sourceId = readinessSourceId.value;
  if (!job || !sourceId || isGenerationTerminal(job.status)) return;
  const session = invalidateReadinessPollSession();
  readinessSubmitting.value = true;
  try {
    const response = await cancelShipmentReadinessGeneration({
      expectedVersion: job.version,
      id: job.id,
    });
    acceptReadinessJobResponse(session, sourceId, response, job.id);
  } catch {
    resumeReadinessPollAfterUncertainTransition(session, sourceId);
  } finally {
    if (isReadinessSessionCurrent(session, sourceId)) {
      readinessSubmitting.value = false;
    }
  }
}

function isExpectedMaterializationResult(
  result: FdmWaimaoShipmentApi.ReadinessMaterializeResult,
  shipmentId: FdmWaimaoShipmentApi.JavaLongString,
) {
  return (
    result.shipmentId === shipmentId &&
    Number.isInteger(result.shipmentVersion) &&
    result.shipmentVersion > 0 &&
    result.readinessMaterialized === true &&
    result.confirmAvailable === false &&
    result.nextRequiredAction === 'RESERVE_WMS_STOCK' &&
    /^[0-9a-f]{64}$/.test(result.readinessSnapshotHash)
  );
}

async function refreshMaterializedShipment(shipmentId: string) {
  const requestVersion = detailRequestVersion;
  const detailRequest =
    detailOpen.value && detail.value?.id === shipmentId
      ? getShipment(shipmentId)
      : undefined;
  const [, refreshedDetail] = await Promise.all([load(), detailRequest]);
  if (
    refreshedDetail &&
    requestVersion === detailRequestVersion &&
    detailOpen.value &&
    detail.value?.id === shipmentId &&
    refreshedDetail.id === shipmentId
  ) {
    detail.value = refreshedDetail;
  }
}

async function materializeReadiness() {
  if (readinessSubmitting.value) return;
  const current = detail.value;
  const job = readinessJob.value;
  if (
    !current ||
    !job ||
    !canMaterializeReadiness.value ||
    !job.proposalVersion
  ) {
    message.warning('当前提案或权威规则不满足物化条件，请重新查询任务状态');
    return;
  }

  const sourceId = current.id;
  const session = invalidateReadinessPollSession();
  readinessSubmitting.value = true;
  try {
    // Identity and CAS fields only. Products, quantities, warehouse and all evidence remain
    // server-owned facts and are deliberately absent from this browser command.
    const result = await materializeShipmentReadinessGeneration({
      expectedRunVersion: job.version,
      expectedShipmentVersion: current.version,
      expectedSourceSnapshotHash: job.sourceSnapshotHash,
      generationRunId: job.id,
      proposalVersion: job.proposalVersion,
      shipmentId: sourceId,
    });
    if (!isExpectedMaterializationResult(result, sourceId)) {
      await refreshMaterializedShipment(sourceId);
      throw new Error('物化响应身份或执行边界与当前发货草稿不一致');
    }

    readinessMaterializationResult.value = result;
    if (isReadinessSessionCurrent(session, sourceId)) closeReadiness();
    await refreshMaterializedShipment(sourceId);
    message.success(
      result.materializedNow
        ? '发货明细已生成；当前仍为 DRAFT，可另行显式预留库存，本次未确认、扣库存或创建出库单'
        : '相同生成运行已物化，本次为幂等重放；已刷新发货明细',
    );
  } catch (error) {
    resumeReadinessPollAfterUncertainTransition(session, sourceId);
    await refreshMaterializedShipment(sourceId);
    throw error;
  } finally {
    if (isReadinessSessionCurrent(session, sourceId)) {
      readinessSubmitting.value = false;
    }
  }
}

function confirmReadinessMaterialization() {
  if (!canMaterializeReadiness.value) return;
  Modal.confirm({
    centered: true,
    content:
      '只会把服务端重新校验通过的 READY 提案物化为当前发货单的 DRAFT 明细；不会预留或扣减库存，不会确认发货，也不会创建 WMS 出库单。',
    okText: '确认生成',
    onOk: materializeReadiness,
    title: '确认生成发货明细？',
  });
}

function closeReadiness() {
  invalidateReadinessPollSession();
  readinessOpen.value = false;
  readinessSourceId.value = undefined;
  readinessLoading.value = false;
  readinessSubmitting.value = false;
}

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  try {
    const result = await getShipmentPage({
      ...query,
      keyword: clean(query.keyword || ''),
    });
    records.value = result.list || [];
    total.value = result.total || 0;
  } finally {
    loading.value = false;
  }
}

function search() {
  query.pageNo = 1;
  void load();
}

function reset() {
  query.keyword = '';
  query.contractOrderId = undefined;
  query.customerId = undefined;
  query.fulfillmentPlanId = undefined;
  relationQueryLabels.contractOrderNo = '';
  relationQueryLabels.customerName = '';
  relationQueryLabels.fulfillmentPlanNo = '';
  query.status = undefined;
  query.transportMode = undefined;
  query.pageNo = 1;
  const nextRouteQuery = { ...route.query };
  delete nextRouteQuery.contractOrderId;
  delete nextRouteQuery.contractOrderNo;
  delete nextRouteQuery.customerId;
  delete nextRouteQuery.customerName;
  delete nextRouteQuery.fulfillmentPlanId;
  delete nextRouteQuery.fulfillmentPlanNo;
  void router.replace({
    path: route.path,
    query: nextRouteQuery,
  });
  void load();
}

function routeQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function hydrateRelationQuery() {
  query.customerId = routeQueryValue(route.query.customerId) || undefined;
  query.contractOrderId =
    routeQueryValue(route.query.contractOrderId) || undefined;
  query.fulfillmentPlanId =
    routeQueryValue(route.query.fulfillmentPlanId) || undefined;
  relationQueryLabels.customerName = routeQueryValue(route.query.customerName);
  relationQueryLabels.contractOrderNo = routeQueryValue(
    route.query.contractOrderNo,
  );
  relationQueryLabels.fulfillmentPlanNo = routeQueryValue(
    route.query.fulfillmentPlanNo,
  );
}

function clearRelationFilter(key: string) {
  const nextRouteQuery = { ...route.query };
  if (key === 'customerId') {
    query.customerId = undefined;
    relationQueryLabels.customerName = '';
    delete nextRouteQuery.customerId;
    delete nextRouteQuery.customerName;
  }
  if (key === 'contractOrderId') {
    query.contractOrderId = undefined;
    relationQueryLabels.contractOrderNo = '';
    delete nextRouteQuery.contractOrderId;
    delete nextRouteQuery.contractOrderNo;
  }
  if (key === 'fulfillmentPlanId') {
    query.fulfillmentPlanId = undefined;
    relationQueryLabels.fulfillmentPlanNo = '';
    delete nextRouteQuery.fulfillmentPlanId;
    delete nextRouteQuery.fulfillmentPlanNo;
  }
  query.pageNo = 1;
  void router.replace({ path: route.path, query: nextRouteQuery });
  void load();
}

function changePage(pageNo: number, pageSize: number) {
  query.pageNo = pageNo;
  query.pageSize = pageSize;
  void load();
}

async function openDetail(id: string) {
  const requestVersion = ++detailRequestVersion;
  if (pendingReservationCommand.value?.shipmentId !== id) {
    pendingReservationCommand.value = undefined;
  }
  if (pendingConfirmationCommand.value?.shipmentId !== id) {
    pendingConfirmationCommand.value = undefined;
  }
  if (pendingHandoffRecoveryCommand.value?.shipmentId !== id) {
    pendingHandoffRecoveryCommand.value = undefined;
  }
  if (readinessMaterializationResult.value?.shipmentId !== id) {
    readinessMaterializationResult.value = undefined;
  }
  if (readinessSourceId.value && readinessSourceId.value !== id) {
    closeReadiness();
  }
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  try {
    const response = await getShipment(id);
    if (requestVersion !== detailRequestVersion || !detailOpen.value) {
      return false;
    }
    if (response.id !== id) {
      throw new Error('发货详情响应身份与当前请求不一致');
    }
    detail.value = response;
    if (
      !isShipmentReservationCommandCurrent(
        pendingReservationCommand.value,
        detail.value,
        canReserveInventory.value,
      )
    ) {
      pendingReservationCommand.value = undefined;
    }
    if (
      !isShipmentConfirmationCommandCurrent(
        pendingConfirmationCommand.value,
        detail.value,
        canConfirm.value,
      )
    ) {
      pendingConfirmationCommand.value = undefined;
    }
    if (
      !isShipmentHandoffRecoveryCommandCurrent(
        pendingHandoffRecoveryCommand.value,
        detail.value,
        canConfirm.value,
      )
    ) {
      pendingHandoffRecoveryCommand.value = undefined;
    }
    return true;
  } finally {
    if (requestVersion === detailRequestVersion) {
      detailLoading.value = false;
    }
  }
}

async function reloadDetail() {
  const targetId = detail.value?.id;
  const requestVersion = detailRequestVersion;
  if (!targetId) return;
  const response = await getShipment(targetId);
  if (
    requestVersion === detailRequestVersion &&
    detailOpen.value &&
    detail.value?.id === targetId &&
    response.id === targetId
  ) {
    detail.value = response;
  }
}

function handleDetailOpenChange(next: boolean) {
  detailOpen.value = next;
  if (next) return;
  detailRequestVersion += 1;
  detailLoading.value = false;
  detail.value = undefined;
  if (readinessOpen.value) closeReadiness();
  if (route.query.shipmentId !== undefined) {
    void router.replace({
      path: route.path,
      query: { ...route.query, shipmentId: undefined },
    });
  }
}

async function openDetailAction(
  id: string,
  action: () => Promise<void> | void,
) {
  if (await openDetail(id)) await action();
}

function hasShipmentSecondaryActions(source: unknown) {
  const record = source as FdmWaimaoShipmentApi.PageItem;
  return Boolean(
    (canUpdate.value && isShipmentDraftEditable(record)) ||
    (canAiGenerate.value &&
      record.status === 'DRAFT' &&
      !record.readinessMaterialized) ||
    reservationActionFor(record) ||
    canConfirmShipment(record, canConfirm.value) ||
    canRecoverShipmentHandoff(record, canConfirm.value) ||
    (canCancel.value && isShipmentDraftEditable(record)),
  );
}

function handleShipmentSecondaryAction(key: string, source: unknown) {
  const record = source as FdmWaimaoShipmentApi.PageItem;
  if (key === 'transport') void openDetailAction(record.id, openUpdate);
  if (key === 'ai') void openDetailAction(record.id, openReadiness);
  if (key === 'reservation') void openReservationActionFromList(record);
  if (key === 'confirm') void openDetailAction(record.id, openConfirmation);
  if (key === 'recover') void openDetailAction(record.id, openHandoffRecovery);
  if (key === 'cancel') void openDetailAction(record.id, openCancel);
}

function reservationActionFor(source: unknown) {
  return availableShipmentReservationAction(source, canReserveInventory.value);
}

function ensureReservationCommand(
  current: FdmWaimaoShipmentApi.Detail,
  action: ShipmentReservationAction,
  reason?: string,
) {
  const command = ensureShipmentReservationCommand(
    pendingReservationCommand.value,
    {
      expectedVersion: current.version,
      kind: reservationCommandKind(action),
      reason,
      shipmentId: current.id,
    },
    nextReservationIdempotencyKey,
  );
  pendingReservationCommand.value = command;
  return command;
}

async function refreshShipmentAfterReservationAction(shipmentId: string) {
  const requestVersion = detailRequestVersion;
  const [latest] = await Promise.all([getShipment(shipmentId), load()]);
  if (latest.id !== shipmentId) throw new Error('发货详情响应身份不一致');
  if (
    requestVersion === detailRequestVersion &&
    detailOpen.value &&
    detail.value?.id === shipmentId &&
    latest.id === shipmentId
  ) {
    detail.value = latest;
  }
  if (
    !isShipmentReservationCommandCurrent(
      pendingReservationCommand.value,
      latest,
      canReserveInventory.value,
    )
  ) {
    pendingReservationCommand.value = undefined;
  }
  return latest;
}

async function executeReservationAction(
  action: ShipmentReservationAction,
  reason?: string,
) {
  const current = detail.value;
  if (!current || reservationActionFor(current) !== action) return false;
  const command = ensureReservationCommand(current, action, reason);
  reservationSubmitting.value = true;
  try {
    let result: FdmWaimaoShipmentApi.ReservationResult;
    try {
      result =
        command.kind === 'RESERVE'
          ? await reserveShipmentStock({
              expectedVersion: command.expectedVersion,
              id: command.shipmentId,
              idempotencyKey: command.idempotencyKey,
            })
          : await releaseShipmentStockReservation({
              expectedVersion: command.expectedVersion,
              id: command.shipmentId,
              idempotencyKey: command.idempotencyKey,
              reason: command.reason || '',
            });
      if (!isExpectedShipmentReservationResult(result, command)) {
        throw new Error('库存预留回执与当前命令身份不一致');
      }
    } catch {
      try {
        const latest = await refreshShipmentAfterReservationAction(
          command.shipmentId,
        );
        if (
          !isShipmentReservationCommandCurrent(
            command,
            latest,
            canReserveInventory.value,
          )
        ) {
          message.warning('操作响应未确认，已按服务端最新预留状态刷新');
          return true;
        }
      } catch {
        // Keep the exact command identity when both command and refresh are uncertain.
      }
      message.warning('操作尚未完成；再次点击将使用相同幂等键安全重试');
      return false;
    }

    pendingReservationCommand.value = undefined;
    try {
      await refreshShipmentAfterReservationAction(command.shipmentId);
    } catch {
      message.warning(
        'WMS 预留操作已返回成功，但列表或详情刷新失败，请手动刷新',
      );
    }
    if (command.kind === 'RELEASE') {
      message.success(
        result.status === 'EXPIRED'
          ? '预留已到期并释放；未扣减在手库存，也未创建 WMS 出库单'
          : '预留已释放；未扣减在手库存，也未创建 WMS 出库单',
      );
    } else {
      message.success(
        result.created
          ? '真实 WMS 库存已预留；发货仍未确认，也未扣减在手库存或创建出库单'
          : '相同预留命令已安全重放；已刷新服务端预留凭证',
      );
    }
    return true;
  } finally {
    reservationSubmitting.value = false;
  }
}

function abandonReservationCommand(
  command?: ShipmentReservationCommandIdentity,
) {
  if (
    !command ||
    pendingReservationCommand.value?.idempotencyKey === command.idempotencyKey
  ) {
    pendingReservationCommand.value = undefined;
  }
}

function openReservationAction(action = detailReservationAction.value) {
  const current = detail.value;
  if (
    !current ||
    !action ||
    reservationActionFor(current) !== action ||
    reservationSubmitting.value
  ) {
    return;
  }
  if (action === 'RELEASE') {
    releaseReservationReason.value = '';
    releaseReservationOpen.value = true;
    return;
  }
  const command = ensureReservationCommand(current, action);
  Modal.confirm({
    centered: true,
    content:
      action === 'RERESERVE'
        ? '服务端会重新校验 readiness、仓库授权、产品执行映射和真实在手库存，再建立新一轮预留。不会确认发货、扣减在手库存或创建 WMS 出库单。'
        : '服务端会从已物化明细重建产品、SKU、仓库、数量及权威证据，并只增加 WMS reserved_quantity。不会确认发货、扣减在手库存或创建 WMS 出库单。',
    okText: reservationActionLabel(action),
    onCancel: () => abandonReservationCommand(command),
    onOk: () => executeReservationAction(action),
    title: `${reservationActionLabel(action)}？`,
  });
}

async function openReservationActionFromList(source: unknown) {
  const item = source as Partial<FdmWaimaoShipmentApi.PageItem>;
  const action = reservationActionFor(item);
  if (!action || typeof item.id !== 'string') return;
  await openDetail(item.id);
  openReservationAction(action);
}

async function submitReleaseReservation() {
  const reason = releaseReservationReason.value.trim();
  if (!reason) {
    message.warning('请填写释放原因');
    return;
  }
  if (reason.length > 512) {
    message.warning('释放原因不能超过 512 个字符');
    return;
  }
  const completed = await executeReservationAction('RELEASE', reason);
  if (completed) {
    releaseReservationOpen.value = false;
    releaseReservationReason.value = '';
  }
}

function cancelReleaseReservation() {
  releaseReservationOpen.value = false;
  releaseReservationReason.value = '';
  abandonReservationCommand(pendingReservationCommand.value);
}

function ensureConfirmationCommand(current: FdmWaimaoShipmentApi.Detail) {
  const command = ensureShipmentConfirmationCommand(
    pendingConfirmationCommand.value,
    current,
    nextConfirmationIdempotencyKey,
  );
  pendingConfirmationCommand.value = command;
  return command;
}

async function refreshShipmentAfterConfirmation(shipmentId: string) {
  const requestVersion = detailRequestVersion;
  const [latest] = await Promise.all([getShipment(shipmentId), load()]);
  if (latest.id !== shipmentId) throw new Error('发货详情响应身份不一致');
  if (
    requestVersion === detailRequestVersion &&
    detailOpen.value &&
    detail.value?.id === shipmentId &&
    latest.id === shipmentId
  ) {
    detail.value = latest;
  }
  if (
    !isShipmentConfirmationCommandCurrent(
      pendingConfirmationCommand.value,
      latest,
      canConfirm.value,
    )
  ) {
    pendingConfirmationCommand.value = undefined;
  }
  return latest;
}

async function executeConfirmation() {
  const current = detail.value;
  if (!canConfirmShipment(current, canConfirm.value)) return false;
  const command = ensureConfirmationCommand(current);
  confirmationSubmitting.value = true;
  try {
    let result: FdmWaimaoShipmentApi.ConfirmResult;
    try {
      result = await confirmShipment({
        expectedVersion: command.expectedVersion,
        id: command.shipmentId,
        idempotencyKey: command.idempotencyKey,
      });
      if (!isExpectedShipmentConfirmationResult(result, command)) {
        throw new Error('发货确认回执与当前命令身份不一致');
      }
    } catch {
      try {
        const latest = await refreshShipmentAfterConfirmation(
          command.shipmentId,
        );
        if (
          latest.status === 'CONFIRMED' &&
          latest.confirmationIdempotencyKey === command.idempotencyKey
        ) {
          message.warning('确认响应未完整返回，但服务端已提交；已刷新最新状态');
          return true;
        }
        if (
          !isShipmentConfirmationCommandCurrent(
            command,
            latest,
            canConfirm.value,
          )
        ) {
          message.warning('确认响应未确认，已按服务端最新状态刷新');
          return false;
        }
      } catch {
        // Preserve the exact command identity while both submit and refresh are uncertain.
      }
      message.warning('确认结果尚不确定；再次点击将使用相同幂等键安全重试');
      return false;
    }

    pendingConfirmationCommand.value = undefined;
    try {
      await refreshShipmentAfterConfirmation(command.shipmentId);
    } catch {
      message.warning('发货已确认，但详情刷新失败，请手动刷新');
    }
    message.success(
      result.created
        ? '发货已确认并提交 WMS 交接队列；当前尚未发生物理出库'
        : '相同确认命令已安全重放；已刷新 WMS 交接状态',
    );
    return true;
  } finally {
    confirmationSubmitting.value = false;
  }
}

function abandonConfirmationCommand(
  command?: ShipmentConfirmationCommandIdentity,
) {
  if (
    !command ||
    pendingConfirmationCommand.value?.idempotencyKey === command.idempotencyKey
  ) {
    pendingConfirmationCommand.value = undefined;
  }
}

function openConfirmation() {
  const current = detail.value;
  if (
    !canConfirmShipment(current, canConfirm.value) ||
    confirmationSubmitting.value
  ) {
    return;
  }
  const command = ensureConfirmationCommand(current);
  Modal.confirm({
    centered: true,
    content:
      '确认后，服务端会再次校验并冻结当前 ACTIVE 库存预留，在同一事务提交发货确认和 durable WMS 交接事件。该动作不可再按草稿释放预留；但此刻仍不会扣减在手库存，物理出库须等待 WMS 整单完成。',
    okText: '确认发货',
    onCancel: () => abandonConfirmationCommand(command),
    onOk: executeConfirmation,
    title: '确认发货并交接 WMS？',
  });
}

function ensureHandoffRecoveryCommand(
  current: FdmWaimaoShipmentApi.Detail,
  reason: string,
) {
  const command = ensureShipmentHandoffRecoveryCommand(
    pendingHandoffRecoveryCommand.value,
    current,
    reason,
    nextHandoffRecoveryIdempotencyKey,
  );
  pendingHandoffRecoveryCommand.value = command;
  return command;
}

async function refreshShipmentAfterHandoffRecovery(shipmentId: string) {
  const requestVersion = detailRequestVersion;
  const [latest] = await Promise.all([getShipment(shipmentId), load()]);
  if (latest.id !== shipmentId) throw new Error('发货详情响应身份不一致');
  if (
    requestVersion === detailRequestVersion &&
    detailOpen.value &&
    detail.value?.id === shipmentId &&
    latest.id === shipmentId
  ) {
    detail.value = latest;
  }
  if (
    !isShipmentHandoffRecoveryCommandCurrent(
      pendingHandoffRecoveryCommand.value,
      latest,
      canConfirm.value,
    )
  ) {
    pendingHandoffRecoveryCommand.value = undefined;
  }
  return latest;
}

function openHandoffRecovery() {
  const current = detail.value;
  if (
    !canRecoverShipmentHandoff(current, canConfirm.value) ||
    handoffRecoverySubmitting.value
  ) {
    return;
  }
  const pending = pendingHandoffRecoveryCommand.value;
  handoffRecoveryReason.value =
    pending?.shipmentId === current.id &&
    pending.expectedShipmentVersion === current.version
      ? pending.reason
      : '';
  handoffRecoveryOpen.value = true;
}

function cancelHandoffRecovery() {
  handoffRecoveryOpen.value = false;
  handoffRecoveryReason.value = '';
}

async function submitHandoffRecovery() {
  const current = detail.value;
  const reason = handoffRecoveryReason.value.trim();
  if (!canRecoverShipmentHandoff(current, canConfirm.value)) return;
  if (!reason) {
    message.warning('请填写恢复原因');
    return;
  }
  if (reason.length > 500) {
    message.warning('恢复原因不能超过 500 个字符');
    return;
  }
  const command = ensureHandoffRecoveryCommand(current, reason);
  handoffRecoverySubmitting.value = true;
  try {
    let result: FdmWaimaoShipmentApi.HandoffRecoveryResult;
    try {
      result = await recoverShipmentWmsHandoff({
        expectedShipmentVersion: command.expectedShipmentVersion,
        id: command.shipmentId,
        idempotencyKey: command.idempotencyKey,
        reason: command.reason,
      });
      if (!isExpectedShipmentHandoffRecoveryResult(result, command)) {
        throw new Error('WMS 交接恢复回执与当前命令身份不一致');
      }
    } catch {
      try {
        const latest = await refreshShipmentAfterHandoffRecovery(
          command.shipmentId,
        );
        if (latest.nextRequiredAction !== 'WMS_HANDOFF_RECOVERY_REQUIRED') {
          handoffRecoveryOpen.value = false;
          handoffRecoveryReason.value = '';
          message.warning('恢复响应未确认，已按服务端最新交接状态刷新');
          return;
        }
      } catch {
        // Preserve identity and reason while both submit and refresh are uncertain.
      }
      message.warning('恢复结果尚不确定；再次提交将使用相同幂等键安全重试');
      return;
    }

    pendingHandoffRecoveryCommand.value = undefined;
    handoffRecoveryOpen.value = false;
    handoffRecoveryReason.value = '';
    try {
      await refreshShipmentAfterHandoffRecovery(command.shipmentId);
    } catch {
      message.warning('WMS 交接已重新排队，但详情刷新失败，请手动刷新');
    }
    message.success(
      result.recovered
        ? '原 WMS 交接事件已重新排队，冻结库存与事件身份保持不变'
        : '相同恢复命令已安全重放；已刷新交接状态',
    );
  } finally {
    handoffRecoverySubmitting.value = false;
  }
}

async function searchPlans(keyword = '') {
  const sequence = ++planSearchSequence;
  planLoading.value = true;
  try {
    const result = await getDemandPlanPage({
      keyword: clean(keyword),
      pageNo: 1,
      pageSize: 50,
      status: 'CONFIRMED',
    });
    if (sequence === planSearchSequence) {
      planOptions.value = result.list || [];
    }
  } finally {
    if (sequence === planSearchSequence) planLoading.value = false;
  }
}

async function selectPlan(value: unknown) {
  const id = typeof value === 'string' ? value : undefined;
  selectedPlan.value = undefined;
  if (!id) return;
  const plan = await getDemandPlan(id);
  if (createForm.fulfillmentPlanId === id) selectedPlan.value = plan;
}

function openCreate() {
  Object.assign(createForm, freshDraftForm());
  selectedPlan.value = undefined;
  planOptions.value = [];
  createOpen.value = true;
  void searchPlans();
}

async function submitCreate() {
  const plan = selectedPlan.value;
  if (!plan || !createForm.fulfillmentPlanId) {
    message.warning('请选择并读取一张已确认履约计划');
    return;
  }
  if (plan.status !== 'CONFIRMED' || !plan.downstreamReady) {
    message.warning(
      '该履约计划尚未满足下游建单条件，请先处理数量或产品映射问题',
    );
    return;
  }
  if (!createForm.etd) {
    message.warning('请填写预计离港日期，WMS 发货准备度需要按该日期核验');
    return;
  }
  if (createForm.eta?.isBefore(createForm.etd, 'day')) {
    message.warning('预计到达日期不能早于预计离港日期');
    return;
  }
  creating.value = true;
  try {
    // Do not send product, quantity, warehouse or WMS evidence from the browser. The server
    // reloads the confirmed contract/plan and creates only the DRAFT header shell.
    const result = await createShipmentDraft({
      bookingNo: clean(createForm.bookingNo),
      carrierName: clean(createForm.carrierName),
      contractOrderId: plan.contractOrderId,
      eta: date(createForm.eta),
      etd: date(createForm.etd),
      expectedContractOrderVersion: plan.contractOrderVersion,
      expectedFulfillmentPlanVersion: plan.version,
      fulfillmentPlanId: plan.id,
      idempotencyKey: createForm.idempotencyKey,
      remark: clean(createForm.remark),
      transportMode: createForm.transportMode,
    });
    message.success(
      result.created
        ? '发货草稿已创建，下一步可生成发货准备建议'
        : '相同请求已存在，已打开原发货草稿',
    );
    createOpen.value = false;
    await load();
    await openDetail(result.id);
  } finally {
    creating.value = false;
  }
}

function openUpdate() {
  if (!detail.value || !isShipmentDraftEditable(detail.value)) return;
  Object.assign(updateForm, {
    bookingNo: detail.value.bookingNo || '',
    carrierName: detail.value.carrierName || '',
    eta: detail.value.eta ? dayjs(detail.value.eta) : undefined,
    etd: detail.value.etd ? dayjs(detail.value.etd) : undefined,
    remark: detail.value.remark || '',
    transportMode: detail.value.transportMode || undefined,
  });
  updateOpen.value = true;
}

async function submitUpdate() {
  const current = detail.value;
  if (!current || !isShipmentDraftEditable(current)) return;
  if (updateForm.eta?.isBefore(updateForm.etd || undefined, 'day')) {
    message.warning('预计到达日期不能早于预计离港日期');
    return;
  }
  updating.value = true;
  try {
    await updateShipmentDraft({
      bookingNo: clean(updateForm.bookingNo),
      carrierName: clean(updateForm.carrierName),
      eta: date(updateForm.eta),
      etd: date(updateForm.etd),
      expectedVersion: current.version,
      id: current.id,
      remark: clean(updateForm.remark),
      transportMode: updateForm.transportMode,
    });
    message.success('运输计划已更新');
    updateOpen.value = false;
    await Promise.all([load(), reloadDetail()]);
  } finally {
    updating.value = false;
  }
}

function openCancel() {
  if (!detail.value || !isShipmentDraftEditable(detail.value)) return;
  cancelReason.value = '';
  cancelOpen.value = true;
}

async function submitCancel() {
  const current = detail.value;
  const reason = cancelReason.value.trim();
  if (!current || !isShipmentDraftEditable(current)) return;
  if (!reason) {
    message.warning('请填写取消原因');
    return;
  }
  cancelling.value = true;
  try {
    await cancelShipmentDraft({
      expectedVersion: current.version,
      id: current.id,
      reason,
    });
    message.success('发货草稿已取消');
    cancelOpen.value = false;
    await Promise.all([load(), reloadDetail()]);
  } finally {
    cancelling.value = false;
  }
}

onBeforeUnmount(() => {
  detailRequestVersion += 1;
  invalidateReadinessPollSession();
});

onMounted(async () => {
  hydrateRelationQuery();
  await load();
  const shipmentId = routeQueryValue(route.query.shipmentId);
  if (shipmentId) await openDetail(shipmentId);
});

onBeforeRouteLeave(() => {
  detailOpen.value = false;
  detailRequestVersion += 1;
  closeReadiness();
});

watch(
  () =>
    [
      route.query.customerId,
      route.query.customerName,
      route.query.contractOrderId,
      route.query.contractOrderNo,
      route.query.fulfillmentPlanId,
      route.query.fulfillmentPlanNo,
      route.query.shipmentId,
    ] as const,
  async (current, previous) => {
    const customerId = routeQueryValue(current[0]) || undefined;
    const customerName = routeQueryValue(current[1]);
    const contractOrderId = routeQueryValue(current[2]) || undefined;
    const contractOrderNo = routeQueryValue(current[3]);
    const fulfillmentPlanId = routeQueryValue(current[4]) || undefined;
    const fulfillmentPlanNo = routeQueryValue(current[5]);
    let relationChanged = false;
    if (query.customerId !== customerId) {
      query.customerId = customerId;
      relationChanged = true;
    }
    if (query.contractOrderId !== contractOrderId) {
      query.contractOrderId = contractOrderId;
      relationChanged = true;
    }
    if (query.fulfillmentPlanId !== fulfillmentPlanId) {
      query.fulfillmentPlanId = fulfillmentPlanId;
      relationChanged = true;
    }
    relationQueryLabels.customerName = customerName;
    relationQueryLabels.contractOrderNo = contractOrderNo;
    relationQueryLabels.fulfillmentPlanNo = fulfillmentPlanNo;
    if (relationChanged) {
      query.pageNo = 1;
      await load();
    }

    const shipmentId = routeQueryValue(current[6]);
    const previousShipmentId = routeQueryValue(previous?.[6]);
    if (shipmentId && (!detailOpen.value || detail.value?.id !== shipmentId)) {
      await openDetail(shipmentId);
    } else if (!shipmentId && previousShipmentId && detailOpen.value) {
      handleDetailOpenChange(false);
    }
  },
);
</script>

<template>
  <Page
    :auto-content-height="false"
    description="从已确认履约计划建立真实发货单；AI 物化、库存预留、人工确认、WMS 交接与整单物理出库均为可审计的独立状态"
    title="发货计划"
  >
    <template #extra>
      <Button v-if="canCreate" type="primary" @click="openCreate">
        <template #icon>
          <IconifyIcon icon="lucide:package-plus" aria-hidden="true" />
        </template>
        创建发货草稿
      </Button>
    </template>

    <Alert
      class="shipment-page__boundary"
      message="安全边界"
      description="DRAFT、已预留、已确认、已交接和已出库含义不同。浏览器只提交单据身份与 CAS 版本；产品、仓库、数量和权威证据均由服务端重建。只有 WMS 返回 CONSUMED 凭证后才表示真实库存已扣减。"
      show-icon
      type="info"
    />

    <Card :bordered="false" class="shipment-page__filters" size="small">
      <Space wrap>
        <Tag
          v-for="filter in activeRelationFilters"
          :key="filter.key"
          closable
          color="blue"
          @close="clearRelationFilter(filter.key)"
        >
          {{ filter.label }}：{{ filter.value }}
        </Tag>
        <Input
          v-model:value="query.keyword"
          allow-clear
          placeholder="发货单、合同、履约计划、客户"
          style="width: 300px"
          @press-enter="search"
        />
        <Select
          v-model:value="query.status"
          allow-clear
          :options="[
            { label: '草稿', value: 'DRAFT' },
            { label: '已确认', value: 'CONFIRMED' },
            { label: '已取消', value: 'CANCELLED' },
          ]"
          placeholder="全部状态"
          style="width: 130px"
        />
        <Select
          v-model:value="query.transportMode"
          allow-clear
          :options="transportOptions"
          placeholder="全部运输方式"
          style="width: 150px"
        />
        <Button type="primary" @click="search">查询</Button>
        <Button @click="reset">重置</Button>
      </Space>
    </Card>

    <Card :bordered="false" size="small">
      <Table
        :columns="columns"
        :data-source="records"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1320 }"
      >
        <template #emptyText>
          <Empty description="暂无真实发货单，请先确认合同和履约计划" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'shipment'">
            <div class="shipment-page__stack">
              <button
                class="shipment-page__link shipment-page__link--single"
                @click="openDetail(record.id)"
              >
                <strong>{{ record.shipmentNo }}</strong>
              </button>
              <div class="shipment-page__source-links">
                <TradeBusinessLink
                  :disabled="!canQueryDemandPlan"
                  :to="
                    canQueryDemandPlan
                      ? fdmTradeDocumentRoute(
                          'demand-plan',
                          record.fulfillmentPlanId,
                        )
                      : undefined
                  "
                >
                  {{
                    record.fulfillmentPlanNo ||
                    `计划 ${record.fulfillmentPlanId}`
                  }}
                </TradeBusinessLink>
                <span aria-hidden="true">·</span>
                <TradeBusinessLink
                  :disabled="!canQueryContract"
                  :to="
                    canQueryContract
                      ? fdmTradeDocumentRoute(
                          'contract-order',
                          record.contractOrderId,
                        )
                      : undefined
                  "
                >
                  {{
                    record.contractOrderNo || `合同 ${record.contractOrderId}`
                  }}
                </TradeBusinessLink>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'customer'">
            <div class="shipment-page__stack">
              <TradeBusinessLink
                :disabled="!canQueryCustomer"
                :to="
                  canQueryCustomer
                    ? fdmTradeDocumentRoute('customer', record.customerId)
                    : undefined
                "
              >
                {{ record.customerName || '未提供客户快照' }}
              </TradeBusinessLink>
              <span>{{
                record.companyName || `公司 ${record.companyId}`
              }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'trade'">
            <div class="shipment-page__stack">
              <strong>{{ record.incoterm || '未提供贸易术语' }}</strong>
              <span>{{ record.deliveryLocation || '未提供交货地' }}</span>
              <span>
                {{ fulfillmentLabel(record.fulfillmentMode) }}
                <Tag v-if="record.directShipRequired" color="purple">要求直发</Tag>
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'schedule'">
            <div class="shipment-page__stack">
              <strong>{{ transportLabel(record.transportMode) }}</strong>
              <span>ETD {{ record.etd || '未安排' }}</span>
              <span>ETA {{ record.eta || '未安排' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'readiness'">
            <div class="shipment-page__stack">
              <Tag :color="record.readinessMaterialized ? 'green' : 'orange'">
                {{
                  record.readinessMaterialized
                    ? '已物化准备证据'
                    : '等待准备建议'
                }}
              </Tag>
              <span>{{ record.lineCount }} 行 ·
                {{ record.sourceCount }} 个来源</span>
              <Tag
                v-if="record.reservationStatus"
                :color="reservationStatusColor(record.reservationStatus)"
              >
                {{ reservationStatusLabel(record.reservationStatus) }}
              </Tag>
              <span>{{ nextActionLabel(record.nextRequiredAction) }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ statusLabel(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <Button size="small" type="link" @click="openDetail(record.id)">
                查看
              </Button>
              <Dropdown
                v-if="hasShipmentSecondaryActions(record)"
                :trigger="['click']"
              >
                <Button size="small" type="link">
                  更多
                  <IconifyIcon icon="lucide:chevron-down" aria-hidden="true" />
                </Button>
                <template #overlay>
                  <Menu
                    @click="
                      handleShipmentSecondaryAction(String($event.key), record)
                    "
                  >
                    <Menu.Item
                      v-if="canUpdate && isShipmentDraftEditable(record)"
                      key="transport"
                    >
                      编辑运输计划
                    </Menu.Item>
                    <Menu.Item
                      v-if="
                        canAiGenerate &&
                        record.status === 'DRAFT' &&
                        !record.readinessMaterialized
                      "
                      key="ai"
                    >
                      AI 准备建议
                    </Menu.Item>
                    <Menu.Item
                      v-if="reservationActionFor(record)"
                      key="reservation"
                      :disabled="
                        reservationSubmitting &&
                        pendingReservationCommand?.shipmentId === record.id
                      "
                    >
                      {{ reservationActionLabel(reservationActionFor(record)) }}
                    </Menu.Item>
                    <Menu.Item
                      v-if="canConfirmShipment(record, canConfirm)"
                      key="confirm"
                      :disabled="
                        confirmationSubmitting &&
                        pendingConfirmationCommand?.shipmentId === record.id
                      "
                    >
                      确认发货
                    </Menu.Item>
                    <Menu.Item
                      v-if="canRecoverShipmentHandoff(record, canConfirm)"
                      key="recover"
                      :disabled="
                        handoffRecoverySubmitting &&
                        pendingHandoffRecoveryCommand?.shipmentId === record.id
                      "
                    >
                      恢复 WMS 交接
                    </Menu.Item>
                    <Menu.Divider
                      v-if="canCancel && isShipmentDraftEditable(record)"
                    />
                    <Menu.Item
                      v-if="canCancel && isShipmentDraftEditable(record)"
                      key="cancel"
                      danger
                    >
                      取消发货草稿
                    </Menu.Item>
                  </Menu>
                </template>
              </Dropdown>
            </Space>
          </template>
        </template>
      </Table>

      <footer class="shipment-page__pagination">
        <span>共 {{ total }} 张真实发货单</span>
        <Pagination
          :current="query.pageNo"
          :page-size="query.pageSize"
          :page-size-options="['10', '20', '50', '100']"
          show-size-changer
          :total="total"
          @change="changePage"
          @show-size-change="changePage"
        />
      </footer>
    </Card>
  </Page>

  <Drawer
    :open="detailOpen"
    :body-style="{ padding: '16px' }"
    destroy-on-close
    :title="detail?.shipmentNo || '发货计划详情'"
    width="min(1180px, 96vw)"
    @update:open="handleDetailOpenChange"
  >
    <template #extra>
      <Space>
        <Button
          v-if="
            canAiGenerate &&
            detail?.status === 'DRAFT' &&
            !detail.readinessMaterialized
          "
          size="small"
          type="primary"
          @click="openReadiness"
        >
          <template #icon>
            <IconifyIcon icon="lucide:sparkles" aria-hidden="true" />
          </template>
          AI 发货准备建议
        </Button>
        <Button
          v-if="detailReservationAction"
          :danger="detailReservationAction === 'RELEASE'"
          :loading="reservationSubmitting"
          size="small"
          :type="detailReservationAction === 'RELEASE' ? 'default' : 'primary'"
          @click="openReservationAction()"
        >
          <template #icon>
            <IconifyIcon
              :icon="
                detailReservationAction === 'RELEASE'
                  ? 'lucide:package-open'
                  : 'lucide:package-check'
              "
              aria-hidden="true"
            />
          </template>
          {{ reservationActionLabel(detailReservationAction) }}
        </Button>
        <Button
          v-if="detailCanConfirm"
          :loading="confirmationSubmitting"
          size="small"
          type="primary"
          @click="openConfirmation"
        >
          <template #icon>
            <IconifyIcon icon="lucide:send" aria-hidden="true" />
          </template>
          确认发货
        </Button>
        <Button
          v-if="detailCanRecoverHandoff"
          danger
          :loading="handoffRecoverySubmitting"
          size="small"
          @click="openHandoffRecovery"
        >
          <template #icon>
            <IconifyIcon icon="lucide:refresh-cw" aria-hidden="true" />
          </template>
          恢复 WMS 交接
        </Button>
        <Button
          v-if="canUpdate && isShipmentDraftEditable(detail)"
          size="small"
          @click="openUpdate"
        >
          修改运输计划
        </Button>
        <Button
          v-if="canCancel && isShipmentDraftEditable(detail)"
          danger
          size="small"
          @click="openCancel"
        >
          取消草稿
        </Button>
      </Space>
    </template>

    <Spin :spinning="detailLoading">
      <template v-if="detail">
        <Alert
          class="shipment-page__detail-alert"
          :description="nextActionLabel(detail.nextRequiredAction)"
          :message="lifecycleMessage(detail)"
          show-icon
          :type="lifecycleAlertType(detail)"
        />

        <Alert
          v-if="readinessMaterializationResult?.shipmentId === detail.id"
          class="shipment-page__detail-alert"
          :message="
            readinessMaterializationResult.materializedNow
              ? '发货明细物化成功'
              : '发货明细已存在，本次为幂等重放'
          "
          show-icon
          type="success"
        >
          <template #description>
            <div class="shipment-page__stack">
              <span>
                准备快照 Hash：
                <code>{{
                  readinessMaterializationResult.readinessSnapshotHash
                }}</code>
              </span>
              <span>
                下一步可另行显式预留真实 WMS
                库存。本次物化未预留、未确认发货、未扣库存，也未创建出库单。
              </span>
            </div>
          </template>
        </Alert>

        <Descriptions
          v-if="detail.reservationId"
          bordered
          class="shipment-page__section"
          :column="2"
          size="small"
          title="WMS 库存预留凭证"
        >
          <Descriptions.Item label="预留状态">
            <Tag :color="reservationStatusColor(detail.reservationStatus)">
              {{ reservationStatusLabel(detail.reservationStatus) }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="预留编号">
            {{ detail.reservationId }}
          </Descriptions.Item>
          <Descriptions.Item label="来源 / 尝试">
            Shipment V{{ detail.reservationSourceVersion ?? '—' }} · Attempt
            {{ detail.reservationAttemptNo ?? '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="WMS 预留版本">
            V{{ detail.reservationVersion ?? '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="预留时间">
            {{ dateTimeText(detail.reservationReservedAt) }}
          </Descriptions.Item>
          <Descriptions.Item label="到期时间">
            <strong v-if="detail.reservationStatus === 'ACTIVE'">
              {{ dateTimeText(detail.reservationExpiresAt) }}
            </strong>
            <template v-else>
              {{ dateTimeText(detail.reservationExpiresAt) }}
            </template>
          </Descriptions.Item>
          <Descriptions.Item label="命令幂等键" :span="2">
            <code>{{ detail.reservationIdempotencyKey || '—' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="请求 Hash" :span="2">
            <code>{{ detail.reservationRequestHash || '—' }}</code>
          </Descriptions.Item>
          <Descriptions.Item :span="2">
            <Alert
              :description="reservationBoundaryDescription(detail)"
              :message="reservationBoundaryMessage(detail)"
              show-icon
              :type="
                detail.reservationStatus === 'CONSUMED' ? 'success' : 'info'
              "
            />
          </Descriptions.Item>
        </Descriptions>

        <Descriptions
          v-if="detail.confirmedSnapshotHash"
          bordered
          class="shipment-page__section"
          :column="2"
          size="small"
          title="发货确认与 WMS 交接凭证"
        >
          <Descriptions.Item label="确认时间">
            {{ dateTimeText(detail.confirmedTime) }}
          </Descriptions.Item>
          <Descriptions.Item label="确认人">
            {{ detail.confirmedByUserId || '系统未返回' }}
          </Descriptions.Item>
          <Descriptions.Item label="确认快照 Hash" :span="2">
            <code>{{ detail.confirmedSnapshotHash }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="确认事件" :span="2">
            <code>{{ detail.confirmationOutboxEventId || '等待写入' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="交接投递状态">
            <Tag
              :color="
                detail.wmsHandoffDeliveryStatus === 'DEAD_LETTER'
                  ? 'red'
                  : detail.wmsHandoffDeliveryStatus === 'PUBLISHED'
                    ? 'green'
                    : 'blue'
              "
            >
              {{ detail.wmsHandoffDeliveryStatus || '等待创建' }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="投递版本 / 次数">
            V{{ detail.wmsHandoffOutboxVersion ?? '—' }} ·
            {{ detail.wmsHandoffRetryCount ?? 0 }} 次
          </Descriptions.Item>
          <Descriptions.Item
            v-if="detail.wmsHandoffRecoveryRequired"
            label="死信时间"
          >
            {{ dateTimeText(detail.wmsHandoffDeadLetterAt) }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="detail.wmsHandoffRecoveryRequired"
            label="脱敏错误"
          >
            {{ detail.wmsHandoffLastErrorCode || 'WMS_HANDOFF_FAILED' }} ·
            {{
              detail.wmsHandoffLastErrorMessage || '请联系管理员检查追踪日志'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="交接冻结版本">
            V{{ detail.reservationHandoffPinnedVersion ?? '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="冻结时间">
            {{ dateTimeText(detail.reservationHandoffPendingAt) }}
          </Descriptions.Item>
          <Descriptions.Item label="冻结事件" :span="2">
            <code>{{ detail.reservationHandoffPinEventId || '—' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="WMS 交接事件" :span="2">
            <code>{{ detail.wmsHandoffEventId || '等待 WMS 接收' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="WMS 交接时间">
            {{ dateTimeText(detail.wmsHandedOffTime) }}
          </Descriptions.Item>
          <Descriptions.Item label="WMS 出库单数">
            {{ detail.wmsOrderCount ?? detail.wmsOrders.length }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="detail.wmsHandoffPlanHash"
            label="WMS 交接计划 Hash"
            :span="2"
          >
            <code>{{ detail.wmsHandoffPlanHash }}</code>
          </Descriptions.Item>
        </Descriptions>

        <Descriptions
          v-if="detail.wmsConsumptionEventId"
          bordered
          class="shipment-page__section"
          :column="2"
          size="small"
          title="WMS 真实出库完成回执"
        >
          <Descriptions.Item label="物理出库时间">
            {{ dateTimeText(detail.wmsConsumedAt) }}
          </Descriptions.Item>
          <Descriptions.Item label="完成范围">
            {{ detail.wmsConsumedOrderCount ?? '—' }} 张出库单 ·
            {{ detail.wmsConsumedLineCount ?? '—' }} 行 ·
            {{ detail.wmsConsumedInventoryCount ?? '—' }} 个库存维度
          </Descriptions.Item>
          <Descriptions.Item label="消费事件" :span="2">
            <code>{{ detail.wmsConsumptionEventId }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="FDM Inbox / WMS Outbox" :span="2">
            {{ detail.wmsCompletionInboxId || '—' }} /
            {{ detail.wmsCompletionOutboxId || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="消费计划 Hash" :span="2">
            <code>{{ detail.wmsConsumptionPlanHash || '—' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="消费命令 Hash" :span="2">
            <code>{{ detail.wmsConsumptionRequestHash || '—' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="事件载荷 Hash" :span="2">
            <code>{{ detail.wmsCompletionPayloadHash || '—' }}</code>
          </Descriptions.Item>
          <Descriptions.Item :span="2">
            <Alert
              description="该回执来自 WMS 的已验证整单消费事件；页面不根据计划数量推算实际出库量。每行实际出库数量均由同一事务中的 WMS 行事实回填。"
              message="真实库存扣减与 FDM 实际出库量已经原子确认"
              show-icon
              type="success"
            />
          </Descriptions.Item>
        </Descriptions>

        <Card
          v-if="detail.wmsOrders.length"
          :bordered="false"
          class="shipment-page__section"
          size="small"
          title="按仓 WMS 出库单"
        >
          <Table
            :columns="wmsOrderColumns"
            :data-source="detail.wmsOrders"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <Tag
                  :color="
                    record.wmsOrderStatus === 'FINISHED' ? 'green' : 'blue'
                  "
                >
                  {{
                    record.wmsOrderStatus === 'FINISHED' ? '已完成' : '待出库'
                  }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'time'">
                {{ dateTimeText(record.handedOffTime) }}
              </template>
            </template>
          </Table>
        </Card>

        <Descriptions bordered :column="2" size="small" title="来源与业务约束">
          <Descriptions.Item label="发货单号">
            {{ detail.shipmentNo }}
          </Descriptions.Item>
          <Descriptions.Item label="版本">
            V{{ detail.version }}
          </Descriptions.Item>
          <Descriptions.Item label="来源合同">
            <TradeBusinessLink
              :disabled="!canQueryContract"
              :to="
                canQueryContract
                  ? fdmTradeDocumentRoute(
                      'contract-order',
                      detail.contractOrderId,
                    )
                  : undefined
              "
            >
              {{ detail.contractOrderNo || detail.contractOrderId }}
            </TradeBusinessLink>
            · V{{ detail.contractOrderVersion }}
          </Descriptions.Item>
          <Descriptions.Item label="履约计划">
            <TradeBusinessLink
              :disabled="!canQueryDemandPlan"
              :to="
                canQueryDemandPlan
                  ? fdmTradeDocumentRoute(
                      'demand-plan',
                      detail.fulfillmentPlanId,
                    )
                  : undefined
              "
            >
              {{ detail.fulfillmentPlanNo || detail.fulfillmentPlanId }}
            </TradeBusinessLink>
            · V{{ detail.fulfillmentPlanVersion }}
          </Descriptions.Item>
          <Descriptions.Item label="客户">
            <TradeBusinessLink
              :disabled="!canQueryCustomer"
              :to="
                canQueryCustomer
                  ? fdmTradeDocumentRoute('customer', detail.customerId)
                  : undefined
              "
            >
              {{ detail.customerName || detail.customerId }}
            </TradeBusinessLink>
          </Descriptions.Item>
          <Descriptions.Item label="业务公司">
            {{ detail.companyName || detail.companyId }}
          </Descriptions.Item>
          <Descriptions.Item label="贸易术语">
            {{ detail.incoterm || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="交货地点">
            {{ detail.deliveryLocation || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="履约方式">
            {{ fulfillmentLabel(detail.fulfillmentMode) }}
            <Tag v-if="detail.directShipRequired" color="purple">要求直发</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag :color="statusColor(detail.status)">
              {{ statusLabel(detail.status) }}
            </Tag>
          </Descriptions.Item>
        </Descriptions>

        <Descriptions
          bordered
          class="shipment-page__section"
          :column="2"
          size="small"
          title="运输计划"
        >
          <Descriptions.Item label="运输方式">
            {{ transportLabel(detail.transportMode) }}
          </Descriptions.Item>
          <Descriptions.Item label="承运方">
            {{ detail.carrierName || '未安排' }}
          </Descriptions.Item>
          <Descriptions.Item label="订舱号">
            {{ detail.bookingNo || '未安排' }}
          </Descriptions.Item>
          <Descriptions.Item label="ETD / ETA">
            {{ detail.etd || '未安排' }} / {{ detail.eta || '未安排' }}
          </Descriptions.Item>
          <Descriptions.Item :span="2" label="备注">
            {{ detail.remark || '无' }}
          </Descriptions.Item>
        </Descriptions>

        <Card
          :bordered="false"
          class="shipment-page__section"
          size="small"
          title="产品明细与 WMS 权威证据"
        >
          <Table
            :columns="lineColumns"
            :data-source="detail.lines"
            :pagination="false"
            row-key="id"
            :scroll="{ x: 850 }"
          >
            <template #emptyText>
              <Empty
                description="尚未物化发货产品。空壳草稿不会复制合同数量或假库存。"
              />
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'product'">
                <div class="shipment-page__stack">
                  <strong>{{ record.productName }}</strong>
                  <span>{{ record.productCode || '无产品编码' }} · SKU
                    {{ record.skuId }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'quantity'">
                {{ record.plannedQuantity }} {{ record.unit }}
              </template>
              <template v-else-if="column.key === 'outbound'">
                <strong>{{ record.actualOutboundQuantity }} {{ record.unit }}</strong>
                <div class="shipment-page__muted">当前阶段应始终为 0</div>
              </template>
              <template v-else-if="column.key === 'source'">
                <Space :size="4" wrap>
                  <Tag
                    v-for="source in record.sources"
                    :key="source.id"
                    color="green"
                  >
                    仓库 {{ source.warehouseId }} · {{ source.readinessStatus }}
                  </Tag>
                </Space>
              </template>
            </template>
            <template #expandedRowRender="{ record }">
              <div class="shipment-page__evidence-list">
                <article
                  v-for="source in record.sources"
                  :key="source.id"
                  class="shipment-page__evidence"
                >
                  <header>
                    <strong>仓库 {{ source.warehouseId }}</strong>
                    <Tag color="green">{{ source.readinessStatus }}</Tag>
                    <span>{{ source.plannedQuantity }} {{ record.unit }}</span>
                  </header>
                  <dl>
                    <dt>权威池</dt>
                    <dd>{{ source.authorityPoolKey }}</dd>
                    <dt>WMS 来源</dt>
                    <dd>
                      {{ source.sourceSystem }} · {{ source.sourceVersion }} ·
                      Seq
                      {{ source.sourceSequence }}
                    </dd>
                    <dt>WMS 请求</dt>
                    <dd class="shipment-page__hash">
                      {{ source.sourceRequestId }}
                    </dd>
                    <dt>WMS Payload Hash</dt>
                    <dd class="shipment-page__hash">
                      {{ source.sourcePayloadHash }}
                    </dd>
                    <dt>仓库授权</dt>
                    <dd>
                      映射 {{ source.warehouseAuthorityMappingId }} · V{{
                        source.warehouseAuthorityVersion
                      }}
                    </dd>
                    <dt>授权引用</dt>
                    <dd class="shipment-page__hash">
                      {{ source.warehouseAuthorityEvidenceRef }}
                    </dd>
                    <dt>授权 Hash</dt>
                    <dd class="shipment-page__hash">
                      {{ source.warehouseAuthorityHash }}
                    </dd>
                    <dt>授权生效 / 截止</dt>
                    <dd>
                      {{ dateTimeText(source.warehouseAuthorityEffectiveFrom) }}
                      /
                      {{ dateTimeText(source.warehouseAuthorityEffectiveTo) }}
                    </dd>
                    <dt>证据引用</dt>
                    <dd>{{ source.evidenceRef }}</dd>
                    <dt>证据版本</dt>
                    <dd>{{ source.evidenceVersion }}</dd>
                    <dt>证据 Hash</dt>
                    <dd class="shipment-page__hash">
                      {{ source.evidenceHash }}
                    </dd>
                    <dt>观测 / 失效</dt>
                    <dd>
                      {{ dateTimeText(source.evidenceObservedAt) }} /
                      {{ dateTimeText(source.evidenceExpiresAt) }}
                    </dd>
                  </dl>
                </article>
              </div>
            </template>
          </Table>
        </Card>

        <Descriptions
          bordered
          class="shipment-page__section"
          :column="2"
          size="small"
          title="AI 与审计身份"
        >
          <Descriptions.Item label="生成运行">
            {{ detail.generationRunId || '尚未生成' }}
          </Descriptions.Item>
          <Descriptions.Item label="提案版本">
            {{ detail.generationProposalVersion || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="准备快照 Hash" :span="2">
            <code>{{ detail.readinessSnapshotHash || '尚未物化' }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="创建请求 Hash" :span="2">
            <code>{{ detail.creationRequestHash }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {{ dateTimeText(detail.createTime) }}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {{ dateTimeText(detail.updateTime) }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="detail.status === 'CANCELLED'"
            label="取消原因"
            :span="2"
          >
            {{ detail.cancelReason }}
          </Descriptions.Item>
        </Descriptions>
      </template>
    </Spin>
  </Drawer>

  <Modal
    :open="readinessOpen"
    :closable="!readinessSubmitting"
    destroy-on-close
    :footer="null"
    :mask-closable="false"
    title="AI 生成发货准备建议"
    width="min(1120px, 96vw)"
    @cancel="closeReadiness"
  >
    <Spin :spinning="readinessLoading || readinessSubmitting">
      <Alert
        class="shipment-page__modal-alert"
        description="产品、可发上限、WMS 发布版本和公司仓库授权都由服务端实时重建。当前结果只是一份只读提案，不会预留、扣减库存或创建出库单。"
        message="AI 只能在权威边界内选择"
        show-icon
        type="info"
      />

      <template v-if="readinessOptions">
        <Descriptions bordered :column="3" size="small">
          <Descriptions.Item label="发货草稿">
            {{ readinessOptions.shipmentNo }} · V{{
              readinessOptions.shipmentVersion
            }}
          </Descriptions.Item>
          <Descriptions.Item label="业务公司">
            {{ readinessOptions.companyName || readinessOptions.companyId }}
          </Descriptions.Item>
          <Descriptions.Item label="ETD">
            {{ readinessOptions.etd || '未填写' }}
          </Descriptions.Item>
        </Descriptions>

        <Alert
          v-if="readinessOptions.blockers.length"
          class="shipment-page__section"
          message="当前不能启动生成"
          show-icon
          type="error"
        >
          <template #description>
            <ul class="shipment-page__plain-list">
              <li v-for="code in readinessOptions.blockers" :key="code">
                {{ blockerLabel(code) }}
              </li>
            </ul>
          </template>
        </Alert>

        <Form class="shipment-page__section" layout="vertical">
          <Row :gutter="16">
            <Col :md="12" :xs="24">
              <Form.Item label="执行仓库" required>
                <Select
                  v-model:value="readinessForm.warehouseId"
                  :disabled="
                    !!readinessJob && !isGenerationTerminal(readinessJob.status)
                  "
                  placeholder="请选择当前公司已授权仓库"
                >
                  <Select.Option
                    v-for="warehouse in readinessOptions.warehouses"
                    :key="warehouse.mappingId"
                    :value="warehouse.warehouseId"
                  >
                    {{ warehouse.warehouseCode }} ·
                    {{ warehouse.warehouseName }} · 授权 V{{
                      warehouse.authorityVersion
                    }}
                  </Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col :md="12" :xs="24">
              <Form.Item label="大模型" required>
                <Select
                  v-model:value="readinessForm.modelId"
                  :disabled="
                    !!readinessJob && !isGenerationTerminal(readinessJob.status)
                  "
                  placeholder="选择当前公司策略允许的大模型"
                >
                  <Select.Option
                    v-for="model in readinessOptions.models"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }} · {{ model.code }}
                  </Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="补充要求（不能覆盖权威数量和仓库约束）">
            <Input.TextArea
              v-model:value="readinessForm.instruction"
              :disabled="
                !!readinessJob && !isGenerationTerminal(readinessJob.status)
              "
              :maxlength="1000"
              placeholder="例如：优先整单发货；若必须拆批，请说明原因"
              show-count
              :auto-size="{ minRows: 2, maxRows: 5 }"
            />
          </Form.Item>
        </Form>

        <Card
          v-if="readinessJob"
          :bordered="false"
          class="shipment-page__generation-card"
          size="small"
        >
          <template #title>
            <Space>
              <span>生成运行 {{ readinessJob.id }}</span>
              <Tag :color="generationStatusColor(readinessJob.status)">
                {{ generationStatusLabel(readinessJob.status) }}
              </Tag>
              <Tag v-if="readinessJob.modelName" color="purple">
                {{ readinessJob.modelName }}
              </Tag>
            </Space>
          </template>

          <Alert
            v-if="readinessJob.errorMessage"
            :description="readinessJob.errorMessage"
            :message="readinessJob.errorCode || '生成失败'"
            show-icon
            type="error"
          />

          <Alert
            v-if="readinessPollPaused"
            class="shipment-page__generation-summary"
            description="已停止自动请求，避免在网络或权限持续异常时无限轮询。检查连接后可人工继续。"
            message="AI 任务状态查询已暂停"
            show-icon
            type="warning"
          />

          <Alert
            v-if="readinessJob.status === 'READY' && !canMaterializeReadiness"
            class="shipment-page__generation-summary"
            description="只有来源身份、提案结构、只读副作用声明及全部服务端 BLOCKER 规则均完整通过时，才会开放物化操作。"
            message="当前 READY 响应不满足客户端展示门禁"
            show-icon
            type="error"
          />

          <template v-if="readinessJob.proposal">
            <Alert
              class="shipment-page__generation-summary"
              :description="readinessJob.proposal.summary"
              message="AI 只读建议已通过服务端规则校验"
              show-icon
              type="success"
            />

            <Table
              :columns="proposalColumns"
              :data-source="readinessJob.proposal.lineSelections"
              :pagination="false"
              row-key="sourceFulfillmentPlanLineId"
              :scroll="{ x: 1100 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'product'">
                  <div class="shipment-page__stack">
                    <strong>{{ record.productName }}</strong>
                    <span>
                      {{ record.productCode || '无产品编码' }} · SKU
                      {{ record.skuId }}
                    </span>
                  </div>
                </template>
                <template v-else-if="column.key === 'warehouse'">
                  仓库 {{ record.warehouseId }}
                </template>
                <template v-else-if="column.key === 'quantity'">
                  <strong>{{ record.shipQuantity }} {{ record.unitCode }}</strong>
                  <div class="shipment-page__muted">
                    上限 {{ record.maximumShipQuantity }} {{ record.unitCode }}
                  </div>
                </template>
                <template v-else-if="column.key === 'evidence'">
                  <div class="shipment-page__stack">
                    <Tag color="green">
                      {{ record.wmsEvidence.status }} · ATP
                      {{ record.wmsEvidence.availableToPromise }}
                    </Tag>
                    <span>
                      {{ record.wmsEvidence.sourceSystem }} ·
                      {{ record.wmsEvidence.sourceVersion }} · Seq
                      {{ record.wmsEvidence.sourceSequence }}
                    </span>
                    <span class="shipment-page__hash">
                      请求 {{ record.wmsEvidence.sourceRequestId }}
                    </span>
                    <span>
                      仓库授权 V{{
                        record.wmsEvidence.warehouseAuthorityEvidence
                          .authorityVersion
                      }}
                      · 映射
                      {{
                        record.wmsEvidence.warehouseAuthorityEvidence.mappingId
                      }}
                    </span>
                    <details class="shipment-page__evidence-details">
                      <summary>展开完整权威证据</summary>
                      <dl>
                        <dt>WMS Hash</dt>
                        <dd class="shipment-page__hash">
                          {{ record.wmsEvidence.sourcePayloadHash }}
                        </dd>
                        <dt>WMS 观测 / 失效</dt>
                        <dd>
                          {{ dateTimeText(record.wmsEvidence.observedAt) }} /
                          {{ dateTimeText(record.wmsEvidence.validUntil) }}
                        </dd>
                        <dt>授权 Hash</dt>
                        <dd class="shipment-page__hash">
                          {{
                            record.wmsEvidence.warehouseAuthorityEvidence
                              .authorityHash
                          }}
                        </dd>
                        <dt>授权引用</dt>
                        <dd class="shipment-page__hash">
                          {{
                            record.wmsEvidence.warehouseAuthorityEvidence
                              .evidenceRef
                          }}
                        </dd>
                        <dt>授权生效 / 截止</dt>
                        <dd>
                          {{
                            dateTimeText(
                              record.wmsEvidence.warehouseAuthorityEvidence
                                .effectiveFrom,
                            )
                          }}
                          /
                          {{
                            dateTimeText(
                              record.wmsEvidence.warehouseAuthorityEvidence
                                .effectiveTo,
                            )
                          }}
                        </dd>
                      </dl>
                    </details>
                  </div>
                </template>
              </template>
            </Table>

            <Alert
              class="shipment-page__generation-boundary"
              description="当前展示仍是只读建议；只有点击“确认生成发货明细”后，服务端才会重新校验并写入 DRAFT 明细。该操作不会预留库存、确认发货、扣减库存或创建 WMS 出库单。"
              message="物化前仍需人工确认并由服务端再次校验"
              show-icon
              type="warning"
            />
          </template>

          <div
            v-if="readinessJob.rules.length"
            class="shipment-page__rule-list"
          >
            <article v-for="rule in readinessJob.rules" :key="rule.ruleCode">
              <Tag :color="rule.passed ? 'green' : 'red'">
                {{ rule.passed ? '通过' : '拦截' }}
              </Tag>
              <div>
                <strong>{{ rule.ruleCode }}</strong>
                <p>{{ rule.message }}</p>
              </div>
            </article>
          </div>
        </Card>

        <footer class="shipment-page__generation-actions">
          <Button @click="closeReadiness">关闭</Button>
          <Button
            v-if="canMaterializeReadiness"
            :loading="readinessSubmitting"
            type="primary"
            @click="confirmReadinessMaterialization"
          >
            确认生成发货明细
          </Button>
          <Button
            v-if="readinessPollPaused"
            :disabled="readinessSubmitting"
            @click="continueReadinessPoll"
          >
            继续查询
          </Button>
          <Button
            v-if="readinessJob && !isGenerationTerminal(readinessJob.status)"
            danger
            :loading="readinessSubmitting"
            @click="cancelReadiness"
          >
            取消生成
          </Button>
          <Button
            v-if="readinessJob?.status === 'FAILED'"
            :loading="readinessSubmitting"
            @click="retryReadiness"
          >
            重试
          </Button>
          <Button
            v-if="readinessJob && isGenerationTerminal(readinessJob.status)"
            :disabled="readinessJob.status === 'CANCELLED'"
            :loading="readinessSubmitting"
            @click="regenerateReadiness"
          >
            重新生成
          </Button>
          <Button
            v-if="!readinessJob"
            :disabled="
              readinessOptions.blockers.length > 0 ||
              !readinessForm.modelId ||
              !readinessForm.warehouseId
            "
            :loading="readinessSubmitting"
            type="primary"
            @click="startReadiness"
          >
            启动 AI 建议
          </Button>
        </footer>
      </template>
    </Spin>
  </Modal>

  <Modal
    v-model:open="createOpen"
    :confirm-loading="creating"
    destroy-on-close
    ok-text="创建空壳草稿"
    title="从已确认履约计划创建发货草稿"
    width="min(920px, 96vw)"
    @ok="submitCreate"
  >
    <Alert
      class="shipment-page__modal-alert"
      description="浏览器只提交合同/计划身份和运输计划；产品、数量、仓库及库存证据不会从本表单写入。"
      message="先创建可审计的 DRAFT 空壳"
      show-icon
      type="info"
    />
    <Form layout="vertical">
      <Form.Item label="已确认履约计划" required>
        <Select
          v-model:value="createForm.fulfillmentPlanId"
          allow-clear
          :filter-option="false"
          :loading="planLoading"
          placeholder="输入计划编号、合同或客户搜索"
          show-search
          @change="selectPlan"
          @search="searchPlans"
        >
          <Select.Option
            v-for="plan in planOptions"
            :key="plan.id"
            :disabled="!plan.downstreamReady"
            :value="plan.id"
          >
            {{ plan.planNo }} · {{ plan.contractOrderNo }} ·
            {{ plan.customerName || '未提供客户' }}
            {{ plan.downstreamReady ? '' : '（下游条件未满足）' }}
          </Select.Option>
        </Select>
      </Form.Item>

      <Alert
        v-if="selectedPlan"
        class="shipment-page__plan-summary"
        :description="`${selectedPlan.contractOrderNo} · ${selectedPlan.customerName || '未提供客户'} · ${selectedPlan.lineCount} 个产品行`"
        :message="`${selectedPlan.planNo} · V${selectedPlan.version}`"
        show-icon
        :type="selectedPlan.downstreamReady ? 'success' : 'warning'"
      />

      <Row :gutter="16">
        <Col :md="8" :xs="24">
          <Form.Item label="运输方式">
            <Select
              v-model:value="createForm.transportMode"
              allow-clear
              :options="transportOptions"
              placeholder="可稍后补充"
            />
          </Form.Item>
        </Col>
        <Col :md="8" :xs="24">
          <Form.Item label="预计离港日期" required>
            <DatePicker v-model:value="createForm.etd" style="width: 100%" />
          </Form.Item>
        </Col>
        <Col :md="8" :xs="24">
          <Form.Item label="预计到达日期">
            <DatePicker v-model:value="createForm.eta" style="width: 100%" />
          </Form.Item>
        </Col>
      </Row>
      <Row :gutter="16">
        <Col :md="12" :xs="24">
          <Form.Item label="承运方">
            <Input v-model:value="createForm.carrierName" :maxlength="128" />
          </Form.Item>
        </Col>
        <Col :md="12" :xs="24">
          <Form.Item label="订舱号">
            <Input v-model:value="createForm.bookingNo" :maxlength="128" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="计划备注">
        <Input.TextArea
          v-model:value="createForm.remark"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          :maxlength="2000"
          show-count
        />
      </Form.Item>
    </Form>
  </Modal>

  <Modal
    v-model:open="updateOpen"
    :confirm-loading="updating"
    ok-text="保存运输计划"
    title="修改发货草稿运输计划"
    width="min(760px, 96vw)"
    @ok="submitUpdate"
  >
    <Form layout="vertical">
      <Row :gutter="16">
        <Col :md="8" :xs="24">
          <Form.Item label="运输方式">
            <Select
              v-model:value="updateForm.transportMode"
              allow-clear
              :options="transportOptions"
            />
          </Form.Item>
        </Col>
        <Col :md="8" :xs="24">
          <Form.Item label="预计离港日期">
            <DatePicker v-model:value="updateForm.etd" style="width: 100%" />
          </Form.Item>
        </Col>
        <Col :md="8" :xs="24">
          <Form.Item label="预计到达日期">
            <DatePicker v-model:value="updateForm.eta" style="width: 100%" />
          </Form.Item>
        </Col>
      </Row>
      <Row :gutter="16">
        <Col :md="12" :xs="24">
          <Form.Item label="承运方">
            <Input v-model:value="updateForm.carrierName" :maxlength="128" />
          </Form.Item>
        </Col>
        <Col :md="12" :xs="24">
          <Form.Item label="订舱号">
            <Input v-model:value="updateForm.bookingNo" :maxlength="128" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="计划备注">
        <Input.TextArea
          v-model:value="updateForm.remark"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          :maxlength="2000"
          show-count
        />
      </Form.Item>
    </Form>
  </Modal>

  <Modal
    :open="releaseReservationOpen"
    :confirm-loading="reservationSubmitting"
    :mask-closable="false"
    ok-text="确认释放预留"
    title="释放真实 WMS 库存预留"
    @cancel="cancelReleaseReservation"
    @ok="submitReleaseReservation"
  >
    <Alert
      class="shipment-page__modal-alert"
      description="释放只减少 WMS reserved_quantity，不扣减在手库存、不确认发货，也不创建、完成或删除 WMS 出库单。释放后如需再次预留，必须发起一个新的预留动作并重新校验全部权威事实。"
      message="释放当前 ACTIVE 预留"
      show-icon
      type="warning"
    />
    <Input.TextArea
      v-model:value="releaseReservationReason"
      :auto-size="{ minRows: 3, maxRows: 6 }"
      :maxlength="512"
      placeholder="请填写释放原因（必填）"
      show-count
    />
  </Modal>

  <Modal
    :open="handoffRecoveryOpen"
    :confirm-loading="handoffRecoverySubmitting"
    :mask-closable="false"
    ok-text="重新投递原交接事件"
    title="恢复 WMS 交接"
    @cancel="cancelHandoffRecovery"
    @ok="submitHandoffRecovery"
  >
    <Alert
      class="shipment-page__modal-alert"
      description="恢复只把原 DEAD_LETTER 事件重新排队，并保留原 event ID、payload hash、确认快照和 WMS 命令幂等键；不会重新冻结预留、创建第二条事件或直接调用 WMS。原因会写入不可变审计。"
      message="受控重试，不是重新确认"
      show-icon
      type="warning"
    />
    <Input.TextArea
      v-model:value="handoffRecoveryReason"
      :maxlength="500"
      placeholder="请填写确认故障已处理、允许重新投递的原因（必填）"
      :rows="4"
      show-count
    />
  </Modal>

  <Modal
    v-model:open="cancelOpen"
    :confirm-loading="cancelling"
    ok-text="确认取消"
    title="取消发货草稿"
    @ok="submitCancel"
  >
    <Alert
      class="shipment-page__modal-alert"
      description="取消只改变本地发货草稿状态，不会创建、撤销或完成任何 WMS 出库动作。"
      message="这是显式状态变更"
      show-icon
      type="warning"
    />
    <Input.TextArea
      v-model:value="cancelReason"
      :auto-size="{ minRows: 3, maxRows: 6 }"
      :maxlength="500"
      placeholder="请填写取消原因（必填）"
      show-count
    />
  </Modal>
</template>

<style scoped>
.shipment-page__boundary,
.shipment-page__filters {
  margin-bottom: 12px;
}

.shipment-page__link {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.shipment-page__link strong {
  color: #1677ff;
}

.shipment-page__link:hover strong {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.shipment-page__link:focus-visible {
  outline: 2px solid #91caff;
  outline-offset: 2px;
}

.shipment-page__link span,
.shipment-page__muted,
.shipment-page__stack span {
  font-size: 12px;
  color: #8492a6;
}

.shipment-page__stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.shipment-page__source-links {
  display: flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  color: #8492a6;
}

.shipment-page__source-links :deep(.fdm-trade-business-link) {
  max-width: 46%;
  font-size: 12px;
}

.shipment-page__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  color: #64748b;
}

.shipment-page__detail-alert,
.shipment-page__generation-boundary,
.shipment-page__generation-summary,
.shipment-page__modal-alert,
.shipment-page__plan-summary,
.shipment-page__section {
  margin-bottom: 16px;
}

.shipment-page__section {
  margin-top: 16px;
}

.shipment-page__evidence-list {
  display: grid;
  gap: 10px;
}

.shipment-page__evidence {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.shipment-page__evidence header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.shipment-page__evidence dl {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  row-gap: 5px;
  margin: 0;
  font-size: 12px;
}

.shipment-page__evidence dt {
  color: #64748b;
}

.shipment-page__evidence dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.shipment-page__evidence-details {
  font-size: 12px;
  color: #64748b;
}

.shipment-page__evidence-details summary {
  color: #1677ff;
  cursor: pointer;
}

.shipment-page__evidence-details dl {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  row-gap: 5px;
  margin: 8px 0 0;
}

.shipment-page__evidence-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.shipment-page__hash,
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow-wrap: anywhere;
}

.shipment-page__generation-card {
  margin-top: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.shipment-page__generation-summary {
  margin-bottom: 12px;
}

.shipment-page__generation-boundary {
  margin-top: 12px;
}

.shipment-page__generation-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.shipment-page__rule-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.shipment-page__rule-list article {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.shipment-page__rule-list p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #64748b;
}

.shipment-page__plain-list {
  padding-left: 18px;
  margin: 0;
}

@media (max-width: 768px) {
  .shipment-page__generation-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .shipment-page__pagination {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
}
</style>
