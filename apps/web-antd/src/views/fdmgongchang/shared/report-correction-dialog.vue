<script setup lang="ts">
import type { ReportCorrectionBatch, ReportCorrectionLine, ReportCorrectionRecord } from '#/api/fdmgongchang/stage-stock/report-correction';

import { computed, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Alert, Button, Input, InputNumber, message, Spin, Tag } from 'ant-design-vue';

import { getReportCorrections, reviewReportCorrection, submitReportCorrection } from '#/api/fdmgongchang/stage-stock/report-correction';

import { formatQty, toNumber } from '../stage-stock/model';
import { businessError } from './business-error';
import FactoryDialog from './factory-dialog.vue';
import { quantityPrecision } from './quantity';

const props = defineProps<{ orderId?: number; orderNo?: string; reportSeq?: number; unit?: string }>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>('open', { required: true });
const batches = ref<ReportCorrectionBatch[]>([]);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const canSubmit = ref(false);
const canConfirm = ref(false);
const selectedSeq = ref<number>();
const visibleBatches = computed(() => selectedSeq.value === undefined
  ? batches.value : batches.value.filter((batch) => batch.reportSeq === selectedSeq.value));
const editingSeq = ref<number>();
const reason = ref('');
const reviewNotes = ref<Record<number, string>>({});
let version = 0;

interface DraftRow {
  backDefectQuantity?: number;
  backGoodQuantity?: number;
  defectQuantity?: number;
  frontDefectQuantity?: number;
  frontGoodQuantity?: number;
  goodQuantity?: number;
  outputId: number;
}

const rows = ref<DraftRow[]>([]);
const precision = computed(() => quantityPrecision(props.unit));
const optionalSide = (row: ReportCorrectionLine) => (row.frontDefectQuantity ?? row.backDefectQuantity ?? null) !== null;
const hasSideGood = (row: ReportCorrectionLine) => (row.frontGoodQuantity ?? row.backGoodQuantity ?? null) !== null;
const draftRow = (row: ReportCorrectionLine): DraftRow => ({
  backDefectQuantity: toNumber(row.backDefectQuantity),
  backGoodQuantity: toNumber(row.backGoodQuantity),
  defectQuantity: toNumber(row.defectQuantity) ?? 0,
  frontDefectQuantity: toNumber(row.frontDefectQuantity),
  frontGoodQuantity: toNumber(row.frontGoodQuantity),
  goodQuantity: toNumber(row.goodQuantity) ?? 0,
  outputId: row.id,
});

function cancelEdit() {
  editingSeq.value = undefined;
  rows.value = [];
  reason.value = '';
}

async function load() {
  const current = ++version;
  const orderId = props.orderId;
  if (!open.value || !orderId) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await getReportCorrections(orderId);
    if (current !== version) return;
    batches.value = result.batches;
    canSubmit.value = result.canSubmit;
    canConfirm.value = result.canConfirm;
  } catch (error) {
    if (current === version) errorMessage.value = businessError(error).msg;
  } finally {
    if (current === version) loading.value = false;
  }
}

watch([open, () => props.orderId, () => props.reportSeq], () => {
  ++version;
  loading.value = false;
  batches.value = [];
  errorMessage.value = '';
  reviewNotes.value = {};
  cancelEdit();
  selectedSeq.value = props.reportSeq;
  if (open.value) void load();
}, { immediate: true });

function edit(batch: ReportCorrectionBatch) {
  editingSeq.value = batch.reportSeq;
  rows.value = batch.rows.map(draftRow);
  reason.value = '';
  errorMessage.value = '';
}

const limit = (value?: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function validRow(row: DraftRow, original: ReportCorrectionLine) {
  if (!optionalSide(original)) return limit(row.goodQuantity) && limit(row.defectQuantity);
  return limit(row.frontDefectQuantity) && limit(row.backDefectQuantity)
    && (hasSideGood(original) ? limit(row.frontGoodQuantity) && limit(row.backGoodQuantity) : limit(row.goodQuantity));
}

async function submit(batch: ReportCorrectionBatch) {
  if (!props.orderId || saving.value || editingSeq.value !== batch.reportSeq) return;
  if (!reason.value.trim()) {
    errorMessage.value = '请填写更正原因。';
    return;
  }
  if (rows.value.some((row, index) => !validRow(row, batch.rows[index]!))) {
    errorMessage.value = '请填写完整的更正数量，数量应大于或等于零。';
    return;
  }
  const corrected = rows.value.map((row, index) => {
    const original = batch.rows[index]!;
    const split = optionalSide(original);
    return {
      outputId: row.outputId,
      goodQuantity: hasSideGood(original) ? Math.min(row.frontGoodQuantity!, row.backGoodQuantity!) : row.goodQuantity!,
      defectQuantity: split ? Math.max(row.frontDefectQuantity!, row.backDefectQuantity!) : row.defectQuantity!,
      ...(split ? { frontDefectQuantity: row.frontDefectQuantity, backDefectQuantity: row.backDefectQuantity } : {}),
      ...(hasSideGood(original) ? { frontGoodQuantity: row.frontGoodQuantity, backGoodQuantity: row.backGoodQuantity } : {}),
    };
  });
  if (!corrected.some((row, index) => {
    const original = draftRow(batch.rows[index]!);
    return row.goodQuantity !== original.goodQuantity || row.defectQuantity !== original.defectQuantity
      || row.frontDefectQuantity !== original.frontDefectQuantity || row.backDefectQuantity !== original.backDefectQuantity
      || row.frontGoodQuantity !== original.frontGoodQuantity || row.backGoodQuantity !== original.backGoodQuantity;
  })) {
    errorMessage.value = '本批次的报工数量没有变化。';
    return;
  }
  await save(async () => {
    await submitReportCorrection({ orderId: props.orderId!, reason: reason.value.trim(), reportSeq: batch.reportSeq, rows: corrected });
    cancelEdit();
    message.success('更正已提交，等待确认');
  });
}

async function review(pending: ReportCorrectionRecord, decision: 'APPROVE' | 'REJECT') {
  const note = reviewNotes.value[pending.id]?.trim();
  if (decision === 'REJECT' && !note) {
    errorMessage.value = '请填写退回原因。';
    return;
  }
  await save(async () => {
    await reviewReportCorrection({ id: pending.id, decision, note });
    message.success(decision === 'APPROVE' ? '报工更正已入账' : '更正申请已退回');
  });
}

async function save(action: () => Promise<void>) {
  if (saving.value) return;
  saving.value = true;
  errorMessage.value = '';
  try {
    await action();
    await load();
    emit('saved');
  } catch (error) {
    errorMessage.value = businessError(error).msg;
  } finally {
    saving.value = false;
  }
}

const statusText: Record<string, string> = { APPROVED: '已更正', APPLIED: '已更正', PENDING: '待确认', REJECTED: '已退回' };
const diff = (before?: number, after?: number) => {
  const value = Number(((after ?? 0) - (before ?? 0)).toFixed(3));
  return `${value > 0 ? '+' : ''}${formatQty(value)}`;
};
</script>

<template>
  <FactoryDialog v-model:open="open" :busy="saving" :width="760">
    <template #title>报工记录与更正 {{ orderNo || '' }}</template>
    <p class="mb-3 text-xs text-muted-foreground">此处更正实际产出。领料数量填错时，从原工序单选择补领或退料；已完工请联系主管在库存与流水中补登领料或退料。</p>
    <Alert v-if="errorMessage" :message="errorMessage" class="mb-3" show-icon type="warning" />
    <Button v-if="errorMessage && !batches.length" class="mb-3" :disabled="loading" @click="load">重新加载</Button>
    <Spin :spinning="loading">
      <div class="flex flex-col gap-3" :class="{ 'min-h-20': loading }">
        <p v-if="!loading && !errorMessage && !batches.length" class="m-0 py-4 text-center text-muted-foreground">此工序单暂无报工批次</p>
        <Button v-if="selectedSeq !== undefined && batches.length" type="link" class="self-start !px-0" @click="selectedSeq = undefined">查看工序单全部批次</Button>
        <section v-for="batch in visibleBatches" :key="batch.reportSeq" class="rounded-lg border border-border p-3">
          <header class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b>第 {{ batch.reportSeq }} 次报工</b>
              <span v-if="batch.reportedAt" class="ml-2 text-xs text-muted-foreground">{{ formatDateTime(batch.reportedAt) }}</span>
              <Tag v-if="batch.pending" color="orange" class="ml-2">待确认</Tag>
            </div>
            <Button v-if="canSubmit && !batch.pending && editingSeq !== batch.reportSeq" :disabled="saving" @click="edit(batch)">更正数量</Button>
          </header>

          <div v-for="(line, index) in batch.rows" :key="line.id" class="mt-2 space-y-2 border-t border-border pt-2">
            <div class="flex flex-wrap justify-between gap-2 text-sm">
              <span class="break-all">{{ line.itemCode }}<template v-if="line.batchNo"> · {{ line.batchNo }}</template></span>
              <span class="tabular-nums">原良品 {{ formatQty(line.goodQuantity) }} · 残次 {{ formatQty(line.defectQuantity) }} {{ unit }}</span>
            </div>
            <div v-if="editingSeq === batch.reportSeq && rows[index]" class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <template v-if="hasSideGood(line)">
                <label class="flex flex-col gap-1 text-xs">更正后正面良品
                  <InputNumber v-model:value="rows[index]!.frontGoodQuantity" :aria-label="`产出 ${index + 1} 更正后正面良品`" :disabled="saving" :min="0" :precision="precision" class="w-full" />
                </label>
                <label class="flex flex-col gap-1 text-xs">更正后反面良品
                  <InputNumber v-model:value="rows[index]!.backGoodQuantity" :aria-label="`产出 ${index + 1} 更正后反面良品`" :disabled="saving" :min="0" :precision="precision" class="w-full" />
                </label>
              </template>
              <label v-else class="flex flex-col gap-1 text-xs">更正后良品
                <InputNumber v-model:value="rows[index]!.goodQuantity" :aria-label="`产出 ${index + 1} 更正后良品`" :disabled="saving" :min="0" :precision="precision" class="w-full" />
                <span class="text-muted-foreground">差额 {{ diff(toNumber(line.goodQuantity), rows[index]!.goodQuantity) }} {{ unit }}</span>
              </label>
              <template v-if="optionalSide(line)">
                <label class="flex flex-col gap-1 text-xs">更正后正面残次
                  <InputNumber v-model:value="rows[index]!.frontDefectQuantity" :aria-label="`产出 ${index + 1} 更正后正面残次`" :disabled="saving" :min="0" :precision="precision" class="w-full" />
                </label>
                <label class="flex flex-col gap-1 text-xs">更正后反面残次
                  <InputNumber v-model:value="rows[index]!.backDefectQuantity" :aria-label="`产出 ${index + 1} 更正后反面残次`" :disabled="saving" :min="0" :precision="precision" class="w-full" />
                </label>
              </template>
              <label v-else class="flex flex-col gap-1 text-xs">更正后残次
                <InputNumber v-model:value="rows[index]!.defectQuantity" :aria-label="`产出 ${index + 1} 更正后残次`" :disabled="saving" :min="0" :precision="precision" class="w-full" />
                <span class="text-muted-foreground">差额 {{ diff(toNumber(line.defectQuantity), rows[index]!.defectQuantity) }} {{ unit }}</span>
              </label>
            </div>
          </div>

          <div v-if="editingSeq === batch.reportSeq" class="mt-3 flex flex-col gap-2">
            <Input.TextArea v-model:value="reason" :disabled="saving" :maxlength="255" :rows="2" aria-label="更正原因" placeholder="填写更正原因，例如把 25 张填成 28 张" />
            <div class="flex justify-end gap-2">
              <Button :disabled="saving" @click="cancelEdit">取消</Button>
              <Button :loading="saving" type="primary" @click="submit(batch)">提交更正</Button>
            </div>
          </div>

          <div v-if="batch.pending" class="mt-3 space-y-2 rounded-md bg-warning/10 p-2">
            <p class="m-0 text-sm">{{ batch.pending.applicantName || '报工人员' }}申请更正 · {{ batch.pending.reason }}</p>
            <div v-for="row in batch.pending.rows" :key="row.outputId" class="text-xs tabular-nums">
              {{ batch.rows.find((line) => line.id === row.outputId)?.itemCode }}
              · 良品 {{ formatQty(batch.pending.originalRows?.find((line) => line.outputId === row.outputId)?.goodQuantity) }} → {{ formatQty(row.goodQuantity) }}
              · 残次 {{ formatQty(batch.pending.originalRows?.find((line) => line.outputId === row.outputId)?.defectQuantity) }} → {{ formatQty(row.defectQuantity) }} {{ unit }}
            </div>
            <template v-if="canConfirm">
              <Input v-model:value="reviewNotes[batch.pending.id]" :disabled="saving" :maxlength="255" aria-label="审核说明" placeholder="审核说明，退回时必填" />
              <div class="flex flex-wrap justify-end gap-2">
                <Button :disabled="saving" @click="review(batch.pending!, 'REJECT')">退回</Button>
                <Button type="primary" :loading="saving" @click="review(batch.pending!, 'APPROVE')">确认更正</Button>
              </div>
            </template>
          </div>

          <details v-if="batch.history?.some((item) => item.id !== batch.pending?.id)" class="mt-3 text-sm">
            <summary class="cursor-pointer text-muted-foreground">更正历史</summary>
            <div v-for="item in batch.history.filter((record) => record.id !== batch.pending?.id)" :key="item.id" class="py-1">
              <Tag>{{ statusText[item.status] || item.status }}</Tag>{{ item.applicantName || '报工人员' }} · {{ item.reason }}
              <span v-if="item.reviewNote || item.reviewerName" class="text-xs text-muted-foreground"> · {{ item.reviewerName }} {{ item.reviewNote }}</span>
            </div>
          </details>
        </section>
      </div>
    </Spin>
  </FactoryDialog>
</template>
