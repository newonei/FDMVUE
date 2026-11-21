<script setup lang="ts">
import type { OrderDraft } from '../order-report';
import type { Job } from '../use-job';

import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, onMounted, ref } from 'vue';

import { buildUUID, cloneDeep } from '@vben/utils';

import { Alert, Button, message, Modal, Spin } from 'ant-design-vue';

import {
  issueMyWorkbenchBatch,
  matchWorkbenchWage,
  prepareMyWorkbenchBatch,
  reportMyWorkbenchBatch,
} from '#/api/fdmgongchang/workbench';
import ImageUpload from '#/components/upload/image-upload.vue';

import { businessError } from '../../shared/business-error';
import { sliceVolume, sliceWageItem } from '../../shared/slice-wage';
import { attrSummary, formatQty, makeLabels, toNumber } from '../../stage-stock/model';
import { loadOrderDraft } from '../order-report';
import { reportErrors } from '../report-quantity';
import { applyIssuePlan, issuePayload } from '../task-issue';
import { createJob, goodTotal, issueShortages, outputPayload, slicePlanThicknessError, stageOf, useJob } from '../use-job';
import BatchWorkbenchRow from './batch-workbench-row.vue';

const props = defineProps<{
  mode: 'issue' | 'report';
  orders: Api.Order[];
  reportDrafts: Map<number, OrderDraft>;
  tasks: FdmgongchangScheduleApi.Task[];
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const home = useJob();
const jobs = ref<Job[]>([]);
const loading = ref(false);
const submitting = ref(false);
const loadError = ref('');
const submitError = ref('');
const editing = ref<number>();
const sheets = ref<string[]>([]);
const issue = computed(() => props.mode === 'issue');
const action = computed(() => issue.value ? '批量领料' : '批量报工');
const labels = computed(() => makeLabels(home.options));
const shortages = computed(() => issueShortages({
  ...home,
  auxPicks: jobs.value.flatMap((job) => job.auxPicks),
  picks: jobs.value.flatMap((job) => job.picks),
}));
const labelOf = (job: Job) => job.task
  ? [`任务 #${job.task.id}`, job.task.contractCode].filter(Boolean).join(' · ')
  : job.order?.orderNo;
const stockName = (stock: Job['picks'][number]['stock']) =>
  attrSummary(stock.stage, stock.item, labels.value, [], 'mm') || stock.itemCode;
const retrying = ref(false);
let sendBatch: (() => Promise<number[]>) | undefined;

function makeJob() {
  return Object.assign(createJob(), { my: home.my, options: home.options, requestKey: buildUUID() });
}

async function load() {
  loadError.value = '';
  loading.value = true;
  try {
    if (issue.value) {
      const plans = await prepareMyWorkbenchBatch(props.tasks.map((task) => task.id));
      jobs.value = plans.map((prepare) => {
        const job = makeJob();
        job.task = prepare.task;
        job.process = home.my?.processes.find((process) => process.code === prepare.task.process);
        if (!job.process || prepare.inProgressOrderId) throw new Error(`任务 #${prepare.task.id} 状态已更新，请刷新工作台`);
        applyIssuePlan(job, prepare);
        return job;
      });
    } else {
      jobs.value = await Promise.all(props.orders.map(async (order) => {
        try {
          const cached = props.reportDrafts.get(order.id);
          const draft = cached ? cloneDeep(cached) : await loadOrderDraft(home, order.id);
          return Object.assign(makeJob(), draft);
        } catch (error) {
          throw new Error(`${order.orderNo}：${businessError(error).msg}`, { cause: error });
        }
      }));
    }
  } catch (error) {
    loadError.value = businessError(error).msg;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function issueProblem(job: Job) {
  if (!job.sourceStage || job.picks.length === 0 || job.picks.some((pick) => !(pick.qty > 0))) {
    return '请选择实际领料批次并填写领取数量';
  }
  if (job.process?.code === 'LAMINATE' &&
    !['BACK', 'FRONT'].every((side) => job.picks.some((pick) => pick.side === side))) {
    return '请分别选择正面和反面的领料';
  }
  return slicePlanThicknessError(job, job.picks.map((pick) => ({ quantity: pick.qty, stock: pick.stock })));
}

async function reportRow(job: Job): Promise<Api.MyBatchReportRow> {
  const process = job.process!.code;
  const good = goodTotal(job);
  let pieceworks: Api.MyBatchReportRow['pieceworks'] = [];
  if (good > 0) {
    const first = job.outputs.find((line) => (toNumber(line.goodQuantity) ?? 0) > 0);
    const matches = await matchWorkbenchWage({
      length: toNumber(first?.attrs.length) ?? null,
      process,
      thickness: toNumber(first?.attrs.thickness) ?? null,
      width: toNumber(first?.attrs.width) ?? null,
    });
    const isSlice = process === 'SLICE';
    const item = isSlice ? sliceWageItem(matches) : matches.find((match) => match.matched) ?? matches[0];
    if (isSlice && !item) throw new Error(`${labelOf(job)}：请先配置开片 m³ 单价`);
    if (item) {
      pieceworks = [{ itemId: item.itemId, quantity: isSlice ? sliceVolume(job.outputs) : good, userId: home.my!.userId }];
    }
  }
  return {
    expectedReportCount: job.order!.reportCount ?? 0,
    finish: job.finish,
    id: job.order!.id,
    outputs: outputPayload(job),
    pieceworks,
    requestKey: job.requestKey,
    returns: Object.entries(job.returns)
      .filter(([, qty]) => job.finish && (qty ?? 0) > 0)
      .map(([inputId, qty]) => ({ inputId: Number(inputId), quantity: qty! })),
  };
}

async function submit() {
  if (submitting.value || jobs.value.length === 0 || editing.value !== undefined) return;
  submitError.value = '';
  submitting.value = true;
  try {
    if (!sendBatch) {
      for (const job of jobs.value) {
        const problem = issue.value ? issueProblem(job) : reportErrors(job)[0];
        if (problem) {
          submitError.value = `${labelOf(job)}：${problem}`;
          if (issue.value) editing.value = job.task!.id;
          return;
        }
      }
      if (issue.value) {
        const rows = jobs.value.map((job) => ({ ...issuePayload(job), issueSheetUrls: [...sheets.value] }));
        sendBatch = () => issueMyWorkbenchBatch(rows);
      } else {
        const rows = await Promise.all(jobs.value.map(reportRow));
        sendBatch = () => reportMyWorkbenchBatch(rows);
      }
    }
    const ids = await sendBatch();
    message.success(issue.value ? `已为 ${ids.length} 项任务领料开工` : `已为 ${ids.length} 张工序单登记产出`);
    emit('saved');
  } catch (error) {
    const { code, msg } = businessError(error);
    retrying.value = !!sendBatch && code < 1_000_000_000 && code !== 400 && code !== 403;
    if (!retrying.value) sendBatch = undefined;
    submitError.value = retrying.value ? `提交结果待核实（${msg}）。重试将沿用本次提交编号。` : msg;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    :closable="!submitting"
    :confirm-loading="submitting"
    :cancel-button-props="{ disabled: submitting }"
    :keyboard="!submitting"
    :mask-closable="false"
    :ok-button-props="{ disabled: loading || !!loadError || !jobs.length || editing !== undefined }"
    :ok-text="retrying ? '重试本次提交' : `确认${action}`"
    :title="action"
    open
    width="760px"
    @cancel="emit('close')"
    @ok="submit"
  >
    <Spin :spinning="loading || submitting">
      <div v-if="loadError" class="flex flex-col items-start gap-2 py-2">
        <Alert :message="loadError" show-icon type="error" />
        <Button @click="load">重新读取</Button>
      </div>
      <p v-else-if="loading && !jobs.length" class="my-3">正在读取所选项目</p>
      <fieldset v-else :disabled="submitting || retrying" class="m-0 flex max-h-[65vh] min-w-0 flex-col gap-3 overflow-y-auto border-0 p-0">
        <p class="m-0 text-sm text-muted-foreground">
          {{ issue ? '核对每项任务实际领取的批次和数量，确认后统一开工。' : `核对各单实际产量。计件按规格匹配，记在${home.my?.userName || '本人'}名下。多人计件请在单笔报工登记。` }}
        </p>
        <Alert v-if="submitError" :message="submitError" role="alert" show-icon type="error" />
        <Alert v-if="issue && shortages.length" show-icon type="warning" message="合计用量超过账面库存，请核对实际领料">
          <template #description>
            <ul class="m-0 list-disc pl-4">
              <li v-for="line in shortages" :key="line.stock.id">
                {{ stockName(line.stock) }} · {{ line.stock.batchNo }} · 缺 {{ formatQty(line.amount) }} {{ line.unit }}，需{{ line.action }}
              </li>
            </ul>
          </template>
        </Alert>
        <section v-for="job in jobs" :key="job.requestKey" class="rounded-md border border-border p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b class="text-base">{{ job.process?.label }}</b>
              <span class="ml-2 text-muted-foreground">{{ labelOf(job) }}</span>
            </div>
            <Button v-if="issue && editing === job.task?.id" @click="editing = undefined">收起领料明细</Button>
            <Button v-else-if="issue" :disabled="editing !== undefined || retrying" @click="editing = job.task?.id">调整领料</Button>
          </div>
          <template v-if="issue && editing !== job.task?.id">
            <p v-if="job.prepare?.target" class="m-0 text-sm">{{ job.prepare.target }}</p>
            <p v-if="!job.picks.length" class="m-0 text-warning">请先选实际领料批次</p>
            <ul v-else class="mb-0 list-disc pl-5">
              <li v-for="pick in job.picks" :key="`${pick.stock.id}:${pick.side ?? ''}`">
                <template v-if="pick.side">{{ pick.side === 'FRONT' ? '正面' : '反面' }} · </template>
                {{ stockName(pick.stock) }} · {{ pick.stock.batchNo }} · {{ formatQty(pick.qty) }} {{ stageOf(job, pick.stock.stage)?.unit }}
              </li>
              <li v-for="pick in job.auxPicks.filter((line) => line.qty > 0)" :key="`aux-${pick.stock.id}`">
                {{ pick.name }} · {{ pick.stock.batchNo }} · {{ formatQty(pick.qty) }} {{ pick.unit }}
              </li>
            </ul>
          </template>
          <BatchWorkbenchRow v-else :job="job" :mode="mode" @confirmed="editing = undefined" />
        </section>
        <section v-if="issue && !retrying" class="flex flex-col gap-1">
          <span class="text-sm font-semibold">本批共用领料凭证（选填）</span>
          <ImageUpload v-model:value="sheets" :max-number="9" :max-size="10" :show-description="false" directory="fdmgongchang/issue-sheet" multiple />
        </section>
      </fieldset>
    </Spin>
  </Modal>
</template>
