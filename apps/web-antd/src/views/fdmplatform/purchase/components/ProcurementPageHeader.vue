<script setup lang="ts">
import { useInMergedView } from '../../components/merged-view';

defineProps<{ description?: string; title: string }>();
const inMergedView = useInMergedView();
</script>

<template>
  <header
    class="procurement-page-header"
    :class="{ 'is-merged': inMergedView }"
  >
    <div class="procurement-page-heading">
      <template v-if="!inMergedView">
        <span class="procurement-eyebrow">采购协作</span>
        <h1>{{ title }}</h1>
      </template>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="procurement-header-actions">
      <slot name="actions"></slot>
    </div>
    <div v-if="$slots.default" class="procurement-header-context">
      <slot></slot>
    </div>
  </header>
</template>
