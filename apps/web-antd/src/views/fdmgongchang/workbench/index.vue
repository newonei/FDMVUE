<script lang="ts" setup>
import type { InputLine } from '../stage-stock/model';

import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { onMounted, ref } from 'vue';

import { Button, message, Result, Spin } from 'ant-design-vue';

import {
  createWorkbenchOrder,
  getWorkbench,
  getWorkbenchOptions,
  getWorkbenchOrder,
  reportWorkbenchOrder,
  returnWorkbenchMaterial,
} from '#/api/fdmgongchang/workbench';

import { useFactory } from '../shared/use-factory';
import { deriveOutputs, toNumber } from '../stage-stock/model';
import ConfirmStep from './modules/confirm-step.vue';
import DoneStep from './modules/done-step.vue';
import Home from './modules/home.vue';
import PickStep from './modules/pick-step.vue';
import PieceStep from './modules/piece-step.vue';
import ReportStep from './modules/report-step.vue';
import { createJob, goodTotal, outputPayload, provideJob } from './use-job';

/**
 * 工厂部门 · 我的工作台（工人手机端）：打开就是「今天做什么」，一屏只做一件事——
 * 领材料 → 确认领料 → 做完报数量 → 确认计件 → 完成。领料、报数量都按自己的名字记。
 */
defineOptions({ name: 'FdmGongchangWorkbench' });

const factory = useFactory();
const job = createJob();
provideJob(job);
const loading = ref(true);
const loadError = ref(false);
const noFactory = ref(false);
const submitting = ref(false);

async function reload() {
  job.my = await getWorkbench();
}

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    if (factory.factoryId.value === null) {
      noFactory.value = true;
      return;
    }
    const [, options] = await Promise.all([reload(), getWorkbenchOptions()]);
    job.options = options;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const defaultMaterial = () =>
  job.options?.materials.find((m) => m.value.toUpperCase() === 'TPE')?.value ?? job.options?.materials[0]?.value;

function reset(process: Api.Process, task?: FdmgongchangScheduleApi.Task) {
  job.process = process;
  job.task = task;
  job.sourceStage = process.sources[0] ?? '';
  job.picks = [];
  job.inputs = [];
  job.outputs = [];
  job.pieces = [];
  job.order = undefined;
  job.returns = {};
  job.finish = true;
  job.createFinish = false;
  job.result = { amount: 0, good: 0, unit: '' };
}

function startTask(task: FdmgongchangScheduleApi.Task, process: Api.Process) {
  reset(process, task);
  job.step = 'pick';
}

function startFree(process: Api.Process) {
  reset(process);
  job.step = 'pick';
}

async function continueOrder(order: Api.Order) {
  const process = job.my?.processes.find((p) => p.code === order.process);
  if (!process) {
    message.warning('你现在没有这道工序的岗位，请找班组长处理');
    return;
  }
  reset(process, job.my?.tasks.find((t) => t.id === order.scheduleTaskId));
  job.sourceStage = order.sourceStage;
  loading.value = true;
  try {
    job.order = await getWorkbenchOrder(order.id);
    job.inputs = (job.order.inputs ?? []).map((line) => ({
      quantity: (toNumber(line.quantity) ?? 0) - (toNumber(line.returnedQuantity) ?? 0),
      side: line.laminationSide ?? undefined,
      stock: {
        batchNo: line.batchNo,
        id: line.stockId ?? line.id,
        item: line.item,
        itemCode: line.itemCode,
        location: line.location,
        quantity: line.quantity ?? 0,
        stage: line.stage,
      },
    }));
    job.outputs = deriveOutputs(process.code, job.inputs, defaultMaterial());
    job.step = 'report';
  } finally {
    loading.value = false;
  }
}

function pickInputs(): InputLine[] {
  return job.picks.map((p) => ({ quantity: p.qty, side: p.side, stock: p.stock }));
}

function createPayload(finish: boolean) {
  return {
    finish,
    inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
    outputs: finish ? outputPayload(job) : [],
    pieceworks: finish ? piecePayload() : [],
    process: job.process!.code,
    scheduleTaskId: job.task?.id,
    sourceStage: job.sourceStage,
  };
}

function piecePayload() {
  return job.pieces
    .filter((p) => p.userId && p.itemId && (p.quantity ?? 0) > 0)
    .map((p) => ({ itemId: p.itemId!, quantity: p.quantity!, userId: p.userId! }));
}

/** 只领料：单子进「我手上在做的」。 */
async function issueOnly() {
  submitting.value = true;
  try {
    await createWorkbenchOrder(createPayload(false));
    await reload();
    job.result = { amount: 0, good: 0, unit: '' };
    job.step = 'done';
  } finally {
    submitting.value = false;
  }
}

/** 已经做完：领料同时报数量。 */
function reportNow() {
  job.createFinish = true;
  job.inputs = pickInputs();
  job.outputs = deriveOutputs(job.process!.code, job.inputs, defaultMaterial());
  job.step = 'report';
}

function afterReport() {
  if (goodTotal(job) > 0) job.step = 'piece';
  else void submit();
}

async function submit() {
  submitting.value = true;
  const before = toNumber(job.my?.todayAmount) ?? 0;
  const good = goodTotal(job);
  try {
    if (job.createFinish) {
      await createWorkbenchOrder(createPayload(true));
    } else if (job.order) {
      const lines = Object.entries(job.returns)
        .filter(([, qty]) => (qty ?? 0) > 0)
        .map(([inputId, qty]) => ({ inputId: Number(inputId), quantity: qty! }));
      if (lines.length > 0) await returnWorkbenchMaterial({ id: job.order.id, lines });
      await reportWorkbenchOrder({
        finish: job.finish,
        id: job.order.id,
        outputs: outputPayload(job),
        pieceworks: piecePayload(),
      });
    }
    await reload();
    job.result = { amount: Math.max(0, (toNumber(job.my?.todayAmount) ?? 0) - before), good, unit: '' };
    job.step = 'done';
  } finally {
    submitting.value = false;
  }
}

/** 再领一批料：同一个活接着做。 */
function again() {
  reset(job.process!, job.task);
  job.step = 'pick';
}

async function goHome() {
  job.step = 'home';
  await reload();
}

function back() {
  if (job.step === 'pick') job.step = 'home';
  else if (job.step === 'confirm') job.step = 'pick';
  else if (job.step === 'report') job.step = job.createFinish ? 'confirm' : 'home';
  else if (job.step === 'piece') job.step = 'report';
}
</script>

<template>
  <div class="mx-auto min-h-full w-full max-w-[480px] bg-background-deep">
    <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
      <template #subTitle>请找工厂管理员在钉钉里把你调到所在工厂的部门。</template>
    </Result>
    <Result v-else-if="loadError" status="warning" title="没有加载出来">
      <template #extra><Button size="large" type="primary" @click="load">再试一次</Button></template>
    </Result>
    <Spin v-else :spinning="loading || submitting">
      <template v-if="job.my && job.options">
        <Home v-if="job.step === 'home'" @continue-order="continueOrder" @start-free="startFree" @start-task="startTask" />
        <PickStep v-else-if="job.step === 'pick'" @back="back" @next="job.step = 'confirm'" />
        <ConfirmStep v-else-if="job.step === 'confirm'" @back="back" @issue-only="issueOnly" @report-now="reportNow" />
        <ReportStep v-else-if="job.step === 'report'" @back="back" @next="afterReport" />
        <PieceStep v-else-if="job.step === 'piece'" :submitting="submitting" @back="back" @submit="submit" />
        <DoneStep v-else-if="job.step === 'done'" @again="again" @home="goHome" />
      </template>
      <div v-else class="h-80"></div>
    </Spin>
  </div>
</template>
