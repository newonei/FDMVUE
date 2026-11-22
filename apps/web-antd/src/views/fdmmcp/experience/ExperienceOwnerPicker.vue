<script setup lang="ts">
import type { ExperienceOwner } from '#/api/fdmmcp/experience';

import { computed, ref, watch } from 'vue';

import { Button, Select } from 'ant-design-vue';

import { experienceApi } from '#/api/fdmmcp/experience';

const props = defineProps<{
  disabled: boolean;
  owner: ExperienceOwner | undefined;
  refreshKey: number;
}>();
const emit = defineEmits<{ choose: [ExperienceOwner | undefined] }>();
const query = ref('');
const retry = ref(0);
const directory = ref<ExperienceOwner[]>([]);
const loading = ref(false);
const failed = ref(false);
const options = computed(() =>
  directory.value.map(({ id, name }) => ({
    value: id,
    label: `${name} · 员工编号 ${id}`,
  })),
);

watch(
  [query, retry, () => props.refreshKey],
  ([name], _, onCleanup) => {
    const request = new AbortController();
    loading.value = true;
    failed.value = false;
    directory.value = [];
    const timer = setTimeout(
      async () => {
        try {
          const { items } = await experienceApi(
            'owners',
            { query: name.trim().slice(0, 240), publishedOnly: true },
            request.signal,
          );
          if (!request.signal.aborted) directory.value = items;
        } catch {
          if (!request.signal.aborted) failed.value = true;
        } finally {
          if (!request.signal.aborted) loading.value = false;
        }
      },
      name ? 180 : 0,
    );
    onCleanup(() => {
      clearTimeout(timer);
      request.abort();
    });
  },
  { immediate: true, flush: 'sync' },
);

function choose(value: unknown) {
  if (props.disabled) return;
  if (value === null || value === undefined) {
    emit('choose', undefined);
  } else {
    const id = (value as { value: string }).value;
    const owner = directory.value.find((item) => item.id === id);
    if (owner) emit('choose', owner);
  }
  query.value = '';
}
</script>

<template>
  <Select
    aria-label="选择经验作者"
    class="owners"
    placeholder="全部作者 · 可输入员工姓名"
    :value="
      owner
        ? { value: owner.id, label: `${owner.name} · 员工编号 ${owner.id}` }
        : undefined
    "
    :options="options"
    :disabled="disabled"
    :loading="loading"
    :filter-option="false"
    :not-found-content="
      loading
        ? '正在查找作者…'
        : failed
          ? '员工目录暂时无法读取'
          : query
            ? '没有匹配的经验作者'
            : '暂无已发布经验的作者'
    "
    allow-clear
    label-in-value
    show-search
    @search="query = $event"
    @change="choose"
  />
  <span v-if="failed" role="alert">员工目录读取失败。<Button type="link" size="small" @click="retry++">重试</Button></span>
</template>

<style scoped>
.owners {
  width: min(100%, 260px);
}
</style>
