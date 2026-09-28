<script lang="ts" setup>
import type { UploadTask } from '#/store/upload-task';

import { computed } from 'vue';

import { useUploadTaskStore } from '#/store/upload-task';

import { describeUploadTask } from './format';

defineOptions({ name: 'UploadTaskProgress' });

const props = defineProps<{ task: UploadTask }>();

const store = useUploadTaskStore();

const percent = computed(() => {
  if (props.task.status === 'success' || props.task.status === 'processing') {
    return 100;
  }
  return Math.floor(props.task.progress * 100);
});

const description = computed(() => describeUploadTask(props.task, store.now));
</script>

<template>
  <div class="upload-task-progress" :class="`is-${task.status}`">
    <div class="upload-task-progress__track">
      <div
        class="upload-task-progress__bar"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>
    <div class="upload-task-progress__text" :title="description">
      {{ description }}
    </div>
  </div>
</template>

<style scoped>
.upload-task-progress {
  min-width: 0;
}

.upload-task-progress__track {
  position: relative;
  height: 4px;
  overflow: hidden;
  background: hsl(var(--muted));
  border-radius: 999px;
}

.upload-task-progress__bar {
  height: 100%;
  background: hsl(var(--primary));
  border-radius: inherit;
  transition: width 0.3s ease;
}

.upload-task-progress__text {
  margin-top: 4px;
  overflow: hidden;
  font-size: 12px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 请求体已发完、服务端仍在转存：用流动条纹表明仍在进行，而不是停在 100% */
.is-processing .upload-task-progress__bar {
  background-color: hsl(var(--primary) / 55%);
  background-image: linear-gradient(
    45deg,
    hsl(var(--primary)) 25%,
    transparent 25%,
    transparent 50%,
    hsl(var(--primary)) 50%,
    hsl(var(--primary)) 75%,
    transparent 75%,
    transparent
  );
  background-size: 16px 16px;
  animation: upload-task-stripes 0.8s linear infinite;
}

.is-processing .upload-task-progress__text {
  color: hsl(var(--primary));
}

.is-success .upload-task-progress__bar {
  background: hsl(var(--success));
}

.is-error .upload-task-progress__bar {
  background: hsl(var(--destructive));
}

.is-error .upload-task-progress__text {
  color: hsl(var(--destructive));
}

.is-canceled .upload-task-progress__bar,
.is-queued .upload-task-progress__bar {
  background: hsl(var(--muted-foreground) / 40%);
}

@keyframes upload-task-stripes {
  from {
    background-position: 16px 0;
  }

  to {
    background-position: 0 0;
  }
}
</style>
