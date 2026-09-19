<script setup lang="ts">
defineProps<{ description?: string; title: string }>();
</script>

<template>
  <header class="procurement-page-header">
    <div class="procurement-page-heading">
      <span class="procurement-eyebrow">采购协作</span>
      <h1>{{ title }}</h1>
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
