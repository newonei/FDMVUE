<script setup lang="ts">
import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Empty, InputNumber } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { contractQuickActionReason } from '../../components/contract-workflow';
import ProcurementStatusBadge from '../components/ProcurementStatusBadge.vue';
import {
  compareTaskQuotes,
  includedLabel,
  latestTaskQuotes,
  quotePlanDefault,
  quoteQuantityRange,
  quoteStatus,
} from './comparison';

const props = defineProps<{
  contract: Contract;
  disabled?: boolean;
  quoteId: string;
}>();
const emit = defineEmits<{
  detail: [id: string];
  newQuote: [assignmentId: string];
  plan: [id: string];
}>();
const selectedQuoteId = ref('');
const quantity = ref<number | string | undefined>();
let previousContext = '';
const source = computed(() =>
  props.contract.quotes?.find((quote) => quote.id === props.quoteId),
);
const assignmentId = computed(() => String(source.value?.assignmentId ?? ''));
const comparison = computed(() =>
  compareTaskQuotes(props.contract, assignmentId.value, quantity.value),
);
const selected = computed(() =>
  comparison.value.entries.find(
    (entry) => entry.quote.id === selectedQuoteId.value,
  ),
);
const previousVersion = computed(
  () =>
    source.value &&
    !comparison.value.entries.some(
      (entry) => entry.quote.id === source.value?.id,
    ),
);
const canCreate = computed(
  () =>
    !contractQuickActionReason(props.contract, 'CREATE_QUOTE') &&
    comparison.value.assignment?.method === 'BUY' &&
    comparison.value.assignment?.status !== 'CANCELLED' &&
    props.contract.requests?.some(
      (request) =>
        request.id === comparison.value.assignment?.requestId &&
        request.status !== 'CANCELLED',
    ),
);

function money(value: unknown) {
  const amount = new BigNumber(
    typeof value === 'number' || typeof value === 'string' ? value : Number.NaN,
  );
  return amount.isFinite() ? amount.toFormat() : '待补齐';
}
function evidenceCount(quote: BusinessRecord) {
  return Array.isArray(quote.evidenceIds)
    ? quote.evidenceIds.length
    : undefined;
}
watch(
  () => [props.contract, props.quoteId] as const,
  () => {
    const latest = latestTaskQuotes(props.contract, assignmentId.value);
    const current =
      latest.find((quote) => quote.id === props.quoteId) ??
      latest.find(
        (quote) =>
          source.value?.seriesId && quote.seriesId === source.value.seriesId,
      );
    const context = `${props.contract.id}/${assignmentId.value}`;
    if (
      context !== previousContext ||
      !latest.some((quote) => quote.id === selectedQuoteId.value)
    )
      selectedQuoteId.value = '';
    previousContext = context;
    const first = current ?? latest[0];
    quantity.value = first
      ? (quotePlanDefault(props.contract, first).quantity ??
        String(comparison.value.assignment?.quantity ?? ''))
      : undefined;
  },
  { immediate: true },
);
</script>

<template>
  <section class="quote-comparison" aria-label="同一任务报价比较">
    <header class="comparison-heading">
      <div>
        <span class="eyebrow">同一采购需求</span>
        <h2>{{ comparison.taskItem?.skuName || '产品资料待补齐' }}</h2>
        <p class="procurement-muted">
          {{ contract.code
          }}<span v-if="contract.name"> · {{ contract.name }}</span> ·
          {{ contract.customerName || '客户待补齐' }}
        </p>
        <p v-if="comparison.taskItem?.specification" class="procurement-muted">
          {{ comparison.taskItem.specification }}
        </p>
      </div>
      <Button
        v-if="canCreate"
        :disabled="disabled"
        @click="emit('newQuote', assignmentId)"
      >
        补充供应商报价
      </Button>
    </header>

    <Alert
      v-if="previousVersion"
      type="info"
      show-icon
      message="所选记录已有新版，以下已按同一报价系列展示最新版本。历史记录仍可查看。"
    />
    <Alert
      v-if="!comparison.assignment"
      type="warning"
      show-icon
      message="来源任务待核实，无法按同一需求比较。请打开报价详情检查关联资料。"
    />

    <div class="comparison-controls">
      <div class="quantity-control">
        <label for="procurement-compare-quantity">比较数量</label>
        <InputNumber
          id="procurement-compare-quantity"
          v-model:value="quantity"
          string-mode
          :min="0.000001"
          :disabled="disabled"
          :controls="false"
          style="width: 132px"
        />
        <span class="procurement-muted">{{
          comparison.sourceUnit || '单位待补齐'
        }}</span>
      </div>
      <span class="procurement-muted">{{ comparison.entries.length }} 份当前报价 ·
        已读取同一任务全部报价</span>
    </div>

    <div
      v-if="comparison.entries.length"
      class="comparison-notice"
      :class="{ 'comparison-notice-warning': !comparison.comparable }"
      role="status"
    >
      <template v-if="comparison.comparable">
        币种、单位和税运包装口径一致，可比较报价小计。交期与额外费用仍需一起判断。
      </template>
      <template v-else-if="comparison.differences.length">
        {{
          comparison.differences.join('、')
        }}，请核对口径后再判断；各报价小计仅供单独参考。
      </template>
      <template
        v-else-if="comparison.entries.some((entry) => entry.issues.length)"
      >
        部分报价存在资料缺项、有效期或数量限制，请先核实下方提示。
      </template>
      <template v-else>
        当前仅有一份报价，可补充其他供应商报价后并排比较。
      </template>
    </div>

    <div
      v-if="comparison.entries.length"
      class="quote-columns"
      tabindex="0"
      aria-label="供应商报价，可横向滚动查看"
    >
      <article
        v-for="entry in comparison.entries"
        :key="entry.quote.id"
        class="quote-column"
        :class="{ 'quote-column-selected': selectedQuoteId === entry.quote.id }"
        :data-quote-id="entry.quote.id"
      >
        <header class="supplier-heading">
          <div class="supplier-title">
            {{ entry.quote.supplierName || '供应商待补齐' }}
          </div>
          <div class="supplier-meta">
            <ProcurementStatusBadge
              :status="quoteStatus(entry.quote).status"
              :label="quoteStatus(entry.quote).label"
            />
            <span class="procurement-muted">版本 {{ entry.quote.version ?? '待补齐' }}</span>
          </div>
        </header>
        <div class="quote-price procurement-number">
          <span>{{ entry.quote.currency || '币种待补齐' }}</span>
          <strong>{{ money(entry.quote.unitPrice) }}</strong>
          <span>/ {{ entry.quote.unit || '单位待补齐' }}</span>
        </div>
        <dl class="quote-facts">
          <div>
            <dt>适用数量</dt>
            <dd>{{ quoteQuantityRange(entry.quote) }}</dd>
          </div>
          <div>
            <dt>税费</dt>
            <dd>{{ includedLabel(entry.quote.taxIncluded) }}</dd>
          </div>
          <div>
            <dt>包装</dt>
            <dd>{{ includedLabel(entry.quote.packagingIncluded) }}</dd>
          </div>
          <div>
            <dt>运费</dt>
            <dd>{{ includedLabel(entry.quote.freightIncluded) }}</dd>
          </div>
          <div>
            <dt>承诺到货</dt>
            <dd>{{ entry.quote.promisedDate || '待补齐' }}</dd>
          </div>
          <div>
            <dt>有效截止</dt>
            <dd>{{ entry.quote.validUntil || '待补齐' }}</dd>
          </div>
        </dl>
        <div class="quote-subtotal">
          <span class="procurement-muted">按比较数量计算的小计</span>
          <strong class="procurement-number">{{ entry.quote.currency || '币种待补齐' }}
            {{
              entry.subtotal === undefined ? '待核实' : money(entry.subtotal)
            }}</strong>
          <span v-if="entry.costNotes.length" class="procurement-muted">{{
            entry.costNotes.join('；')
          }}</span>
        </div>
        <ul v-if="entry.issues.length" class="quote-issues">
          <li v-for="issue in entry.issues" :key="issue">{{ issue }}</li>
        </ul>
        <p
          v-else-if="entry.planReason"
          class="quote-action-hint procurement-muted"
        >
          {{ entry.planReason }}
        </p>
        <div class="quote-column-actions">
          <Button
            block
            :disabled="disabled || !entry.canPlan"
            :title="entry.planReason"
            @click="selectedQuoteId = entry.quote.id"
          >
            {{
              selectedQuoteId === entry.quote.id
                ? '已选为方案来源'
                : '选为方案来源'
            }}
          </Button>
          <Button type="text" block @click="emit('detail', entry.quote.id)">
            查看详情与证据<span v-if="evidenceCount(entry.quote) !== undefined">（{{ evidenceCount(entry.quote) }}）</span>
          </Button>
        </div>
      </article>
    </div>
    <Empty v-else description="当前任务暂无可比较的报价" />

    <footer v-if="comparison.entries.length" class="plan-summary">
      <div>
        <strong>{{
          selected
            ? `方案来源：${selected.quote.supplierName || '供应商待补齐'}`
            : '选择一份报价作为方案来源'
        }}</strong>
        <p v-if="selected && !selected.canPlan" class="procurement-muted">
          {{ selected.planReason }}
        </p>
        <p v-else-if="selected" class="procurement-muted">
          方案默认带入剩余可编制数量 {{ selected.planQuantity }}
          {{
            comparison.sourceUnit
          }}，可在表单调整；保存后办理方案生效，再继续下单。
        </p>
        <p v-else class="procurement-muted">
          比较数量用于测算；编制方案时按任务剩余额度带入，可继续调整。
        </p>
      </div>
      <Button
        type="primary"
        :disabled="disabled || !selected?.canPlan"
        @click="selected && emit('plan', selected.quote.id)"
      >
        编制采购方案
      </Button>
    </footer>
  </section>
</template>

<style scoped>
.quote-comparison {
  min-width: 0;
}

.comparison-heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.eyebrow {
  font-size: 12px;
  color: var(--procurement-secondary);
}

.comparison-heading h2 {
  margin: 6px 0 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}

.comparison-heading p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.comparison-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 12px;
}

.quantity-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.comparison-controls > span {
  font-size: 12px;
}

.comparison-notice {
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--procurement-secondary);
  background: var(--procurement-muted);
  border-radius: 6px;
}

.comparison-notice-warning {
  border-left: 3px solid var(--ant-color-warning, #ad741c);
}

.quote-columns {
  display: flex;
  gap: 12px;
  align-items: stretch;
  padding: 2px 2px 12px;
  overflow-x: auto;
}

.quote-columns:focus-visible {
  outline: 2px solid var(--procurement-accent);
  outline-offset: 3px;
}

.quote-column {
  display: flex;
  flex: 1 0 250px;
  flex-direction: column;
  min-width: 250px;
  max-width: 340px;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 8px;
}

.quote-column-selected {
  border-color: var(--procurement-accent);
}

.supplier-heading {
  padding: 16px 16px 0;
}

.supplier-title {
  font-weight: 600;
  line-height: 1.7;
}

.supplier-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
}

.quote-price {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
  padding: 20px 16px;
}

.quote-price strong {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}

.quote-price span {
  font-size: 12px;
  color: var(--procurement-secondary);
}

.quote-facts {
  padding: 0 16px;
  margin: 0;
}

.quote-facts > div {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--procurement-line);
}

.quote-facts dt {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--procurement-secondary);
}

.quote-facts dd {
  margin: 0;
  font-size: 12px;
  text-align: right;
}

.quote-subtotal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.quote-subtotal > span {
  font-size: 12px;
  line-height: 1.6;
}

.quote-subtotal strong {
  font-size: 18px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.quote-issues {
  padding: 10px 12px 10px 24px;
  margin: 0 16px 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--procurement-text);
  background: var(--procurement-muted);
  border-radius: 6px;
}

.quote-action-hint {
  margin: 0 16px 16px;
  line-height: 1.7;
}

.quote-column-actions {
  padding: 0 16px 12px;
  margin-top: auto;
}

.quote-column-actions .ant-btn + .ant-btn {
  margin-top: 6px;
}

.plan-summary {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding-top: 18px;
  margin-top: 16px;
  border-top: 1px solid var(--procurement-line);
}

.plan-summary p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.plan-summary strong {
  font-weight: 500;
}

@media (max-width: 767px) {
  .comparison-heading,
  .plan-summary {
    flex-direction: column;
    align-items: stretch;
  }

  .quote-column {
    flex-basis: min(85vw, 280px);
    min-width: min(85vw, 280px);
  }
}
</style>
