<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Button, DatePicker, Descriptions, Drawer, Input, message, Modal, Popconfirm, Spin, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  acceptProductionOrder,
  cancelProductionOrder,
  completeProductionOrder,
  getProductionOrder,
  rejectProductionOrder,
  voidDelivery,
} from '#/api/fdmgongchang/production-order';

import { dateText, num, ORDER_STATUS, specText, timeText } from '../shared';
import DeliveryModal from './delivery-modal.vue';
import MaterialPlan from './material-plan.vue';

/**
 * 订单详情。下单人（mode=mine）待接单时可以撤回；
 * 工厂（mode=factory）待接单时接单（回复交期）或退回；生产中把做好的货交到采购仓库（交货单），
 * 完成数量 = 净交货数量；可以结束这张单（没交够也可以，比如下单人同意少做）。
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
const canCancel = computed(() => props.mode === 'mine' && order.value?.status === 'SUBMITTED');
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
    promisedDate.value = dayjs(dateText(order.value.requiredDate));
    reply.value = '';
  } finally {
    loading.value = false;
  }
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
  return run(
    () => acceptProductionOrder({ id, promisedDate: promisedDate.value?.format('YYYY-MM-DD'), reply: reply.value.trim() || undefined }),
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
  <Drawer v-model:open="open" :title="order ? `生产订单 ${order.orderNo}` : '生产订单'" width="min(760px, 100vw)">
    <Spin :spinning="loading">
      <div v-if="order" class="flex flex-col gap-4 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <Tag v-if="status" :color="status.color" class="m-0">{{ status.label }}</Tag>
          <span class="text-muted-foreground">{{ order.factoryName }}</span>
          <span v-if="order.purpose" class="text-muted-foreground">· {{ order.purpose }}</span>
        </div>
        <Descriptions :column="{ xs: 1, sm: 2 }" size="small" bordered>
          <Descriptions.Item label="下单人">{{ order.requesterName }}<span v-if="order.requesterDeptName" class="text-muted-foreground">（{{ order.requesterDeptName }}）</span></Descriptions.Item>
          <Descriptions.Item label="下单时间">{{ timeText(order.createTime) }}</Descriptions.Item>
          <Descriptions.Item label="希望交货">{{ dateText(order.requiredDate) }}</Descriptions.Item>
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
              <span v-if="(i.processes ?? []).length === 0" class="text-xs text-muted-foreground">
                工艺：旧单没有定工艺，从已包装成品交货
              </span>
              <span v-else class="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span class="text-muted-foreground">工艺 · {{ i.routeName || '自选工序' }}：</span>
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
              <span v-if="order.status !== 'SUBMITTED'" class="text-xs text-muted-foreground">
                已交货 <b class="text-foreground">{{ num(i.completedQuantity) }}</b>
                <template v-if="producedQty(i) > 0"> · 最后一道已做 {{ producedQty(i) }}</template>
              </span>
              <Button
                v-if="canProgress && num(i.completedQuantity) < num(i.quantity)"
                size="small"
                type="primary"
                @click="openDelivery(i)"
              >
                交货
              </Button>
            </span>
          </div>
        </section>

        <MaterialPlan v-if="canPlan" :editable="canPlan" :order-id="order.id" />

        <section v-if="canHandle" class="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          <h3 class="m-0 text-sm font-semibold">接单处理</h3>
          <label for="po-promised" class="flex flex-col gap-1 text-xs text-muted-foreground">
            回复交期（默认是下单人希望的日期）
            <DatePicker id="po-promised" v-model:value="promisedDate" :disabled-date="disabledDate" class="w-48" />
          </label>
          <label for="po-reply" class="flex flex-col gap-1 text-xs text-muted-foreground">
            说明（退回时必填）
            <Input id="po-reply" v-model:value="reply" :maxlength="255" placeholder="例如 排在下周三开工 / 这个颜色缺料" />
          </label>
          <div class="flex gap-2">
            <Button :loading="busy" type="primary" @click="accept">接单</Button>
            <Button :loading="busy" danger @click="reject">退回</Button>
          </div>
        </section>

        <p v-if="order.status === 'ACCEPTED'" class="m-0 text-xs text-muted-foreground">
          做好的货点「交货」交到采购部门仓库，完成数量按交货数累加。工序单关联这张单只用来看各道工序的进度。
        </p>

        <section v-if="deliveries.length > 0" class="flex flex-col gap-2">
          <h3 class="m-0 text-sm font-semibold">交货记录（{{ deliveries.filter((d) => d.status === 'DELIVERED').length }}）</h3>
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
                {{ d.productName }} {{ num(d.quantity) }}{{ d.unit }} → {{ d.warehouseName || '采购仓库' }}
                <template v-if="d.stockInCode">（入库单 {{ d.stockInCode }}）</template>
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
            {{ allDone ? '已全部交货，可以结束这张单。' : '还没交够也可以结束，比如下单人同意少做。' }}
          </span>
          <Popconfirm title="结束这张单？结束后不能再交货" ok-text="结束" @confirm="finish">
            <Button :loading="busy" :type="allDone ? 'primary' : 'default'">结束这张单</Button>
          </Popconfirm>
        </section>

        <div v-if="mode === 'mine'" class="flex flex-wrap justify-end gap-2">
          <Button @click="emit('copy', order)">{{ order.status === 'REJECTED' ? '修改后重新下单' : '复制下单' }}</Button>
          <Popconfirm v-if="canCancel" title="撤回这张单？工厂还没接单" ok-text="撤回" @confirm="cancel">
            <Button :loading="busy" danger>撤回</Button>
          </Popconfirm>
        </div>
      </div>
    </Spin>
    <DeliveryModal v-model:open="deliveryOpen" :item="deliveryItem" @saved="onDelivered" />
    <Modal
      :open="!!voidTarget"
      :confirm-loading="busy"
      ok-text="作废"
      :ok-button-props="{ danger: true }"
      :title="`作废交货单 ${voidTarget?.deliveryNo ?? ''}`"
      @cancel="voidTarget = undefined"
      @ok="confirmVoid"
    >
      <p class="text-xs text-muted-foreground">
        作废后采购仓库扣回这批货（已经从仓库出库的不能作废），工厂库存退回原来的行，订单完成数量扣回。
      </p>
      <Input id="delivery-void-reason" v-model:value="voidReason" :maxlength="255" placeholder="作废原因（必填）" />
    </Modal>
  </Drawer>
</template>
