<script setup lang="ts">
/** 手机端每一步的顶部：返回、标题、第几步。 */
defineProps<{ current?: number; subtitle?: string; title: string; total?: number }>();
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <header class="flex flex-col gap-2.5 border-b border-border bg-card px-4 py-3">
    <div class="flex items-center gap-2">
      <button
        aria-label="返回"
        class="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground"
        type="button"
        @click="emit('back')"
      >
        <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" viewBox="0 0 24 24" width="22"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div class="flex min-w-0 flex-col">
        <span class="text-lg font-bold">{{ title }}</span>
        <span v-if="subtitle" class="truncate text-sm text-muted-foreground">{{ subtitle }}</span>
      </div>
    </div>
    <div v-if="total" class="grid gap-1.5" :style="{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }">
      <div
        v-for="i in total"
        :key="i"
        :class="i <= (current ?? 0) ? 'bg-primary' : 'bg-muted'"
        class="h-1.5 rounded-full"
      ></div>
    </div>
  </header>
</template>
