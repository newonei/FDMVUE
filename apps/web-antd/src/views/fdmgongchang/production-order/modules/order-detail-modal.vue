<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { ShortageDispatchSeed } from '../../shared/schedule';
import type { RouteDraft } from '../shared';
import type { RoutePurchaseReference } from './route-purchase-reference';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, shallowRef, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Alert, Button, Checkbox, DatePicker, Descriptions, Input, message, Modal, Popconfirm, Spin, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  acceptProductionOrder,
  cancelProductionOrder,
  completeProductionOrder,
  confirmProductionOrderChange,
  getLastRoute,
  getProductionOrder,
  getRouteOptions,
  rejectProductionOrder,
  saveItemRoute,
  voidDelivery,
} from '#/api/fdmgongchang/production-order';

import { factoryToday } from '../../shared/factory-date';
import FactoryDialog from '../../shared/factory-dialog.vue';
import { colorModeText, parameterText, textureText, thicknessText } from '../manufacturing';
import { dateText, num, ORDER_STATUS, routeProblem, specText, timeText } from '../shared';
import AuxPanel from './aux-panel.vue';
import DeliveryModal from './delivery-modal.vue';
import FulfillmentGuide from './fulfillment-guide.vue';
import { productionConfigDraft, productionRouteProblems, savedProductionConfigProblems } from './item-production-config';
import ItemProductionConfigModal from './item-production-config-modal.vue';
import MaterialPlan from './material-plan.vue';
import OrderStockTrace from './order-stock-trace.vue';
import PurchaseSheet from './purchase-sheet.vue';
import RoutePicker from './route-picker.vue';
import RouteProductReference from './route-product-reference.vue';
import { routePurchaseReferenceProps } from './route-purchase-reference';
import RouteSupplementModal from './route-supplement-modal.vue';
import SourcePurchaseLink from './source-purchase-link.vue';
import SupplyMatch from './supply-match.vue';

/**
 * 订单详情。下单人（mode=mine）待接单时可以撤回；
 * 工厂（mode=factory）待接单时接单（回复交期）或退回；生产中把做好的货交到仓库（交货单），
 * 完成数量 = 净交货数量；可以结束这张单（没交够也可以，比如下单人同意少做）。
 * 供应商是本厂的采购单自动生成的单：工厂接单时给每个产品定工艺（还没开工序单前都能改），
 * 生产要求读采购单下单资料，数量跟着采购单走（接单后有变更要工厂确认）；做好的货开「生产入库」单进本厂仓库，
 * 采购单到货随之更新，之后由仓库销售出库或其它出库（库存中心）。
 */
const props = defineProps<{
  focusFulfillment?: boolean;
  mode: 'factory' | 'mine';
  orderId?: number;
}>();
const emit = defineEmits<{
  changed: [];
  copy: [order: Api.Order];
  dispatchShortage: [seed: ShortageDispatchSeed];
  planShortage: [];
  viewTasks: [orderNo: string];
}>();
const open = defineModel<boolean>('open', { required: true });
const { hasAccessByCodes } = useAccess();
const canHandleOrder = computed(() => hasAccessByCodes(['fdmgongchang:production-order:handle']));
const canViewProductArchive = computed(() => hasAccessByCodes(['fdmplatform:products:query']));

const order = ref<Api.Order>();
const fulfillmentGuide = ref<InstanceType<typeof FulfillmentGuide>>();
const loading = ref(false);
const loadError = ref(false);
let loadVersion = 0;
const acceptView = ref<'items' | 'material' | 'purchase' | 'stock'>('items');
const acceptNavigation = ref<HTMLElement>();
const detailContent = ref<HTMLElement>();
const busy = ref(false);
const targetRefreshing = ref(false);
const targetRefreshError = ref(false);
let targetRefreshVersion = 0;
const promisedDate = ref<Dayjs>();
const reply = ref('');
const deliveryOpen = ref(false);
const deliveryItem = ref<Api.Item>();
const voidTarget = ref<Api.Delivery>();
const voidReason = ref('');
const materialPlan = ref<InstanceType<typeof MaterialPlan>>();
const configItemId = ref<number>();
const configOpen = ref(false);
const supplementItem = ref<Api.Item>();
const supplementOpen = ref(false);
function editProductionConfig(item: Api.Item) {
  if (canHandle.value) selectAcceptView('items');
  configItemId.value = item.id;
  configOpen.value = true;
}

function supplementRoute(item: Api.Item) {
  supplementItem.value = item;
  supplementOpen.value = true;
}

const status = computed(() => (order.value ? ORDER_STATUS[order.value.status] : undefined));
const fromPurchase = computed(() => order.value?.sourceType === 'PURCHASE_ORDER');
/** 补库单：订单用掉常备物料后系统自动下的，工厂接单时定工艺。 */
const fromRestock = computed(() => order.value?.sourceType === 'RESTOCK');
/** 工艺由工厂定的单：采购单生成的单、补库单。 */
const factoryRoute = computed(() => fromPurchase.value || fromRestock.value);
/** 采购单生成的单：工厂定工艺用的工序和路线、每个产品的工艺草稿。 */
const routeOptions = ref<RouteApi.Options>();
const drafts = ref<Record<number, RouteDraft>>({});
const editingRoute = ref<number>();
/** 接单时批量定工艺：先选好工序，再套用到勾选的产品（默认全选）。 */
const batchDraft = ref<RouteDraft>({ steps: [] });
const batchIds = ref<number[]>([]);
const activeItems = computed(() => (order.value?.items ?? []).filter((i) => num(i.quantity) > 0));
const incompleteItems = computed(() => activeItems.value.filter((item) => savedProductionConfigProblems(item).length > 0));
const canCancel = computed(() => props.mode === 'mine' && order.value?.status === 'SUBMITTED' && !fromPurchase.value);
const canHandle = computed(() => props.mode === 'factory' && canHandleOrder.value && order.value?.status === 'SUBMITTED');
const canProgress = computed(() => props.mode === 'factory' && canHandleOrder.value && order.value?.status === 'ACCEPTED');
const canSupplementRoute = computed(() => props.mode === 'factory' && order.value?.status === 'ACCEPTED'
  && hasAccessByCodes(['fdmgongchang:schedule:confirm']));
const canViewTasks = computed(() => hasAccessByCodes(['fdmgongchang:schedule:query']));
/** 工厂看用料逆推：接单前就能看要多少板材和原料，生产中可以换配方、板材规格。 */
/** 多个产品待定工艺时才显示批量设置。 */
const canBatchRoute = computed(() => factoryRoute.value && canHandle.value && activeItems.value.length > 1);
const canPlan = computed(() => props.mode === 'factory' && (canHandle.value || canProgress.value));
const purchaseReference = shallowRef<RoutePurchaseReference>();
const materialSaving = computed(() => !!materialPlan.value?.saving);
const detailBusy = computed(() => busy.value || configOpen.value || materialSaving.value);
const acceptViews = computed(() => [
  { key: 'items', label: `产品明细（${order.value?.items.length ?? 0}）` },
  { key: 'material', label: '用料逆推' },
  { key: 'stock', label: '库存匹配' },
  ...(fromPurchase.value ? [{ key: 'purchase', label: '采购资料' } as const] : []),
] as const);
const allDone = computed(() =>
  (order.value?.items ?? []).every((i) => num(i.completedQuantity) >= num(i.quantity)),
);
const deliveries = computed(() => order.value?.deliveries ?? []);
const showFulfillment = computed(() => props.mode === 'factory' && order.value?.status === 'ACCEPTED');
const showStockTrace = computed(() => props.mode === 'factory' && canHandleOrder.value
  && (order.value?.status === 'ACCEPTED' || order.value?.status === 'COMPLETED'));

watch([open, () => props.focusFulfillment, fulfillmentGuide], ([isOpen, focus, guide]) => {
  if (isOpen && focus) guide?.focus();
}, { flush: 'post' });

function selectAcceptView(view: typeof acceptView.value) {
  if (view === acceptView.value) return;
  acceptView.value = view;
  const body = acceptNavigation.value?.closest('.ant-modal-body');
  if (body) body.scrollTop = 0;
}

function jumpToDetail(section: string) {
  const target = detailContent.value?.querySelector<HTMLElement>(`#${section}`);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.({ block: 'start' });
}

async function load() {
  const id = props.orderId;
  if (!id || !open.value) return;
  const version = ++loadVersion;
  loadError.value = false;
  targetRefreshError.value = false;
  loading.value = true;
  try {
    const fresh = await getProductionOrder(id);
    if (version !== loadVersion) return;
    order.value = fresh;
    const required = dateText(fresh.requiredDate);
    promisedDate.value = required ? dayjs(required) : undefined;
    reply.value = '';
    editingRoute.value = undefined;
    await loadRoutes();
  } catch {
    if (version === loadVersion) loadError.value = true;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

/** 工厂定工艺：已定过的沿用，没定过的带出这个产品上次在本厂用的工艺。 */
async function loadRoutes() {
  const o = order.value;
  if (!o || props.mode !== 'factory' || !factoryRoute.value || !['ACCEPTED', 'SUBMITTED'].includes(o.status)) return;
  const options = await getRouteOptions(o.factoryId).catch(() => undefined);
  const next: Record<number, RouteDraft> = {};
  await Promise.all(
    o.items.map(async (i) => {
      if ((i.processes ?? []).length > 0) {
        next[i.id] = { routeId: i.routeId ?? undefined, steps: [...(i.processes ?? [])] };
        return;
      }
      const last = await getLastRoute(o.factoryId, i.productId).catch(() => null);
      next[i.id] = last ? { routeId: last.routeId ?? undefined, steps: [...last.steps] } : { steps: [] };
    }),
  );
  if (order.value !== o) return;
  routeOptions.value = options;
  drafts.value = next;
  batchDraft.value = { steps: [] };
  batchIds.value = o.items.filter((i) => num(i.quantity) > 0).map((i) => i.id);
}

function applyBatchRoute() {
  const processes = routeOptions.value?.processes ?? [];
  const problem = processes.length > 0 ? routeProblem(batchDraft.value.steps, processes) : '请选择要走的工序';
  if (problem) {
    message.warning(problem);
    return;
  }
  const targets = activeItems.value.filter((i) => batchIds.value.includes(i.id));
  if (targets.length === 0) {
    message.warning('请勾选要套用的产品');
    return;
  }
  const next = { ...drafts.value };
  for (const i of targets) next[i.id] = { routeId: batchDraft.value.routeId, steps: [...batchDraft.value.steps] };
  drafts.value = next;
  message.success(`已套用到 ${targets.length} 个产品，个别产品还可以在下面单独调整`);
}

function toggleBatchAll(checked: boolean) {
  batchIds.value = checked ? activeItems.value.map((i) => i.id) : [];
}

function draftProblem(item: Api.Item) {
  const processes = routeOptions.value?.processes ?? [];
  const draft = drafts.value[item.id];
  if (!draft || processes.length === 0) return '请选择要走的工序';
  return routeProblem(draft.steps, processes) || productionRouteProblems(productionConfigDraft(item), draft.steps);
}

/** 开过工序单的产品不能再改工艺。 */
function itemStarted(item: Api.Item) {
  return (item.steps ?? []).some((s) => s.orderCount > 0);
}

function saveRoute(item: Api.Item) {
  if (targetRefreshing.value || targetRefreshError.value) return;
  const draft = drafts.value[item.id];
  const problem = draftProblem(item);
  if (!draft || problem) {
    message.warning(problem || '请选择要走的工序');
    return;
  }
  return run(() => saveItemRoute({ itemId: item.id, routeId: draft.routeId, steps: draft.steps }), '工艺已保存');
}

/** 确认规格后订单明细和用料逆推都要按新规格重算。 */
async function onTargetChanged() {
  if (!order.value) return;
  const orderId = order.value.id;
  const current = ++targetRefreshVersion;
  targetRefreshing.value = true;
  targetRefreshError.value = false;
  // 只换明细，不重置接单表单里已经填的交期和回复
  try {
    const fresh = await getProductionOrder(orderId);
    if (current !== targetRefreshVersion || !open.value || order.value?.id !== orderId) return;
    const nextDrafts = { ...drafts.value };
    for (const item of fresh.items) {
      const previous = order.value.items.find((row) => row.id === item.id);
      if (!previous || previous.routeId !== item.routeId || JSON.stringify(previous.processes ?? []) !== JSON.stringify(item.processes ?? [])) {
        nextDrafts[item.id] = { routeId: item.routeId ?? undefined, steps: [...(item.processes ?? [])] };
      }
    }
    drafts.value = nextDrafts;
    order.value = { ...order.value, items: [...fresh.items] };
    emit('changed');
    await materialPlan.value?.reload();
  } catch {
    if (current === targetRefreshVersion && open.value && order.value?.id === orderId) targetRefreshError.value = true;
  } finally {
    if (current === targetRefreshVersion) targetRefreshing.value = false;
  }
}

function confirmChange() {
  if (!order.value) return;
  const id = order.value.id;
  return run(() => confirmProductionOrderChange(id), '已确认采购单变更');
}

watch(() => [open.value, props.orderId] as const, ([value]) => {
  ++loadVersion;
  ++targetRefreshVersion;
  order.value = undefined;
  purchaseReference.value = undefined;
  routeOptions.value = undefined;
  drafts.value = {};
  batchDraft.value = { steps: [] };
  batchIds.value = [];
  configOpen.value = false;
  configItemId.value = undefined;
  targetRefreshing.value = false;
  targetRefreshError.value = false;
  supplementOpen.value = false;
  supplementItem.value = undefined;
  if (value) {
    acceptView.value = 'items';
    load();
  }
}, { immediate: true });

async function run(action: () => Promise<unknown>, text: string) {
  busy.value = true;
  try {
    await action();
    message.success(text);
    emit('changed');
    await load();
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    busy.value = false;
  }
}

function accept() {
  if (loadError.value || materialSaving.value || targetRefreshing.value || targetRefreshError.value) return;
  if (!order.value) return;
  const id = order.value.id;
  if (!promisedDate.value) {
    message.warning('请先回复工厂交期');
    return;
  }
  const incomplete = incompleteItems.value[0];
  if (incomplete) {
    message.warning(`「${incomplete.productName}」：${savedProductionConfigProblems(incomplete).join('；')}。补齐并保存后才能接单`);
    editProductionConfig(incomplete);
    return;
  }
  let routes: Api.RouteReq[] | undefined;
  if (factoryRoute.value) {
    for (const item of activeItems.value) {
      const problem = draftProblem(item);
      if (problem) {
        selectAcceptView('items');
        message.warning(`「${item.productName}」：${problem}`);
        return;
      }
    }
    routes = activeItems.value.map((i) => ({ itemId: i.id, routeId: drafts.value[i.id]!.routeId, steps: drafts.value[i.id]!.steps }));
  }
  return run(
    () =>
      acceptProductionOrder({
        id,
        promisedDate: promisedDate.value?.format('YYYY-MM-DD'),
        reply: reply.value.trim() || undefined,
        routes,
      }),
    '已接单，可在列表勾选订单并拆分下发工序任务',
  );
}

function reject() {
  if (!order.value || loadError.value || materialSaving.value) return;
  if (!reply.value.trim()) {
    message.warning('退回时请写明原因，方便下单人修改');
    return;
  }
  const id = order.value.id;
  return run(() => rejectProductionOrder({ id, reply: reply.value.trim() }), '已退回给下单人');
}

function cancel() {
  if (!order.value) return;
  const id = order.value.id;
  return run(() => cancelProductionOrder(id), '已撤回');
}

function finish() {
  if (!order.value) return;
  const id = order.value.id;
  return run(() => completeProductionOrder(id), '这张单已完成');
}

function openDelivery(item: Api.Item) {
  deliveryItem.value = item;
  deliveryOpen.value = true;
}

async function onDelivered(text: string) {
  message.success(text);
  emit('changed');
  await load();
}

function askVoid(d: Api.Delivery) {
  voidTarget.value = d;
  voidReason.value = '';
}

async function confirmVoid() {
  const target = voidTarget.value;
  if (!target) return;
  if (!voidReason.value.trim()) {
    message.warning('请写明作废原因');
    return;
  }
  await run(() => voidDelivery({ id: target.id, reason: voidReason.value.trim() }), '已作废交货单');
  voidTarget.value = undefined;
}

const disabledDate = (d: Dayjs) => d.isBefore(factoryToday().startOf('day'));

/** 订单工艺里的工序（旧单列出关联过的工序）。 */
function plannedSteps(item: Api.Item) {
  const steps = item.steps ?? [];
  return (item.processes ?? []).length > 0 ? steps.filter((s) => s.planned) : steps;
}

function stepClass(step: Api.Step, last: boolean) {
  if (step.inProgressCount > 0) return 'bg-warning/15 text-warning';
  if (num(step.goodQuantity) > 0) return last ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary';
  return 'bg-muted text-muted-foreground';
}

function stepTitle(step: Api.Step) {
  const parts = [`${step.label}：良品 ${num(step.goodQuantity)}${step.unit}`];
  if (num(step.defectQuantity) > 0) parts.push(`残次 ${num(step.defectQuantity)}${step.unit}`);
  parts.push(`${step.orderCount} 张工序单`);
  if (step.inProgressCount > 0) parts.push(`${step.inProgressCount} 张在制`);
  return parts.join(' · ');
}

/** 工艺最后一道已报的良品：做好了、可以交货的数量参考。 */
function producedQty(item: Api.Item) {
  const steps = plannedSteps(item);
  return (item.processes ?? []).length > 0 ? num(steps[steps.length - 1]?.goodQuantity) : 0;
}
</script>

<template>
  <FactoryDialog
    v-model:open="open"
    :busy="detailBusy"
    :width="1440"
  >
    <template #title>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{{ order ? `生产订单 ${order.orderNo}` : '生产订单' }}</span>
        <Tag v-if="status" :color="status.color" class="m-0">{{ status.label }}</Tag>
        <Tag v-if="fromRestock" class="m-0" color="purple">补库</Tag>
        <span v-if="order?.factoryName" class="text-sm font-normal text-muted-foreground">{{ order.factoryName }}</span>
      </div>
    </template>
    <Spin :spinning="loading">
      <Alert v-if="loadError" type="error" show-icon message="订单加载失败">
        <template #action><Button size="small" @click="load">重新加载</Button></template>
      </Alert>
      <div v-else-if="order" ref="detailContent" class="flex flex-col gap-5 text-sm">
        <Alert
          v-if="fromPurchase && order.sourceChanged && mode === 'factory'"
          show-icon
          type="warning"
          message="采购单有变更"
          :description="order.sourceChangeNote ?? ''"
        >
          <template #action>
            <Button :loading="busy" size="small" @click="confirmChange">知道了</Button>
          </template>
        </Alert>
        <p v-else-if="fromPurchase && order.sourceChangeNote && order.status === 'SUBMITTED'" class="m-0 text-xs text-warning">
          {{ order.sourceChangeNote }}
        </p>
        <nav v-if="!canHandle" aria-label="订单详情目录" class="order-navigation">
          <Button v-if="showFulfillment" type="text" @click="fulfillmentGuide?.focus()">补产指引</Button>
          <Button type="text" @click="jumpToDetail('po-detail-items')">产品明细</Button>
          <Button type="text" @click="jumpToDetail('po-detail-overview')">订单信息</Button>
          <Button v-if="showStockTrace || canPlan" type="text" @click="jumpToDetail('po-detail-supply')">库存与用料</Button>
          <Button v-if="fromPurchase" type="text" @click="jumpToDetail('po-detail-purchase')">采购资料</Button>
          <Button v-if="deliveries.length > 0" type="text" @click="jumpToDetail('po-detail-deliveries')">{{ fromPurchase ? '入库记录' : '交货记录' }}</Button>
        </nav>
        <FulfillmentGuide
          v-if="showFulfillment"
          ref="fulfillmentGuide"
          class="detail-section"
          :can-deliver="canProgress"
          :can-plan-shortage="canViewTasks && canSupplementRoute"
          :can-view-tasks="canViewTasks"
          :items="order.items"
          :order-id="order.id"
          :order-no="order.orderNo"
          :purchase="fromPurchase"
          @configure="editProductionConfig"
          @deliver="openDelivery"
          @dispatch-shortage="emit('dispatchShortage', $event)"
          @plan-shortage="emit('planShortage')"
          @view-tasks="emit('viewTasks', order.orderNo)"
        >
          <template v-if="canProgress && allDone" #completed-action>
            <Popconfirm title="结束这张单？结束后不能再交货" ok-text="结束" @confirm="finish">
              <Button :loading="busy" type="primary">结束这张单</Button>
            </Popconfirm>
          </template>
        </FulfillmentGuide>
        <div id="po-detail-overview" class="detail-section grid gap-3" :class="{ 'detail-overview': fromPurchase && !canHandle }" tabindex="-1">
          <section v-if="fromPurchase" aria-labelledby="po-purchase-source" class="min-w-0 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <h3 id="po-purchase-source" class="m-0 text-xs font-medium text-muted-foreground">采购来源</h3>
            <dl class="mb-0 mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="min-w-0 sm:col-span-2 lg:col-span-4">
                <dt class="text-xs text-muted-foreground">采购主题</dt>
                <dd class="m-0 break-words text-base font-semibold">{{ order.sourceOrderSubject || '未填写采购主题' }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">合同内部单号</dt>
                <dd class="m-0 break-words font-medium">{{ order.sourceContractName || '—' }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">合同编号</dt>
                <dd class="m-0 break-words">{{ order.sourceContractCode || '—' }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">采购单号</dt>
                <dd class="m-0 break-words"><SourcePurchaseLink v-if="order.sourceOrderCode" :order="order" code-only /><span v-else>—</span></dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">客户</dt>
                <dd class="m-0 break-words">{{ order.customerName || '—' }}</dd>
              </div>
            </dl>
          </section>
          <div class="flex min-w-0 flex-col gap-3" :class="{ 'accept-overview': canHandle }">
            <Descriptions :column="{ xs: 1, sm: 2 }" size="small" bordered>
              <Descriptions.Item :label="fromPurchase ? '采购员' : '下单人'">{{ order.requesterName }}<span v-if="order.requesterDeptName" class="text-muted-foreground">（{{ order.requesterDeptName }}）</span></Descriptions.Item>
              <Descriptions.Item label="下单时间">{{ timeText(order.createTime) }}</Descriptions.Item>
              <Descriptions.Item :label="fromPurchase ? '采购单交期' : '希望交货'">{{ dateText(order.requiredDate) || '没填' }}</Descriptions.Item>
              <Descriptions.Item label="工厂交期">{{ dateText(order.promisedDate) || '—' }}</Descriptions.Item>
              <Descriptions.Item v-if="order.purpose && !fromPurchase" :span="2" label="用途">{{ order.purpose }}</Descriptions.Item>
              <Descriptions.Item v-if="order.remark" :span="2" label="备注">{{ order.remark }}</Descriptions.Item>
              <Descriptions.Item v-if="order.reply" :span="2" :label="order.status === 'REJECTED' ? '退回原因' : '工厂回复'">
                {{ order.reply }}<span class="text-muted-foreground"> — {{ order.handlerName }} {{ timeText(order.handledAt) }}</span>
              </Descriptions.Item>
            </Descriptions>

            <section v-if="canHandle" class="flex min-w-0 flex-col justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <h3 class="m-0 text-base font-semibold">接单处理</h3>
              <div class="accept-form-fields">
                <label for="po-promised" class="flex flex-col gap-1 text-xs text-muted-foreground">
                  回复交期（接单必填）
                  <DatePicker id="po-promised" v-model:value="promisedDate" :disabled-date="disabledDate" class="w-full" />
                </label>
                <label for="po-reply" class="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                  工厂回复（退回时必填）
                  <Input id="po-reply" v-model:value="reply" :maxlength="255" placeholder="填写交期说明或退回原因" />
                </label>
              </div>
            </section>
          </div>
        </div>

        <Alert v-if="targetRefreshError" type="warning" show-icon message="参数已保存，订单刷新失败。请重新加载后再接单或保存工艺，以免覆盖新参数。">
          <template #action><Button size="small" :loading="targetRefreshing" @click="onTargetChanged">重新加载已保存参数</Button></template>
        </Alert>

        <nav v-if="canHandle" ref="acceptNavigation" aria-label="接单信息" class="order-navigation">
          <Button
            v-for="view in acceptViews"
            :key="view.key"
            :aria-pressed="acceptView === view.key"
            :type="acceptView === view.key ? 'primary' : 'text'"
            @click="selectAcceptView(view.key)"
          >
            {{ view.label }}
          </Button>
        </nav>

        <section id="po-detail-items" v-show="!canHandle || acceptView === 'items'" aria-label="产品明细" class="detail-section grid gap-3" :class="{ 'accept-items-grid': canHandle }" tabindex="-1">
          <h3 v-if="!canHandle" class="m-0 text-base font-semibold">产品明细（{{ order.items.length }}）</h3>
          <Alert
            v-if="canHandle && incompleteItems.length > 0"
            class="col-span-full"
            type="warning"
            show-icon
            :message="`${incompleteItems.length} 个产品尚未完整确认生产参数，请补齐并保存后接单。`"
          />
          <div v-if="canBatchRoute" class="col-span-full flex flex-col gap-2 rounded-md bg-muted/40 p-3">
            <span class="text-xs font-semibold text-foreground">批量设置工序</span>
            <RoutePicker id="po-batch" v-model="batchDraft" :options="routeOptions" />
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" role="group" aria-label="套用到哪些产品">
              <Checkbox
                :checked="batchIds.length === activeItems.length"
                :indeterminate="batchIds.length > 0 && batchIds.length < activeItems.length"
                @change="(e) => toggleBatchAll(e.target.checked)"
              >
                全部
              </Checkbox>
              <Checkbox.Group v-model:value="batchIds">
                <Checkbox v-for="i in activeItems" :key="i.id" :value="i.id">
                  {{ i.productCode || i.productName }}<span class="text-muted-foreground"> · {{ specText(i) }}</span>
                </Checkbox>
              </Checkbox.Group>
            </div>
            <span>
              <Button size="small" type="primary" @click="applyBatchRoute">套用到勾选的 {{ batchIds.length }} 个产品</Button>
            </span>
          </div>
          <article v-for="i in order.items" :key="i.id" class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4">
            <div class="flex w-full min-w-0 flex-col sm:w-auto sm:flex-1">
              <h4 class="m-0 break-words text-base font-semibold">{{ i.productName }}</h4>
              <span class="text-xs text-muted-foreground">{{ i.productCode }} · {{ specText(i) }}</span>
              <span class="flex flex-wrap gap-x-3">
                <Button v-if="canPlan" class="!px-0" type="link" size="small" :disabled="targetRefreshing || targetRefreshError" @click="editProductionConfig(i)">修改参数与工艺</Button>
                <Button
                  v-if="canSupplementRoute && i.processes?.length && num(i.completedQuantity) < num(i.quantity)"
                  class="!px-0" type="link" size="small" :disabled="targetRefreshing || targetRefreshError"
                  @click="supplementRoute(i)"
                >补工序</Button>
              </span>
              <span v-if="canHandle && savedProductionConfigProblems(i).length > 0" class="text-xs text-orange-600">{{ savedProductionConfigProblems(i).join('；') }}</span>
              <RouteProductReference
                v-if="canPlan && num(i.quantity) > 0"
                class="my-1"
                v-bind="routePurchaseReferenceProps(purchaseReference, i.sourceLineId)"
                :product-id="canViewProductArchive ? i.productId : undefined"
                :folding-type="i.suggestedFoldingType"
              />
              <div v-if="canHandle && i.targetConfirmedAt" class="my-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{{ colorModeText(i.targetColorMode) }} · 成品总厚 {{ thicknessText(i.targetThickness) }}</span>
                <span>正面 {{ parameterText(i.targetFrontColor) }} · {{ thicknessText(i.targetFrontThickness) }} · {{ textureText(i, 'FRONT') }}</span>
                <span v-if="i.targetConstructionType === 'DOUBLE_LAYER'">反面 {{ parameterText(i.targetBackColor) }} · {{ thicknessText(i.targetBackThickness) }} · {{ textureText(i, 'BACK') }}</span>
              </div>
              <span v-if="i.printing || i.packaging" class="text-xs text-muted-foreground">
                <template v-if="i.printing">印花：{{ i.printing }}</template><template v-if="i.printing && i.packaging"> · </template><template v-if="i.packaging">包装：{{ i.packaging }}</template>
              </span>
              <span v-if="(i.auxUsages ?? []).length > 0" class="text-xs text-muted-foreground">
                辅料：{{
                  (i.auxUsages ?? [])
                    .map((a) => `${a.productName} 每件 ${num(a.perUnit)}${a.unit ?? ''}`)
                    .join('，')
                }}
              </span>
              <span v-if="i.remark" class="text-xs text-warning">备注：{{ i.remark }}</span>
              <span v-if="num(i.quantity) === 0" class="text-xs text-muted-foreground">采购单已取消这一行</span>
              <div
                v-else-if="factoryRoute && drafts[i.id] && (canHandle || (editingRoute === i.id && canProgress))"
                class="mt-1 flex flex-col gap-1"
              >
                <RoutePicker
                  :id="`po-item-${i.id}`"
                  :model-value="drafts[i.id]!"
                  :options="routeOptions"
                  @update:model-value="(v: RouteDraft) => (drafts[i.id] = v)"
                />
                <span v-if="editingRoute === i.id" class="flex gap-2">
                  <Button :loading="busy" :disabled="targetRefreshing || targetRefreshError" size="small" type="primary" @click="saveRoute(i)">保存工艺</Button>
                  <Button size="small" @click="(editingRoute = undefined), loadRoutes()">取消</Button>
                </span>
              </div>
              <span v-else-if="(i.processes ?? []).length === 0" class="text-xs text-muted-foreground">
                {{ factoryRoute ? '工艺：工厂接单时定' : '工艺：旧单没有定工艺，从已包装成品交货' }}
              </span>
              <span v-else class="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span class="text-muted-foreground">工艺 · {{ i.routeName || '自选工序' }}：</span>
                <button
                  v-if="factoryRoute && canProgress && !itemStarted(i) && editingRoute === undefined"
                  class="text-primary hover:underline"
                  type="button"
                  @click="editingRoute = i.id"
                >
                  改工艺
                </button>
                <template v-for="(step, index) in plannedSteps(i)" :key="step.process">
                  <span v-if="index > 0" class="text-muted-foreground" aria-hidden="true">›</span>
                  <span
                    class="rounded px-1.5 leading-5"
                    :class="stepClass(step, index === plannedSteps(i).length - 1)"
                    :title="stepTitle(step)"
                  >
                    {{ step.label }}
                    <template v-if="order.status !== 'SUBMITTED'">
                      <b class="tabular-nums">{{ num(step.goodQuantity) }}</b>{{ step.unit }}
                    </template>
                  </span>
                </template>
              </span>
            </div>
            <span class="flex w-full flex-col items-start gap-1 sm:w-auto sm:shrink-0 sm:items-end sm:text-right">
              <span class="text-muted-foreground">应做 <b class="text-base tabular-nums text-foreground">{{ num(i.quantity) }}</b> {{ i.unit }}</span>
              <span v-if="order.status !== 'SUBMITTED' && fromPurchase" class="text-xs text-muted-foreground">
                已入库 <b class="text-foreground">{{ num(i.completedQuantity) }}</b>
                <template v-if="num(i.shippedQuantity) > 0"> · 早期工厂出货 {{ num(i.shippedQuantity) }}</template>
                <template v-if="producedQty(i) > 0"> · 最后一道已做 {{ producedQty(i) }}</template>
              </span>
              <span v-else-if="order.status !== 'SUBMITTED'" class="text-xs text-muted-foreground">
                已交货 <b class="text-foreground">{{ num(i.completedQuantity) }}</b>
                <template v-if="producedQty(i) > 0"> · 最后一道已做 {{ producedQty(i) }}</template>
              </span>
              <Button
                v-if="canProgress && num(i.completedQuantity) < num(i.quantity)"
                type="primary"
                @click="openDelivery(i)"
              >
                {{ fromPurchase ? '生产入库' : '交货' }}
              </Button>
            </span>
          </article>
        </section>

        <div id="po-detail-purchase" v-if="fromPurchase" v-show="!canHandle || acceptView === 'purchase'" class="detail-section flex flex-col gap-4" tabindex="-1">
          <PurchaseSheet :order-id="order.id" :items="order.items" @reference="purchaseReference = $event" />
          <AuxPanel
            v-if="mode === 'factory'"
            :key="`aux-${order.id}-${order.items.map((i) => (i.processes ?? []).join(',')).join('|')}`"
            :editable="canProgress"
            :items="order.items"
            :order-id="order.id"
            :route-options="routeOptions"
          />
        </div>
        <div v-if="showStockTrace || canPlan" v-show="!canHandle || acceptView === 'stock' || acceptView === 'material'" id="po-detail-supply" class="detail-section flex flex-col gap-4" tabindex="-1">
          <OrderStockTrace v-if="showStockTrace" :items="order.items" :order-id="order.id" />
          <section v-if="canPlan" v-show="!canHandle || acceptView === 'stock'" aria-label="库存匹配">
            <SupplyMatch :items="order.items" :order-id="order.id" />
          </section>
          <section v-if="canPlan" v-show="!canHandle || acceptView === 'material'" aria-label="用料逆推">
            <MaterialPlan ref="materialPlan" :editable="canPlan" :order-id="order.id" />
          </section>
        </div>

        <p v-if="order.status === 'ACCEPTED' && fromPurchase" class="m-0 text-xs text-muted-foreground">
          这张单来自采购单：做好的货点「生产入库」开入库单进本厂仓库，采购单到货同一步更新；
          发货由仓库在「库存中心 → 出库单」办理（有合同做销售出库，没有合同做其它出库）。数量跟着采购单走，采购员改了会提示。
        </p>
        <p v-else-if="order.status === 'ACCEPTED'" class="m-0 text-xs text-muted-foreground">
          做好的货点「交货」交到仓库，完成数量按交货数累加。工序单关联这张单只用来看各道工序的进度。
        </p>

        <section v-if="deliveries.length > 0" id="po-detail-deliveries" class="detail-section flex flex-col gap-2" tabindex="-1">
          <h3 class="m-0 text-base font-semibold">
            {{ fromPurchase ? '入库记录' : '交货记录' }}（{{ deliveries.filter((d) => d.status === 'DELIVERED').length }}）
          </h3>
          <div
            v-for="d in deliveries"
            :key="d.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            :class="d.status === 'VOIDED' ? 'opacity-60' : ''"
          >
            <span class="flex min-w-0 flex-col">
              <span class="flex flex-wrap items-center gap-2">
                <b>{{ d.deliveryNo }}</b>
                <Tag v-if="d.status === 'VOIDED'" class="m-0">已作废</Tag>
                <span class="text-xs text-muted-foreground">{{ dateText(d.deliveredDate) }} · {{ d.operatorName }}</span>
              </span>
              <span class="text-xs text-muted-foreground">
                <template v-if="d.kind === 'FACTORY'">
                  {{ d.productName }} {{ num(d.quantity) }}{{ d.unit }} 完工，留在{{ d.warehouseName || '工厂' }}
                  <template v-if="d.stockInCode">（采购单到货 {{ d.stockInCode }}）</template>
                </template>
                <template v-else>
                  {{ d.productName }} {{ num(d.quantity) }}{{ d.unit }} → {{ d.warehouseName || '仓库' }}
                  <template v-if="d.stockInCode">（入库单 {{ d.stockInCode }}）</template>
                </template>
              </span>
              <span class="text-xs text-muted-foreground">
                {{ d.lines.map((l) => `${l.batchNo} × ${num(l.quantity)}`).join('，') }}
                <template v-if="d.remark"> · {{ d.remark }}</template>
                <template v-if="d.voidReason"> · 作废原因：{{ d.voidReason }}</template>
              </span>
            </span>
            <button
              v-if="canProgress && d.status === 'DELIVERED'"
              class="text-xs text-destructive hover:underline"
              type="button"
              @click="askVoid(d)"
            >
              作废
            </button>
          </div>
        </section>

        <section v-if="canProgress && !allDone" class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
          <span class="text-xs text-muted-foreground">
            <template v-if="fromPurchase">采购单做完或不再做时结束这张单；已入库的货照常由仓库出库。</template>
            <template v-else>下单人同意少做时，可以结束这张单。</template>
          </span>
          <Popconfirm title="结束这张单？结束后不能再交货" ok-text="结束" @confirm="finish">
            <Button :loading="busy">结束这张单</Button>
          </Popconfirm>
        </section>

        <p v-if="mode === 'mine' && fromPurchase" class="m-0 text-xs text-muted-foreground">
          这张单是采购单 {{ order.sourceOrderCode }} 自动生成的，改数量、取消请改采购单。
        </p>
        <div v-else-if="mode === 'mine'" class="flex flex-wrap justify-end gap-2">
          <Button @click="emit('copy', order)">{{ order.status === 'REJECTED' ? '修改后重新下单' : '复制下单' }}</Button>
          <Popconfirm v-if="canCancel" title="撤回这张单？工厂还没接单" ok-text="撤回" @confirm="cancel">
            <Button :loading="busy" danger>撤回</Button>
          </Popconfirm>
        </div>
      </div>
      <div v-else-if="loading" class="min-h-24"></div>
    </Spin>
    <DeliveryModal
      v-model:open="deliveryOpen"
      :factory-id="order?.factoryId"
      :item="deliveryItem"
      :purchase="fromPurchase"
      @saved="onDelivered"
    />
    <Modal
      :open="!!voidTarget"
      :confirm-loading="busy"
      ok-text="作废"
      :ok-button-props="{ danger: true }"
      :title="`作废${voidTarget?.kind === 'FACTORY' ? '完工登记' : voidTarget?.kind === 'PURCHASE' ? '生产入库单' : '交货单'} ${voidTarget?.deliveryNo ?? ''}`"
      @cancel="voidTarget = undefined"
      @ok="confirmVoid"
    >
      <p v-if="voidTarget?.kind === 'FACTORY'" class="text-xs text-muted-foreground">
        作废后采购单到货冲回，货从批次 {{ order?.orderNo }} 转回原来的库存行，订单完成数量扣回；这批货已经出货的不能作废。
      </p>
      <p v-else class="text-xs text-muted-foreground">
        作废后仓库扣回这批货（已经从仓库出库的不能作废），工厂库存退回原来的行，订单完成数量扣回<template
          v-if="voidTarget?.kind === 'PURCHASE'"
        >
，采购单到货冲回
</template>。
      </p>
      <Input id="delivery-void-reason" v-model:value="voidReason" :maxlength="255" placeholder="作废原因（必填）" />
    </Modal>
    <template v-if="canHandle" #footer>
      <div class="accept-footer">
        <div class="min-w-0 flex-1 text-xs text-muted-foreground">
          <b class="block text-sm text-foreground">交期：{{ promisedDate?.format('YYYY-MM-DD') || '待填写' }}</b>
          <div v-if="targetRefreshError" class="text-destructive">请先重新加载已保存参数</div>
          <button v-else-if="incompleteItems.length > 0" type="button" class="text-left text-primary hover:underline disabled:opacity-50" :disabled="loading || loadError || materialSaving || targetRefreshing" @click="editProductionConfig(incompleteItems[0]!)">
            {{ incompleteItems.length }} 个产品待确认生产参数 · 去补齐
          </button>
          <span v-else>基础参数已确认，请核对产品工艺</span>
        </div>
        <Button :disabled="detailBusy" size="large" @click="open = false">关闭</Button>
        <Button :loading="busy" :disabled="loading || loadError || materialSaving || targetRefreshing || targetRefreshError" danger size="large" @click="reject">退回</Button>
        <Button :loading="busy || targetRefreshing" :disabled="loading || loadError || materialSaving || targetRefreshError" type="primary" size="large" @click="accept">接单</Button>
      </div>
    </template>
  </FactoryDialog>
  <ItemProductionConfigModal
    v-if="order && configItemId"
    v-model:open="configOpen"
    :order-id="order.id"
    :item-id="configItemId"
    :purchase-reference="purchaseReference"
    :show-product-archive="canViewProductArchive"
    @saved="onTargetChanged"
  />
  <RouteSupplementModal
    v-if="order && supplementItem"
    v-model:open="supplementOpen" :factory-id="order.factoryId" :item="supplementItem" :order-no="order.orderNo"
    @released="onTargetChanged"
  />
</template>

<style scoped>
.accept-form-fields {
  display: grid;
  grid-template-columns: minmax(146px, 168px) minmax(0, 1fr);
  gap: 12px;
}

.order-navigation {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 4px;
  padding: 6px 0;
  overflow: auto;
  background: hsl(var(--background));
  border-bottom: 1px solid hsl(var(--border));
}

.detail-section {
  scroll-margin-top: 55px;
}

.accept-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 6px 0;
  text-align: left;
}

.accept-footer > .ant-btn-primary {
  min-width: 112px;
}

@media (min-width: 1050px) {
  .detail-overview {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .accept-overview {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  }

  .accept-items-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .accept-form-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .order-navigation {
    flex-wrap: wrap;
  }

  .order-navigation > .ant-btn {
    padding-inline: 8px;
  }

  .detail-section {
    scroll-margin-top: 92px;
  }
}
</style>
