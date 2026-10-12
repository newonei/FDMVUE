<script setup lang="ts">
import type { ExchangeRatePoint } from '#/api/fdmplatform/exchange-rates';

import { computed, ref, watch } from 'vue';

import { Alert, Spin } from 'ant-design-vue';

import { getExchangeRateHistory } from '#/api/fdmplatform/exchange-rates';

import { errorText } from '../../data';
import { rateText, trendSummary } from './model';

/** 选中币种的参考汇率走势，只画已保存的每日参考值。 */
const props = defineProps<{ currency: string }>();
const days = ref(90);
const points = ref<ExchangeRatePoint[]>([]);
const loading = ref(false);
const loadError = ref('');
let sequence = 0;

async function load() {
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getExchangeRateHistory(props.currency, days.value);
    if (run === sequence) points.value = result;
  } catch (error) {
    if (run === sequence) {
      points.value = [];
      loadError.value = errorText(error);
    }
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(() => [props.currency, days.value], load, { immediate: true });

const WIDTH = 600;
const HEIGHT = 120;
const summary = computed(() => trendSummary(points.value));
const path = computed(() => {
  const view = summary.value;
  if (!view || points.value.length < 2) return '';
  const span = view.max - view.min || view.max * 0.001 || 1;
  return points.value
    .map((point, index) => {
      const x = (index / (points.value.length - 1)) * WIDTH;
      const y =
        HEIGHT -
        8 -
        ((Number(point.rateToCny) - view.min) / span) * (HEIGHT - 16);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
});
</script>

<template>
  <div class="trend">
    <div class="head">
      <b>1 {{ currency }} 折人民币走势</b>
      <div class="seg" role="group" aria-label="走势区间">
        <button
          v-for="option in [30, 90, 180]"
          :key="option"
          type="button"
          :class="{ on: days === option }"
          @click="days = option"
        >
          {{ option }} 天
        </button>
      </div>
    </div>
    <Alert v-if="loadError" type="error" show-icon :message="loadError" />
    <Spin v-else :spinning="loading">
      <template v-if="summary">
        <div class="figures">
          <span>最新 <b>{{ rateText(summary.last) }}</b>
            <small>{{ summary.lastDate }}</small></span>
          <span>区间最高 <b>{{ rateText(summary.max) }}</b></span>
          <span>区间最低 <b>{{ rateText(summary.min) }}</b></span>
          <span>区间均值 <b>{{ rateText(summary.average) }}</b></span>
          <span>较 {{ summary.firstDate }}
            <b :class="summary.change >= 0 ? 'up' : 'down'">{{ summary.change >= 0 ? '+' : ''
              }}{{ summary.change.toFixed(2) }}%</b></span>
        </div>
        <svg
          v-if="path"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          class="chart"
          role="img"
          :aria-label="`${currency} 参考汇率走势`"
        >
          <path :d="path" class="line" vector-effect="non-scaling-stroke" />
        </svg>
        <p class="note">
          共 {{ points.length }} 个公布日。只显示系统已保存的每日参考值（{{
            points[0]?.rateDate
          }}
          起），休市日沿用前一公布日、不重复画点。
        </p>
      </template>
      <p v-else-if="!loading" class="note">这段时间还没有保存的参考汇率。</p>
    </Spin>
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.seg button {
  padding: 2px 10px;
  font: inherit;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.seg button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.figures {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.figures b {
  margin-left: 4px;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}

.figures b.up {
  color: hsl(var(--success));
}

.figures b.down {
  color: hsl(var(--destructive));
}

.chart {
  width: 100%;
  height: 120px;
  background: hsl(var(--accent) / 50%);
  border-radius: 6px;
}

.line {
  fill: none;
  stroke: hsl(var(--primary));
  stroke-width: 2;
}

.note {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
