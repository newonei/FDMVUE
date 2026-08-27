<script lang="ts" setup>
import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

import { computed } from 'vue';

import { Tag } from 'ant-design-vue';

import { formatCompactDecimal, formatExactMoney, hasValue } from '../data';

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    heading?: string;
    matches?: FdmcaiwuQuotationApi.AccessoryMatch[];
  }>(),
  {
    compact: false,
    heading: '辅料规格匹配',
    matches: () => [],
  },
);

const visibleMatches = computed(() => props.matches.filter(Boolean));
const hasFallback = computed(() =>
  visibleMatches.value.some(
    (item) => String(item.matchMode).toUpperCase() !== 'EXACT',
  ),
);

function accessoryLabel(item: FdmcaiwuQuotationApi.AccessoryMatch) {
  if (item.accessoryName) return item.accessoryName;
  const labels: Record<string, string> = {
    CARTON: '外箱',
    OPP: 'OPP膜',
    STRAP: '绑带',
  };
  return labels[String(item.accessoryType).toUpperCase()] || item.accessoryType;
}

function formatMatchSpecification(
  length: unknown,
  width: unknown,
  thickness: unknown,
) {
  if (![length, width, thickness].every((value) => hasValue(value))) return '—';
  return `${formatCompactDecimal(length, '', 3)} × ${formatCompactDecimal(
    width,
    '',
    3,
  )} × ${formatCompactDecimal(thickness, '', 3)} mm`;
}

function matchModeLabel(item: FdmcaiwuQuotationApi.AccessoryMatch) {
  return String(item.matchMode).toUpperCase() === 'EXACT'
    ? '精确匹配'
    : '向上最近似';
}

function sourceText(item: FdmcaiwuQuotationApi.AccessoryMatch) {
  return [item.sourceVersion, item.sourceLocation].filter(Boolean).join(' · ');
}
</script>

<template>
  <section
    v-if="visibleMatches.length"
    class="accessory-match-panel"
    :class="{ 'is-compact': compact }"
  >
    <div class="accessory-match-heading">
      <div>
        <div class="accessory-match-title">{{ heading }}</div>
        <div class="accessory-match-subtitle">
          优先精确规格；无精确价格时仅采用长、宽、厚均不小于成品的最近启用规格
        </div>
      </div>
      <Tag :color="hasFallback ? 'warning' : 'success'">
        {{ hasFallback ? '含向上替代' : '全部精确匹配' }}
      </Tag>
    </div>

    <div class="accessory-match-grid">
      <div
        v-for="item in visibleMatches"
        :key="`${item.accessoryType}-${item.accessoryPriceId || ''}-${item.matchedLengthMm || ''}-${item.matchedWidthMm || ''}-${item.matchedThicknessMm || ''}`"
        class="accessory-match-item"
      >
        <div class="accessory-match-item-heading">
          <strong>{{ accessoryLabel(item) }}</strong>
          <Tag
            :color="
              String(item.matchMode).toUpperCase() === 'EXACT'
                ? 'success'
                : 'warning'
            "
          >
            {{ matchModeLabel(item) }}
          </Tag>
        </div>
        <div class="accessory-match-specification">
          <span>
            请求
            {{
              formatMatchSpecification(
                item.requestedLengthMm,
                item.requestedWidthMm,
                item.requestedThicknessMm,
              )
            }}
          </span>
          <span class="accessory-match-arrow">→</span>
          <strong>
            采用
            {{
              formatMatchSpecification(
                item.matchedLengthMm,
                item.matchedWidthMm,
                item.matchedThicknessMm,
              )
            }}
          </strong>
        </div>
        <div
          v-if="
            hasValue(item.costPerPiece) ||
            item.accessoryPriceId ||
            sourceText(item)
          "
          class="accessory-match-meta"
        >
          <span v-if="hasValue(item.costPerPiece)">
            单片成本 {{ formatExactMoney(item.costPerPiece) }}
          </span>
          <span v-if="item.accessoryPriceId">
            价格记录 #{{ item.accessoryPriceId }}
          </span>
          <span v-if="sourceText(item)">来源 {{ sourceText(item) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.accessory-match-panel {
  padding: 14px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 10px;
}

.accessory-match-heading,
.accessory-match-item-heading,
.accessory-match-specification,
.accessory-match-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.accessory-match-heading {
  justify-content: space-between;
  margin-bottom: 12px;
}

.accessory-match-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.accessory-match-subtitle,
.accessory-match-meta {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.accessory-match-subtitle {
  margin-top: 2px;
}

.accessory-match-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.accessory-match-item {
  min-width: 0;
  padding: 10px 12px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.accessory-match-item-heading {
  justify-content: space-between;
}

.accessory-match-specification {
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.accessory-match-arrow {
  color: var(--ant-color-primary, #1677ff);
}

.accessory-match-meta {
  flex-wrap: wrap;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.is-compact .accessory-match-subtitle {
  display: none;
}

.is-compact .accessory-match-grid {
  grid-template-columns: 1fr;
}

@media (max-width: 1100px) {
  .accessory-match-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .accessory-match-heading,
  .accessory-match-specification {
    align-items: flex-start;
  }

  .accessory-match-heading {
    flex-direction: column;
  }
}
</style>
