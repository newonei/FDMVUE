<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Alert, Button, Input, message, Modal, Progress, Spin, Tag } from 'ant-design-vue';

import {
  closeScheduleTask,
  confirmSchedule,
  deleteScheduleTask,
  discardSchedule,
  getScheduleFormOptions,
  handleScheduleTaskShortage,
  regenerateSchedule,
  saveScheduleTask,
} from '#/api/fdmgongchang/schedule';

import {
  dateText,
  dayLabel,
  groupByDate,
  PROCESS_LABELS,
  RISK_TYPES,
  SCHEDULE_STATUS,
  TASK_STATUS,
} from '../../shared/schedule';
import PlanEditor from './plan-editor.vue';
import TaskFormModal from './task-form-modal.vue';

/**
 * 一份排单：生成中、失败、待确认（可调整、加任务、带意见重新生成、下发）、已下发（计划 vs 实际，可追加、改人、删任务）。
 * 手动派工的排单没有经过 AI，从空方案开始自己加任务。
 */
const props = defineProps<{
  schedule: Api.Schedule;
  workers: FdmgongchangFactoryApi.Worker[];
}>();
const emit = defineEmits<{ changed: [id?: number]; retry: [schedule: Api.Schedule] }>();

const { hasAccessByCodes } = useAccess();
const canGenerate = computed(() => hasAccessByCodes(['fdmgongchang:schedule:generate']));
const canConfirm = computed(() => hasAccessByCodes(['fdmgongchang:schedule:confirm']));

const tasks = ref<Api.PlanTask[]>([]);
const busy = ref(false);
const feedbackOpen = ref(false);
const feedback = ref('');

watch(
  () => [props.schedule.id, props.schedule.status, props.schedule.plan],
  () => {
    tasks.value = (props.schedule.plan?.tasks ?? []).map((t) => ({
      ...t,
      workerIds: [...(t.workerIds ?? [])],
    }));
  },
  { immediate: true },
);

const status = computed(() => SCHEDULE_STATUS[props.schedule.status]);
const range = computed(() => {
  const start = dateText(props.schedule.startDate);
  const end = new Date(`${start}T00:00:00`);
  end.setDate(end.getDate() + props.schedule.days - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${start} 至 ${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
});
const confirmedGroups = computed(() =>
  groupByDate(props.schedule.tasks ?? [], (t) => dateText(t.workDate)),
);
const noWorker = computed(() => tasks.value.filter((t) => t.workerIds.length === 0).length);

// ========== 手动加任务、改任务 ==========
const formOpen = ref(false);
const formInitial = ref<Api.PlanTask | null>(null);
/** 已下发排单里正在改的任务编号；为空是追加。 */
const editingTaskId = ref<number>();
/** 待确认方案里正在改的那一条。 */
const editingPlanTask = ref<Api.PlanTask>();
const formOptions = ref<Api.FormOptions | null>(null);
const formOptionsFor = ref<number>();

async function ensureOptions() {
  if (formOptionsFor.value === props.schedule.id && formOptions.value) return;
  formOptions.value = await getScheduleFormOptions(props.schedule.id);
  formOptionsFor.value = props.schedule.id;
}

async function openForm(initial: Api.PlanTask | null, taskId?: number, planTask?: Api.PlanTask) {
  await ensureOptions();
  formInitial.value = initial;
  editingTaskId.value = taskId;
  editingPlanTask.value = planTask;
  formOpen.value = true;
}

function editConfirmed(task: Api.Task) {
  void openForm(
    {
      contractCode: task.contractCode,
      date: dateText(task.workDate),
      process: task.process,
      product: task.product,
      quantity: task.quantity,
      reason: task.reason,
      sequence: task.sequence,
      spec: task.spec,
      unit: task.unit,
      workerIds: (task.workerIds ?? '').split(',').filter(Boolean).map(Number),
    },
    task.id,
  );
}

// ========== 接单制：关闭任务、报工差额 ==========
const finished = (task: Api.Task) => task.status === 'DONE' || task.status === 'CLOSED';
/** 「再派一个」补差额的原任务：追加成功后记成已补派。 */
const resendFor = ref<Api.Task>();

/** 补派默认今天；排单范围已经过了就放在最后一天（超出范围的要另开一份手动派工）。 */
function resendDate() {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = range.value.slice(-10);
  return today > end ? end : today;
}

function resend(task: Api.Task) {
  resendFor.value = task;
  void openForm({
    contractCode: task.contractCode,
    date: resendDate(),
    process: task.process,
    product: task.product,
    quantity: Number(task.shortage),
    reason: `补 ${dateText(task.workDate)} 报工差额`,
    sequence: null,
    spec: task.spec,
    unit: task.unit,
    workerIds: [],
  });
}

function dropShortage(task: Api.Task) {
  Modal.confirm({
    content: `差的 ${Number(task.shortage)} ${task.unit ?? ''} 不再安排生产。`,
    okText: '不补了',
    title: '不补这个差额？',
    onOk: async () => {
      await handleScheduleTaskShortage({ id: task.id, note: '不补了' });
      message.success('已处理');
      emit('changed', props.schedule.id);
    },
  });
}

const closeOpen = ref(false);
const closeReason = ref('');
const closing = ref<Api.Task>();
function openClose(task: Api.Task) {
  closing.value = task;
  closeReason.value = '';
  closeOpen.value = true;
}
async function submitClose() {
  if (!closing.value) return;
  if (!closeReason.value.trim()) {
    message.warning('请写关闭原因');
    return;
  }
  busy.value = true;
  try {
    await closeScheduleTask({ id: closing.value.id, note: closeReason.value.trim() });
    closeOpen.value = false;
    message.success('任务已关闭');
    emit('changed', props.schedule.id);
  } finally {
    busy.value = false;
  }
}

async function submitForm(task: Api.PlanTask) {
  if (props.schedule.status === 'DRAFT') {
    // 待确认：只改本地方案，下发时一起校验
    const workerNames = task.workerIds.map((id) => props.workers.find((w) => w.userId === id)?.nickname ?? String(id));
    const next = { ...task, workerNames };
    tasks.value = editingPlanTask.value
      ? tasks.value.map((t) => (t === editingPlanTask.value ? next : t))
      : [...tasks.value, next];
    return;
  }
  await saveScheduleTask({ id: editingTaskId.value, scheduleId: props.schedule.id, task });
  if (resendFor.value && !editingTaskId.value) {
    await handleScheduleTaskShortage({ id: resendFor.value.id, note: `已补派 ${Number(task.quantity)}` });
  }
  resendFor.value = undefined;
  message.success(editingTaskId.value ? '任务已修改，工人工作台马上能看到' : '任务已追加，工人工作台马上能看到');
  emit('changed', props.schedule.id);
}

function removeConfirmed(task: Api.Task) {
  Modal.confirm({
    content: '删掉后这个任务不再出现在工人工作台；已经有工序单关联的任务不能删。',
    okButtonProps: { danger: true },
    okText: '删除',
    onOk: async () => {
      await deleteScheduleTask(props.schedule.id, task.id);
      message.success('任务已删除');
      emit('changed', props.schedule.id);
    },
    title: `删除 ${dayLabel(dateText(task.workDate))} 的${PROCESS_LABELS[task.process] ?? task.process}任务？`,
  });
}

function percent(task: Api.Task) {
  const plan = Number(task.quantity);
  return plan > 0 ? Math.min(100, Math.round((Number(task.actualQuantity) / plan) * 100)) : 0;
}

async function confirm() {
  if (tasks.value.length === 0) {
    message.warning('请至少保留一个任务再下发');
    return;
  }
  busy.value = true;
  try {
    await confirmSchedule({ id: props.schedule.id, tasks: tasks.value });
    message.success(`${props.schedule.scheduleNo} 已下发，开工序单时可以关联这些任务`);
    emit('changed', props.schedule.id);
  } finally {
    busy.value = false;
  }
}

async function regenerate() {
  if (!feedback.value.trim()) {
    message.warning('请写一下要怎么调整');
    return;
  }
  busy.value = true;
  try {
    const id = await regenerateSchedule({ feedback: feedback.value.trim(), id: props.schedule.id });
    feedbackOpen.value = false;
    feedback.value = '';
    message.success('已按意见重新生成，AI 正在排单');
    emit('changed', id);
  } finally {
    busy.value = false;
  }
}

function discard() {
  Modal.confirm({
    content: '作废后这份排单不能再下发；已下发的任务不再出现在开工序单的关联列表里。',
    okButtonProps: { danger: true },
    okText: '作废',
    onOk: async () => {
      await discardSchedule(props.schedule.id);
      message.success(`${props.schedule.scheduleNo} 已作废`);
      emit('changed', props.schedule.id);
    },
    title: `作废 ${props.schedule.scheduleNo}？`,
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="m-0 font-mono text-base font-semibold">{{ schedule.scheduleNo }}</h2>
          <Tag :color="status.color" class="m-0">{{ status.label }}</Tag>
          <Tag v-if="schedule.manual" class="m-0" color="purple">手动派工</Tag>
          <Tag v-if="schedule.revision > 1" class="m-0">第 {{ schedule.revision }} 版</Tag>
        </div>
        <span class="text-xs text-muted-foreground">
          {{ range }} · {{ schedule.operatorName || '—' }} · {{ formatDateTime(schedule.createTime ?? undefined) }}
          <template v-if="schedule.confirmedBy"> · {{ schedule.confirmedBy }} 下发</template>
        </span>
        <span v-if="schedule.scopeOrderNos?.length" class="text-xs text-primary">只排这几张工厂订单：{{ schedule.scopeOrderNos.join('、') }}</span>
        <span v-if="schedule.note" class="text-xs">补充说明：{{ schedule.note }}</span>
        <span v-if="schedule.feedback" class="text-xs">调整意见：{{ schedule.feedback }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <template v-if="schedule.status === 'DRAFT'">
          <Button v-if="canConfirm" :disabled="busy" @click="openForm(null)">＋ 添加任务</Button>
          <Button v-if="canGenerate && !schedule.manual" :disabled="busy" @click="feedbackOpen = true">带意见重新生成</Button>
          <Button v-if="canConfirm" :loading="busy" type="primary" @click="confirm">确认下发</Button>
        </template>
        <Button v-if="schedule.status === 'CONFIRMED' && canConfirm" @click="openForm(null)">＋ 追加任务</Button>
        <Button v-if="schedule.status === 'FAILED' && canGenerate" type="primary" @click="emit('retry', schedule)">
          重新生成
        </Button>
        <Button
          v-if="canGenerate && ['CONFIRMED', 'DRAFT', 'FAILED', 'GENERATING'].includes(schedule.status)"
          danger
          type="link"
          @click="discard"
        >
          作废
        </Button>
      </div>
    </header>

    <div v-if="schedule.status === 'GENERATING'" class="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
      <Spin />
      AI 正在根据订单、库存、在制和人员排单，一般 1–2 分钟，页面会自动刷新。
    </div>
    <Alert v-else-if="schedule.status === 'FAILED'" :message="schedule.errorMessage || '生成失败'" show-icon type="error" />

    <template v-if="schedule.plan">
      <p v-if="schedule.plan.summary" class="m-0 rounded-md bg-muted/40 p-3 text-sm">{{ schedule.plan.summary }}</p>
      <div v-if="schedule.plan.risks.length > 0" class="flex flex-col gap-2">
        <Alert
          v-for="(risk, i) in schedule.plan.risks"
          :key="i"
          :description="risk.detail"
          :message="risk.title"
          :type="RISK_TYPES[risk.level] ?? 'warning'"
          show-icon
        />
      </div>
      <Alert
        v-if="schedule.plan.warnings.length > 0"
        :message="`系统校验时调整了 ${schedule.plan.warnings.length} 处`"
        show-icon
        type="info"
      >
        <template #description>
          <ul class="m-0 list-disc pl-4 text-xs">
            <li v-for="w in schedule.plan.warnings" :key="w">{{ w }}</li>
          </ul>
        </template>
      </Alert>
    </template>

    <template v-if="schedule.status === 'DRAFT'">
      <p v-if="noWorker > 0" class="m-0 text-xs text-warning">{{ noWorker }} 个任务还没排人，下发后进工人工作台的任务大厅，有这道工序岗位的人可以抢单；要指定人就在下发前补上。</p>
      <p v-if="schedule.manual && tasks.length === 0" class="m-0 text-sm text-muted-foreground">
        手动派工：点右上角「＋ 添加任务」，选哪天、哪道工序、做多少、谁来做；加完点「确认下发」，工人工作台就能看到。
      </p>
      <PlanEditor
        v-else
        v-model:tasks="tasks"
        :editable="canConfirm"
        :workers="workers"
        @edit="(t) => openForm({ ...t, workerIds: [...t.workerIds] }, undefined, t)"
      />
    </template>

    <template v-else-if="schedule.status === 'CONFIRMED' || (schedule.status === 'DISCARDED' && (schedule.tasks ?? []).length > 0)">
      <section v-for="[date, list] in confirmedGroups" :key="date" class="flex flex-col gap-2">
        <h4 class="m-0 text-sm font-semibold">{{ dayLabel(date) }}</h4>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div v-for="task in list" :key="task.id" class="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <b>{{ task.sequence }}. {{ PROCESS_LABELS[task.process] ?? task.process }}</b>
              <span class="flex items-center gap-1.5">
                <Tag v-if="task.status" :color="TASK_STATUS[task.status].color" class="m-0">{{ TASK_STATUS[task.status].label }}</Tag>
                <span class="font-mono text-xs">{{ task.contractCode || '备货' }}</span>
              </span>
            </div>
            <div class="text-xs text-muted-foreground">{{ [task.product, task.spec].filter(Boolean).join(' · ') }}</div>
            <div class="text-xs">
              {{ task.workerNames || (task.status === 'OPEN' ? '待领取，工人在工作台抢单' : '未排人') }}
              <span v-if="task.plannedQuantity" class="text-muted-foreground">· 排单 {{ Number(task.plannedQuantity) }}，接单时按上道良品改成 {{ Number(task.quantity) }}</span>
            </div>
            <div v-if="task.shortage" class="flex flex-wrap items-center justify-between gap-2 rounded bg-warning/10 px-2 py-1 text-xs text-warning">
              <span>报工差 {{ Number(task.shortage) }} {{ task.unit }}，待处理</span>
              <span v-if="canConfirm && schedule.status === 'CONFIRMED'" class="flex gap-1">
                <Button size="small" type="link" @click="resend(task)">再派一个</Button>
                <Button size="small" type="link" @click="dropShortage(task)">不补了</Button>
              </span>
            </div>
            <div v-else-if="task.shortageNote" class="text-xs text-muted-foreground">差额：{{ task.shortageNote }}</div>
            <div v-if="task.closedReason" class="text-xs text-muted-foreground">关闭原因：{{ task.closedReason }}</div>
            <div class="flex items-center gap-2">
              <Progress :percent="percent(task)" :show-info="false" class="m-0 flex-1" size="small" />
              <span class="whitespace-nowrap text-xs tabular-nums">
                实际 {{ Number(task.actualQuantity) }} / 计划 {{ Number(task.quantity) }} {{ task.unit }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{{ task.orderCount }} 张工序单关联</span>
              <span v-if="schedule.status === 'CONFIRMED' && canConfirm" class="flex gap-1">
                <template v-if="!finished(task)">
                  <Button size="small" type="link" @click="editConfirmed(task)">{{ task.status === 'OPEN' ? '派单 / 改量' : '改派 / 改量' }}</Button>
                  <Button size="small" type="link" @click="openClose(task)">关闭</Button>
                </template>
                <Button v-if="task.orderCount === 0 && task.status !== 'DONE'" danger size="small" type="link" @click="removeConfirmed(task)">删</Button>
              </span>
            </div>
          </div>
        </div>
      </section>
    </template>
    <PlanEditor v-else-if="schedule.status === 'DISCARDED' && schedule.plan" v-model:tasks="tasks" :editable="false" :workers="workers" />

    <p v-if="schedule.status === 'CONFIRMED' && (schedule.tasks ?? []).length === 0" class="m-0 text-sm text-muted-foreground">
      这份排单的任务都删完了，可以点「＋ 追加任务」。
    </p>

    <TaskFormModal
      v-model:open="formOpen"
      :initial="formInitial"
      :options="formOptions"
      :schedule="schedule"
      :submit="submitForm"
      :workers="workers"
    />

    <Modal v-model:open="closeOpen" :confirm-loading="busy" ok-text="关闭任务" title="关闭任务" @ok="submitClose">
      <p class="m-0 mb-2 text-xs text-muted-foreground">关闭后任务不再出现在工人工作台，也不能再报工。</p>
      <Input id="task-close-reason" v-model:value="closeReason" :maxlength="200" placeholder="原因，例如：订单取消、排错了" />
    </Modal>

    <Modal v-model:open="feedbackOpen" :confirm-loading="busy" ok-text="重新生成" title="带意见重新生成" @ok="regenerate">
      <p class="m-0 mb-2 text-xs text-muted-foreground">写清楚要怎么改，AI 会参考这一版方案重新排，这一版作废。</p>
      <Input.TextArea
        id="schedule-feedback"
        v-model:value="feedback"
        :maxlength="500"
        :rows="4"
        placeholder="例如：开片每天最多 300 片；张三周三请假；先做 HT-001"
      />
    </Modal>
  </div>
</template>
