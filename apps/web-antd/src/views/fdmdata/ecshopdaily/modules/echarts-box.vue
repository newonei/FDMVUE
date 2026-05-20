<script lang="ts" setup>
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    option: ECOption | null;
    height?: number;
  }>(),
  { height: 320 },
);

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const emptyOption: ECOption = {
  title: {
    text: '暂无数据',
    left: 'center',
    top: 'middle',
    textStyle: { color: '#999', fontSize: 14 },
  },
};

async function paint() {
  const opt = props.option;
  await renderEcharts(opt ?? emptyOption);
}

watch(
  () => props.option,
  () => {
    void paint();
  },
  { deep: true },
);

onMounted(() => {
  void paint();
});
</script>

<template>
  <EchartsUI
    ref="chartRef"
    class="w-full min-w-0 rounded-md border border-border/60 bg-card"
    :height="`${height}px`"
    width="100%"
  />
</template>
