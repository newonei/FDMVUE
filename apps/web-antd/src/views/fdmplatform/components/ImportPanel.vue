<script setup lang="ts">
import type { ImportRow } from '../csv';

import type { BusinessRecord } from '#/api/fdmplatform';

import { computed, onMounted, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  confirmImport,
  getImport,
  getImports,
  newIdempotencyKey,
  validateImport,
} from '#/api/fdmplatform';

import { parseMasterCsv } from '../csv';
import { errorText, label, rows } from '../data';
import RecordTable from './RecordTable.vue';

const props = defineProps<{ companyId: number }>();
const emit = defineEmits<{ imported: [] }>();
const sourceSystem = ref('JINZHI');
const evidenceRef = ref('');
const sourceFilename = ref('');
const sourceSha256 = ref('');
const records = ref<ImportRow[]>([]);
const batches = ref<BusinessRecord[]>([]);
const selected = ref<BusinessRecord>();
const loading = ref(false);
const saving = ref(false);
const panelError = ref('');
const validationKey = ref(newIdempotencyKey());
const confirmationKey = ref(newIdempotencyKey());
const selectedRows = computed(() =>
  rows(selected.value?.records).map((row, index) => ({
    ...row,
    id: `${index}`,
  })),
);
const mappings = computed(() =>
  rows(selected.value?.mappings).map((row, index) => ({
    ...row,
    id: `${index}`,
  })),
);
const preview = computed(() =>
  records.value.map((row, index) => ({ ...row, id: `${index}` })),
);
const issues = computed(() =>
  Array.isArray(selected.value?.issues)
    ? selected.value.issues.map((entry) =>
        typeof entry === 'string'
          ? entry
          : `第 ${entry.row ?? '?'} 行 · ${entry.externalId ?? ''} · ${String(entry.message ?? entry.reason ?? '请核对记录')}`,
      )
    : [],
);
const columns = [
  { key: 'type', title: '类型' },
  { key: 'name', title: '名称' },
  { key: 'code', title: '内部业务编号' },
  { key: 'externalId', title: '来源系统 ID' },
  { key: 'specification', title: '规格说明' },
  { key: 'unit', title: '单位' },
];

async function load() {
  const company = props.companyId;
  loading.value = true;
  try {
    const result = await getImports(company);
    if (props.companyId === company) batches.value = result;
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
async function selectFile(event: Event) {
  const company = props.companyId;
  const file = (event.target as HTMLInputElement).files?.[0];
  records.value = [];
  selected.value = undefined;
  sourceFilename.value = '';
  sourceSha256.value = '';
  panelError.value = '';
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024)
      throw new Error('CSV 文件应不超过 2 MB，请按批次拆分');
    const buffer = await file.arrayBuffer();
    const parsed = parseMasterCsv(
      new TextDecoder('utf-8', { fatal: true }).decode(buffer),
    );
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    if (props.companyId !== company) return;
    sourceSha256.value = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    sourceFilename.value = file.name;
    records.value = parsed;
    validationKey.value = newIdempotencyKey();
  } catch (error) {
    panelError.value = errorText(error);
  }
}
watch([sourceSystem, evidenceRef], () => {
  validationKey.value = newIdempotencyKey();
});
watch(
  () => props.companyId,
  () => {
    records.value = [];
    batches.value = [];
    selected.value = undefined;
    sourceFilename.value = '';
    sourceSha256.value = '';
    evidenceRef.value = '';
    panelError.value = '';
    void load();
  },
);
async function validate() {
  if (records.value.length === 0 || !evidenceRef.value.trim()) {
    panelError.value = '请选择有效 CSV，并填写来源备份 / 依据引用';
    return;
  }
  const company = props.companyId;
  saving.value = true;
  panelError.value = '';
  try {
    const batch = await validateImport({
      companyId: company,
      sourceSystem: sourceSystem.value,
      sourceFilename: sourceFilename.value,
      evidenceRef: evidenceRef.value.trim(),
      sourceSha256: sourceSha256.value,
      records: records.value,
      idempotencyKey: validationKey.value,
    });
    if (props.companyId !== company) return;
    selected.value = batch;
    confirmationKey.value = newIdempotencyKey();
    await load();
    message.success('已生成服务端校验结果，请核对差异后确认');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
async function selectBatch(batch: BusinessRecord) {
  const company = props.companyId;
  loading.value = true;
  panelError.value = '';
  try {
    const detail = await getImport(batch.id);
    if (props.companyId === company) {
      selected.value = detail;
      confirmationKey.value = newIdempotencyKey();
    }
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
async function confirm() {
  const batch = selected.value;
  if (!batch || batch.status !== 'VALIDATED' || batch.version === undefined)
    return;
  const company = props.companyId;
  saving.value = true;
  panelError.value = '';
  try {
    const confirmed = await confirmImport(batch.id, {
      companyId: company,
      expectedVersion: batch.version,
      idempotencyKey: confirmationKey.value,
    });
    if (props.companyId !== company) return;
    selected.value = confirmed;
    await load();
    emit('imported');
    message.success('本批主数据已确认导入');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="import-panel">
    <Alert v-if="panelError" type="error" :message="panelError" show-icon />
    <Alert
      type="info"
      show-icon
      message="仅导入主数据映射，先校验后确认。同来源同内容可复用，有差异则整批拒绝；原系统合同、资金与库存不会被此入口改写。"
    />
    <Card title="读取主数据 CSV · 每批最多 200 行" size="small">
      <Form layout="vertical" class="import-form">
        <Form.Item label="来源系统" required>
          <Select
            v-model:value="sourceSystem"
            :options="[
              { value: 'JINZHI', label: '金智 CRM' },
              { value: 'OKKI', label: 'OKKI' },
              { value: 'FDM_DATA', label: '现有 FDM 主数据' },
              { value: 'JUSHUITAN', label: '聚水潭' },
            ]"
          />
        </Form.Item>
        <Form.Item label="来源备份 / 依据引用" required>
          <Input
            v-model:value="evidenceRef"
            placeholder="填写已保存的备份或依据引用"
          />
        </Form.Item>
        <Form.Item label="UTF-8 CSV 文件" required>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="选择主数据 CSV 文件"
            @change="selectFile"
          />
        </Form.Item>
      </Form>
      <p class="muted">
        表头：<code>type,name,code,externalId,specification,unit</code>。type
        使用 SKU 产品、SUPPLIER 供应商、WAREHOUSE 仓库、STOCK_OWNER
        货权主体。编号按文本处理，保留前导零。 客户请到客户中心新建或从 OKKI
        选择，系统生成编号并要求选择国家 / 地区。
      </p>
      <div v-if="sourceFilename" class="file-evidence">
        <strong>{{ sourceFilename }} · {{ records.length }} 条记录</strong><span>浏览器计算的文件 SHA-256：{{
            sourceSha256
          }}（服务端未读取原文件）</span>
      </div>
      <RecordTable v-if="preview.length" :data="preview" :columns="columns" />
      <Button
        type="primary"
        :loading="saving"
        :disabled="!records.length"
        @click="validate"
      >
        提交服务端预检
      </Button>
    </Card>
    <Card v-if="selected" title="当前批次校验结果" size="small">
      <Space wrap>
        <Tag :color="selected.status === 'VALIDATED' ? 'green' : 'orange'">
          {{ label(selected.status) }}
</Tag><span>批次 {{ selected.id }} · 版本 {{ selected.version }}</span><Button
          v-if="selected.status === 'VALIDATED'"
          type="primary"
          :loading="saving"
          @click="confirm"
        >
          确认导入这批记录
        </Button>
      </Space>
      <Alert
        v-if="issues.length"
        type="error"
        message="发现需要处理的差异"
        show-icon
      >
        <template #description>
          <ul>
            <li v-for="(issue, index) in issues" :key="index">{{ issue }}</li>
          </ul>
        </template>
      </Alert>
      <RecordTable
        v-if="selectedRows.length"
        :data="selectedRows"
        :columns="columns"
      />
      <RecordTable
        v-if="mappings.length"
        :data="mappings"
        :columns="[
          { key: 'row', title: '原始行' },
          { key: 'type', title: '类型' },
          { key: 'externalId', title: '来源 ID' },
          { key: 'masterId', title: '平台主数据 ID' },
          { key: 'created', title: '本次新建（否则复用）' },
        ]"
      />
    </Card>
    <Card title="历史导入批次" size="small">
      <template #extra>
        <Button size="small" :loading="loading" @click="load">
          刷新
        </Button>
</template><Table
        :data-source="batches"
        row-key="id"
        :loading="loading"
        :scroll="{ x: 850 }"
        :columns="[
          { title: '来源文件', dataIndex: 'sourceFilename' },
          { title: '来源系统', dataIndex: 'sourceSystem' },
          { title: '状态', key: 'status' },
          { title: '版本', dataIndex: 'version' },
          { title: '操作', key: 'action' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <Tag v-if="column.key === 'status'">{{ label(record.status) }}</Tag><Button
            v-else-if="column.key === 'action'"
            type="link"
            @click="selectBatch(record as BusinessRecord)"
          >
            查看预检 / 结果
          </Button>
        </template>
      </Table>
    </Card>
  </div>
</template>

<style scoped>
.import-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.import-form {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 0 20px;
}

.muted {
  font-size: 12px;
  line-height: 1.8;
  color: #64748b;
}

.file-evidence {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  word-break: break-all;
}

.file-evidence span {
  font-size: 11px;
  color: #64748b;
}

@media (max-width: 650px) {
  .import-form {
    grid-template-columns: 1fr;
  }
}
</style>
