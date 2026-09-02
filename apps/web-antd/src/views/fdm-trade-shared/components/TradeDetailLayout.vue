<script lang="ts" setup>
import '../styles.css';

defineOptions({ name: 'FdmTradeDetailLayout' });

withDefaults(
  defineProps<{
    asideLabel?: string;
    mainLabel?: string;
  }>(),
  {
    asideLabel: '摘要与关联单据',
    mainLabel: '单据内容',
  },
);
</script>

<template>
  <div
    class="fdm-trade-detail-layout"
    :class="{ 'fdm-trade-detail-layout--single': !$slots.aside }"
  >
    <main :aria-label="mainLabel" class="fdm-trade-detail-layout__main">
      <slot></slot>
    </main>
    <aside
      v-if="$slots.aside"
      :aria-label="asideLabel"
      class="fdm-trade-detail-layout__aside"
    >
      <slot name="aside"></slot>
    </aside>
  </div>
</template>
