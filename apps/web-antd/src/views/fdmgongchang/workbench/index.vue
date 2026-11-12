<script lang="ts" setup>
import type { InputLine } from '../stage-stock/model';

import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { buildUUID } from '@vben/utils';

import { Button, message, Modal, Result, Spin } from 'ant-design-vue';

import {
  claimWorkbenchTask,
  createWorkbenchOrder,
  getWorkbench,
  getWorkbenchOptions,
  getWorkbenchOrder,
  issueWorkbenchTask,
  prepareWorkbenchTask,
  reportWorkbenchOrder,
  reportWorkbenchTask,
  returnWorkbenchMaterial,
  supplementWorkbenchOrder,
  TASK_REPORTED_TODAY,
} from '#/api/fdmgongchang/workbench';

import { businessError } from '../shared/business-error';
import FactorySwitch from '../shared/factory-switch.vue';
import { sliceVolume } from '../shared/slice-wage';
import { useFactory } from '../shared/use-factory';
import { applyTaskTarget, deriveOutputs, toNumber } from '../stage-stock/model';
import WorkshopHome from '../workshop/home.vue';
import ConfirmStep from './modules/confirm-step.vue';
import DoneStep from './modules/done-step.vue';
import Home from './modules/home.vue';
import PickStep from './modules/pick-step.vue';
import PieceStep from './modules/piece-step.vue';
import ReportStep from './modules/report-step.vue';
import { createJob, goodTotal, outputPayload, provideJob } from './use-job';

/**
 * 工厂部门 · 我的工作台（工人手机端）：活都从派单来——我的任务里看清楚做什么、领什么料，
 * 先按实际批次领料开工，再对本工序的实际产出报工，支持分批、补领和余料退回。
 */
defineOptions({ name: 'FdmGongchangWorkbench' });

const props = defineProps<{ process?: string }>();
const factory = useFactory();
const route = useRoute();
const job = createJob();
provideJob(job);
const loading = ref(true);
const loadError = ref(false);
const loadErrorMessage = ref('');
const noFactory = ref(false);
const submitting = ref(false);

async function reload() {
  job.my = await getWorkbench(props.process);
}

/** 业务已经保存成功，列表刷新失败不能把界面留在可重复提交的步骤。 */
async function reloadAfterSave() {
  try {
    await reload();
    return true;
  } catch {
    message.warning('已保存成功，但工作台刷新失败，请返回工作台重试刷新，无需重复提交。');
    return false;
  }
}

async function load() {
  loading.value = true;
  loadError.value = false;
  noFactory.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    const linkedTask = linkedTaskQuery();
    if (linkedTask) {
      if (!factory.factories.value.some((item) => item.id === linkedTask.factoryId)) {
        throw new Error('报工链接中的工厂不可访问，请联系管理员');
      }
      factory.select(linkedTask.factoryId);
    }
    if (factory.factoryId.value === null) {
      noFactory.value = true;
      return;
    }
    const [, options] = await Promise.all([reload(), getWorkbenchOptions()]);
    job.options = options;
    if (linkedTask) {
      const prepare = await prepareWorkbenchTask(linkedTask.taskId);
      const process = job.my?.processes.find((item) => item.code === prepare.task.process);
      if (!process || (props.process && prepare.task.process !== props.process)) throw new Error('这项任务不属于当前车间岗位，请从对应车间打开');
      await startTask(prepare.task, process, undefined, prepare);
    }
  } catch (error) {
    loadError.value = true;
    loadErrorMessage.value = businessError(error).msg;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function claimTask(task: FdmgongchangScheduleApi.Task) {
  submitting.value = true;
  try {
    await claimWorkbenchTask(task.id);
    message.success('任务已领取，可以领料开工');
    await reloadAfterSave();
  } finally {
    submitting.value = false;
  }
}

async function changeFactory(id: number) {
  factory.select(id);
  job.step = 'home';
  job.my = undefined;
  await load();
}

/** 钉钉简版入口只传工厂和任务 ID，工厂权限与任务内容仍由服务端确认。 */
function linkedTaskQuery() {
  const { factoryId, taskId } = route.query;
  if (factoryId === undefined && taskId === undefined) return;
  const validId = (value: unknown): value is string =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  if (!validId(factoryId) || !validId(taskId)) throw new Error('报工链接无效，请重新打开');
  return { factoryId: Number(factoryId), taskId: Number(taskId) };
}

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
  job.result = { action: 'issue', amount: 0, good: 0, unit: '' };
  job.prepare = undefined;
  job.auxPicks = [];
  job.sheets = [];
  job.urgent = false;
  job.urgentReason = '';
  job.onBehalfOf = undefined;
  job.requestKey = buildUUID();
}

/** 独立开片：一单可领多种板材，各规格实际产出分别入库。 */
function startActual(process: Api.Process) {
  reset(process);
  job.step = 'pick';
}

/**
 * 按任务领料开工：确认计划产出和上工序批次；已开工时直接进入原工序单报工。
 */
async function startTask(
  task: FdmgongchangScheduleApi.Task,
  process: Api.Process,
  onBehalfOf?: { id: number; name: string },
  prepared?: Api.TaskPrepare,
) {
  reset(process, task);
  job.onBehalfOf = onBehalfOf;
  loading.value = true;
  try {
    const prepare = prepared ?? await prepareWorkbenchTask(task.id);
    job.prepare = prepare;
    if (prepare.inProgressOrderId) {
      await openOrder(prepare.inProgressOrderId, false);
      return;
    }
    const sourceStages = prepare.sourceStages?.length ? prepare.sourceStages : process.sources;
    job.sourceStage = prepare.sourceStage && sourceStages.includes(prepare.sourceStage) ? prepare.sourceStage : sourceStages[0] ?? '';
    job.picks = prepare.picks
      .map((p) => ({ qty: Math.max(0, toNumber(p.quantity) ?? 0), side: p.side, stock: p.stock }));
    const plannedRecipe = prepare.outputAttrs?.recipeCode ?? task.output?.attrs?.recipeCode;
    const plannedBatches = toNumber(task.output?.recipeBatches ?? prepare.task.output?.recipeBatches);
    if (process.code === 'MIX' && plannedRecipe) job.recipe = { code: plannedRecipe, batches: plannedBatches && plannedBatches > 0 ? plannedBatches : 1 };
    const qty = toNumber(task.quantity) ?? 0;
    job.auxPicks = prepare.aux
      .filter((a) => a.stocks.length > 0)
      .map((a) => ({
        name: a.productName ?? a.productCode ?? '',
        qty: Math.max(0, Math.round((toNumber(a.perUnit) ?? 0) * qty * 1000) / 1000),
        stock: a.stocks[0]!,
        unit: a.unit ?? '',
      }));
    job.step = 'pick';
  } finally {
    loading.value = false;
  }
}

function pickInputs(): InputLine[] {
  return job.picks.map((p) => ({ quantity: p.qty, side: p.side, stock: p.stock }));
}

function createPayload(finish: boolean) {
  return {
    auxInputs: job.auxPicks.filter((p) => p.qty > 0).map((p) => ({ quantity: p.qty, stockId: p.stock.id })),
    finish,
    inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
    outputs: finish ? outputPayload(job) : [],
    pieceworks: finish ? piecePayload() : [],
    process: job.process!.code,
    recipeBatches: job.process?.code === 'MIX' ? job.recipe?.batches : undefined,
    recipeCode: job.process?.code === 'MIX' ? job.recipe?.code : undefined,
    productionOrderItemId: job.task ? undefined : job.productionItem?.id,
    scheduleTaskId: job.task?.id,
    sourceStage: job.sourceStage,
    ...urgentPayload(),
  };
}

/** 领板材时勾了加急才带上。 */
function urgentPayload() {
  return job.urgent && job.sourceStage === 'BOARD'
    ? { urgent: true, urgentReason: job.urgentReason.trim() }
    : {};
}

function piecePayload() {
  return job.pieces
    .filter((p) => p.userId && p.itemId && (toNumber(p.quantity) ?? 0) > 0)
    .map((p) => ({ itemId: p.itemId!, quantity: job.process?.code === 'SLICE' ? sliceVolume(job.outputs) : p.quantity!, userId: p.userId! }));
}

/** 只领料：单子进「我手上在做的」；补领时把料加到原来那张单上。 */
async function issueOnly() {
  if (job.supplement && job.order?.status === 'COMPLETED' && !job.supplementRemark.trim()) {
    message.warning('已完工的单补登领料要写原因');
    return;
  }
  submitting.value = true;
  try {
    if (job.supplement && job.order) {
      await supplementWorkbenchOrder({
          id: job.order.id,
          inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
          remark: job.supplementRemark.trim() || undefined,
        });
    } else if (job.task) {
      await issueWorkbenchTask({
            auxInputs: job.auxPicks.filter((p) => p.qty > 0).map((p) => ({ quantity: p.qty, stockId: p.stock.id })),
            inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
            issueSheetUrls: job.sheets,
            onBehalfOf: job.onBehalfOf?.id,
            recipeBatches: job.process?.code === 'MIX' ? job.recipe?.batches : undefined,
            recipeCode: job.process?.code === 'MIX' ? job.recipe?.code : undefined,
            requestKey: job.requestKey,
            sourceStage: job.sourceStage,
            taskId: job.task.id,
            ...urgentPayload(),
          });
    } else {
      await createWorkbenchOrder(createPayload(false));
    }
    job.result = { action: job.supplement ? 'supplement' : 'issue', amount: 0, good: 0, unit: '' };
    job.step = 'done';
    await reloadAfterSave();
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
 * 本工序计划属性用于报工预填；订单成品规格只作需求参考，不能覆盖半成品规格。
 */
function applyTarget() {
  const target = job.prepare?.outputAttrs ?? job.task?.output?.attrs ?? job.prepare?.targetAttrs ?? job.order?.outputAttrs;
  if (!target) return;
  if (job.process?.code === 'SLICE' || job.process?.code === 'CUT') {
    applyTaskTarget(job.process.code, target, job.inputs, job.outputs);
    return;
  }
  for (const out of job.outputs) {
    out.attrs = { ...out.attrs, ...Object.fromEntries(Object.entries(target).filter(([field, value]) =>
      (job.process?.code !== 'LAMINATE' || field !== 'thickness')
      && value !== null && value !== undefined && value !== '')) };
  }
}

/** 复用已领料的工序单，报工只登记本次新增产出。 */
async function openOrder(id: number, supplement: boolean) {
  const order = await getWorkbenchOrder(id);
  const process = job.my?.processes.find((p) => p.code === order.process)
    ?? job.my?.teamProcesses?.find((p) => p.code === order.process);
  if (!process) throw new Error('当前账号没有这道工序岗位');
  const existing = job.my?.inProgress.find((o) => o.id === id) ?? job.my?.recentDone?.find((o) => o.id === id);
  const taskId = order.scheduleTaskId ?? existing?.scheduleTaskId ?? job.task?.id;
  let task = job.my?.tasks.find((t) => t.id === taskId) ?? (job.task?.id === taskId ? job.task : undefined);
  let prepare = job.prepare?.task.id === taskId ? job.prepare : undefined;
  // 在制单不限日期，任务列表只显示近期任务；缺失时按关联 ID 恢复任务契约。
  if (taskId && !prepare && (!supplement || !task)) prepare = await prepareWorkbenchTask(taskId);
  task ??= prepare?.task;
  const onBehalfOf = job.onBehalfOf;
  reset(process, task);
  job.onBehalfOf = onBehalfOf;
  job.prepare = prepare;
  job.order = order;
  job.sourceStage = order.sourceStage;
  job.supplement = supplement;
  job.recipe = process.code === 'MIX' && order.recipeCode ? { code: order.recipeCode, batches: toNumber(order.recipeBatches) ?? 1 } : undefined;
  if (supplement) {
    job.step = 'pick';
    return;
  }
  job.inputs = (order.inputs ?? []).filter((line) => line.stage !== 'AUX').map((line) => ({
    quantity: Math.max(0, (toNumber(line.quantity) ?? 0) - (toNumber(line.returnedQuantity) ?? 0)),
    side: line.laminationSide ?? undefined,
    stock: {
      batchNo: line.batchNo,
      id: line.stockId ?? line.id,
      item: line.item,
      itemCode: line.itemCode,
      itemId: line.itemId ?? 0,
      location: line.location,
      quantity: line.quantity ?? 0,
      stage: line.stage,
    },
  }));
  job.outputs = deriveOutputs(process.code, job.inputs, defaultMaterial(), job.recipe?.code);
  applyTarget();
  job.step = 'report';
}

async function continueOrder(order: Api.Order, supplement = false) {
  loading.value = true;
  try {
    job.task = undefined;
    job.prepare = undefined;
    job.onBehalfOf = undefined;
    await openOrder(order.id, supplement);
  } finally {
    loading.value = false;
  }
}

function afterReport() {
  // 返回修改实际良品后，计件数量同步到这次实际产出。
  for (const piece of job.pieces) piece.quantity = job.process?.code === 'SLICE' ? sliceVolume(job.outputs) : goodTotal(job);
  // 任务报工进入最终确认，即使本次全部为不良品。
  if (job.prepare || goodTotal(job) > 0) job.step = 'piece';
  else void submit();
}

/** 先确认领料和凭证，提交后再从在制工序单报产出。 */
function afterPick() {
  job.step = 'confirm';
}

async function submit() {
  submitting.value = true;
  const before = toNumber(job.my?.todayAmount) ?? 0;
  const good = goodTotal(job);
  try {
    const lines = Object.entries(job.returns)
      .filter(([, qty]) => (qty ?? 0) > 0)
      .map(([inputId, qty]) => ({ inputId: Number(inputId), quantity: qty! }));
    if (job.order && !job.task && lines.length > 0) {
      await returnWorkbenchMaterial({ id: job.order.id, lines });
      job.returns = {};
    }
    if (job.task && job.order) {
      await reportTask();
    } else if (job.createFinish) {
      await createWorkbenchOrder(createPayload(true));
    } else if (job.order) {
      await reportWorkbenchOrder({
        finish: job.finish,
        id: job.order.id,
        outputs: outputPayload(job),
        pieceworks: piecePayload(),
      });
    }
    job.result = { action: 'report', amount: 0, good, unit: '' };
    job.step = 'done';
    if (await reloadAfterSave()) {
      job.result.amount = Math.max(0, (toNumber(job.my?.todayAmount) ?? 0) - before);
    }
  } finally {
    submitting.value = false;
  }
}

/** 按任务报工：今天已经报过时问要不要追加一批；其他错误照常提示。 */
async function reportTask(duplicateAction?: 'APPEND'): Promise<void> {
  const payload: Api.TaskReportReq = {
    duplicateAction,
    finish: job.finish,
    onBehalfOf: job.onBehalfOf?.id,
    outputs: outputPayload(job),
    pieceworks: piecePayload(),
    requestKey: job.requestKey,
    taskId: job.task!.id,
    ...(job.order ? {
      orderId: job.order.id,
      expectedReportCount: job.order.reportCount ?? 0,
      returns: Object.entries(job.returns)
        .filter(([, qty]) => (qty ?? 0) > 0)
        .map(([inputId, qty]) => ({ inputId: Number(inputId), quantity: qty! })),
    } : {
      auxInputs: job.auxPicks.filter((p) => p.qty > 0).map((p) => ({ quantity: p.qty, stockId: p.stock.id })),
      inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
      issueSheetUrls: job.sheets,
      recipeBatches: job.process?.code === 'MIX' ? job.recipe?.batches : undefined,
      recipeCode: job.process?.code === 'MIX' ? job.recipe?.code : undefined,
      sourceStage: job.sourceStage,
      ...urgentPayload(),
    }),
  };
  try {
    await reportWorkbenchTask(payload);
  } catch (error) {
    const { code, msg } = businessError(error);
    if (code === TASK_REPORTED_TODAY && !duplicateAction) {
      const append = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          cancelText: '不报了',
          content: msg,
          okText: '追加一批',
          onCancel: () => resolve(false),
          onOk: () => resolve(true),
          title: '这个任务今天已经报过',
        });
      });
      if (append) return reportTask('APPEND');
      throw error;
    }
    message.error(msg);
    throw error;
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
    job.step = job.createFinish ? 'confirm' : 'home';
  }
  else if (job.step === 'piece') job.step = 'report';
}
</script>

<template>
  <!-- 车间入口保留应用菜单，个人工作台仍支持手机全屏操作。 -->
  <div class="mx-auto min-h-full min-w-0 w-full bg-background-deep" :class="{ 'max-w-[1080px] max-md:fixed max-md:inset-0 max-md:z-[900] max-md:max-w-none max-md:overflow-y-auto': !props.process }">
    <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
      <template #subTitle>请找工厂管理员在钉钉里把你调到所在工厂的部门。</template>
    </Result>
    <Result v-else-if="loadError" status="warning" title="没有加载出来">
      <template #subTitle>{{ loadErrorMessage }}</template>
      <template #extra>
        <div class="flex flex-wrap items-center justify-center gap-3">
          <FactorySwitch v-if="props.process && factory.factories.value.length > 1" :factories="factory.factories.value" :value="factory.factoryId.value" @change="changeFactory" />
          <Button size="large" type="primary" @click="load">再试一次</Button>
        </div>
      </template>
    </Result>
    <Spin v-else :spinning="loading || submitting">
      <template v-if="job.my && job.options">
        <WorkshopHome
          v-if="job.step === 'home' && props.process"
          :process="props.process"
          :factories="factory.factories.value"
          :factory-id="factory.factoryId.value"
          @change-factory="changeFactory"
          @refresh="load"
          @claim-task="claimTask"
          @start-task="startTask"
          @start-actual="startActual"
          @report-order="continueOrder"
          @supplement-order="(order) => continueOrder(order, true)"
        />
        <Home
          v-else-if="job.step === 'home'"
          @start-task="startTask"
          @start-actual="startActual"
          @report-order="continueOrder"
          @supplement-order="(order) => continueOrder(order, true)"
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
