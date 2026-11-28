<script setup lang="ts">
import type { PendingReportCorrection } from '#/api/fdmgongchang/stage-stock/report-correction';

import { ref, watch } from 'vue';

import { Alert, Button } from 'ant-design-vue';

import { getPendingReportCorrections } from '#/api/fdmgongchang/stage-stock/report-correction';

import ReportCorrectionDialog from '../shared/report-correction-dialog.vue';
import { useJob } from '../workbench/use-job';

const props = defineProps<{ factoryId: null | number; process: string }>();
const emit = defineEmits<{ saved: [] }>();
const job = useJob();
const rows = ref<PendingReportCorrection[]>([]);
const hasMore = ref(false);
const expanded = ref(false);
const open = ref(false);
const current = ref<PendingReportCorrection>();
let loadVersion = 0;

async function refresh() {
  const version = ++loadVersion;
  if (props.factoryId === null) return;
  try {
    const result = await getPendingReportCorrections(props.process);
    if (version !== loadVersion) return;
    rows.value = result.canReview ? result.rows : [];
    hasMore.value = result.hasMore;
  } catch {
    if (version === loadVersion) rows.value = [];
  }
}

function inspect(row: PendingReportCorrection) {
  current.value = row;
  open.value = true;
}

function saved() {
  void refresh();
  emit('saved');
}

watch([() => props.factoryId, () => props.process], () => {
  rows.value = [];
  hasMore.value = expanded.value = open.value = false;
  current.value = undefined;
  void refresh();
}, { immediate: true });
watch(() => job.my, () => { void refresh(); });
</script>

<template>
  <Alert v-if="rows.length" show-icon type="warning" :message="`${rows.length}${hasMore ? '+' : ''} 条报工更正待确认`">
    <template #action>
      <Button size="small" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : '查看待审批次' }}</Button>
    </template>
    <template v-if="expanded" #description>
      <ul class="mb-0 mt-2 list-none space-y-1 p-0">
        <li v-for="row in rows" :key="row.id" class="flex flex-wrap items-baseline gap-x-2">
          <Button type="link" size="small" class="!px-0" @click="inspect(row)">{{ row.orderNo }} · 第 {{ row.reportSeq }} 次报工</Button>
          <span class="text-sm">{{ row.applicantName ? `${row.applicantName} · ` : '' }}{{ row.reason }}</span>
        </li>
      </ul>
    </template>
  </Alert>
  <ReportCorrectionDialog
    v-model:open="open"
    :order-id="current?.orderId"
    :order-no="current?.orderNo"
    :report-seq="current?.reportSeq"
    :unit="job.options?.stages.find((stage) => stage.code === current?.outputStage)?.unit"
    @saved="saved"
  />
</template>
