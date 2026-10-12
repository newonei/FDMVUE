<script setup lang="ts">
import type {
  ProcurementFile,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import { downloadProcurementFile } from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { downloadBlob } from '../model';
const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  action: [name: string];
  details: [];
  signed: [file: File, exportId: string];
}>();
const pageError = ref('');
const exportId = ref<string>();
const fileInput = ref<HTMLInputElement>();
const confirmed = computed(() => props.view.details.status === 'CONFIRMED');
const entity = computed(() => props.view.details.signingEntitySnapshot);
const template = computed(() => props.view.details.templateSnapshot);
const picked = computed(() => props.view.details.clauseSnapshots ?? []);
const signed = computed(() =>
  props.view.files.some((file) => file.kind === 'SIGNED'),
);
// The newest Word is almost always the one the factory stamped.
watch(
  () => props.view.exports.map((file) => file.id).join(','),
  () => {
    exportId.value = props.view.exports.at(-1)?.id;
  },
  { immediate: true },
);
async function download(file: ProcurementFile) {
  try {
    downloadBlob(
      await downloadProcurementFile(
        props.view.contractId,
        props.view.id,
        file.id,
      ),
      file.name,
    );
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && exportId.value) emit('signed', file, exportId.value);
  if (fileInput.value) fileInput.value.value = '';
}
</script>
<template>
  <Space direction="vertical" style="width: 100%" size="middle">
    <Alert v-if="pageError" type="error" :message="pageError" />
    <Alert
      v-if="!confirmed"
      type="warning"
      show-icon
      message="下单资料还没确认，暂时不能生成采购单"
      description="签约公司、采购单模板和条款在「商品与到货」页签的下单资料里填写，确认后回到这里生成 Word。"
    >
      <template #action>
        <Button size="small" type="primary" @click="emit('details')">
          去填写下单资料
        </Button>
      </template>
    </Alert>
    <Card title="采购单模板" size="small">
      <ol class="contract-steps">
        <li :class="{ done: view.exports.length > 0 }">
          <b>1. 生成采购单 Word</b>
          <span class="muted">按已确认的下单资料生成，可在 Word 里微调后发给工厂盖章。</span>
          <Button
            v-if="view.allowedActions.includes('EXPORT_CONTRACT')"
            :type="view.exports.length > 0 ? 'default' : 'primary'"
            :loading="saving"
            @click="emit('action', 'EXPORT_CONTRACT')"
          >
            {{ view.exports.length > 0 ? '重新生成 Word' : '生成采购单 Word' }}
          </Button>
        </li>
        <li :class="{ done: signed }">
          <b>2. 上传供应商盖章件（选填）</b>
          <span class="muted">支持 PDF、Word 或照片（jpg / png）。</span>
          <Space v-if="view.allowedActions.includes('UPLOAD_SIGNED')" wrap>
            <Select
              v-if="view.exports.length > 1"
              v-model:value="exportId"
              :options="
                view.exports.map((file) => ({
                  value: file.id,
                  label: `对应第${file.revision ?? ''}版 Word`,
                }))
              "
              style="width: 180px"
            /><Button
              :type="signed ? 'default' : 'primary'"
              :disabled="!exportId || saving || !view.storageEnabled"
              :title="view.storageEnabled ? undefined : '文件存储未配置'"
              @click="fileInput?.click()"
            >
              {{ signed ? '再传一份盖章件' : '上传盖章件' }}
            </Button>
            <input
              ref="fileInput"
              type="file"
              hidden
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              @change="upload"
            />
          </Space>
          <span v-else-if="confirmed" class="muted">先生成 Word</span>
        </li>
      </ol>
    </Card>
    <Card title="签约资料" size="small">
      <Descriptions size="small" :column="2">
        <Descriptions.Item label="采购方">
          {{ entity?.legalName ?? entity?.name ?? '未选择' }}
        </Descriptions.Item>
        <Descriptions.Item label="供应商">
          {{ view.order.supplierName }}
        </Descriptions.Item>
        <Descriptions.Item label="采购方地址">
          {{ entity?.address ?? '未维护' }}
        </Descriptions.Item>
        <Descriptions.Item label="工厂联系人">
          {{ view.details.contactSnapshot?.name ?? '未选择' }}
          {{ view.details.contactSnapshot?.phone }}
        </Descriptions.Item>
        <Descriptions.Item label="合同模板">
          {{ template?.name ?? '未选择' }}
        </Descriptions.Item>
        <Descriptions.Item label="条款">
          {{ picked.map((item) => item.name).join('；') || '未选择' }}
        </Descriptions.Item>
      </Descriptions>
    </Card>
    <Card v-if="template" title="正文预览" size="small">
      <h3>{{ template.title }}</h3>
      <p class="clause-text">{{ template.headerText }}</p>
      <section v-for="item in picked" :key="item.id">
        <strong>{{ item.name }}</strong>
        <p class="clause-text">{{ item.text }}</p>
      </section>
      <p class="clause-text">{{ template.footerText }}</p>
    </Card>
    <Card title="文件记录" size="small">
      <Table
        :data-source="view.files"
        row-key="id"
        size="small"
        :pagination="false"
        :columns="[
          { title: '文件', dataIndex: 'name' },
          { title: '类型', key: 'kind' },
          { title: '文件版本', dataIndex: 'revision' },
          { title: '资料修订版', dataIndex: 'detailsRevision' },
          { title: '时间', key: 'createdAt', dataIndex: 'createdAt' },
          { title: '操作', key: 'action' },
        ]"
      >
        <template #emptyText>还没有生成过合同</template>
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'kind'">{{
            record.kind === 'SIGNED' ? '供应商盖章件' : '采购单 Word'
          }}</span><span v-else-if="column.key === 'createdAt'">{{
            formatDate(
              record.createdAt == null ? undefined : String(record.createdAt),
              'YYYY-MM-DD HH:mm',
            ) || '—'
          }}</span><Button
            v-else-if="column.key === 'action'"
            type="link"
            @click="download(record as ProcurementFile)"
          >
            下载
          </Button>
        </template>
      </Table>
    </Card>
  </Space>
</template>
<style scoped>
.contract-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.contract-steps li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.contract-steps li.done {
  border-color: hsl(var(--success) / 60%);
}

.contract-steps li.done b::after {
  margin-left: 6px;
  color: hsl(var(--success));
  content: '✓';
}

.contract-steps .muted {
  flex: 1 1 240px;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.clause-text {
  line-height: 1.8;
  white-space: pre-wrap;
}
</style>
