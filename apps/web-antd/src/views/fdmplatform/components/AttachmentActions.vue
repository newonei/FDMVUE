<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

import { Button, Dropdown, Menu, message, Modal } from 'ant-design-vue';

import { errorText } from '../data';

const props = defineProps<{
  contextKey?: string;
  disabled?: boolean;
  download?: () => unknown;
  loading?: boolean;
  name: string;
  preview?: () => unknown;
  remove?: () => Promise<void>;
  rename?: () => unknown;
}>();

const deleting = ref(false);
let confirmation: ReturnType<typeof Modal.confirm> | undefined;

function closeConfirmation() {
  confirmation?.destroy();
  confirmation = undefined;
}

watch(() => props.contextKey, closeConfirmation, { flush: 'sync' });
onBeforeUnmount(closeConfirmation);

function confirmDeletion() {
  if (!props.remove || props.disabled || deleting.value || confirmation) return;
  const { name, remove } = props;
  confirmation = Modal.confirm({
    title: '删除附件',
    content: `确定删除「${name}」吗？`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    afterClose: () => {
      confirmation = undefined;
    },
    async onOk() {
      deleting.value = true;
      try {
        await remove();
        message.success('附件已删除');
      } catch (error) {
        message.error(errorText(error));
        throw error;
      } finally {
        deleting.value = false;
      }
    },
  });
}
</script>

<template>
  <Dropdown
    :trigger="['click']"
    placement="bottomRight"
    :disabled="disabled || loading || deleting"
  >
    <Button
      size="small"
      :aria-label="`${name}的附件操作`"
      aria-haspopup="menu"
      :disabled="disabled"
      :loading="loading || deleting"
      @click.stop
    >
      <span aria-hidden="true" class="attachment-ellipsis">⋮</span>
    </Button>
    <template #overlay>
      <Menu>
        <Menu.Item
          v-if="download"
          key="download"
          :disabled="disabled || loading || deleting"
          @click="download()"
          >
下载
</Menu.Item>
        <Menu.Item
          v-if="preview"
          key="preview"
          :disabled="disabled || loading || deleting"
          @click="preview()"
          >
预览
</Menu.Item>
        <Menu.Item
          v-if="remove"
          key="delete"
          :disabled="disabled || loading || deleting"
          danger
          @click="confirmDeletion"
        >
          删除
        </Menu.Item>
        <Menu.Item
          v-if="rename"
          key="rename"
          :disabled="disabled || loading || deleting"
          @click="rename()"
          >
重命名
</Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>

<style scoped>
.attachment-ellipsis {
  display: inline-block;
  min-width: 14px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
}
</style>
