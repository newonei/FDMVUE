<script lang="ts" setup>
import type { stageDetails } from './model';

import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed, ref } from 'vue';

import { Button, Tag } from 'ant-design-vue';

import { dateText, num, specText } from '../production-order/shared';
import { TASK_STAGE_LABELS } from '../shared/schedule';
import { sizeText } from '../stage-stock/model';
import { quantityText, stateColors, taskStatus } from './stage-detail-format';

const props = defineProps<{
  colorLabels?: Api.Order['colorLabels'];
  rows: ReturnType<typeof stageDetails>['rows'];
}>();

const expandedItems = ref(new Set<number>());
const boardSides: Record<string, string> = {
  BACK: '反面层',
  BOTH: '正反同规格层',
  FRONT: '正面层',
};

const rows = computed(() => props.rows.map((row) => {
  const tasks = (row.step?.tasks ?? []).flatMap((task) => [
    { supplement: false, task },
    ...(task.children ?? []).map((child) => ({ supplement: true, task: child })),
  ]);
  const boardColors = [...new Set(tasks.map(({ task }) => boardColorText(task)).filter(Boolean))];
  return { ...row, boardColors, tasks };
}));

function colorText(value?: null | string) {
  return value ? props.colorLabels?.[value] || value : '';
}

function finishedColor(item: Api.Item) {
  const front = colorText(item.targetFrontColor);
  const back = colorText(item.targetBackColor);
  const hasDifferentColors = front && back && front !== back;
  if ((item.targetColorMode === 'DUAL' && (front || back)) || hasDifferentColors) {
    return `正面 ${front || '—'} / 反面 ${back || '—'}`;
  }
  return front || back || colorText(item.color) || '—';
}

function finishedSpec(item: Api.Item) {
  const { targetLength, targetWidth, targetThickness } = item;
  const size = targetLength && targetWidth && targetThickness
    ? sizeText({ length: targetLength, thickness: targetThickness, width: targetWidth }, 'mm')
    : item.size;
  return specText({ material: item.targetMaterial || item.material, size, specification: item.specification }) || '—';
}

function boardColorText(task: Api.StepTask) {
  const color = colorText(task.boardColor);
  const side = task.boardSide && boardSides[task.boardSide];
  return color && (side ? `${side} ${color}` : color);
}

function toggleItem(id: number) {
  if (expandedItems.value.has(id)) expandedItems.value.delete(id);
  else expandedItems.value.add(id);
}
</script>

<template>
  <div aria-label="发泡成品表格" role="region" tabindex="0" class="overflow-x-auto rounded-lg border border-border">
    <table aria-label="发泡成品明细" class="mix-table min-w-[980px]">
      <thead>
        <tr>
          <th scope="col" class="w-[20%]">成品</th>
          <th scope="col" class="w-[15%]">成品规格</th>
          <th scope="col" class="w-[12%]">成品颜色</th>
          <th scope="col" class="w-[16%]">板材颜色</th>
          <th scope="col" class="amount">订单需求</th>
          <th scope="col" class="amount">良品</th>
          <th scope="col" class="amount">不良品</th>
          <th scope="col" class="whitespace-nowrap">工序状态</th>
          <th scope="col" class="whitespace-nowrap">明细</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="{ boardColors, item, stage, step, tasks } in rows" :key="item.id">
          <tr>
            <th scope="row">
              <span class="block break-words font-semibold">{{ item.productName }}</span>
              <span v-if="item.productCode" class="mt-1 block break-words font-normal text-muted-foreground">{{ item.productCode }}</span>
            </th>
            <td class="break-words">{{ finishedSpec(item) }}</td>
            <td class="break-words">{{ finishedColor(item) }}</td>
            <td>
              <div v-for="color in boardColors" :key="color" class="break-words">{{ color }}</div>
              <span v-if="boardColors.length === 0" class="text-muted-foreground">—</span>
            </td>
            <td class="amount">{{ quantityText(item.quantity, item.unit) }}</td>
            <td class="amount">{{ step ? quantityText(step.goodQuantity, step.unit) : '—' }}</td>
            <td class="amount">{{ step ? quantityText(step.defectQuantity, step.unit) : '—' }}</td>
            <td>
              <Tag :color="stateColors[stage.state]" class="m-0">{{ stage.text }}</Tag>
              <div v-if="step?.taskCount" class="mt-1 whitespace-nowrap text-muted-foreground">
                达标 {{ step.completedTaskCount ?? 0 }} / {{ step.taskCount }}
              </div>
            </td>
            <td>
              <Button
                type="link"
                size="small"
                :aria-expanded="expandedItems.has(item.id)"
                class="px-0 text-xs"
                @click="toggleItem(item.id)"
              >
                {{ expandedItems.has(item.id) ? '收起明细' : '查看明细' }}
              </Button>
            </td>
          </tr>
          <tr v-if="expandedItems.has(item.id)" class="bg-muted/30">
            <td colspan="9">
              <div class="space-y-2 py-1">
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span v-if="item.routeName">工艺路线 {{ item.routeName }}</span>
                  <span v-if="step?.outputStage && TASK_STAGE_LABELS[step.outputStage]">工序产出 {{ TASK_STAGE_LABELS[step.outputStage] }}</span>
                  <span v-if="step?.orderCount">工序单 共 {{ step.orderCount }} 张 · 在制 {{ step.inProgressCount }} 张 · 已完成 {{ step.completedOrderCount ?? 0 }} 张</span>
                  <span v-if="step?.taskCount">
                    排单任务 待领取 {{ step.pendingTaskCount ?? 0 }} 个 · 已领取 {{ step.claimedTaskCount ?? 0 }} 个<template v-if="step.sharedTaskCount"> · 合并生产 {{ step.sharedTaskCount }} 个</template>
                  </span>
                </div>
                <div v-if="tasks.length" class="rounded-md border border-border bg-background">
                  <table aria-label="排单任务明细" class="mix-table">
                    <thead>
                      <tr>
                        <th scope="col">排单任务</th>
                        <th scope="col">板材颜色</th>
                        <th scope="col">排单日期</th>
                        <th scope="col">状态</th>
                        <th scope="col" class="amount">计划产量</th>
                        <th scope="col" class="amount">已报良品</th>
                        <th scope="col" class="amount">补产后良品</th>
                        <th scope="col" class="amount">剩余缺口</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="{ supplement, task } in tasks" :key="task.id">
                        <th scope="row" :class="supplement ? 'font-normal text-muted-foreground' : 'font-semibold'">
                          <span :class="{ 'pl-3': supplement }">{{ supplement ? '补产任务' : task.children?.length ? '原任务' : '排单任务' }} #{{ task.id }}</span>
                        </th>
                        <td>{{ boardColorText(task) || '—' }}</td>
                        <td>{{ dateText(task.workDate) || '—' }}</td>
                        <td><Tag :color="taskStatus(task).color" class="m-0">{{ taskStatus(task).label }}</Tag></td>
                        <td class="amount">{{ quantityText(task.quantity, task.unit) }}</td>
                        <td class="amount">{{ quantityText(task.actualQuantity, task.unit) }}</td>
                        <td class="amount">{{ task.children?.length ? quantityText(task.creditedQuantity, task.unit) : '—' }}</td>
                        <td class="amount">
                          <span v-if="!supplement && num(task.creditedQuantity) < num(task.quantity)" class="font-medium text-warning">
                            {{ quantityText(num(task.quantity) - num(task.creditedQuantity), task.unit) }}
                          </span>
                          <template v-else>—</template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="m-0 text-muted-foreground">
                  {{ step?.taskCount || step?.orderCount ? '暂无可显示的排单任务明细。' : '尚未下发排单任务，也没有关联工序单。' }}
                </p>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.mix-table {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  border-collapse: collapse;
}

.mix-table > thead {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 60%);
}

.mix-table > :is(thead, tbody) > tr > :is(th, td) {
  padding: 8px 10px;
  vertical-align: top;
  border-bottom: 1px solid hsl(var(--border));
}

.mix-table > tbody > tr:last-child > :is(th, td) {
  border-bottom: 0;
}

.amount {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
