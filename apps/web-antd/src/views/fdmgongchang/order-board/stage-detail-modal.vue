<script lang="ts" setup>
import type { Stage } from './model';

import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed } from 'vue';

import { Alert, Button, Empty, Modal, Spin, Tag } from 'ant-design-vue';

import { dateText, num, specText } from '../production-order/shared';
import { TASK_STAGE_LABELS } from '../shared/schedule';
import { deliveryProgress, stageDetails } from './model';

const props = defineProps<{
  failed: boolean;
  itemId?: number;
  loading: boolean;
  order?: Api.Order;
  stage?: Stage;
}>();

const emit = defineEmits<{ close: []; retry: [] }>();

const details = computed(() =>
  props.order && props.stage
    ? stageDetails(props.order, props.stage, props.itemId)
    : undefined,
);
const outbound = computed(() => props.stage?.code === 'OUTBOUND');
const stockIn = computed(() => props.stage?.code === 'STOCK_IN');
const logistics = computed(() => outbound.value || stockIn.value);
const sharedTasks = computed(() => details.value?.rows.some(({ step }) => step?.sharedTaskCount));
const products = computed(() => new Map(details.value?.rows.map(({ item }) => [item.id, item])));
const quantities = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
const stateColors: Record<Stage['state'], string> = {
  done: 'success',
  idle: 'default',
  partial: 'warning',
  reported: 'purple',
  running: 'processing',
  skipped: 'default',
  waiting: 'warning',
};

function quantityText(value: null | number | string | undefined, unit?: null | string) {
  return [quantities.format(num(value)), unit].filter(Boolean).join(' ');
}

function logisticsMetrics(item: Api.Item) {
  const { actual, remaining, target } = deliveryProgress(item, outbound.value);
  return [
    { label: '订单目标', value: quantityText(target, item.unit) },
    { label: outbound.value ? '已出库' : '已交货 / 入库', value: quantityText(actual, item.unit) },
    { label: outbound.value ? '剩余待出库' : '剩余待交货', value: quantityText(remaining, item.unit) },
  ];
}
</script>

<template>
  <Modal
    :open="!!details"
    :title="`${stage?.label ?? ''}详情`"
    :z-index="2100"
    centered
    width="min(760px, calc(100vw - 32px))"
    @cancel="emit('close')"
  >
    <template #footer>
      <Button @click="emit('close')">关闭</Button>
    </template>
    <Spin :spinning="loading">
      <div v-if="details && order" class="stage-detail-content space-y-4">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/40 px-4 py-3 text-sm">
          <b>{{ order.orderNo }}</b>
          <Tag :color="stateColors[details.stage.state]" class="m-0">{{ details.stage.text }}</Tag>
          <span v-if="order.customerName" class="text-muted-foreground">{{ order.customerName }}</span>
          <span v-if="order.promisedDate || order.requiredDate" class="text-muted-foreground">
            {{ order.promisedDate ? '工厂交期' : '需求交期' }} {{ dateText(order.promisedDate || order.requiredDate) }}
          </span>
        </div>

        <Alert v-if="failed" type="warning" show-icon message="详情刷新失败，当前显示看板快照。">
          <template #action><Button size="small" @click="emit('retry')">重试</Button></template>
        </Alert>

        <Empty
          v-if="details.rows.length === 0"
          :description="details.itemMissing ? '该产品明细已不存在。' : logistics ? '当前订单没有可统计的产品明细。' : details.stage.detail"
        />
        <template v-else>
          <p v-if="outbound || sharedTasks" class="mb-0 text-xs leading-5 text-muted-foreground">
            {{ outbound ? '仅统计明确关联本单的有效出库记录。' : '合并生产任务的状态按整项任务统计，良品数量按订单明细归集。' }}
          </p>
          <section v-for="{ item, stage: lineStage, step } in details.rows" :key="item.id" class="space-y-3 rounded-lg border border-border p-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="mb-1 break-words text-sm font-semibold">{{ item.productName }}</h3>
                <p v-if="item.productCode || specText(item)" class="mb-0 break-words text-xs text-muted-foreground">
                  {{ [item.productCode, specText(item)].filter(Boolean).join(' · ') }}
                </p>
              </div>
              <Tag :color="stateColors[lineStage.state]" class="m-0">{{ lineStage.text }}</Tag>
            </div>

            <template v-if="logistics">
              <dl class="mb-0 grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                <div v-for="metric in logisticsMetrics(item)" :key="metric.label">
                  <dt class="text-xs text-muted-foreground">{{ metric.label }}</dt>
                  <dd class="mb-0 mt-1 break-words font-semibold tabular-nums">{{ metric.value }}</dd>
                </div>
              </dl>
              <p v-if="outbound && num(item.warehouseShippedQuantity) > 0" class="mb-0 text-xs text-muted-foreground">
                其中库存中心出库 {{ quantityText(item.warehouseShippedQuantity, item.unit) }}
              </p>
              <p v-if="stockIn && item.deliveryStageLabel" class="mb-0 text-xs text-muted-foreground">
                交货阶段 {{ item.deliveryStageLabel }}
              </p>
            </template>
            <template v-else>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>订单需求 {{ quantityText(item.quantity, item.unit) }}</span>
                <span v-if="item.routeName">工艺路线 {{ item.routeName }}</span>
                <span v-if="step?.outputStage && TASK_STAGE_LABELS[step.outputStage]">工序产出 {{ TASK_STAGE_LABELS[step.outputStage] }}</span>
              </div>
              <p v-if="lineStage.state === 'idle' && !step?.orderCount" class="mb-0 text-sm text-muted-foreground">尚未下发排单任务，也没有关联工序单。</p>
              <template v-else-if="step">
                <dl class="mb-0 grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                  <div>
                    <dt class="text-xs text-muted-foreground">良品</dt>
                    <dd class="mb-0 mt-1 break-words font-semibold tabular-nums">{{ quantityText(step.goodQuantity, step.unit) }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-muted-foreground">不良品</dt>
                    <dd class="mb-0 mt-1 break-words font-semibold tabular-nums">{{ quantityText(step.defectQuantity, step.unit) }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-muted-foreground">任务达标</dt>
                    <dd class="mb-0 mt-1 font-semibold tabular-nums">{{ step.taskCount ? `${step.completedTaskCount ?? 0} / ${step.taskCount}` : '—' }}</dd>
                  </div>
                </dl>
                <dl class="mb-0 space-y-2 text-xs">
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <dt class="font-medium">工序单</dt>
                    <dd class="mb-0 text-muted-foreground">
                      共 {{ step.orderCount }} 张 · 在制 {{ step.inProgressCount }} 张 · 已完成 {{ step.completedOrderCount ?? 0 }} 张
                    </dd>
                  </div>
                  <div v-if="step.taskCount" class="flex flex-wrap gap-x-3 gap-y-1">
                    <dt class="font-medium">排单任务</dt>
                    <dd class="mb-0 text-muted-foreground">
                      待领取 {{ step.pendingTaskCount ?? 0 }} 个 · 已领取 {{ step.claimedTaskCount ?? 0 }} 个<template v-if="step.sharedTaskCount"> · 合并生产 {{ step.sharedTaskCount }} 个</template>
                    </dd>
                  </div>
                </dl>
              </template>
            </template>
          </section>
        </template>

        <section v-if="stockIn && details.rows.length > 0 && (!loading || details.deliveries.length > 0)" class="space-y-2">
          <h3 class="mb-0 text-sm font-semibold">交货 / 入库记录</h3>
          <p v-if="details.deliveries.length === 0" class="mb-0 text-sm text-muted-foreground">当前暂无交货 / 入库记录。</p>
          <article v-for="delivery in details.deliveries" :key="delivery.id" class="space-y-1 rounded-md border border-border px-3 py-2">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <b>{{ delivery.deliveryNo }}</b>
              <Tag :color="delivery.status === 'VOIDED' ? 'default' : 'success'" class="m-0">
                {{ delivery.status === 'VOIDED' ? '已作废' : delivery.kind === 'FACTORY' ? '已登记完工' : delivery.kind === 'PURCHASE' ? '已入库' : '已交货' }}
              </Tag>
              <span class="text-xs text-muted-foreground">{{ [dateText(delivery.deliveredDate), delivery.operatorName].filter(Boolean).join(' · ') }}</span>
            </div>
            <p class="mb-0 break-words text-xs text-muted-foreground">
              {{ delivery.productName || products.get(delivery.productionOrderItemId)?.productName }}
              · {{ quantityText(delivery.quantity, delivery.unit || products.get(delivery.productionOrderItemId)?.unit) }}
              <template v-if="delivery.warehouseName"> · {{ delivery.warehouseName }}</template>
              <template v-if="delivery.stockInCode"> · {{ delivery.stockInCode }}</template>
            </p>
            <p v-if="delivery.remark || delivery.voidReason" class="mb-0 break-words text-xs text-muted-foreground">
              {{ [delivery.remark, delivery.voidReason ? `作废原因 ${delivery.voidReason}` : ''].filter(Boolean).join(' · ') }}
            </p>
          </article>
        </section>
      </div>
    </Spin>
  </Modal>
</template>

<style scoped>
.stage-detail-content {
  max-height: calc(100dvh - 170px);
  padding: 2px;
  overflow: auto;
}
</style>
