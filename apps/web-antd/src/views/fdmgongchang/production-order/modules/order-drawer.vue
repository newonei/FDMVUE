<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { RouteDraft } from '../shared';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Alert, Button, DatePicker, Descriptions, Input, message, Modal, Popconfirm, Spin, Tag } from 'ant-design-vue';
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
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { dateText, num, ORDER_STATUS, routeProblem, specText, timeText } from '../shared';
import DeliveryModal from './delivery-modal.vue';
import MaterialPlan from './material-plan.vue';
import PurchaseSheet from './purchase-sheet.vue';
import RoutePicker from './route-picker.vue';

/**
 * 订单详情。下单人（mode=mine）待接单时可以撤回；
 * 工厂（mode=factory）待接单时接单（回复交期）或退回；生产中把做好的货交到仓库（交货单），
 * 完成数量 = 净交货数量；可以结束这张单（没交够也可以，比如下单人同意少做）。
 * 供应商是本厂的采购单自动生成的单：工厂接单时给每个产品定工艺（还没开工序单前都能改），
 * 生产要求读采购单下单资料，数量跟着采购单走（接单后有变更要工厂确认）；做好的货开「生产入库」单进本厂仓库，
 * 采购单到货随之更新，之后由仓库销售出库或其它出库（库存中心）。
 */
const props = defineProps<{ mode: 'factory' | 'mine'; orderId?: number }>();
const emit = defineEmits<{ changed: []; copy: [order: Api.Order] }>();
const open = defineModel<boolean>('open', { required: true });

const order = ref<Api.Order>();
const loading = ref(false);
const busy = ref(false);
const promisedDate = ref<Dayjs>();
const reply = ref('');
const deliveryOpen = ref(false);
const deliveryItem = ref<Api.Item>();
const voidTarget = ref<Api.Delivery>();
const voidReason = ref('');

const status = computed(() => (order.value ? ORDER_STATUS[order.value.status] : undefined));
const fromPurchase = computed(() => order.value?.sourceType === 'PURCHASE_ORDER');
/** 采购单生成的单：工厂定工艺用的工序和路线、每个产品的工艺草稿。 */
const routeOptions = ref<RouteApi.Options>();
const drafts = ref<Record<number, RouteDraft>>({});
const editingRoute = ref<number>();
const activeItems = computed(() => (order.value?.items ?? []).filter((i) => num(i.quantity) > 0));
const canCancel = computed(() => props.mode === 'mine' && order.value?.status === 'SUBMITTED' && !fromPurchase.value);
const canHandle = computed(() => props.mode === 'factory' && order.value?.status === 'SUBMITTED');
const canProgress = computed(() => props.mode === 'factory' && order.value?.status === 'ACCEPTED');
/** 工厂看用料逆推：接单前就能看要多少板材和原料，生产中可以换配方、板材规格。 */
const canPlan = computed(() => props.mode === 'factory' && (canHandle.value || canProgress.value));
const allDone = computed(() =>
  (order.value?.items ?? []).every((i) => num(i.completedQuantity) >= num(i.quantity)),
);
const deliveries = computed(() => order.value?.deliveries ?? []);

async function load() {
  if (!props.orderId) return;
  loading.value = true;
  try {
    order.value = await getProductionOrder(props.orderId);
    const required = dateText(order.value.requiredDate);
    promisedDate.value = required ? dayjs(required) : undefined;
    reply.value = '';
    editingRoute.value = undefined;
  } finally {
    loading.value = false;
  }
  await loadRoutes();
}

/** 工厂定工艺：已定过的沿用，没定过的带出这个产品上次在本厂用的工艺。 */
async function loadRoutes() {
  const o = order.value;
  if (!o || props.mode !== 'factory' || !fromPurchase.value || !['ACCEPTED', 'SUBMITTED'].includes(o.status)) return;
  routeOptions.value = await getRouteOptions(o.factoryId).catch(() => undefined);
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
  drafts.value = next;
}

function draftProblem(item: Api.Item) {
  const processes = routeOptions.value?.processes ?? [];
  const draft = drafts.value[item.id];
  return draft && processes.length > 0 ? routeProblem(draft.steps, processes) : '请选择要走的工序';
}

/** 开过工序单的产品不能再改工艺。 */
function itemStarted(item: Api.Item) {
  return (item.steps ?? []).some((s) => s.orderCount > 0);
}

function saveRoute(item: Api.Item) {
  const draft = drafts.value[item.id];
  const problem = draftProblem(item);
  if (!draft || problem) {
    message.warning(problem || '请选择要走的工序');
    return;
  }
  return run(() => saveItemRoute({ itemId: item.id, routeId: draft.routeId, steps: draft.steps }), '工艺已保存');
}

function confirmChange() {
  if (!order.value) return;
  const id = order.value.id;
  return run(() => confirmProductionOrderChange(id), '已确认采购单变更');
}

watch(open, (value) => {
  if (value) load();
  else order.value = undefined;
});

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
  if (!order.value) return;
  const id = order.value.id;
  if (!promisedDate.value) {
    message.warning('采购单没填交期，请回复交期');
    return;
  }
  let routes: Api.RouteReq[] | undefined;
  if (fromPurchase.value) {
    for (const item of activeItems.value) {
      const problem = draftProblem(item);
      if (problem) {
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
    '已接单，这张单会进入 AI 排单的待生产订单',
  );
}

function reject() {
  if (!order.value) return;
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

const disabledDate = (d: Dayjs) => d.isBefore(dayjs().startOf('day'));

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
  <FdmResizableDrawer resize-key="factory-production-order" v-model:open="open" :title="order ? `生产订单 ${order.orderNo}` : '生产订单'" width="min(760px, 100vw)">
    <Spin :spinning="loading">
      <div v-if="order" class="flex flex-col gap-4 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <Tag v-if="status" :color="status.color" class="m-0">{{ status.label }}</Tag>
          <span class="text-muted-foreground">{{ order.factoryName }}</span>
          <span v-if="order.purpose && !fromPurchase" class="text-muted-foreground">· {{ order.purpose }}</span>
          <Tag v-if="fromPurchase" class="m-0" color="blue">采购单 {{ order.sourceOrderCode }}</Tag>
        </div>
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
        <Descriptions :column="{ xs: 1, sm: 2 }" size="small" bordered>
          <Descriptions.Item v-if="fromPurchase" :span="2" label="来源">
            采购单 {{ order.sourceOrderCode }}
            <template v-if="order.sourceContractCode"> · 合同 {{ order.sourceContractCode }}</template>
            <span v-if="order.customerName" class="text-muted-foreground">（{{ order.customerName }}）</span>
          </Descriptions.Item>
          <Descriptions.Item :label="fromPurchase ? '采购员' : '下单人'">{{ order.requesterName }}<span v-if="order.requesterDeptName" class="text-muted-foreground">（{{ order.requesterDeptName }}）</span></Descriptions.Item>
          <Descriptions.Item label="下单时间">{{ timeText(order.createTime) }}</Descriptions.Item>
          <Descriptions.Item :label="fromPurchase ? '采购单交期' : '希望交货'">{{ dateText(order.requiredDate) || '没填' }}</Descriptions.Item>
          <Descriptions.Item label="工厂交期">{{ dateText(order.promisedDate) || '—' }}</Descriptions.Item>
          <Descriptions.Item v-if="order.remark" :span="2" label="备注">{{ order.remark }}</Descriptions.Item>
          <Descriptions.Item v-if="order.reply" :span="2" :label="order.status === 'REJECTED' ? '退回原因' : '工厂回复'">
            {{ order.reply }}<span class="text-muted-foreground"> — {{ order.handlerName }} {{ timeText(order.handledAt) }}</span>
          </Descriptions.Item>
        </Descriptions>

        <section class="flex flex-col gap-2">
          <h3 class="m-0 text-sm font-semibold">明细</h3>
          <div v-for="i in order.items" :key="i.id" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span class="flex min-w-0 flex-1 flex-col">
              <span>{{ i.productName }}</span>
              <span class="text-xs text-muted-foreground">{{ i.productCode }} · {{ specText(i) }}</span>
              <span v-if="i.printing" class="text-xs text-muted-foreground">{{ i.printing }}</span>
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
                v-else-if="fromPurchase && drafts[i.id] && (canHandle || (editingRoute === i.id && canProgress))"
                class="mt-1 flex flex-col gap-1"
              >
                <RoutePicker
                  :id="`po-item-${i.id}`"
                  :model-value="drafts[i.id]!"
                  :options="routeOptions"
                  @update:model-value="(v: RouteDraft) => (drafts[i.id] = v)"
                />
                <span v-if="editingRoute === i.id" class="flex gap-2">
                  <Button :loading="busy" size="small" type="primary" @click="saveRoute(i)">保存工艺</Button>
                  <Button size="small" @click="(editingRoute = undefined), loadRoutes()">取消</Button>
                </span>
              </div>
              <span v-else-if="(i.processes ?? []).length === 0" class="text-xs text-muted-foreground">
                {{ fromPurchase ? '工艺：工厂接单时定' : '工艺：旧单没有定工艺，从已包装成品交货' }}
              </span>
              <span v-else class="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span class="text-muted-foreground">工艺 · {{ i.routeName || '自选工序' }}：</span>
                <button
                  v-if="fromPurchase && canProgress && !itemStarted(i) && editingRoute === undefined"
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
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1 text-right">
              <span><b>{{ num(i.quantity) }}</b> {{ i.unit }}</span>
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
                size="small"
                type="primary"
                @click="openDelivery(i)"
              >
                {{ fromPurchase ? '生产入库' : '交货' }}
              </Button>
            </span>
          </div>
        </section>

        <PurchaseSheet v-if="fromPurchase" :order-id="order.id" />

        <MaterialPlan v-if="canPlan" :editable="canPlan" :order-id="order.id" />

        <section v-if="canHandle" class="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          <h3 class="m-0 text-sm font-semibold">接单处理</h3>
          <label for="po-promised" class="flex flex-col gap-1 text-xs text-muted-foreground">
            {{ fromPurchase ? '回复交期（默认是采购单交期，没填要自己选）' : '回复交期（默认是下单人希望的日期）' }}
            <DatePicker id="po-promised" v-model:value="promisedDate" :disabled-date="disabledDate" class="w-48" />
          </label>
          <label for="po-reply" class="flex flex-col gap-1 text-xs text-muted-foreground">
            说明（退回时必填）
            <Input id="po-reply" v-model:value="reply" :maxlength="255" placeholder="例如 排在下周三开工 / 这个颜色缺料" />
          </label>
          <p v-if="fromPurchase" class="m-0 text-xs text-muted-foreground">
            工艺由工厂定：在上面每个产品下面选好要走的工序再接单；没开工序单前都还能改。
          </p>
          <div class="flex gap-2">
            <Button :loading="busy" type="primary" @click="accept">接单</Button>
            <Button :loading="busy" danger @click="reject">退回</Button>
          </div>
        </section>

        <p v-if="order.status === 'ACCEPTED' && fromPurchase" class="m-0 text-xs text-muted-foreground">
          这张单来自采购单：做好的货点「生产入库」开入库单进本厂仓库，采购单到货同一步更新；
          发货由仓库在「库存中心 → 出库单」办理（有合同做销售出库，没有合同做其它出库）。数量跟着采购单走，采购员改了会提示。
        </p>
        <p v-else-if="order.status === 'ACCEPTED'" class="m-0 text-xs text-muted-foreground">
          做好的货点「交货」交到仓库，完成数量按交货数累加。工序单关联这张单只用来看各道工序的进度。
        </p>

        <section v-if="deliveries.length > 0" class="flex flex-col gap-2">
          <h3 class="m-0 text-sm font-semibold">
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

        <section v-if="canProgress" class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
          <span class="text-xs text-muted-foreground">
            <template v-if="fromPurchase">采购单做完或不再做时结束这张单；已入库的货照常由仓库出库。</template>
            <template v-else>{{ allDone ? '已全部交货，可以结束这张单。' : '还没交够也可以结束，比如下单人同意少做。' }}</template>
          </span>
          <Popconfirm title="结束这张单？结束后不能再交货" ok-text="结束" @confirm="finish">
            <Button :loading="busy" :type="allDone ? 'primary' : 'default'">结束这张单</Button>
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
  </FdmResizableDrawer>
</template>
