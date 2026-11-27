<script lang="ts" setup>
import type { Stage } from './model';

import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed } from 'vue';

import { Alert, Button, Descriptions, Empty, Modal, Spin, Tag } from 'ant-design-vue';

import { dateText, num, specText } from '../production-order/shared';
import { TASK_STAGE_LABELS } from '../shared/schedule';
import MixStageTable from './mix-stage-table.vue';
import { deliveryProgress, stageDetails } from './model';
import { quantityText, stateColors, taskStatus } from './stage-detail-format';

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
const mixing = computed(() => props.stage?.code === 'MIX');
const outbound = computed(() => props.stage?.code === 'OUTBOUND');
const stockIn = computed(() => props.stage?.code === 'STOCK_IN');
const logistics = computed(() => outbound.value || stockIn.value);
const sharedTasks = computed(() => details.value?.rows.some(({ step }) => step?.sharedTaskCount));
const products = computed(() => new Map(details.value?.rows.map(({ item }) => [item.id, item])));
const productRows = computed(() => (details.value?.rows ?? []).map((row) => ({
  ...row, progress: deliveryProgress(row.item, outbound.value),
})));
const taskRows = computed(() => (details.value?.rows ?? []).flatMap(({ item, step }) =>
  (step?.tasks ?? []).flatMap((task) => [
    { item, parentId: undefined, task },
    ...(task.children ?? []).map((child) => ({ item, parentId: task.id, task: child })),
  ]),
));
</script>

<template>
  <Modal
    :open="!!details"
    :title="`${stage?.label ?? ''}详情`"
    :z-index="2100"
    centered
    width="min(1280px, calc(100vw - 32px))"
    @cancel="emit('close')"
  >
    <template #footer>
      <Button @click="emit('close')">关闭</Button>
    </template>
    <Spin :spinning="loading">
      <div v-if="details && order" class="stage-detail-content space-y-4">
        <Descriptions bordered size="small" :column="{ xs: 1, sm: 2, lg: 4 }">
          <Descriptions.Item label="生产订单号">{{ order.orderNo }}</Descriptions.Item>
          <Descriptions.Item label="环节状态"><Tag :color="stateColors[details.stage.state]" class="m-0">{{ details.stage.text }}</Tag></Descriptions.Item>
          <Descriptions.Item label="客户">{{ order.customerName || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="order.promisedDate ? '工厂交期' : '需求交期'">{{ dateText(order.promisedDate || order.requiredDate) || '待确认' }}</Descriptions.Item>
        </Descriptions>

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
          <MixStageTable
            v-if="mixing"
            :key="order.id"
            :color-labels="order.colorLabels"
            :rows="details.rows"
          />
          <template v-else>
            <div class="stage-table-wrap">
              <table aria-label="工序产品明细" class="stage-table" :class="logistics ? 'min-w-[740px]' : 'min-w-[1100px]'">
                <thead>
                  <tr>
                    <th scope="col">产品</th>
                    <th scope="col">产品编码</th>
                    <th scope="col">规格</th>
                    <th scope="col">状态</th>
                    <th scope="col" class="amount">订单需求</th>
                    <template v-if="logistics">
                      <th scope="col" class="amount">{{ outbound ? '已出库' : '已交货 / 入库' }}</th>
                      <th scope="col" class="amount">{{ outbound ? '剩余待出库' : '剩余待交货' }}</th>
                      <th v-if="outbound" scope="col" class="amount">库存中心出库</th>
                      <th v-else scope="col">交货阶段</th>
                    </template>
                    <template v-else>
                      <th scope="col">工艺路线</th>
                      <th scope="col">工序产出</th>
                      <th scope="col" class="amount">良品</th>
                      <th scope="col" class="amount">不良品</th>
                      <th scope="col" class="amount">任务达标</th>
                      <th scope="col">工序单（总 / 在制 / 完成）</th>
                      <th scope="col">排单（待领 / 已领 / 合并）</th>
                    </template>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="{ item, progress, stage: lineStage, step } in productRows" :key="item.id">
                    <th scope="row">{{ item.productName }}</th>
                    <td>{{ item.productCode || '—' }}</td>
                    <td>{{ specText(item) || '—' }}</td>
                    <td><Tag :color="stateColors[lineStage.state]" class="m-0">{{ lineStage.text }}</Tag></td>
                    <td class="amount">{{ quantityText(item.quantity, item.unit) }}</td>
                    <template v-if="logistics">
                      <td class="amount">{{ quantityText(progress.actual, item.unit) }}</td>
                      <td class="amount">{{ quantityText(progress.remaining, item.unit) }}</td>
                      <td v-if="outbound" class="amount">{{ num(item.warehouseShippedQuantity) > 0 ? quantityText(item.warehouseShippedQuantity, item.unit) : '—' }}</td>
                      <td v-else>{{ item.deliveryStageLabel || '—' }}</td>
                    </template>
                    <template v-else>
                      <td>{{ item.routeName || '—' }}</td>
                      <td>{{ step?.outputStage ? TASK_STAGE_LABELS[step.outputStage] || '—' : '—' }}</td>
                      <td class="amount">{{ step ? quantityText(step.goodQuantity, step.unit) : '—' }}</td>
                      <td class="amount">{{ step ? quantityText(step.defectQuantity, step.unit) : '—' }}</td>
                      <td class="amount">{{ step?.taskCount ? `${step.completedTaskCount ?? 0} / ${step.taskCount}` : '—' }}</td>
                      <td class="tabular-nums">{{ step ? `${step.orderCount} / ${step.inProgressCount} / ${step.completedOrderCount ?? 0}` : '—' }}</td>
                      <td class="tabular-nums">{{ step?.taskCount ? `${step.pendingTaskCount ?? 0} / ${step.claimedTaskCount ?? 0} / ${step.sharedTaskCount ?? 0}` : '—' }}</td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>
            <section v-if="!logistics && taskRows.length" class="space-y-2">
              <h3 class="mb-0 text-sm font-semibold">排单任务明细</h3>
              <div class="stage-table-wrap">
                <table aria-label="排单任务明细" class="stage-table min-w-[950px]">
                  <thead>
                    <tr>
                      <th scope="col">产品</th>
                      <th scope="col">排单任务</th>
                      <th scope="col">归属原任务</th>
                      <th scope="col">排单日期</th>
                      <th scope="col">状态</th>
                      <th scope="col" class="amount">计划产量</th>
                      <th scope="col" class="amount">已报良品</th>
                      <th scope="col" class="amount">补产后良品</th>
                      <th scope="col" class="amount">剩余缺口</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="{ item, parentId, task } in taskRows" :key="`${item.id}-${task.id}`">
                      <td>{{ item.productName }}</td>
                      <th scope="row">{{ parentId ? '补产任务' : task.children?.length ? '原任务' : '排单任务' }} #{{ task.id }}</th>
                      <td>{{ parentId ? `#${parentId}` : '—' }}</td>
                      <td>{{ dateText(task.workDate) || '—' }}</td>
                      <td><Tag :color="taskStatus(task).color" class="m-0">{{ taskStatus(task).label }}</Tag></td>
                      <td class="amount">{{ quantityText(task.quantity, task.unit) }}</td>
                      <td class="amount">{{ quantityText(task.actualQuantity, task.unit) }}</td>
                      <td class="amount">{{ task.children?.length ? quantityText(task.creditedQuantity, task.unit) : '—' }}</td>
                      <td class="amount">
                        <span v-if="!parentId && num(task.creditedQuantity) < num(task.quantity)" class="font-medium text-warning">{{ quantityText(num(task.quantity) - num(task.creditedQuantity), task.unit) }}</span>
                        <template v-else>—</template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </template>
        </template>

        <section v-if="stockIn && details.rows.length > 0 && (!loading || details.deliveries.length > 0)" class="space-y-2">
          <h3 class="mb-0 text-sm font-semibold">交货 / 入库记录</h3>
          <p v-if="details.deliveries.length === 0" class="mb-0 text-sm text-muted-foreground">当前暂无交货 / 入库记录。</p>
          <div v-else class="stage-table-wrap">
            <table aria-label="交货 / 入库记录" class="stage-table min-w-[1000px]">
              <thead>
                <tr>
                  <th scope="col">交货单号</th>
                  <th scope="col">产品</th>
                  <th scope="col">状态</th>
                  <th scope="col" class="amount">数量</th>
                  <th scope="col">交货日期</th>
                  <th scope="col">经办人</th>
                  <th scope="col">仓库</th>
                  <th scope="col">入库单号</th>
                  <th scope="col">备注</th>
                  <th scope="col">作废原因</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="delivery in details.deliveries" :key="delivery.id">
                  <th scope="row">{{ delivery.deliveryNo }}</th>
                  <td>{{ delivery.productName || products.get(delivery.productionOrderItemId)?.productName || '—' }}</td>
                  <td><Tag :color="delivery.status === 'VOIDED' ? 'default' : 'success'" class="m-0">{{ delivery.status === 'VOIDED' ? '已作废' : delivery.kind === 'FACTORY' ? '已登记完工' : delivery.kind === 'PURCHASE' ? '已入库' : '已交货' }}</Tag></td>
                  <td class="amount">{{ quantityText(delivery.quantity, delivery.unit || products.get(delivery.productionOrderItemId)?.unit) }}</td>
                  <td>{{ dateText(delivery.deliveredDate) || '—' }}</td>
                  <td>{{ delivery.operatorName || '—' }}</td>
                  <td>{{ delivery.warehouseName || '—' }}</td>
                  <td>{{ delivery.stockInCode || '—' }}</td>
                  <td class="whitespace-pre-wrap">{{ delivery.remark || '—' }}</td>
                  <td class="whitespace-pre-wrap">{{ delivery.voidReason || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
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

.stage-table-wrap {
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.stage-table {
  width: 100%;
  font-size: 12px;
  text-align: left;
  border-collapse: collapse;
}

.stage-table thead {
  background: hsl(var(--muted) / 60%);
}

.stage-table :is(th, td) {
  padding: 8px 10px;
  vertical-align: middle;
  overflow-wrap: anywhere;
  border-inline-end: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.stage-table :is(th, td):last-child {
  border-inline-end: 0;
}

.stage-table tbody tr:last-child :is(th, td) {
  border-bottom: 0;
}

.amount {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
