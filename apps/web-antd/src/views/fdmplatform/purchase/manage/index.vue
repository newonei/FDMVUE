<script setup lang="ts">
import type { ActionDefinition } from '../../data';
import type { DocumentKind } from '../../documents/model';

import type { AttachmentView, Contract, DocumentRow } from '#/api/fdmplatform';
import type { MigrationInfo } from '#/api/fdmplatform/business-documents';
import type {
  ProcurementOrderRow,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  message,
  Progress,
  Space,
  Table,
  TabPane,
  Tabs,
} from 'ant-design-vue';

import {
  getAttachments,
  getContract,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import {
  downloadProcurementFile,
  exportProcurementOrder,
  getProcurementOrder,
  getProcurementOrders,
  procurementOrderAction,
  uploadProcurementSigned,
} from '#/api/fdmplatform/procurement';
import { getProcurementFinanceSummary } from '#/api/fdmplatform/procurement-finance';

import ActionDialog from '../../components/ActionDialog.vue';
import AttachmentPanel from '../../components/AttachmentPanel.vue';
import ContractDocumentDialog from '../../components/ContractDocumentDialog.vue';
import RecordTable from '../../components/RecordTable.vue';
import { errorText, field, rows } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import DocumentAction from '../../documents/DocumentAction.vue';
import MigrationSource from '../../documents/MigrationSource.vue';
import { documentActionUnavailableReason } from '../../documents/model';
import {
  contractTarget,
  detailLocation,
  entityTarget,
  relatedDocumentLinks,
  resolveDocumentRow,
  standaloneLocation,
  withoutDetailQuery,
} from '../../documents/navigation';
import RecordDetail from '../../documents/RecordDetail.vue';
import RelatedLink from '../../documents/RelatedLink.vue';
import { useRouteOwner } from '../../documents/useRouteOwner';
import FinanceDocument from '../../finance/procurement/components/FinanceDocument.vue';
import OrderFinance from '../../finance/procurement/components/OrderFinance.vue';
import { hasPayableBalance } from '../../finance/procurement/model';
import ProcurementPageHeader from '../components/ProcurementPageHeader.vue';
import ProcurementStatusBadge from '../components/ProcurementStatusBadge.vue';
import OrderContract from './components/OrderContract.vue';
import OrderDetails from './components/OrderDetails.vue';
import {
  canRecordOrderArrival,
  canReturnOrderArrival,
  downloadBlob,
  orderArrivalProgress,
  orderDetailsPayload,
  orderMoney,
  orderPaymentProgress,
  purchaseRowLabels,
} from './model';

import '../../documents/procurement-tabs';

import '../../components/compact-tables.css';
import '../components/procurement.css';

const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const records = ref<ProcurementOrderRow[]>([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const keyword = ref(
  typeof route.query.keyword === 'string' ? route.query.keyword : '',
);
const status = ref<string | undefined>(
  typeof route.query.status === 'string' ? route.query.status : undefined,
);
const mine = ref(route.query.mine === 'true');
const loading = ref(false);
const detailLoading = ref(false);
const saving = ref(false);
const pageError = ref('');
const listError = ref('');
const view = ref<ProcurementOrderView>();
const contract = ref<Contract>();
const migration = computed(
  () => view.value?.order.migration as MigrationInfo | undefined,
);
const actionOpen = ref(false);
const createAction = ref<string>();
const createKind = ref<DocumentKind>('orders');
const plansOpen = ref(false);
const nestedFinanceBusy = ref(false);
const contactEditorBusy = ref(false);
const arrivalId = ref<string>();
const financeType = ref<'REIMBURSEMENT' | 'REQUEST'>();
const financeRevision = ref(0);
const financeSummary = ref<Record<string, unknown>>({});
const financeLoading = ref(false);
const financeError = ref('');
let financeSequence = 0;
const childOpen = computed(
  () =>
    actionOpen.value ||
    !!createAction.value ||
    plansOpen.value ||
    reasonOpen.value ||
    !!financeType.value ||
    !!arrivalId.value ||
    nestedFinanceBusy.value ||
    contactEditorBusy.value ||
    saving.value,
);
const reasonOpen = ref(false);
const reasonDefinition = ref<ActionDefinition>();
const orderAttachments = ref<AttachmentView>();
const attachmentsLoading = ref(false);
const attachmentsError = ref('');
const commandKeys = new Map<string, string>();
const historyActionNames: Record<string, string> = {
  SAVE_DETAILS: '保存采购资料',
  CONFIRM_DETAILS: '确认采购资料',
  WITHDRAW_DETAILS: '撤回并编辑',
  REVISE_DETAILS: '新建资料变更版本',
};
const historyRows = computed(() =>
  (view.value?.history ?? []).map((entry) => ({
    ...entry,
    action: historyActionNames[String(entry.action)] ?? entry.action,
    occurredAt:
      formatDate(
        entry.occurredAt === null || entry.occurredAt === undefined
          ? undefined
          : String(entry.occurredAt),
        'YYYY-MM-DD HH:mm',
      ) || '—',
  })),
);
let sequence = 0;
let listSequence = 0;
let listQueryKey = '';
const selection = ref<{ contractId: string; documentId: string }>();
const localStandaloneId = ref<string>();
const localTab = ref('details');
let selectionTrigger: HTMLElement | undefined;
const detailId = computed(
  () =>
    selection.value?.documentId ??
    (typeof route.query.documentId === 'string'
      ? route.query.documentId
      : undefined),
);
const standaloneId = computed(
  () =>
    localStandaloneId.value ??
    (typeof route.query.standaloneId === 'string'
      ? route.query.standaloneId
      : undefined),
);
const contractId = computed(() =>
  typeof route.query.contractId === 'string'
    ? route.query.contractId
    : undefined,
);
const tab = computed({
  get: () => {
    if (selection.value) return localTab.value;
    return typeof route.query.tab === 'string' ? route.query.tab : 'details';
  },
  set: (tab: string) => {
    if (selection.value) localTab.value = tab;
    else void router.replace({ query: { ...route.query, tab } });
  },
});
const arrivalProgress = computed(() =>
  view.value ? orderArrivalProgress(view.value.order) : [],
);
const arrivalRows = computed(() =>
  rows(contract.value?.arrivals).filter(
    (entry) => entry.orderId === view.value?.id,
  ),
);
const arrivalRow = computed(() =>
  contract.value && arrivalId.value
    ? resolveDocumentRow(contract.value, 'arrivals', arrivalId.value)
    : undefined,
);
const canReceive = computed(
  () =>
    !!view.value &&
    !!contract.value?.allowedActions.includes('RECORD_ARRIVAL') &&
    canRecordOrderArrival(view.value.order),
);
const paymentProgress = computed(() =>
  orderPaymentProgress(financeSummary.value),
);
const selectedIndex = computed(() =>
  records.value.findIndex((row) => row.id === view.value?.id),
);
const financeContext = computed(() => ({
  contractId: view.value?.contractId,
  orderId: view.value?.id,
  currency: financeSummary.value.currency ?? view.value?.order.currency,
  ...(financeType.value === 'REQUEST'
    ? { amount: financeSummary.value.availableRequestAmount }
    : {}),
}));

async function loadFinanceSummary() {
  const current = view.value;
  if (!current || !active.value) return;
  const run = ++financeSequence;
  financeLoading.value = true;
  financeError.value = '';
  try {
    const value = await getProcurementFinanceSummary(
      current.contractId,
      current.id,
    );
    if (
      run === financeSequence &&
      current.id === view.value?.id &&
      active.value
    )
      financeSummary.value = value;
  } catch (error) {
    if (run === financeSequence && current.id === view.value?.id)
      financeError.value = errorText(error);
  } finally {
    if (run === financeSequence) financeLoading.value = false;
  }
}
function openFinance(type: 'REIMBURSEMENT' | 'REQUEST') {
  if (childOpen.value || !view.value) return;
  if (
    type === 'REQUEST' &&
    !hasPayableBalance(financeSummary.value.availableRequestAmount)
  )
    return;
  financeType.value = type;
}
async function financeChanged() {
  await Promise.all([refreshFacts(), loadList()]);
}
async function loadOrderAttachments() {
  const current = view.value;
  if (!current || !active.value) return;
  attachmentsLoading.value = true;
  attachmentsError.value = '';
  try {
    const value = await getAttachments(current.contractId, {
      targetKind: 'purchaseOrders',
      targetId: current.id,
    });
    if (view.value?.id === current.id && active.value)
      orderAttachments.value = value;
  } catch (error) {
    if (view.value?.id === current.id && active.value)
      attachmentsError.value = errorText(error);
  } finally {
    if (view.value?.id === current.id) attachmentsLoading.value = false;
  }
}
watch(
  () => [view.value?.id, tab.value, active.value],
  () => {
    orderAttachments.value = undefined;
    if (tab.value === 'attachments') void loadOrderAttachments();
  },
);
const links = computed(() =>
  view.value && contract.value
    ? relatedDocumentLinks(contract.value, 'orders', view.value.order)
    : [],
);
const mainLinks = computed(() =>
  links.value.filter(
    (link) =>
      link.target.type === 'contract' ||
      link.target.type === 'customer' ||
      link.target.type === 'supplier' ||
      (link.target.type === 'document' &&
        ['plans', 'requests'].includes(link.target.kind)),
  ),
);
const productLinks = computed(() =>
  links.value.filter((link) => !mainLinks.value.includes(link)),
);
const recordRow = computed(() =>
  view.value && contract.value
    ? resolveDocumentRow(contract.value, 'orders', view.value.id)
    : undefined,
);
const cancelReason = computed(() =>
  view.value && contract.value
    ? documentActionUnavailableReason(
        contract.value,
        'CANCEL_ORDER',
        view.value.order,
      )
    : undefined,
);
function key(action: string) {
  let id = commandKeys.get(action);
  if (!id) {
    id = newIdempotencyKey();
    commandKeys.set(action, id);
  }
  return id;
}
async function loadList() {
  if (!active.value) return;
  const run = ++listSequence;
  const params = {
    contractId: contractId.value,
    pageNo: page.value,
    pageSize: 10,
    keyword: keyword.value || undefined,
    status: status.value,
    mine: mine.value || undefined,
  };
  const queryKey = JSON.stringify(params);
  if (queryKey !== listQueryKey) {
    records.value = [];
    total.value = 0;
    listQueryKey = queryKey;
  }
  loading.value = true;
  listError.value = '';
  try {
    const result = await getProcurementOrders(params);
    if (run === listSequence && active.value) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === listSequence) listError.value = errorText(error);
  } finally {
    if (run === listSequence) loading.value = false;
  }
}
async function loadDetail() {
  const run = ++sequence;
  view.value = undefined;
  contract.value = undefined;
  actionOpen.value = false;
  reasonOpen.value = false;
  pageError.value = '';
  createAction.value = undefined;
  plansOpen.value = false;
  arrivalId.value = undefined;
  financeType.value = undefined;
  financeSummary.value = {};
  financeSequence++;
  if (!active.value) return;
  try {
    if (!selection.value && standaloneLocation(route.query)) return;
    const target = selection.value ?? detailLocation(route.query);
    if (!target) return;
    detailLoading.value = true;
    const [value, parent] = await Promise.all([
      getProcurementOrder(target.contractId, target.documentId),
      getContract(target.contractId),
    ]);
    if (run !== sequence || !active.value) return;
    view.value = value;
    contract.value = parent;
    commandKeys.clear();
    void loadFinanceSummary();
  } catch (error) {
    if (run === sequence)
      pageError.value = `无法打开采购单：${errorText(error)}`;
  } finally {
    if (run === sequence) detailLoading.value = false;
  }
}
async function refreshFacts() {
  if (!view.value) return;
  const currentId = view.value.id;
  try {
    const [value, parent] = await Promise.all([
      getProcurementOrder(view.value.contractId, currentId),
      getContract(view.value.contractId),
    ]);
    if (view.value?.id === currentId) {
      view.value = value;
      contract.value = parent;
      void loadFinanceSummary();
    }
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function createRelated(kind: DocumentKind, action: string) {
  if (!active.value || childOpen.value) return;
  createKind.value = kind;
  createAction.value = action;
}
async function created(value: Contract) {
  if (
    !active.value ||
    ((view.value?.contractId ?? contractId.value) &&
      value.id !== (view.value?.contractId ?? contractId.value))
  )
    return;
  createAction.value = undefined;
  if (view.value) await refreshFacts();
  await loadList();
}
async function plansChanged(value: Contract) {
  if (!active.value || value.id !== view.value?.contractId) return;
  await refreshFacts();
}
function openRow(row: DocumentRow, selectedTab = 'details', event?: Event) {
  if (childOpen.value) return;
  selectionTrigger =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : undefined;
  if (row.standaloneId) {
    localStandaloneId.value = row.standaloneId;
    return;
  }
  localTab.value = selectedTab;
  selection.value = { contractId: row.contractId, documentId: row.id };
}
function selectAdjacent(offset: number) {
  const row = records.value[selectedIndex.value + offset];
  if (row) openRow(row);
}
async function back() {
  if (childOpen.value) return;
  const wasLocal = !!selection.value || !!localStandaloneId.value;
  selection.value = undefined;
  localStandaloneId.value = undefined;
  if (!wasLocal || route.query.documentId || route.query.standaloneId) {
    const query = withoutDetailQuery(route.query);
    delete query.tab;
    await router.replace({ query });
  }
  await nextTick();
  selectionTrigger?.focus();
}
async function clear() {
  page.value = 1;
  keyword.value = '';
  status.value = undefined;
  mine.value = false;
  if (Object.keys(route.query).length > 0) await router.replace({ query: {} });
  void loadList();
}
async function command(
  action: string,
  payload: Record<string, unknown> = {},
  operationKey = key(action),
) {
  if (!view.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    const args = {
      expectedVersion: view.value.details.version,
      contractVersion: view.value.version,
      idempotencyKey: operationKey,
    };
    const previousExports = new Set(view.value.exports.map((file) => file.id));
    const value =
      action === 'EXPORT_CONTRACT'
        ? await exportProcurementOrder(
            view.value.contractId,
            view.value.id,
            args,
          )
        : await procurementOrderAction(view.value.contractId, view.value.id, {
            ...args,
            action,
            payload: orderDetailsPayload(payload),
          });
    view.value = value;
    if (action === 'EXPORT_CONTRACT') {
      const file =
        value.exports.find((entry) => !previousExports.has(entry.id)) ??
        value.exports.at(-1);
      if (file)
        downloadBlob(
          await downloadProcurementFile(value.contractId, value.id, file.id),
          file.name,
        );
    }
    commandKeys.delete(action);
    reasonOpen.value = false;
    let successMessage = '采购资料已更新';
    if (action === 'WITHDRAW_DETAILS' || action === 'REVISE_DETAILS')
      successMessage = '已进入资料草稿，可直接编辑';
    else if (action === 'EXPORT_CONTRACT')
      successMessage = 'Word已生成，可在历史版本中下载';
    message.success(successMessage);
    void loadList();
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
function action(name: string) {
  if (['REVISE_DETAILS', 'WITHDRAW_DETAILS'].includes(name)) {
    reasonDefinition.value = {
      action: name,
      title: name === 'REVISE_DETAILS' ? '新建资料变更版本' : '撤回并编辑',
      description:
        name === 'REVISE_DETAILS'
          ? '保留原采购执行及已付事实，仅建立联系人、交货、签约资料的新版本。'
          : '撤回仅开放附加资料字段，已有执行事实时按后台条件阻断。',
      fields: [field('reason', '原因', 'textarea')],
    };
    reasonOpen.value = true;
  } else void command(name);
}
async function upload(file: File, exportId: string) {
  if (!view.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    view.value = await uploadProcurementSigned(
      view.value.contractId,
      view.value.id,
      file,
      {
        exportId,
        expectedVersion: view.value.details.version,
        contractVersion: view.value.version,
        idempotencyKey: key('UPLOAD_SIGNED'),
      },
    );
    commandKeys.delete('UPLOAD_SIGNED');
    message.success('签章版本已保存');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
watch(
  () => [
    active.value,
    detailId.value,
    selection.value?.contractId,
    route.query.contractId,
  ],
  () => {
    createAction.value = undefined;
    plansOpen.value = false;
    actionOpen.value = false;
    reasonOpen.value = false;
    financeType.value = undefined;
    arrivalId.value = undefined;
    if (detailId.value) void loadDetail();
    else {
      view.value = undefined;
      contract.value = undefined;
      sequence++;
      financeSequence++;
      financeSummary.value = {};
    }
  },
  { immediate: true, flush: 'post' },
);
watch(
  () => [active.value, route.query.contractId],
  () => {
    void loadList();
  },
  { immediate: true },
);
watch(
  () => [
    route.query.documentId,
    route.query.standaloneId,
    route.query.contractId,
  ],
  () => {
    selection.value = undefined;
    localStandaloneId.value = undefined;
  },
);
watch(financeType, (value, previous) => {
  if (!value && previous) financeRevision.value++;
});
</script>
<template>
  <Page auto-content-height>
    <div class="procurement-workspace order-workspace">
      <ProcurementPageHeader
        title="采购订单"
        description="跟进交付与付款，在当前订单直接办理关联业务。"
      >
        <template #actions>
          <Button :loading="loading" @click="loadList">刷新</Button>
          <Button
            type="primary"
            :disabled="childOpen"
            @click="createRelated('orders', 'GENERATE_ORDERS')"
          >
            生成采购单
          </Button>
        </template>
      </ProcurementPageHeader>
      <Alert
        v-if="listError"
        type="error"
        :message="listError"
        description="列表未刷新成功，已保留上次结果。"
        show-icon
      />
      <div class="order-surface">
        <div class="order-views" aria-label="采购状态视图">
          <button
            v-for="item in [
              { value: undefined, label: '全部订单' },
              { value: 'ORDERED', label: '待到货' },
              { value: 'PARTIALLY_RECEIVED', label: '部分到货' },
              { value: 'RECEIVED', label: '已到货' },
              { value: 'CANCELLED', label: '已取消' },
            ]"
            :key="item.label"
            type="button"
            :class="{ selected: status === item.value }"
            :aria-pressed="status === item.value"
            @click="
              status = item.value;
              page = 1;
              loadList();
            "
          >
            {{ item.label }}
          </button>
        </div>
        <div class="procurement-toolbar">
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="搜索订单、客户、供应商"
            class="order-search"
            @search="
              page = 1;
              loadList();
            "
          />
          <div class="procurement-toolbar-actions">
            <Button
              :type="mine ? 'default' : 'primary'"
              size="small"
              @click="
                mine = false;
                page = 1;
                loadList();
              "
            >
              全部
            </Button>
            <Button
              :type="mine ? 'primary' : 'default'"
              size="small"
              @click="
                mine = true;
                page = 1;
                loadList();
              "
            >
              我负责的
            </Button>
            <span class="procurement-muted">当前筛选共 {{ total }} 单</span>
            <Button
              v-if="keyword || status || contractId || mine"
              type="text"
              @click="clear"
            >
              清除筛选
            </Button>
          </div>
        </div>
        <Alert
          v-if="contractId"
          type="info"
          message="正在查看关联合同的采购单"
          banner
        />
        <Table
          class="fdm-business-table order-table"
          size="middle"
          table-layout="fixed"
          :scroll="{ x: 1080 }"
          :data-source="records"
          :loading="loading"
          :row-key="(row: ProcurementOrderRow) => row.standaloneId ?? row.id"
          :row-class-name="
            (row: ProcurementOrderRow) =>
              view?.id === row.id ? 'procurement-row-selected' : ''
          "
          :pagination="{
            current: page,
            pageSize: 10,
            total,
            showSizeChanger: false,
            showTotal: (value: number) => `共 ${value} 单`,
          }"
          :columns="[
            { title: '采购单 / 供应商', key: 'supplier', width: 240 },
            { title: '关联订单', key: 'contract', width: 210 },
            { title: '采购金额', key: 'amount', width: 155, align: 'right' },
            { title: '到货进度', key: 'arrival', width: 190 },
            { title: '付款进度', key: 'payment', width: 185 },
            { title: '状态 / 办理', key: 'action', width: 140, fixed: 'right' },
          ]"
          @change="
            (value) => {
              page = value.current ?? 1;
              loadList();
            }
          "
        >
          <template #emptyText>
            <Empty description="没有符合条件的采购订单">
              <Button
                v-if="keyword || status || contractId || mine"
                @click="clear"
              >
                清除筛选
              </Button>
              <Button
                v-else
                type="primary"
                @click="createRelated('orders', 'GENERATE_ORDERS')"
              >
                从生效方案生成
              </Button>
            </Empty>
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'supplier'" class="order-cell">
              <button
                type="button"
                class="order-record-link"
                @click="openRow(record as DocumentRow, 'details', $event)"
              >
                {{ purchaseRowLabels(record as ProcurementOrderRow).order }}
              </button>
              <RelatedLink
                class="procurement-muted"
                :target="
                  entityTarget(
                    'supplier',
                    purchaseRowLabels(record as ProcurementOrderRow).supplierId,
                  )
                "
              >
                {{ purchaseRowLabels(record as ProcurementOrderRow).supplier }}
              </RelatedLink>
            </div>
            <div v-else-if="column.key === 'contract'" class="order-cell">
              <RelatedLink :target="contractTarget(record.contractId)">
                {{ purchaseRowLabels(record as ProcurementOrderRow).contract }}
              </RelatedLink>
              <span class="procurement-muted">{{
                record.customerName || '客户未注明'
              }}</span>
            </div>
            <span
              v-else-if="column.key === 'amount'"
              class="procurement-number"
              >{{
                orderMoney(
                  record.orderAmount ?? record.record.amount,
                  record.record.currency,
                )
              }}</span>
            <div v-else-if="column.key === 'arrival'" class="order-cell">
              <template v-if="orderArrivalProgress(record.record).length">
                <div
                  v-for="group in orderArrivalProgress(record.record)"
                  :key="group.key"
                  class="order-quantity"
                >
                  <span v-if="group.known" class="procurement-number">{{ group.arrived }} / {{ group.ordered }}
                    <span class="procurement-muted">{{
                      group.unit
                    }}</span></span>
                  <span v-else class="procurement-muted">到货数量待核实</span>
                  <Progress
                    v-if="group.percent !== undefined"
                    :percent="group.percent"
                    :show-info="false"
                    size="small"
                  />
                </div>
              </template>
              <span v-else class="procurement-muted">到货数据待核实</span>
            </div>
            <button
              v-else-if="column.key === 'payment'"
              type="button"
              class="order-payment-link"
              @click="openRow(record as DocumentRow, 'payments', $event)"
            >
              <span>已付
                {{
                  orderMoney(record.paidAmount, record.record.currency)
                }}</span>
              <span class="procurement-muted">未付
                {{
                  orderMoney(record.unpaidAmount, record.record.currency)
                }}</span>
            </button>
            <div v-else-if="column.key === 'action'" class="order-cell">
              <ProcurementStatusBadge
                :status="String(record.record.status ?? '')"
              />
              <Button
                type="link"
                class="order-open"
                @click="openRow(record as DocumentRow, 'details', $event)"
              >
                查看与办理
              </Button>
            </div>
          </template>
        </Table>
      </div>
    </div>

    <Drawer
      :open="Boolean(detailId) && active"
      width="min(1080px, 96vw)"
      root-class-name="procurement-record-drawer"
      :closable="!childOpen"
      :mask-closable="!childOpen"
      :keyboard="!childOpen"
      :destroy-on-close="true"
      @close="back"
    >
      <template #title><span>采购单执行</span></template>
      <template #extra>
        <Space>
          <Button
            v-if="selectedIndex >= 0"
            size="small"
            :disabled="childOpen || selectedIndex <= 0"
            @click="selectAdjacent(-1)"
          >
            上一单
          </Button>
          <Button
            v-if="selectedIndex >= 0"
            size="small"
            :disabled="childOpen || selectedIndex >= records.length - 1"
            @click="selectAdjacent(1)"
          >
            下一单
          </Button>
          <Button
            size="small"
            :disabled="childOpen"
            :loading="detailLoading"
            @click="loadDetail"
          >
            刷新
          </Button>
        </Space>
      </template>
      <div class="procurement-workspace order-execution">
        <Alert v-if="pageError" type="error" :message="pageError" show-icon />
        <Alert
          v-if="detailLoading && !view"
          type="info"
          message="正在读取采购单…"
        />
        <template v-if="view && active">
          <header class="order-execution-header">
            <div>
              <div class="order-heading-line">
                <h2>
                  {{ purchaseRowLabels({ ...view, record: view.order }).order }}
                </h2>
                <ProcurementStatusBadge
                  :status="String(view.order.status ?? '')"
                />
              </div>
              <div class="procurement-muted">
                {{ purchaseRowLabels({ ...view, record: view.order }).supplier
                }}<span v-if="view.details.deliveryDate">
                  · 交期 {{ view.details.deliveryDate }}</span>
              </div>
            </div>
            <Button
              v-if="canReceive"
              type="primary"
              :disabled="childOpen"
              @click="createRelated('arrivals', 'RECORD_ARRIVAL')"
            >
              登记到货
            </Button>
          </header>

          <div class="order-summary">
            <div class="order-summary-item">
              <span class="procurement-muted">采购金额</span>
              <strong class="procurement-number">{{
                orderMoney(
                  financeSummary.orderAmount,
                  financeSummary.currency ?? view.order.currency,
                )
              }}</strong>
              <span class="procurement-muted">所属公司：{{ view.companyName || '待补齐' }}</span>
            </div>
            <div class="order-summary-item">
              <span class="procurement-muted">货物进度</span>
              <div v-for="group in arrivalProgress" :key="group.key">
                <span v-if="group.known" class="procurement-number">已到 {{ group.arrived }} · 未到 {{ group.remaining }}
                  {{ group.unit }}</span>
                <span v-else>数量待核实</span>
                <Progress
                  v-if="group.percent !== undefined"
                  :percent="group.percent"
                  :show-info="false"
                  size="small"
                />
                <div
                  v-if="group.returned && group.returned !== '0'"
                  class="procurement-muted"
                >
                  已退 {{ group.returned }} {{ group.unit }}
                </div>
              </div>
              <span v-if="!arrivalProgress.length">到货数据待核实</span>
            </div>
            <div class="order-summary-item">
              <span class="procurement-muted">付款进度</span>
              <strong class="procurement-number">已付
                {{
                  orderMoney(
                    financeSummary.paidAmount,
                    financeSummary.currency ?? view.order.currency,
                  )
                }}</strong>
              <Progress
                v-if="paymentProgress !== undefined"
                :percent="paymentProgress"
                :show-info="false"
                size="small"
              />
              <span class="procurement-muted">未付
                {{
                  orderMoney(
                    financeSummary.unpaidAmount,
                    financeSummary.currency ?? view.order.currency,
                  )
                }}</span>
            </div>
          </div>
          <Alert
            v-if="financeError"
            type="warning"
            :message="`付款摘要暂未读取：${financeError}`"
            show-icon
          >
            <template #action>
              <Button
                size="small"
                :loading="financeLoading"
                @click="loadFinanceSummary"
              >
                重试
              </Button>
            </template>
          </Alert>
          <div class="order-secondary-actions">
            <Button
              :disabled="
                childOpen ||
                financeLoading ||
                !hasPayableBalance(financeSummary.availableRequestAmount)
              "
              :title="
                financeLoading
                  ? '正在读取请款余额'
                  : !hasPayableBalance(financeSummary.availableRequestAmount)
                    ? '暂无可请款余额，或付款摘要未读取'
                    : undefined
              "
              @click="openFinance('REQUEST')"
            >
              申请付款
            </Button>
            <Button :disabled="childOpen" @click="openFinance('REIMBURSEMENT')">
              费用报销
            </Button>
            <Button
              v-if="contract?.allowedActions.includes('RETURN_ARRIVAL')"
              :disabled="childOpen || !canReturnOrderArrival(view.order)"
              :title="
                !canReturnOrderArrival(view.order)
                  ? '当前订单没有可退到货数量'
                  : undefined
              "
              @click="createRelated('purchaseReturns', 'RETURN_ARRIVAL')"
            >
              采购退货
            </Button>
            <details class="order-more">
              <summary>更多操作</summary>
              <div class="order-more-content">
                <Button
                  v-if="view.allowedActions.includes('REVISE_DETAILS')"
                  :disabled="childOpen"
                  @click="action('REVISE_DETAILS')"
                >
                  新建资料变更版本
                </Button>
                <Button
                  :disabled="childOpen || !contract"
                  @click="plansOpen = true"
                >
                  采购方案变更
                </Button>
                <Button
                  v-if="contract?.allowedActions.includes('CANCEL_ORDER')"
                  danger
                  :disabled="childOpen || !!cancelReason"
                  :title="cancelReason"
                  @click="actionOpen = true"
                >
                  取消采购余额
                </Button>
                <span v-if="cancelReason" class="procurement-muted">{{
                  cancelReason
                }}</span>
              </div>
            </details>
          </div>
          <div class="order-context">
            <Space
              v-for="link in mainLinks"
              :key="JSON.stringify(link.target)"
              size="small"
            >
              <span class="procurement-muted">{{ link.label }}</span><RelatedLink :target="link.target">{{ link.value }}</RelatedLink>
            </Space>
          </div>

          <Tabs v-model:active-key="tab" class="order-tabs">
            <TabPane key="details" tab="商品与到货">
              <OrderDetails
                :view="view"
                :saving="saving"
                @busy="contactEditorBusy = $event"
                @save="(payload) => command('SAVE_DETAILS', payload)"
                @action="action"
              />
              <section class="order-arrivals">
                <h3>
                  到货记录
                  <span class="procurement-muted">{{ arrivalRows.length }} 笔</span>
                </h3>
                <Table
                  :data-source="arrivalRows"
                  size="small"
                  row-key="id"
                  :pagination="false"
                  :scroll="{ x: 620 }"
                  :columns="[
                    { title: '到货批次', key: 'batch' },
                    { title: '产品', key: 'product' },
                    { title: '到货数量', dataIndex: 'quantity' },
                    { title: '合格数量', dataIndex: 'acceptedQuantity' },
                  ]"
                >
                  <template #emptyText>暂未登记到货</template>
                  <template #bodyCell="{ column, record }">
                    <Button
                      v-if="column.key === 'batch'"
                      type="link"
                      :disabled="childOpen"
                      @click="arrivalId = String(record.id)"
                    >
                      {{ record.batchNo || '查看到货单' }}
                    </Button>
                    <span v-else-if="column.key === 'product'">{{
                      contract?.items.find(
                        (item) => item.id === record.contractItemId,
                      )?.productName || '产品未注明'
                    }}</span>
                  </template>
                </Table>
              </section>
              <div v-if="productLinks.length" class="order-context">
                <Space
                  v-for="link in productLinks"
                  :key="JSON.stringify(link.target)"
                  size="small"
                >
                  <span class="procurement-muted">{{ link.label }}</span><RelatedLink :target="link.target">
                    {{ link.value }}
                  </RelatedLink>
                </Space>
              </div>
            </TabPane>
            <TabPane key="payments" tab="付款与费用">
              <OrderFinance
                :key="financeRevision"
                :contract-id="view.contractId"
                :order-id="view.id"
                mode="payments"
                @busy="nestedFinanceBusy = $event"
                @changed="financeChanged"
              />
            </TabPane>
            <TabPane key="costs" tab="成本归属">
              <OrderFinance
                :key="financeRevision"
                :contract-id="view.contractId"
                :order-id="view.id"
                mode="costs"
                @busy="nestedFinanceBusy = $event"
                @changed="financeChanged"
              />
            </TabPane>
            <TabPane key="contract" tab="采购合同">
              <OrderContract
                :view="view"
                :saving="saving"
                @save="(payload) => command('SAVE_DETAILS', payload)"
                @action="action"
                @signed="upload"
              />
            </TabPane>
            <TabPane key="attachments" tab="附件">
              <AttachmentPanel
                :contract-id="view.contractId"
                :target="{ targetKind: 'purchaseOrders', targetId: view.id }"
                :view="orderAttachments"
                :categories="orderAttachments?.uploadCategories ?? []"
                :loading="attachmentsLoading"
                :error="attachmentsError"
                @refresh="loadOrderAttachments"
              />
            </TabPane>
            <TabPane key="history" tab="操作记录">
              <MigrationSource
                :migration="migration"
                :native-source="{
                  kind: 'CONTRACT',
                  nativeId: view.contractId,
                  recordId: view.id,
                }"
              />
              <RecordTable
                :data="historyRows"
                :columns="[
                  { key: 'action', title: '操作' },
                  { key: 'actorId', title: '经办人' },
                  { key: 'occurredAt', title: '时间' },
                  { key: 'version', title: '资料版本' },
                  { key: 'reason', title: '原因' },
                ]"
              />
            </TabPane>
          </Tabs>
        </template>
      </div>
    </Drawer>
    <ActionDialog
      :open="reasonOpen && active"
      :definition="reasonDefinition"
      :saving="saving"
      :error="pageError"
      @close="reasonOpen = false"
      @submit="
        (payload, key) => command(reasonDefinition!.action, payload, key)
      "
    />
    <DocumentAction
      :open="actionOpen && active"
      kind="orders"
      action="CANCEL_ORDER"
      :row="recordRow"
      :contract-id="view?.contractId"
      @close="actionOpen = false"
      @updated="
        actionOpen = false;
        financeChanged();
      "
    />
    <DocumentAction
      :open="!!createAction && active"
      :kind="createKind"
      :action="createAction"
      :contract-id="view?.contractId ?? contractId"
      :source="view ? { kind: 'orders', id: view.id } : undefined"
      :lock-contract="Boolean(view?.contractId ?? contractId)"
      @close="createAction = undefined"
      @updated="created"
    />
    <ContractDocumentDialog
      :open="plansOpen && active"
      :contract="contract"
      kind="plans"
      @close="plansOpen = false"
      @updated="plansChanged"
    />
    <FinanceDocument
      :open="!!financeType && active"
      :type="financeType ?? 'REQUEST'"
      :context="financeContext"
      @close="financeType = undefined"
      @updated="financeChanged"
    />
    <RecordDetail
      :open="!!arrivalId && active"
      kind="arrivals"
      :row="arrivalRow"
      @close="arrivalId = undefined"
      @updated="financeChanged"
    />
  </Page>
  <BusinessDocumentDetail
    :id="standaloneId"
    :open="Boolean(standaloneId) && active"
    kind="orders"
    @close="back"
    @updated="loadList"
  />
</template>

<style scoped>
.order-workspace {
  display: grid;
  gap: 16px;
}

.order-surface {
  overflow: hidden;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.order-views {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 0 20px;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.order-views button {
  padding: 16px 0 13px;
  color: var(--ant-color-text-secondary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.order-views .selected {
  font-weight: 600;
  color: var(--ant-color-primary);
  border-bottom-color: var(--ant-color-primary);
}

.order-views button:focus-visible,
.order-record-link:focus-visible,
.order-payment-link:focus-visible {
  outline: 2px solid var(--ant-color-primary);
  outline-offset: 3px;
}

.order-surface .procurement-toolbar {
  padding: 16px 20px;
}

.order-search {
  width: 320px;
  max-width: 100%;
}

.order-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
}

.order-record-link {
  max-width: 100%;
  font-weight: 600;
  color: var(--ant-color-text);
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.order-record-link:hover {
  color: var(--ant-color-primary);
}

.order-payment-link {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.order-payment-link:hover {
  color: var(--ant-color-primary);
}

.order-quantity {
  width: 100%;
}

.order-open {
  height: auto;
  padding: 0;
}

.order-execution {
  display: grid;
  gap: 20px;
}

.order-execution-header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.order-heading-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 6px;
}

.order-heading-line h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.order-summary {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
  padding: 20px;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.order-summary-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.order-summary-item strong {
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.order-secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.order-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 12px;
}

.order-more {
  position: relative;
  font-size: 13px;
}

.order-more summary {
  padding: 5px 12px;
  color: var(--ant-color-text-secondary);
  cursor: pointer;
}

.order-more-content {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 5;
  display: grid;
  gap: 10px;
  width: 240px;
  padding: 12px;
  background: var(--ant-color-bg-elevated);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
  box-shadow: var(--ant-box-shadow-secondary);
}

.order-arrivals {
  margin-top: 24px;
}

.order-arrivals h3 {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

.order-tabs :deep(.ant-tabs-nav) {
  margin-top: 0;
}

.order-tabs :deep(.ant-card) {
  border: 0;
  box-shadow: none;
}

.order-tabs :deep(.ant-card-head) {
  min-height: 40px;
  padding: 0;
}

.order-tabs :deep(.ant-card-body) {
  padding: 16px 0;
}

.order-tabs :deep(.ant-table) {
  font-size: 14px;
}

.order-summary :deep(.ant-progress),
.order-quantity :deep(.ant-progress) {
  margin: 0;
  line-height: 1;
}

@media (max-width: 720px) {
  .order-summary {
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 16px;
  }

  .order-execution-header {
    align-items: flex-start;
  }

  .order-heading-line h2 {
    font-size: 18px;
  }

  .order-views {
    gap: 16px;
    padding: 0 16px;
  }

  .order-views button {
    padding-top: 12px;
  }
}
</style>
