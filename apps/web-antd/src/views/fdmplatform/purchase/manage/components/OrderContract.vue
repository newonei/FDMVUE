<script setup lang="ts">
import type {
  ProcurementFile,
  ProcurementOrderView,
  ProcurementSetting,
} from '#/api/fdmplatform/procurement';

import { computed, reactive, ref, watch } from 'vue';

import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  downloadProcurementFile,
  getProcurementSettings,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { compatibleClauses, downloadBlob } from '../model';
const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  action: [name: string];
  save: [payload: Record<string, unknown>];
  signed: [file: File, exportId: string];
}>();
const entities = ref<ProcurementSetting[]>([]);
const templates = ref<ProcurementSetting[]>([]);
const clauses = ref<ProcurementSetting[]>([]);
const pageError = ref('');
const exportId = ref<string>();
const fileInput = ref<HTMLInputElement>();
const form = reactive({
  signingEntityId: undefined as string | undefined,
  templateId: undefined as string | undefined,
  clauseIds: [] as string[],
});
const canEdit = computed(() =>
  props.view.allowedActions.includes('SAVE_DETAILS'),
);
const entity = computed(
  () =>
    (canEdit.value
      ? entities.value.find((item) => item.id === form.signingEntityId)
      : props.view.details.signingEntitySnapshot) ??
    props.view.details.signingEntitySnapshot,
);
const template = computed(
  () =>
    (canEdit.value
      ? templates.value.find((item) => item.id === form.templateId)
      : props.view.details.templateSnapshot) ??
    props.view.details.templateSnapshot,
);
const groups = computed(() => [
  ...new Set(
    (canEdit.value ? clauses.value : (props.view.details.clauseSnapshots ?? []))
      .map((item) => item.groupCode)
      .filter(Boolean),
  ),
]);
const picked = computed(() =>
  canEdit.value
    ? clauses.value.filter((item) => form.clauseIds.includes(item.id))
    : (props.view.details.clauseSnapshots ?? []),
);
watch(
  () => [props.view.id, props.view.details.version],
  async () => {
    Object.assign(form, {
      signingEntityId: props.view.details.signingEntityId,
      templateId: props.view.details.templateId,
      clauseIds: [...props.view.details.clauseIds],
    });
    try {
      [entities.value, templates.value, clauses.value] = await Promise.all([
        getProcurementSettings('entities', { usage: 'SIGN' }),
        getProcurementSettings('templates'),
        getProcurementSettings('clauses'),
      ]);
    } catch (error) {
      pageError.value = errorText(error);
    }
  },
  { immediate: true },
);
function clauseGroupTitle(group: string | undefined) {
  const labels: Record<string, string> = {
    PAYMENT: '付款条款',
    DELIVERY: '交货条款',
    QUALITY: '质量要求',
    AFTER_SALES: '售后服务',
    PACKAGING: '包装要求',
    TRANSPORT: '运输约定',
    ACCEPTANCE: '验收标准',
    LIABILITY: '违约责任',
    DISPUTE: '争议解决',
    CONFIDENTIALITY: '保密条款',
    OTHER: '其他约定',
  };
  return group ? (labels[group] ?? group) : '条款组';
}
function chooseClause(group: string, value: unknown) {
  const other = form.clauseIds.filter(
    (id) => clauses.value.find((item) => item.id === id)?.groupCode !== group,
  );
  form.clauseIds = typeof value === 'string' ? [...other, value] : other;
}
function save() {
  pageError.value = compatibleClauses(
    clauses.value,
    form.clauseIds,
    template.value?.requiredClauseGroups ?? [],
  );
  if (pageError.value) return;
  emit('save', { ...props.view.details, ...form });
}
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
    <Alert v-if="pageError" type="error" :message="pageError" /><Alert
      type="info"
      message="采购签约公司独立于付款主体和成本归属。Word只包含选定签约资料、采购明细及条款，不包含内部付款分摊或利润。"
    /><Card title="签约资料与条款选择" size="small">
      <Form layout="vertical" class="contract-fields">
        <Form.Item label="采购签约公司" required>
          <Select
            v-model:value="form.signingEntityId"
            :disabled="!canEdit || saving"
            :options="
              entities
                .filter(
                  (item) => item.active || item.id === form.signingEntityId,
                )
                .map((item) => ({
                  value: item.id,
                  label: item.legalName ?? item.name,
                }))
            "
            show-search
            option-filter-prop="label"
            placeholder="选择签约公司"
          />
</Form.Item><Form.Item label="合同模板" required>
          <Select
            v-model:value="form.templateId"
            :disabled="!canEdit || saving"
            :options="
              templates
                .filter((item) => item.active || item.id === form.templateId)
                .map((item) => ({
                  value: item.id,
                  label: `${item.name} · 版本${item.version}`,
                }))
            "
            placeholder="选择模板"
          />
</Form.Item><Form.Item
          v-for="group in groups"
          :key="group"
          :label="clauseGroupTitle(group)"
          :required="template?.requiredClauseGroups?.includes(group!)"
        >
          <Select
            :value="picked.find((item) => item.groupCode === group)?.id"
            :disabled="!canEdit || saving"
            :options="
              clauses
                .filter(
                  (item) =>
                    item.groupCode === group &&
                    (item.active || form.clauseIds.includes(item.id)),
                )
                .map((item) => ({ value: item.id, label: item.name }))
            "
            allow-clear
            @update:value="(value) => chooseClause(group!, value)"
          />
        </Form.Item>
</Form><Space wrap>
        <Button v-if="canEdit" type="primary" :loading="saving" @click="save">
          保存合同选择
</Button><Button
          v-if="view.allowedActions.includes('CONFIRM_DETAILS')"
          :loading="saving"
          @click="emit('action', 'CONFIRM_DETAILS')"
        >
          确认已保存下单资料
</Button><Button
          v-if="view.allowedActions.includes('WITHDRAW_DETAILS')"
          :loading="saving"
          @click="emit('action', 'WITHDRAW_DETAILS')"
        >
          撤回并编辑
</Button><Button
          v-if="view.allowedActions.includes('EXPORT_CONTRACT')"
          type="primary"
          :loading="saving"
          @click="emit('action', 'EXPORT_CONTRACT')"
        >
          生成可编辑 Word
        </Button>
      </Space>
</Card><Card title="正文与抬头预览" size="small">
      <h3>{{ template?.title ?? '请选择模板' }}</h3>
      <Descriptions size="small" :column="2">
        <Descriptions.Item label="采购方">
          {{
            entity?.legalName ?? entity?.name ?? '未选择'
          }}
</Descriptions.Item><Descriptions.Item label="供应商">
          {{ view.order.supplierName }}
</Descriptions.Item><Descriptions.Item label="采购方地址">
          {{ entity?.address ?? '未维护' }}
</Descriptions.Item><Descriptions.Item label="工厂联系人">
          {{ view.details.contactSnapshot?.name ?? '未选择' }}
          {{ view.details.contactSnapshot?.phone }}
        </Descriptions.Item>
      </Descriptions>
      <p class="clause-text">{{ template?.headerText }}</p>
      <section v-for="item in picked" :key="item.id">
        <strong>{{ item.name }}</strong>
        <p class="clause-text">{{ item.text }}</p>
      </section>
      <p class="clause-text">{{ template?.footerText }}</p>
</Card><Card title="Word 与签章版本" size="small">
      <Space v-if="view.allowedActions.includes('UPLOAD_SIGNED')" wrap>
        <Select
          v-model:value="exportId"
          :options="
            view.exports.map((file) => ({
              value: file.id,
              label: `第${file.revision ?? ''}版 · ${file.name}`,
            }))
          "
          placeholder="选择签章版对应的Word"
          style="width: 320px"
        /><Button
          :disabled="!exportId || saving || !view.storageEnabled"
          @click="fileInput?.click()"
        >
          上传签章版
</Button><input
          ref="fileInput"
          type="file"
          hidden
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          @change="upload"
        />
</Space><Table
        :data-source="view.files"
        row-key="id"
        :columns="[
          { title: '文件', dataIndex: 'name' },
          { title: '文件类型', key: 'kind' },
          { title: '文件版本', dataIndex: 'revision' },
          { title: '资料修订版', dataIndex: 'detailsRevision' },
          { title: '生成时间', key: 'createdAt', dataIndex: 'createdAt' },
          { title: '操作', key: 'action' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'kind'">{{
            record.kind === 'SIGNED' ? '签章文件' : 'Word导出'
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
.contract-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.clause-text {
  line-height: 1.8;
  white-space: pre-wrap;
}

@media (max-width: 700px) {
  .contract-fields {
    grid-template-columns: 1fr;
  }
}
</style>
