<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Modal } from 'ant-design-vue';

import { isActiveResultAsset } from '../result-history';

interface ComparisonSelection {
  asset: FdmCreativeApi.NodeResultAsset;
  label: string;
  version: FdmCreativeApi.NodeResultVersion;
}

const props = defineProps<{
  open: boolean;
  selections: ComparisonSelection[];
}>();
const emit = defineEmits<{ close: [] }>();
const zoom = ref(1);
const panes = ref<HTMLDivElement[]>([]);
const images = computed(() =>
  props.selections
    .filter(({ asset }) => asset.kind === 'IMAGE' && isActiveResultAsset(asset))
    .slice(0, 2),
);

watch(
  () => props.open,
  () => {
    zoom.value = 1;
  },
);

function syncScroll(event: Event) {
  const source = event.currentTarget as HTMLDivElement;
  const horizontal =
    source.scrollLeft / Math.max(1, source.scrollWidth - source.clientWidth);
  const vertical =
    source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
  for (const pane of panes.value) {
    if (pane === source) continue;
    const left = horizontal * (pane.scrollWidth - pane.clientWidth);
    const top = vertical * (pane.scrollHeight - pane.clientHeight);
    if (Math.abs(pane.scrollLeft - left) > 1) pane.scrollLeft = left;
    if (Math.abs(pane.scrollTop - top) > 1) pane.scrollTop = top;
  }
}
</script>

<template>
  <Modal
    centered
    :open="open && images.length === 2"
    :footer="null"
    title="图片比较"
    width="min(1440px, calc(100vw - 32px))"
    @cancel="emit('close')"
  >
    <div class="result-compare" data-testid="result-compare">
      <div class="result-compare__toolbar">
        <span>正在查看两张图片 · 不改变已采用结果</span>
        <div class="result-compare__zoom">
          <span>同步缩放 {{ Math.round(zoom * 100) }}%</span>
          <Button
            size="small"
            aria-label="比较缩小"
            :disabled="zoom <= 1"
            @click="zoom = Math.max(1, zoom - 0.5)"
          >
            <IconifyIcon icon="lucide:zoom-out" />
          </Button>
          <Button
            size="small"
            aria-label="比较放大"
            :disabled="zoom >= 3"
            @click="zoom = Math.min(3, zoom + 0.5)"
          >
            <IconifyIcon icon="lucide:zoom-in" />
          </Button>
          <Button size="small" @click="zoom = 1">适合窗口</Button>
        </div>
      </div>
      <div class="result-compare__images">
        <article
          v-for="item in images"
          :key="`${item.version.nodeRunId}:${item.asset.id}`"
          class="result-compare__item"
        >
          <header>
            <strong
              >{{ item.label }} · {{ item.asset.name || '未命名图片' }}</strong
            >
            <span>{{ item.version.model?.name || '模型未记录' }}</span>
          </header>
          <div
            ref="panes"
            class="result-compare__viewport"
            tabindex="0"
            :aria-label="`${item.label}图片，可滚动查看细节`"
            @scroll="syncScroll"
          >
            <div
              class="result-compare__surface"
              :style="{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }"
            >
              <img
                :src="item.asset.url"
                :alt="`${item.label} ${item.asset.name || '结果图片'}`"
              />
            </div>
          </div>
          <footer>
            <span v-if="item.asset.width && item.asset.height"
              >{{ item.asset.width }} × {{ item.asset.height }}</span
            >
            <span v-else>原图比例显示</span>
            <a :href="item.asset.url" :download="item.asset.name">下载原图</a>
          </footer>
        </article>
      </div>
      <p class="result-compare__hint">
        两侧保留原图比例；放大后滚动任意一侧，同步查看相同位置。
      </p>
    </div>
  </Modal>
</template>

<style scoped>
.result-compare__toolbar,
.result-compare__zoom,
.result-compare__item footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.result-compare__toolbar {
  margin: 4px 0 14px;
  font-size: 12px;
}

.result-compare__images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.result-compare__item {
  min-width: 0;
}

.result-compare__item header {
  display: grid;
  gap: 4px;
  margin-bottom: 8px;
}

.result-compare__item header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.result-compare__item header span,
.result-compare__item footer,
.result-compare__hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.result-compare__viewport {
  height: clamp(280px, 56vh, 640px);
  overflow: auto;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.result-compare__surface {
  box-sizing: border-box;
  padding: 12px;
}

.result-compare__surface img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.result-compare__item footer {
  margin-top: 8px;
}

.result-compare__hint {
  margin: 12px 0 0;
}

@media (max-width: 640px) {
  .result-compare__images {
    gap: 8px;
  }
  .result-compare__viewport {
    height: 42vh;
  }
  .result-compare__surface {
    padding: 4px;
  }
}
</style>
