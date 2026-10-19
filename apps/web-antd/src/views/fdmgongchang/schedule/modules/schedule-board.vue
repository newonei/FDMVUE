<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Button, DatePicker, Empty, Input, message, Result, Select, Spin, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getWorkerList } from '#/api/fdmgongchang/factory';
import { createManualSchedule, generateSchedule, getSchedule, getSchedules } from '#/api/fdmgongchang/schedule';

import { dateText, SCHEDULE_STATUS } from '../../shared/schedule';
import ScheduleDetail from './schedule-detail.vue';

/**
 * 排单方案（工厂排单页的一个标签）：系统把本厂的订单、库存、用料逆推、在制、人员和产能交给 AI，AI 给出未来几天的排单方案；
 * 排单员调整或带意见重新生成，确认后下发成任务。AI 只出方案，不动库存和单据。也可以不用 AI 手动派工。
 * 当前工厂由外层页面选好（接口自动带 factory-id），切换工厂时重新加载；focusId 指定要打开的那一份。
 */
const props = defineProps<{ factoryId: number; focusId?: number }>();

const { hasAccessByCodes } = useAccess();
const canGenerate = computed(() => hasAccessByCodes(['fdmgongchang:schedule:generate']));
const canConfirm = computed(() => hasAccessByCodes(['fdmgongchang:schedule:confirm']));

const loadError = ref(false);
const schedules = ref<Api.Schedule[]>([]);
const selectedId = ref<number>();
const detail = ref<Api.Schedule>();
const detailLoading = ref(false);
const workers = ref<FdmgongchangFactoryApi.Worker[]>([]);
const generating = ref(false);
const creatingManual = ref(false);
const form = ref({ days: 3, note: '', startDate: dayjs() as Dayjs });

let pollTimer: ReturnType<typeof setTimeout> | undefined;

async function loadList() {
  schedules.value = await getSchedules();
}

async function loadDetail(id: number, quiet = false) {
  if (!quiet) detailLoading.value = true;
  try {
    const data = await getSchedule(id);
    if (selectedId.value !== id) return;
    detail.value = data;
    clearTimeout(pollTimer);
    if (data.status === 'GENERATING') {
      pollTimer = setTimeout(() => loadDetail(id, true), 3000);
    } else if (quiet) {
      await loadList();
    }
  } finally {
    detailLoading.value = false;
  }
}

async function load() {
  loadError.value = false;
  clearTimeout(pollTimer);
  selectedId.value = undefined;
  detail.value = undefined;
  try {
    const [, list] = await Promise.all([loadList(), getWorkerList({ assigned: true, status: 0 }).catch(() => [])]);
    workers.value = list;
    const target = schedules.value.find((s) => s.id === props.focusId) ?? schedules.value[0];
    if (target) select(target.id);
  } catch {
    loadError.value = true;
  }
}

onMounted(load);
onBeforeUnmount(() => clearTimeout(pollTimer));
watch(() => props.factoryId, load);
watch(
  () => props.focusId,
  async (id) => {
    if (!id) return;
    if (!schedules.value.some((s) => s.id === id)) await loadList();
    select(id);
  },
);

function select(id: number) {
  selectedId.value = id;
  void loadDetail(id);
}

async function generate(override?: {
  days: number;
  note?: null | string;
  productionOrderIds?: null | number[];
  startDate: string;
}) {
  generating.value = true;
  try {
    const id = await generateSchedule(
      override
        ? {
            days: override.days,
            note: override.note ?? undefined,
            productionOrderIds: override.productionOrderIds ?? undefined,
            startDate: override.startDate,
          }
        : {
            days: form.value.days,
            note: form.value.note.trim() || undefined,
            startDate: form.value.startDate.format('YYYY-MM-DD'),
          },
    );
    message.success('已提交，AI 正在排单');
    await loadList();
    select(id);
  } finally {
    generating.value = false;
  }
}

/** 手动派工：不用 AI，按左边的日期和天数建一份空排单，在右边自己加任务、派人。 */
async function createManual() {
  creatingManual.value = true;
  try {
    const id = await createManualSchedule({
      days: form.value.days,
      note: form.value.note.trim() || undefined,
      startDate: form.value.startDate.format('YYYY-MM-DD'),
    });
    message.success('已新建手动派工，在右边添加任务、选人，然后确认下发');
    await loadList();
    select(id);
  } finally {
    creatingManual.value = false;
  }
}

function retry(schedule: Api.Schedule) {
  const start = dateText(schedule.startDate);
  void generate({
    days: schedule.days,
    note: schedule.note,
    productionOrderIds: schedule.scopeOrderIds,
    startDate: dayjs(start).isBefore(dayjs(), 'day') ? dayjs().format('YYYY-MM-DD') : start,
  });
}

async function onChanged(id?: number) {
  await loadList();
  if (id) select(id);
}

defineExpose({ reload: load });

const dayOptions = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ label: `${d} 天`, value: d }));
</script>

<template>
  <Result v-if="loadError" status="warning" title="排单没有加载出来">
    <template #extra><Button type="primary" @click="load">重新加载</Button></template>
  </Result>

  <div v-else class="flex flex-col gap-4 xl:flex-row xl:items-start">
    <aside class="flex flex-col gap-3 xl:w-72 xl:shrink-0">
      <section v-if="canGenerate || canConfirm" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        <h3 class="m-0 text-sm font-semibold text-foreground">新排单</h3>
        <label for="schedule-start" class="flex flex-col gap-1">
          从哪天开始
          <DatePicker
            id="schedule-start"
            v-model:value="form.startDate"
            :allow-clear="false"
            :disabled-date="(d: Dayjs) => d.isBefore(dayjs(), 'day')"
            class="w-full"
          />
        </label>
        <label for="schedule-days" class="flex flex-col gap-1">
          排几天
          <Select id="schedule-days" v-model:value="form.days" :options="dayOptions" />
        </label>
        <label for="schedule-note" class="flex flex-col gap-1">
          补充说明（选填）
          <Input.TextArea
            id="schedule-note"
            v-model:value="form.note"
            :maxlength="500"
            :rows="3"
            placeholder="例如：2 号压花机周三保养；HT-001 要提前；周日不开工"
          />
        </label>
        <Button v-if="canGenerate" :loading="generating" block type="primary" @click="generate()">AI 生成排单</Button>
        <Button v-if="canConfirm" :loading="creatingManual" block @click="createManual">手动派工（不用 AI）</Button>
      </section>

      <section class="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
        <h3 class="m-0 px-1 py-1 text-sm font-semibold">排单记录</h3>
        <Empty v-if="schedules.length === 0" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="还没有排单" />
        <button
          v-for="s in schedules"
          :key="s.id"
          :class="s.id === selectedId ? 'bg-primary/10' : 'hover:bg-muted/50'"
          class="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left"
          type="button"
          @click="select(s.id)"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs">{{ s.scheduleNo }}</span>
            <span class="flex gap-1">
              <Tag v-if="s.manual" class="m-0" color="purple">手动</Tag>
              <Tag :color="SCHEDULE_STATUS[s.status].color" class="m-0">{{ SCHEDULE_STATUS[s.status].label }}</Tag>
            </span>
          </span>
          <span class="text-xs text-muted-foreground">
            {{ dateText(s.startDate) }} 起 {{ s.days }} 天<template v-if="s.revision > 1"> · 第 {{ s.revision }} 版</template>
          </span>
          <span v-if="s.scopeOrderNos?.length" class="truncate text-xs text-primary">
            只排 {{ s.scopeOrderNos.join('、') }}
          </span>
        </button>
      </section>
    </aside>

    <section class="min-w-0 flex-1 rounded-lg border border-border bg-card p-4">
      <Spin :spinning="detailLoading">
        <ScheduleDetail v-if="detail" :schedule="detail" :workers="workers" @changed="onChanged" @retry="retry" />
        <Empty v-else description="左边生成一份排单，或选一条排单记录" />
      </Spin>
    </section>
  </div>
</template>
