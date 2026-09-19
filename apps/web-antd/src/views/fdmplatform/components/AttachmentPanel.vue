<script setup lang="ts">
import type {
  AttachmentTarget,
  AttachmentView,
  ContractAttachment,
} from '#/api/fdmplatform';

import { onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Empty,
  message,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  downloadAttachment,
  newIdempotencyKey,
  uploadAttachment,
} from '#/api/fdmplatform';

import { errorText } from '../data';

const props = defineProps<{
  categories: string[];
  contractId: string;
  error: string;
  loading: boolean;
  target?: AttachmentTarget;
  view?: AttachmentView;
}>();
const emit = defineEmits<{ busy: [value: boolean]; refresh: [] }>();
const category = ref<string>();
const selectedFile = ref<File>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const downloading = ref('');
const operationError = ref('');
const uploadKey = ref('');
watch(uploading, (value) => emit('busy', value), { flush: 'sync' });
onBeforeUnmount(() => emit('busy', false));
const categoryLabels: Record<string, string> = {
  SPECIFICATION: '产品规格',
  SALES: '商业合同',
  PROCUREMENT: '询价采购',
  RECEIPT: '回款凭证',
  FINANCE: '发票与成本',
  STOCK: '库存与物流',
};
function chooseFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0];
  uploadKey.value = newIdempotencyKey();
}
async function upload() {
  if (!selectedFile.value || !category.value || !props.view?.enabled) return;
  uploading.value = true;
  operationError.value = '';
  try {
    await uploadAttachment(
      props.contractId,
      selectedFile.value,
      category.value,
      uploadKey.value || newIdempotencyKey(),
      props.target,
    );
    selectedFile.value = undefined;
    if (fileInput.value) fileInput.value.value = '';
    message.success(
      props.target
        ? '附件已保存到当前单据'
        : '附件已保存，可在业务表单选择引用',
    );
    emit('refresh');
  } catch (error) {
    operationError.value = errorText(error);
  } finally {
    uploading.value = false;
  }
}
async function download(item: ContractAttachment) {
  downloading.value = item.id;
  operationError.value = '';
  try {
    const blob = await downloadAttachment(props.contractId, item.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    operationError.value = errorText(error);
  } finally {
    downloading.value = '';
  }
}
</script>

<template>
  <div class="attachment-stack">
    <Alert
      v-if="error || operationError"
      type="error"
      show-icon
      :message="error || operationError"
    />
    <Alert
      v-if="view && !view.enabled"
      type="warning"
      show-icon
      message="系统文件存储暂不可用，请检查基础设施中的文件配置。附件上传复用系统当前存储。"
    />
    <p>
      {{
        target
          ? '附件与当前单据关联保存，可在这里继续上传和下载。'
          : '可在这里上传和下载合同资料。'
      }}
    </p>
    <Space wrap>
      <template v-if="view?.enabled && categories.length">
        <Select
          v-model:value="category"
          :options="
            categories.map((value) => ({
              value,
              label: categoryLabels[value] ?? value,
            }))
          "
          placeholder="资料分类"
          style="width: 170px"
          :disabled="uploading"
          @change="uploadKey = newIdempotencyKey()"
        />
        <input
          ref="fileInput"
          type="file"
          aria-label="选择合同附件"
          :disabled="uploading"
          @change="chooseFile"
        />
        <Button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFile || !category"
          @click="upload"
        >
          上传附件
        </Button>
      </template>
      <Button :loading="loading" @click="emit('refresh')">刷新附件</Button>
    </Space>
    <Table
      :data-source="view?.items ?? []"
      row-key="id"
      :loading="loading"
      :columns="[
        { title: '附件名称', dataIndex: 'name' },
        { title: '分类', key: 'category' },
        { title: '大小', key: 'size' },
        { title: '上传时间', dataIndex: 'createdAt' },
        { title: '操作', key: 'action' },
      ]"
      :scroll="{ x: 800 }"
    >
      <template #emptyText>
        <Empty description="暂无当前身份可读取的附件" />
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'category'">{{
          categoryLabels[record.category] ?? record.category
        }}</span>
        <span v-else-if="column.key === 'size'">{{ (Number(record.size) / 1024).toFixed(1) }} KB</span>
        <Button
          v-else-if="column.key === 'action'"
          type="link"
          :loading="downloading === record.id"
          @click="download(record as ContractAttachment)"
        >
          下载
        </Button>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.attachment-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
