<script lang="ts" setup>
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';

import { onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

/** 看板图表外壳：透明背景，跟随明暗主题；没有数据时由页面显示空状态。 */
const props = withDefaults(
  defineProps<{ height?: number; option: ECOption | null }>(),
  { height: 300 },
);

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

async function paint() {
  if (props.option) await renderEcharts(props.option, true);
}

watch(
  () => props.option,
  () => void paint(),
  { deep: true },
);
onMounted(() => void paint());
</script>

<template>
  <EchartsUI ref="chartRef" :height="`${height}px`" width="100%" />
</template>
