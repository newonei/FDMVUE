<script setup lang="ts">
import { Button, Modal } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    busy?: boolean;
    width?: number;
  }>(),
  { busy: false, width: 1280 },
);
const open = defineModel<boolean>('open', { required: true });
</script>

<template>
  <Modal
    v-model:open="open"
    :closable="!busy"
    :keyboard="!busy"
    :mask-closable="false"
    :width="props.width"
    centered
    class="factory-dialog-panel"
    wrap-class-name="factory-dialog"
  >
    <template v-if="$slots.title" #title>
      <slot name="title"></slot>
    </template>
    <slot></slot>
    <template #footer>
      <slot name="footer">
        <Button :disabled="busy" size="large" @click="open = false">关闭</Button>
      </slot>
    </template>
  </Modal>
</template>

<style>
.ant-modal.factory-dialog-panel {
  max-width: calc(100vw - 32px);
  padding-bottom: 0;
}

.factory-dialog-panel > div > .ant-modal-content {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
  padding: 0;
}

.factory-dialog-panel > div > .ant-modal-content > .ant-modal-header {
  flex: none;
  padding: 16px 64px 16px 24px;
  margin: 0;
  border-bottom: 1px solid hsl(var(--border));
  border-radius: inherit;
  border-end-start-radius: 0;
  border-end-end-radius: 0;
}

.factory-dialog-panel > div > .ant-modal-content > .ant-modal-header > .ant-modal-title {
  font-size: 18px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.factory-dialog-panel > div > .ant-modal-content > .ant-modal-close {
  inset-inline-end: 12px;
  top: 11px;
  width: 40px;
  height: 40px;
}

.factory-dialog-panel > div > .ant-modal-content > .ant-modal-close .ant-modal-close-x {
  line-height: 40px;
}

.factory-dialog-panel > div > .ant-modal-content > .ant-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 20px 24px;
  overflow: auto;
  overscroll-behavior: contain;
}

.factory-dialog-panel > div > .ant-modal-content > .ant-modal-footer {
  flex: none;
  padding: 12px 24px;
  margin: 0;
  border-top: 1px solid hsl(var(--border));
}

@media (max-width: 600px) {
  .ant-modal.factory-dialog-panel {
    max-width: calc(100vw - 16px);
  }

  .factory-dialog-panel > div > .ant-modal-content {
    max-height: calc(100dvh - 16px);
  }

  .factory-dialog-panel > div > .ant-modal-content > .ant-modal-header,
  .factory-dialog-panel > div > .ant-modal-content > .ant-modal-body,
  .factory-dialog-panel > div > .ant-modal-content > .ant-modal-footer {
    padding-inline-start: 12px;
  }

  .factory-dialog-panel > div > .ant-modal-content > .ant-modal-body,
  .factory-dialog-panel > div > .ant-modal-content > .ant-modal-footer {
    padding-inline-end: 12px;
  }
}
</style>
