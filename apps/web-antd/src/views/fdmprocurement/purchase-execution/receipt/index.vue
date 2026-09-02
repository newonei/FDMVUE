<script lang="ts" setup>
import type { FdmProcurementPurchaseExecutionReceiptApi } from '#/api/fdmprocurement/purchase-execution/receipt';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Pagination,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createPurchaseReceipt,
  deletePurchaseReceipt,
  exportPurchaseReceipt,
  getPurchaseReceipt,
  getPurchaseReceiptPage,
  postPurchaseReceipt,
  reversePurchaseReceipt,
  updatePurchaseReceipt,
} from '#/api/fdmprocurement/purchase-execution/receipt';

import { validatePurchaseReceiptReverseReason } from './status-policy';

defineOptions({ name: 'FdmProcurementPurchaseExecutionReceipt' });

type Receipt = FdmProcurementPurchaseExecutionReceiptApi.Receipt;

const { hasAccessByCodes } = useAccess();
const hasPermission = (code: string) => hasAccessByCodes([code]);
const canQuery = computed(() =>
  hasPermission('fdmprocurement:purchase-execution:query'),
);

const loading = ref(false);
const saving = ref(false);
const rows = ref<Receipt[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(10);
const companyId = ref('');
const status = ref<FdmProcurementPurchaseExecutionReceiptApi.PostingStatus>();
const editorOpen = ref(false);
const reverseOpen = ref(false);
const editingId = ref<string>();
const editingVersion = ref<number>();
const reversing = ref<Receipt>();
const reverseReason = ref('');

const form = reactive({
  documentTime: '',
  linesText: '[]',
  purchaseOrderId: '',
  remark: '',
});

const columns = [
  { dataIndex: 'no', key: 'no', title: '入库单号' },
  { dataIndex: 'supplierId', key: 'supplierId', title: '供应商 ID' },
  { dataIndex: 'purchaseOrderId', key: 'purchaseOrderId', title: '采购单 ID' },
  { dataIndex: 'documentTime', key: 'documentTime', title: '入库时间' },
  { dataIndex: 'status', key: 'status', title: '状态' },
  { dataIndex: 'version', key: 'version', title: '数据版本' },
  { key: 'actions', title: '操作', width: 260 },
];

function statusLabel(value?: string) {
  if (value === 'POSTED') return '已过账';
  if (value === 'DRAFT') return '草稿';
  return value || '未知';
}

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  try {
    const result = await getPurchaseReceiptPage({
      companyId: companyId.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: status.value,
    });
    rows.value = result.list || [];
    total.value = result.total || 0;
  } finally {
    loading.value = false;
  }
}

function resetEditor() {
  editingId.value = undefined;
  editingVersion.value = undefined;
  Object.assign(form, {
    documentTime: '',
    linesText: '[]',
    purchaseOrderId: '',
    remark: '',
  });
}

function openCreate() {
  resetEditor();
  editorOpen.value = true;
}

async function openEdit(row: Receipt | Record<string, any>) {
  row = row as Receipt;
  const detail = await getPurchaseReceipt(row.id);
  editingId.value = detail.id;
  editingVersion.value = detail.version;
  Object.assign(form, {
    documentTime: detail.documentTime || '',
    linesText: JSON.stringify(
      (detail.lines || []).map(
        ({ purchaseOrderLineId, quantity, warehouseId }) => ({
          purchaseOrderLineId,
          quantity,
          warehouseId,
        }),
      ),
      null,
      2,
    ),
    purchaseOrderId: detail.purchaseOrderId,
    remark: detail.remark || '',
  });
  editorOpen.value = true;
}

function parseLines() {
  const value = JSON.parse(form.linesText || '[]') as unknown;
  if (!Array.isArray(value)) throw new TypeError('明细必须是 JSON 数组');
  return value as FdmProcurementPurchaseExecutionReceiptApi.LineSaveReq[];
}

async function save() {
  if (!form.purchaseOrderId.trim() || !form.documentTime) {
    message.warning('请输入采购单 ID 和入库时间');
    return;
  }
  let lines: FdmProcurementPurchaseExecutionReceiptApi.LineSaveReq[];
  try {
    lines = parseLines();
    if (lines.length === 0) throw new TypeError('至少需要一条入库明细');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '明细 JSON 无效');
    return;
  }
  const payload: FdmProcurementPurchaseExecutionReceiptApi.SaveReq = {
    documentTime: form.documentTime,
    expectedVersion: editingVersion.value,
    id: editingId.value,
    lines,
    purchaseOrderId: form.purchaseOrderId.trim(),
    remark: form.remark.trim() || undefined,
  };
  saving.value = true;
  try {
    await (editingId.value
      ? updatePurchaseReceipt(payload)
      : createPurchaseReceipt(payload));
    message.success(editingId.value ? '采购入库已更新' : '采购入库已创建');
    editorOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function post(row: Receipt | Record<string, any>) {
  row = row as Receipt;
  await postPurchaseReceipt({
    expectedPostingVersion: row.postingVersion,
    expectedVersion: row.version,
    id: row.id,
  });
  message.success('采购入库已过账');
  await load();
}

function openReverse(row: Receipt | Record<string, any>) {
  reversing.value = row as Receipt;
  reverseReason.value = '';
  reverseOpen.value = true;
}

async function reverse() {
  if (!reversing.value) return;
  const result = validatePurchaseReceiptReverseReason(reverseReason.value);
  if (!result.valid) {
    message.warning(result.error);
    return;
  }
  saving.value = true;
  try {
    await reversePurchaseReceipt({
      expectedPostingVersion: reversing.value.postingVersion,
      expectedVersion: reversing.value.version,
      id: reversing.value.id,
      reason: result.reason,
    });
    message.success('采购入库已反过账');
    reverseOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: Receipt | Record<string, any>) {
  row = row as Receipt;
  await deletePurchaseReceipt(row.id);
  message.success('采购入库已删除');
  await load();
}

async function download() {
  const data = await exportPurchaseReceipt({
    companyId: companyId.value.trim() || undefined,
    pageNo: 1,
    pageSize: pageSize.value,
    status: status.value,
  });
  downloadFileFromBlobPart({ fileName: 'FDM采购入库.xls', source: data });
}

onMounted(load);
</script>

<template>
  <Page auto-content-height>
    <Alert
      v-if="!canQuery"
      message="缺少 fdmprocurement:purchase-execution:query 权限"
      show-icon
      type="warning"
    />
    <Card v-else title="FDM 采购入库">
      <Space class="toolbar" wrap>
        <Input
          v-model:value="companyId"
          allow-clear
          placeholder="公司 ID"
          @press-enter="load"
        />
        <Input
          v-model:value="status"
          allow-clear
          placeholder="状态：DRAFT / POSTED"
          @press-enter="load"
        />
        <Button @click="load">查询</Button>
        <Button
          v-if="hasPermission('fdmprocurement:purchase-execution:create')"
          type="primary"
          @click="openCreate"
        >
          新建
        </Button>
        <Button
          v-if="hasPermission('fdmprocurement:purchase-execution:query')"
          @click="download"
        >
          导出
        </Button>
      </Space>
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <Tag
            v-if="column.key === 'status'"
            :color="record.status === 'POSTED' ? 'green' : 'blue'"
          >
            {{ statusLabel(record.status) }}
          </Tag>
          <Space v-else-if="column.key === 'actions'">
            <Button
              v-if="
                record.status === 'DRAFT' &&
                hasPermission('fdmprocurement:purchase-execution:update')
              "
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Button
              v-if="
                record.status === 'DRAFT' &&
                hasPermission('fdmprocurement:purchase-execution:update-status')
              "
              size="small"
              type="link"
              @click="post(record)"
            >
              过账
            </Button>
            <Button
              v-if="
                record.status === 'POSTED' &&
                hasPermission('fdmprocurement:purchase-execution:update-status')
              "
              danger
              size="small"
              type="link"
              @click="openReverse(record)"
            >
              反过账
            </Button>
            <Button
              v-if="
                record.status === 'DRAFT' &&
                hasPermission('fdmprocurement:purchase-execution:delete')
              "
              danger
              size="small"
              type="link"
              @click="remove(record)"
            >
              删除
            </Button>
          </Space>
        </template>
      </Table>
      <Pagination
        v-model:current="pageNo"
        v-model:page-size="pageSize"
        :total="total"
        @change="load"
      />
    </Card>

    <Modal
      v-model:open="editorOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑采购入库' : '新建采购入库'"
      width="760px"
      @ok="save"
    >
      <div class="editor">
        <label>采购单 ID<Input v-model:value="form.purchaseOrderId" /></label>
        <label>入库时间<Input
            v-model:value="form.documentTime"
            type="datetime-local"
        /></label>
        <label>备注<Input.TextArea v-model:value="form.remark" /></label>
        <label class="wide">
          入库明细（purchaseOrderLineId、warehouseId、quantity）
          <Input.TextArea v-model:value="form.linesText" :rows="10" />
        </label>
      </div>
    </Modal>

    <Modal
      v-model:open="reverseOpen"
      :confirm-loading="saving"
      title="采购入库反过账"
      @ok="reverse"
    >
      <Alert message="反过账必须填写可审计原因。" show-icon type="warning" />
      <Input.TextArea v-model:value="reverseReason" :rows="4" />
    </Modal>
  </Page>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}

.editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.editor label {
  display: grid;
  gap: 6px;
}

.editor .wide {
  grid-column: 1 / -1;
}
</style>
