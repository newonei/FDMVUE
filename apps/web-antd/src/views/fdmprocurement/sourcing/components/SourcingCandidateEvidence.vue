<script lang="ts" setup>
import type { CandidatePresentationFacts } from '../candidate-presentation';

import type { FdmProcurementSourcingApi } from '#/api/fdmprocurement/sourcing';

import { computed } from 'vue';

import { Tag, Tooltip } from 'ant-design-vue';

import { evidenceCompleteness, reasonText } from '../candidate-presentation';

interface CandidateEvidenceFacts extends CandidatePresentationFacts {
  currency?: null | string;
  eliminationCodes?: null | string[];
  exchangeRateToCny?: FdmProcurementSourcingApi.DecimalValue | null;
  performanceFactsHash?: null | string;
  rateEffectiveDate?: null | string;
  rateFallbackUsed?: boolean | null;
  rateProvider?: null | string;
  rateRequestedDate?: null | string;
}

const props = defineProps<{ candidate: CandidateEvidenceFacts }>();

const evidence = computed(() => evidenceCompleteness(props.candidate));
const reasonCodes = computed(() => props.candidate.eliminationCodes || []);
const isRmbQuote = computed(() =>
  ['CNY', 'RMB'].includes((props.candidate.currency || '').toUpperCase()),
);
</script>

<template>
  <div class="candidate-evidence">
    <div class="candidate-evidence__title">
      <Tag :color="evidence.color">{{ evidence.label }}</Tag>
      <Tooltip :title="evidence.note">
        <span class="candidate-evidence__help">证据完整性</span>
      </Tooltip>
    </div>

    <div v-if="candidate.performanceSnapshotId" class="candidate-evidence__row">
      <span>绩效快照</span>
      <Tooltip :title="candidate.performanceFactsHash || '未返回事实 Hash'">
        <strong>#{{ candidate.performanceSnapshotId }}</strong>
      </Tooltip>
    </div>
    <div v-else class="candidate-evidence__missing">未返回绩效快照</div>

    <div v-if="candidate.exchangeRateToCny" class="candidate-evidence__rate">
      <div class="candidate-evidence__row">
        <span>兑人民币</span>
        <strong>{{ candidate.exchangeRateToCny }}</strong>
      </div>
      <div class="candidate-evidence__meta">
        {{ candidate.rateProvider || '来源未提供' }} ·
        {{
          candidate.rateEffectiveDate ||
          candidate.rateRequestedDate ||
          '日期未提供'
        }}
        <Tag v-if="candidate.rateFallbackUsed" color="gold">回退汇率</Tag>
      </div>
    </div>
    <div v-else-if="isRmbQuote" class="candidate-evidence__meta">
      人民币报价，无需换汇
    </div>
    <div v-else class="candidate-evidence__missing">未返回可信汇率证据</div>

    <Tooltip v-if="candidate.evidenceHash" :title="candidate.evidenceHash">
      <div class="candidate-evidence__hash">证据 Hash 已冻结</div>
    </Tooltip>

    <div v-if="reasonCodes.length" class="candidate-evidence__reasons">
      <Tooltip
        v-for="code in reasonCodes"
        :key="code"
        :title="reasonText(code)"
      >
        <Tag>{{ code }}</Tag>
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.candidate-evidence {
  display: grid;
  gap: 5px;
  min-width: 230px;
  font-size: 12px;
  color: #475569;
}

.candidate-evidence__title,
.candidate-evidence__row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.candidate-evidence__help {
  text-decoration: underline dotted;
  cursor: help;
}

.candidate-evidence__meta,
.candidate-evidence__missing {
  color: #64748b;
}

.candidate-evidence__missing {
  color: #b45309;
}

.candidate-evidence__hash {
  overflow: hidden;
  text-overflow: ellipsis;
  color: #2563eb;
  white-space: nowrap;
  cursor: help;
}

.candidate-evidence__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.candidate-evidence__reasons :deep(.ant-tag) {
  max-width: 220px;
  margin-inline-end: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
</style>
