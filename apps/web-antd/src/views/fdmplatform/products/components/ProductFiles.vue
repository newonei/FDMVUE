<script setup lang="ts">
import type {
  ProductAttachment,
  ProductAttachmentView,
} from '#/api/fdmplatform/products';

import { ref, watch } from 'vue';

import {
  Alert,
  Button,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  downloadProductAttachment,
  getProductAttachments,
  uploadProductAttachment,
} from '#/api/fdmplatform/products';

import { errorText } from '../../data';

const props = defineProps<{ companyId: number; productId: string }>();
const emit = defineEmits<{ changed: [] }>();
const replacesId = ref<string>();
const view = ref<ProductAttachmentView>();
const selectedFile = ref<File>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const loading = ref(false);
const panelError = ref('');
const uploadKey = ref('');
let sequence = 0;
watch(
  () => [props.companyId, props.productId],
  () => {
    selectedFile.value = undefined;
    void load();
  },
  { immediate: true },
);
async function load() {
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getProductAttachments(
      props.companyId,
      props.productId,
    );
    if (run === sequence) view.value = result;
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function chooseFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0];
  uploadKey.value = newIdempotencyKey();
}
async function upload() {
  if (!selectedFile.value) return;
  uploading.value = true;
  panelError.value = '';
  try {
    await uploadProductAttachment(
      props.companyId,
      props.productId,
      selectedFile.value,
      uploadKey.value,
      replacesId.value,
    );
    selectedFile.value = undefined;
    if (fileInput.value) fileInput.value.value = '';
    message.success('产品标准资料已上传');
    replacesId.value = undefined;
    emit('changed');
    await load();
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    uploading.value = false;
  }
}
async function download(file: ProductAttachment) {
  try {
    const blob = await downloadProductAttachment(
      props.companyId,
      props.productId,
      file.id,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    panelError.value = errorText(error);
  }
}
</script>

<template>
  <Space direction="vertical" style="width: 100%" :size="12">
    <Alert v-if="panelError" type="error" show-icon :message="panelError" />
    <Alert
      v-if="view && !view.enabled"
      type="warning"
      show-icon
      message="系统文件存储暂不可用，请检查基础设施中的文件配置。"
    />
    <p>
      此处上传跨业务共用的产品规格、检测、包装及说明书资料，本业务所有启用登录用户均可读取。客户专属图稿请在具体合同的“产品规格”附件中上传。
    </p>
    <Space wrap>
      <template v-if="view?.enabled && view.canUpload">
        <Select
          v-model:value="replacesId"
          :options="
            view.items
              .filter((file) => file.active)
              .map((file) => ({
                value: file.id,
                label: `替换 ${file.name}（v${file.revision}）`,
              }))
          "
          allow-clear
          placeholder="新增资料（或选择要替换的文件）"
          style="width: 280px"
          :disabled="uploading"
          @change="uploadKey = newIdempotencyKey()"
        />
        <input
          ref="fileInput"
          type="file"
          aria-label="选择产品标准资料"
          :disabled="uploading"
          @change="chooseFile"
        /><Button
          :loading="uploading"
          :disabled="!selectedFile"
          @click="upload"
        >
          上传标准资料
        </Button>
</template><Button :loading="loading" @click="load">刷新资料</Button>
    </Space>
    <Table
      :data-source="view?.items ?? []"
      row-key="id"
      :loading="loading"
      :pagination="false"
      :columns="[
        { title: '资料名称', dataIndex: 'name' },
        { title: '版本', key: 'revision' },
        { title: '上传时间', dataIndex: 'createdAt' },
        { title: '操作', key: 'action' },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <Tag
          v-if="column.key === 'revision'"
          :color="record.active ? 'green' : 'default'"
        >
          v{{ record.revision }} · {{ record.active ? '当前' : '历史' }}
        </Tag>
        <Button
          v-if="column.key === 'action'"
          type="link"
          @click="download(record as ProductAttachment)"
        >
          下载
        </Button>
      </template>
    </Table>
  </Space>
</template>
