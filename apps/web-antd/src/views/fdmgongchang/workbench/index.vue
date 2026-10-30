<script lang="ts" setup>
import type { InputLine } from '../stage-stock/model';

import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { onMounted, ref } from 'vue';

import { Button, message, Modal, Result, Spin } from 'ant-design-vue';

import {
  claimWorkbenchTask,
  createWorkbenchOrder,
  getWorkbench,
  getWorkbenchOptions,
  prepareWorkbenchTask,
  releaseWorkbenchTask,
  reportWorkbenchOrder,
  reportWorkbenchTask,
  returnWorkbenchMaterial,
  supplementWorkbenchOrder,
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
 * 工厂部门 · 我的工作台（工人手机端）：活都从派单、接单来——任务大厅接单，我的任务里看清楚做什么、领什么料，
 * 做完了报工：对照实际改领料 → 报好的、坏的数量 → 确认计件、拍领料单 → 完成。领料、报数量都按自己的名字记。
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
  job.productionItem = undefined;
  job.recipe = undefined;
  job.supplement = false;
  job.supplementRemark = '';
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
  job.prepare = undefined;
  job.auxPicks = [];
  job.sheets = [];
}

/**
 * 按任务报工（下班前做完了来报）：系统按任务带出建议领料，工人对照实际改数量；
 * 接着报好的、坏的数量，最后确认计件、拍领料单，一次提交，任务完成。
 */
async function startTask(task: FdmgongchangScheduleApi.Task, process: Api.Process) {
  reset(process, task);
  loading.value = true;
  try {
    const prepare = await prepareWorkbenchTask(task.id);
    job.prepare = prepare;
    if (prepare.sourceStage && process.sources.includes(prepare.sourceStage)) job.sourceStage = prepare.sourceStage;
    job.picks = prepare.picks.map((p) => ({ qty: toNumber(p.quantity) ?? 0, stock: p.stock }));
    const qty = toNumber(task.quantity) ?? 0;
    job.auxPicks = prepare.aux
      .filter((a) => a.stocks.length > 0)
      .map((a) => ({
        name: a.productName ?? a.productCode ?? '',
        qty: Math.round((toNumber(a.perUnit) ?? 0) * qty * 1000) / 1000,
        stock: a.stocks[0]!,
        unit: a.unit ?? '',
      }));
    job.step = 'pick';
  } finally {
    loading.value = false;
  }
}

async function claimTask(task: FdmgongchangScheduleApi.Task) {
  submitting.value = true;
  try {
    await claimWorkbenchTask(task.id);
    message.success('接单成功，做完了在「我的任务」里报工');
    await reload();
  } finally {
    submitting.value = false;
  }
}

function releaseTask(task: FdmgongchangScheduleApi.Task) {
  Modal.confirm({
    content: '退单后任务回到任务大厅，别人可以接。',
    okText: '退单',
    title: '不做这个任务了？',
    async onOk() {
      await releaseWorkbenchTask(task.id);
      message.success('已退单');
      await reload();
    },
  });
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
    recipeBatches: job.recipe?.batches,
    recipeCode: job.recipe?.code,
    productionOrderItemId: job.task ? undefined : job.productionItem?.id,
    scheduleTaskId: job.task?.id,
    sourceStage: job.sourceStage,
  };
}

function piecePayload() {
  return job.pieces
    .filter((p) => p.userId && p.itemId && (p.quantity ?? 0) > 0)
    .map((p) => ({ itemId: p.itemId!, quantity: p.quantity!, userId: p.userId! }));
}

/** 只领料：单子进「我手上在做的」；补领时把料加到原来那张单上。 */
async function issueOnly() {
  if (job.supplement && job.order?.status === 'COMPLETED' && !job.supplementRemark.trim()) {
    message.warning('已完工的单补登领料要写原因');
    return;
  }
  submitting.value = true;
  try {
    await (job.supplement && job.order
      ? supplementWorkbenchOrder({
          id: job.order.id,
          inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
          remark: job.supplementRemark.trim() || undefined,
        })
      : createWorkbenchOrder(createPayload(false)));
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
  job.outputs = deriveOutputs(job.process!.code, job.inputs, defaultMaterial(), job.recipe?.code);
  applyTarget();
  job.step = 'report';
}

/**
 * 按任务报工时产出规格按订单带出，工人只填数量：开片的片材长宽同板材、厚度是成品厚；立切切成成品长宽。
 * 其他工序的规格本来就按领的料带出。
 */
function applyTarget() {
  const target = job.prepare?.targetAttrs;
  if (!target) return;
  const code = job.process?.code;
  for (const out of job.outputs) {
    if (code === 'SLICE') {
      const board = job.inputs[0]?.stock.item;
      out.attrs.length = out.attrs.length ?? board?.length ?? null;
      out.attrs.width = out.attrs.width ?? board?.width ?? null;
      if (target.thickness !== null && target.thickness !== undefined) out.attrs.thickness = target.thickness;
    } else if (code === 'CUT') {
      if (target.length !== null && target.length !== undefined) out.attrs.length = target.length;
      if (target.width !== null && target.width !== undefined) out.attrs.width = target.width;
    }
  }
}

function afterReport() {
  // 按任务报工最后一步要拍领料单，所以总要进计件这一步
  if (job.prepare || goodTotal(job) > 0) job.step = 'piece';
  else void submit();
}

/** 领料这一步点下一步：按任务报工时直接报数量（领料和报工一起提交），否则先确认领料。 */
function afterPick() {
  if (job.prepare) reportNow();
  else job.step = 'confirm';
}

async function submit() {
  submitting.value = true;
  const before = toNumber(job.my?.todayAmount) ?? 0;
  const good = goodTotal(job);
  try {
    if (job.prepare && job.task) {
      await reportWorkbenchTask({
        auxInputs: job.auxPicks.filter((p) => p.qty > 0).map((p) => ({ quantity: p.qty, stockId: p.stock.id })),
        inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
        issueSheetUrls: job.sheets,
        outputs: outputPayload(job),
        pieceworks: piecePayload(),
        recipeBatches: job.recipe?.batches,
        recipeCode: job.recipe?.code,
        sourceStage: job.sourceStage,
        taskId: job.task.id,
      });
    } else if (job.createFinish) {
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
  else if (job.step === 'report') {
    if (job.prepare) job.step = 'pick';
    else job.step = job.createFinish ? 'confirm' : 'home';
  }
  else if (job.step === 'piece') job.step = 'report';
}
</script>

<template>
  <!-- 手机上全屏显示，盖住电脑端的顶部栏和标签页，工人只看到要做的活 -->
  <div class="mx-auto min-h-full w-full max-w-[1080px] bg-background-deep max-md:fixed max-md:inset-0 max-md:z-[900] max-md:max-w-none max-md:overflow-y-auto">
    <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
      <template #subTitle>请找工厂管理员在钉钉里把你调到所在工厂的部门。</template>
    </Result>
    <Result v-else-if="loadError" status="warning" title="没有加载出来">
      <template #extra><Button size="large" type="primary" @click="load">再试一次</Button></template>
    </Result>
    <Spin v-else :spinning="loading || submitting">
      <template v-if="job.my && job.options">
        <Home
          v-if="job.step === 'home'"
          @claim-task="claimTask"
          @release-task="releaseTask"
          @start-task="startTask"
        />
        <PickStep v-else-if="job.step === 'pick'" @back="back" @next="afterPick" />
        <ConfirmStep v-else-if="job.step === 'confirm'" @back="back" @issue-only="issueOnly" @report-now="reportNow" />
        <ReportStep v-else-if="job.step === 'report'" @back="back" @next="afterReport" />
        <PieceStep v-else-if="job.step === 'piece'" :submitting="submitting" @back="back" @submit="submit" />
        <DoneStep v-else-if="job.step === 'done'" @again="again" @home="goHome" />
      </template>
      <div v-else class="h-80"></div>
    </Spin>
  </div>
</template>
