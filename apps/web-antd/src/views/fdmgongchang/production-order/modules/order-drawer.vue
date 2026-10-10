<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Button, Checkbox, DatePicker, Descriptions, Drawer, Input, InputNumber, message, Popconfirm, Spin, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  acceptProductionOrder,
  cancelProductionOrder,
  getProductionOrder,
  progressProductionOrder,
  rejectProductionOrder,
} from '#/api/fdmgongchang/production-order';

import { dateText, num, ORDER_STATUS, specText, timeText } from '../shared';

/**
 * 订单详情。下单人（mode=mine）待接单时可以撤回；
 * 工厂（mode=factory）待接单时接单（回复交期）或退回，生产中登记完成数量、结束这张单。
 */
const props = defineProps<{ mode: 'factory' | 'mine'; orderId?: number }>();
const emit = defineEmits<{ changed: [] }>();
const open = defineModel<boolean>('open', { required: true });

const order = ref<Api.Order>();
const loading = ref(false);
const busy = ref(false);
const promisedDate = ref<Dayjs>();
const reply = ref('');
const done = ref<Record<number, null | number>>({});
const complete = ref(false);

const status = computed(() => (order.value ? ORDER_STATUS[order.value.status] : undefined));
const canCancel = computed(() => props.mode === 'mine' && order.value?.status === 'SUBMITTED');
const canHandle = computed(() => props.mode === 'factory' && order.value?.status === 'SUBMITTED');
const canProgress = computed(() => props.mode === 'factory' && order.value?.status === 'ACCEPTED');
const allDone = computed(() =>
  (order.value?.items ?? []).every((i) => (done.value[i.id] ?? 0) >= num(i.quantity)),
);

async function load() {
  if (!props.orderId) return;
  loading.value = true;
  try {
    order.value = await getProductionOrder(props.orderId);
    promisedDate.value = dayjs(dateText(order.value.requiredDate));
    reply.value = '';
    complete.value = false;
    done.value = Object.fromEntries(order.value.items.map((i) => [i.id, num(i.completedQuantity)]));
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

function saveProgress() {
  if (!order.value) return;
  const id = order.value.id;
  return run(
    () =>
      progressProductionOrder({
        complete: complete.value,
        id,
        items: order.value!.items.map((i) => ({ completedQuantity: done.value[i.id] ?? 0, itemId: i.id })),
      }),
    complete.value ? '这张单已完成' : '已登记完成数量',
  );
}

const disabledDate = (d: Dayjs) => d.isBefore(dayjs().startOf('day'));
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
              <span v-if="i.remark" class="text-xs text-warning">备注：{{ i.remark }}</span>
            </span>
            <span v-if="canProgress" class="flex items-center gap-1 text-xs text-muted-foreground">
              已完成
              <InputNumber
                :id="`po-done-${i.id}`"
                :min="0"
                :precision="0"
                :value="done[i.id] ?? undefined"
                class="w-24"
                size="small"
                @change="(v) => (done[i.id] = (v as null | number | undefined) ?? null)"
              />
              / {{ num(i.quantity) }} {{ i.unit }}
            </span>
            <span v-else class="shrink-0 text-right">
              <b>{{ num(i.quantity) }}</b> {{ i.unit }}
              <span v-if="order.status !== 'SUBMITTED'" class="block text-xs text-muted-foreground">已完成 {{ num(i.completedQuantity) }}</span>
            </span>
          </div>
        </section>

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
          包装工序单关联这张单（或按 AI 排单里这张单的任务开工）后，每次报产出的良品会自动累加到完成数量<template v-if="canProgress">；这里也可以手动修正</template>。
        </p>
        <section v-if="canProgress" class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
          <Checkbox v-model:checked="complete">
            结束这张单<span class="text-xs text-muted-foreground">{{ allDone ? '（已全部做完）' : '（还没做够也可以结束，比如下单人同意少做）' }}</span>
          </Checkbox>
          <Button :loading="busy" type="primary" @click="saveProgress">{{ complete ? '保存并完成' : '保存完成数量' }}</Button>
        </section>

        <div v-if="canCancel" class="flex justify-end">
          <Popconfirm title="撤回这张单？工厂还没接单" ok-text="撤回" @confirm="cancel">
            <Button :loading="busy" danger>撤回</Button>
          </Popconfirm>
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
