<script setup lang="ts">
import type { LegacyKind, LegacySummary } from '#/api/fdmplatform/legacy';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Alert, Button, Space, Spin } from 'ant-design-vue';

import { getLegacySummary } from '#/api/fdmplatform/legacy';

import { errorText } from '../data';
import { useRouteOwner } from '../documents/useRouteOwner';
import LegacyPanel from './LegacyPanel.vue';
import { legacyCount, legacyDefaultMode, legacyModeQuery } from './model';

const props = defineProps<{ kinds: LegacyKind[] }>();
const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const summary = ref<LegacySummary>();
const mode = ref<'current' | 'legacy'>('current');
const ready = ref(false);
const initError = ref('');
const nativeVisited = ref(false);
let sequence = 0;
const total = computed(() => legacyCount(summary.value, props.kinds));

watch(
  () => props.kinds.join(','),
  async () => {
    const run = ++sequence;
    ready.value = false;
    summary.value = undefined;
    initError.value = '';
    if (props.kinds.length === 0) {
      mode.value = 'current';
      nativeVisited.value = true;
      ready.value = true;
      return;
    }
    try {
      const result = await getLegacySummary();
      if (run !== sequence) return;
      summary.value = result;
      mode.value = legacyDefaultMode(
        route.query,
        legacyCount(result, props.kinds),
      );
    } catch (error) {
      if (run !== sequence) return;
      initError.value = `原系统记录暂时无法加载：${errorText(error)}`;
      mode.value = 'current';
    } finally {
      if (run === sequence) {
        nativeVisited.value ||= mode.value === 'current';
        ready.value = true;
      }
    }
  },
  { immediate: true },
);

watch(
  () => [route.query, active.value],
  () => {
    if (!active.value || !ready.value) return;
    mode.value = legacyDefaultMode(route.query, total.value);
    nativeVisited.value ||= mode.value === 'current';
  },
);

function changeMode(value: 'current' | 'legacy') {
  if (!active.value) return;
  mode.value = value;
  nativeVisited.value ||= value === 'current';
  const query = legacyModeQuery(route.query, value);
  void router.replace({ query });
}
</script>

<template>
  <div class="legacy-workspace">
    <div v-if="kinds.length" class="legacy-switch">
      <Space wrap>
        <Button
          :type="mode === 'current' ? 'primary' : 'default'"
          @click="changeMode('current')"
        >
          当前业务 · 新建 / 办理
        </Button>
        <Button
          :type="mode === 'legacy' ? 'primary' : 'default'"
          @click="changeMode('legacy')"
        >
          金智导入记录<span v-if="summary">（{{ total }}）</span>
        </Button>
        <span class="legacy-caption">原系统记录保留原状态及金额，当前新单据在本系统办理。</span>
      </Space>
      <Alert v-if="initError" :message="initError" type="warning" show-icon />
    </div>
    <div v-if="!ready" class="legacy-loading">
      <Spin tip="正在读取记录范围…" />
    </div>
    <div v-if="nativeVisited" v-show="mode === 'current' && ready">
      <slot></slot>
    </div>
    <LegacyPanel
      v-if="ready && mode === 'legacy' && active"
      :kinds="kinds"
      :summary="summary"
      class="legacy-page"
    />
  </div>
</template>

<style scoped>
.legacy-switch {
  display: grid;
  gap: 10px;
  margin: 16px 16px 0;
}

.legacy-caption {
  font-size: 12px;
  color: #64748b;
}

.legacy-page {
  margin: 16px;
}

.legacy-loading {
  padding: 64px;
  text-align: center;
}
</style>
