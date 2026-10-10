<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Alert, Button, Input, message, Modal, Progress, Spin, Tag } from 'ant-design-vue';

import {
  confirmSchedule,
  discardSchedule,
  regenerateSchedule,
} from '#/api/fdmgongchang/schedule';

import {
  dateText,
  dayLabel,
  groupByDate,
  PROCESS_LABELS,
  RISK_TYPES,
  SCHEDULE_STATUS,
} from '../../shared/schedule';
import PlanEditor from './plan-editor.vue';

/** 一份排单：生成中、失败、待确认（可调整、带意见重新生成、下发）、已下发（计划 vs 实际）。 */
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
          <Tag v-if="schedule.revision > 1" class="m-0">第 {{ schedule.revision }} 版</Tag>
        </div>
        <span class="text-xs text-muted-foreground">
          {{ range }} · {{ schedule.operatorName || '—' }} · {{ formatDateTime(schedule.createTime ?? undefined) }}
          <template v-if="schedule.confirmedBy"> · {{ schedule.confirmedBy }} 下发</template>
        </span>
        <span v-if="schedule.note" class="text-xs">补充说明：{{ schedule.note }}</span>
        <span v-if="schedule.feedback" class="text-xs">调整意见：{{ schedule.feedback }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <template v-if="schedule.status === 'DRAFT'">
          <Button v-if="canGenerate" :disabled="busy" @click="feedbackOpen = true">带意见重新生成</Button>
          <Button v-if="canConfirm" :loading="busy" type="primary" @click="confirm">确认下发</Button>
        </template>
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
      <p v-if="noWorker > 0" class="m-0 text-xs text-warning">{{ noWorker }} 个任务还没排人，下发前可以补上。</p>
      <PlanEditor v-model:tasks="tasks" :editable="canConfirm" :workers="workers" />
    </template>

    <template v-else-if="schedule.status === 'CONFIRMED' || (schedule.status === 'DISCARDED' && (schedule.tasks ?? []).length > 0)">
      <section v-for="[date, list] in confirmedGroups" :key="date" class="flex flex-col gap-2">
        <h4 class="m-0 text-sm font-semibold">{{ dayLabel(date) }}</h4>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div v-for="task in list" :key="task.id" class="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <b>{{ task.sequence }}. {{ PROCESS_LABELS[task.process] ?? task.process }}</b>
              <span class="font-mono text-xs">{{ task.contractCode || '备货' }}</span>
            </div>
            <div class="text-xs text-muted-foreground">{{ [task.product, task.spec].filter(Boolean).join(' · ') }}</div>
            <div class="text-xs">{{ task.workerNames || '未排人' }}</div>
            <div class="flex items-center gap-2">
              <Progress :percent="percent(task)" :show-info="false" class="m-0 flex-1" size="small" />
              <span class="whitespace-nowrap text-xs tabular-nums">
                实际 {{ Number(task.actualQuantity) }} / 计划 {{ Number(task.quantity) }} {{ task.unit }}
              </span>
            </div>
            <span class="text-xs text-muted-foreground">{{ task.orderCount }} 张工序单关联</span>
          </div>
        </div>
      </section>
    </template>
    <PlanEditor v-else-if="schedule.status === 'DISCARDED' && schedule.plan" v-model:tasks="tasks" :editable="false" :workers="workers" />

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
