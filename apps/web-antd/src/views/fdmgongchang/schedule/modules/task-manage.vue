<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Button, Checkbox, DatePicker, Empty, Input, message, Modal, Progress, Select, Spin, Tag } from 'ant-design-vue';

import { getWorkerList } from '#/api/fdmgongchang/factory';
import { listScheduleTasks, reassignScheduleTasks, returnScheduleTasksToHall } from '#/api/fdmgongchang/schedule';

import { factoryToday } from '../../shared/factory-date';
import { dateText, dayLabel, PROCESS_LABELS, TASK_STATUS, taskMaterialText } from '../../shared/schedule';
import { formatQty } from '../../stage-stock/model';
import TaskMaterials from './task-materials.vue';

/**
 * 任务管理：同订单跨日期、跨排单合并，整单进度由服务端按全部已下发任务统计；
 * 筛选仅决定显示哪些订单及任务明细，不截断整单进度。
 * 勾选多个改派（如某人请假，把他的活派给别人，改派即派单）或退回任务大厅让人重新抢。
 * 单个任务改量、关闭、处理差额在所属排单里做，点排单号过去。
 */
const props = defineProps<{ factoryId: number }>();
const emit = defineEmits<{ openSchedule: [id: number] }>();

const { hasAccessByCodes } = useAccess();
const canEdit = computed(() => hasAccessByCodes(['fdmgongchang:schedule:confirm']));

const range = ref<[Dayjs, Dayjs]>([factoryToday(), factoryToday().add(6, 'day')]);
const process = ref<string>();
const status = ref<Api.TaskStatus>();
const workerId = ref<number>();
const keyword = ref('');
const tasks = ref<Api.Task[]>([]);
const workers = ref<FdmgongchangFactoryApi.Worker[]>([]);
const loading = ref(false);
const selected = ref<number[]>([]);

const processOptions = Object.entries(PROCESS_LABELS).map(([value, label]) => ({ label, value }));
const statusOptions = Object.entries(TASK_STATUS).map(([value, s]) => ({ label: s.label, value }));
const workerLabel = (w: FdmgongchangFactoryApi.Worker) => [w.nickname, w.team].filter(Boolean).join(' · ');
const workerOptions = computed(() => workers.value.map((w) => ({ label: workerLabel(w), value: w.userId })));
const groups = computed(() => {
  const grouped = new Map<string, { contractCode: string; key: string; tasks: Api.Task[] }>();
  for (const task of tasks.value) {
    const contractCode = task.contractCode?.trim() ?? '';
    const key = contractCode ? `order:${contractCode}` : `task:${task.id}`;
    const group = grouped.get(key) ?? { contractCode, key, tasks: [] };
    group.tasks.push(task);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => ({
    ...group,
    products: [...new Set(group.tasks.map((task) => task.product?.trim()).filter(Boolean))].join('、'),
    progress: group.tasks.find((task) => task.orderProgress)?.orderProgress,
  }));
});
const selectedTasks = computed(() => tasks.value.filter((t) => selected.value.includes(t.id)));
const nameOf = (id: number) => workers.value.find((w) => w.userId === id)?.nickname ?? String(id);
const idsOf = (t: Api.Task) => (t.workerIds ?? '').split(',').filter(Boolean).map(Number);
/** 报工、关闭了的任务不能再改派或退回。 */
const manageable = (t: Api.Task) => t.status === 'OPEN' || t.status === 'CLAIMED';
/** 选中里能退回大厅的：派了人、还没有工序单。 */
const returnable = computed(() => selectedTasks.value.filter((t) => idsOf(t).length > 0 && !t.orderCount));

async function load() {
  loading.value = true;
  try {
    tasks.value = await listScheduleTasks({
      from: range.value[0].format('YYYY-MM-DD'),
      keyword: keyword.value.trim() || undefined,
      process: process.value,
      status: status.value,
      to: range.value[1].format('YYYY-MM-DD'),
      workerId: workerId.value,
    });
    selected.value = selected.value.filter((id) => tasks.value.some((t) => t.id === id && manageable(t)));
  } finally {
    loading.value = false;
  }
}

async function loadWorkers() {
  workers.value = await getWorkerList({ assigned: true, status: 0 }).catch(() => []);
}

onMounted(() => Promise.all([load(), loadWorkers()]));
watch([range, process, status, workerId], load);
watch(
  () => props.factoryId,
  () => {
    selected.value = [];
    void Promise.all([load(), loadWorkers()]);
  },
);

function percent(task: Pick<Api.Task, 'actualQuantity' | 'quantity'>) {
  const plan = Number(task.quantity);
  return plan > 0 ? Math.min(100, Math.round((Number(task.actualQuantity) / plan) * 100)) : 0;
}

function toggle(id: number, checked: boolean) {
  selected.value = checked ? [...selected.value, id] : selected.value.filter((x) => x !== id);
}
function toggleGroup(list: Api.Task[], checked: boolean) {
  const ids = new Set(list.filter((t) => manageable(t)).map((t) => t.id));
  selected.value = checked
    ? [...new Set([...selected.value, ...ids])]
    : selected.value.filter((id) => !ids.has(id));
}

// ========== 改派 ==========
const reassignOpen = ref(false);
const fromWorker = ref<number>();
const toWorkers = ref<number[]>([]);
const busy = ref(false);
/** 选中的任务里出现过的人，「把谁换掉」从这里选。 */
const fromOptions = computed(() =>
  [...new Set(selectedTasks.value.flatMap(idsOf))].map((id) => ({ label: nameOf(id), value: id })),
);
/** 派给的人要有选中任务的全部工序岗位。 */
const toOptions = computed(() => {
  const need = new Set(selectedTasks.value.map((t) => t.process));
  return workers.value
    .filter((w) => [...need].every((p) => w.posts.includes(p)))
    .map((w) => ({ label: workerLabel(w), value: w.userId }));
});

function openReassign() {
  fromWorker.value = workerId.value && fromOptions.value.some((o) => o.value === workerId.value) ? workerId.value : undefined;
  toWorkers.value = [];
  reassignOpen.value = true;
}

async function reassign() {
  if (toWorkers.value.length === 0) {
    message.warning('请选择派给谁');
    return;
  }
  busy.value = true;
  try {
    const n = await reassignScheduleTasks({
      fromWorkerId: fromWorker.value,
      taskIds: selected.value,
      toWorkerIds: toWorkers.value,
    });
    message.success(n > 0 ? `已改派 ${n} 个任务，工人工作台马上能看到` : '选中的任务里没有要换的人');
    reassignOpen.value = false;
    selected.value = [];
    await load();
  } finally {
    busy.value = false;
  }
}

// ========== 退回任务大厅 ==========
function returnToHall() {
  const list = returnable.value;
  Modal.confirm({
    content: '退回后任务去掉人员、改回待领取，数量恢复成排单时的数，有这道工序岗位的人可以在任务大厅重新抢；已经有工序单的任务不能退。',
    okText: '退回任务大厅',
    onOk: async () => {
      const n = await returnScheduleTasksToHall(list.map((t) => t.id));
      message.success(`已退回 ${n} 个任务`);
      selected.value = [];
      await load();
    },
    title: `把 ${list.length} 个任务退回任务大厅？`,
  });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <DatePicker.RangePicker v-model:value="range" :allow-clear="false" aria-label="日期范围" class="w-64" size="small" />
      <Select
        v-model:value="process"
        :options="processOptions"
        allow-clear
        aria-label="工序"
        class="w-32"
        placeholder="全部工序"
        size="small"
      />
      <Select
        v-model:value="status"
        :options="statusOptions"
        allow-clear
        aria-label="任务状态"
        class="w-28"
        placeholder="全部任务状态"
        size="small"
      />
      <Select
        v-model:value="workerId"
        :options="workerOptions"
        allow-clear
        aria-label="人员"
        class="w-40"
        option-filter-prop="label"
        placeholder="全部人员"
        show-search
        size="small"
      />
      <Input.Search
        v-model:value="keyword"
        aria-label="订单号或产品"
        class="w-52"
        placeholder="订单号或产品"
        size="small"
        @search="load"
      />
      <span class="flex-1"></span>
      <template v-if="canEdit">
        <span v-if="selected.length > 0" class="text-xs text-muted-foreground">已选 {{ selected.length }} 个任务</span>
        <Button :disabled="returnable.length === 0" size="small" @click="returnToHall">退回任务大厅</Button>
        <Button :disabled="selected.length === 0" size="small" type="primary" @click="openReassign">改派</Button>
      </template>
    </div>

    <Spin :spinning="loading">
      <Empty v-if="tasks.length === 0" description="这段时间没有已下发的任务" />
      <p v-if="groups.length" class="mb-3 text-xs text-muted-foreground">
        同订单合并展示，进度累计该订单全部已下发有效任务的良品数量；各已下发工序分别达标后，订单显示已完成。下方任务明细保留当前筛选范围。
      </p>
      <section v-for="group in groups" :key="group.key" :data-order-key="group.key" class="mb-4 overflow-hidden rounded-lg border border-border bg-card">
        <header class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-muted/30 px-3 py-3">
          <Checkbox
            v-if="canEdit && group.tasks.some(manageable)"
            :aria-label="`选中 ${group.contractCode || '备货'} 当前筛选内全部可改的任务`"
            :checked="group.tasks.filter(manageable).every((t) => selected.includes(t.id))"
            :indeterminate="group.tasks.some((t) => selected.includes(t.id)) && !group.tasks.filter(manageable).every((t) => selected.includes(t.id))"
            @change="(e) => toggleGroup(group.tasks, e.target.checked)"
          />
          <h4 class="m-0 font-mono text-sm font-semibold">{{ group.contractCode || '备货 / 未关联订单' }}</h4>
          <Tag v-if="group.contractCode && group.progress" :color="group.progress.completed ? 'success' : 'processing'" class="m-0">
            {{ group.progress.completed ? '订单已完成' : '订单进行中' }}
          </Tag>
          <Tag v-else-if="group.contractCode" class="m-0">订单进度待加载</Tag>
          <span class="ml-auto text-xs text-muted-foreground">
            <template v-if="group.progress">共 {{ group.progress.taskCount }} 个有效任务 · </template>
            当前筛选 {{ group.tasks.length }} 个任务
          </span>
          <div v-if="group.products" class="w-full text-xs text-muted-foreground">关联产品：{{ group.products }}</div>
        </header>

        <div v-if="group.progress" class="px-3 pb-2 pt-1">
          <table class="w-full text-sm">
            <thead class="text-xs text-muted-foreground">
              <tr>
                <th class="w-28 py-2 text-left font-medium">工序</th>
                <th class="py-2 pr-4 text-left font-medium">已报工 / 任务数量</th>
                <th class="w-32 py-2 text-left font-medium">工序状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in group.progress.processes" :key="`${item.process}:${item.unit ?? ''}`" :data-process-key="`${item.process}:${item.unit ?? ''}`" class="border-t border-border">
                <td class="py-2 font-medium">{{ PROCESS_LABELS[item.process] ?? item.process }}</td>
                <td class="py-2 pr-4">
                  <div class="flex items-center gap-3">
                    <Progress :percent="percent(item)" :status="item.completed ? 'success' : 'normal'" :show-info="false" class="m-0 max-w-72 flex-1" size="small" />
                    <span class="whitespace-nowrap text-xs tabular-nums">{{ formatQty(item.actualQuantity) }} / {{ formatQty(item.quantity) }} {{ item.unit }}</span>
                  </div>
                  <div v-if="!item.completed && Number(item.quantity) > 0 && Number(item.actualQuantity) >= Number(item.quantity)" class="text-xs text-muted-foreground">部分产品任务尚未达标</div>
                </td>
                <td class="py-2">
                  <Tag :color="item.completed ? 'success' : Number(item.actualQuantity) > 0 ? 'processing' : 'default'" class="m-0">
                    {{ item.completed ? '已完成' : Number(item.actualQuantity) > 0 ? '进行中' : '未开始' }}
                  </Tag>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="group.progress.note" class="mb-1 mt-2 text-xs text-warning">{{ group.progress.note }}</p>
        </div>

        <details class="border-t border-border" :open="!group.progress">
          <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">任务明细（{{ group.tasks.length }}） · 查看领料、人员和来源排单</summary>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[1000px] text-sm">
              <thead class="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th v-if="canEdit" class="w-8 px-2 py-1.5"></th>
                  <th class="px-2 py-1.5 text-left font-medium">日期</th>
                  <th class="px-2 py-1.5 text-left font-medium">工序</th>
                  <th class="px-2 py-1.5 text-left font-medium">产品 / 领料产出</th>
                  <th class="w-56 px-2 py-1.5 text-left font-medium">进度（良品 / 任务）</th>
                  <th class="px-2 py-1.5 text-left font-medium">任务状态</th>
                  <th class="px-2 py-1.5 text-left font-medium">人员</th>
                  <th class="px-2 py-1.5 text-left font-medium">来自排单</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in group.tasks" :key="task.id" class="border-t border-border align-top">
                  <td v-if="canEdit" class="px-2 py-1.5">
                    <Checkbox
                      v-if="manageable(task)"
                      :aria-label="`选中 ${PROCESS_LABELS[task.process] ?? task.process} 任务`"
                      :checked="selected.includes(task.id)"
                      @change="(e) => toggle(task.id, e.target.checked)"
                    />
                  </td>
                  <td class="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">{{ dateText(task.workDate) ? dayLabel(dateText(task.workDate)) : '未定日期' }}</td>
                  <td class="whitespace-nowrap px-2 py-1.5">{{ task.sequence }}. {{ PROCESS_LABELS[task.process] ?? task.process }}</td>
                  <td class="px-2 py-1.5">
                    <div class="text-xs text-muted-foreground">关联产品：{{ task.product || '备货' }}</div>
                    <TaskMaterials v-if="task.output || task.inputs?.length" :task="task" class="mt-0.5" />
                    <div v-else class="text-xs">产出：{{ taskMaterialText(task.output, task.spec) }}</div>
                  </td>
                  <td class="px-2 py-1.5">
                    <div class="flex items-center gap-2">
                      <Progress :percent="percent(task)" :show-info="false" class="m-0 flex-1" size="small" />
                      <span class="whitespace-nowrap text-xs tabular-nums">
                        {{ formatQty(task.actualQuantity ?? 0) }} / {{ formatQty(task.quantity) }} {{ task.unit }}
                      </span>
                    </div>
                    <div v-if="task.shortage" class="text-xs text-warning">差 {{ Number(task.shortage) }} 待处理</div>
                  </td>
                  <td class="px-2 py-1.5">
                    <Tag v-if="task.status" :color="TASK_STATUS[task.status].color" class="m-0">{{ TASK_STATUS[task.status].label }}</Tag>
                    <div v-if="task.closedReason" class="text-xs text-muted-foreground">{{ task.closedReason }}</div>
                  </td>
                  <td class="px-2 py-1.5 text-xs">
                    <span v-if="task.workerNames">{{ task.workerNames }}</span>
                    <span v-else class="text-muted-foreground">任务大厅等人抢</span>
                  </td>
                  <td class="px-2 py-1.5">
                    <button class="font-mono text-xs text-primary hover:underline" type="button" @click="emit('openSchedule', task.scheduleId)">
                      {{ task.scheduleNo }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </Spin>

    <Modal v-model:open="reassignOpen" :confirm-loading="busy" :title="`改派 · ${selected.length} 个任务`" ok-text="改派" @ok="reassign">
      <div class="flex flex-col gap-3 text-xs text-muted-foreground">
        <label for="reassign-from" class="flex flex-col gap-1">
          把谁换掉（不选就是把这些任务的人员整个换掉）
          <Select id="reassign-from" v-model:value="fromWorker" :options="fromOptions" allow-clear placeholder="例如请假的人" />
        </label>
        <label for="reassign-to" class="flex flex-col gap-1">
          派给谁（只列有这些任务全部工序岗位的人）
          <Select
            id="reassign-to"
            v-model:value="toWorkers"
            :options="toOptions"
            mode="multiple"
            option-filter-prop="label"
            placeholder="选人"
          />
        </label>
        <p class="m-0">改派即派单：任务直接进新人员的「我的任务」，不经过任务大厅；已经开的工序单不受影响。</p>
      </div>
    </Modal>
  </div>
</template>
