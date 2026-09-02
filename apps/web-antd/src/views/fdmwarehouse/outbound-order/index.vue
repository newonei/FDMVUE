<script lang="ts" setup>
import type { FdmWarehouseOutboundOrderApi } from '#/api/fdmwarehouse/outbound-order';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  message,
  Modal,
  Pagination,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  completeOutboundOrder,
  createOutboundOrder,
  deleteOutboundOrder,
  exportOutboundOrder,
  getOutboundOrder,
  getOutboundOrderPage,
  updateOutboundOrder,
} from '#/api/fdmwarehouse/outbound-order';

import {
  canCompleteReservationAttempt,
  clearReservationCompletionCommand,
  ensureReservationCompletionCommand,
  isExpectedReservationCompletionReceipt,
  loadReservationCompletionCommand,
  saveReservationCompletionCommand,
} from './reservation-completion-actions';

defineOptions({ name: 'FdmWarehouseOutboundOrder' });

type Outbound = FdmWarehouseOutboundOrderApi.OutboundOrder;

const { hasAccessByCodes } = useAccess();
const hasPermission = (code: string) => hasAccessByCodes([code]);
const canQuery = computed(() =>
  hasPermission('fdmwarehouse:outbound-order:query'),
);

const loading = ref(false);
const saving = ref(false);
const rows = ref<Outbound[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const editorOpen = ref(false);
const editingId = ref<string>();

const form = reactive({
  bizOrderNo: '',
  detailsText: '[]',
  orderTime: '',
  remark: '',
  totalPrice: 0,
  totalQuantity: 0,
  warehouseId: '',
});

const columns = [
  { dataIndex: 'outboundOrderNo', key: 'no', title: '出库单号' },
  { dataIndex: 'bizOrderNo', key: 'bizOrderNo', title: '业务单号' },
  { dataIndex: 'warehouseName', key: 'warehouse', title: '仓库' },
  { dataIndex: 'totalQuantity', key: 'quantity', title: '数量' },
  { dataIndex: 'status', key: 'status', title: '状态' },
  {
    dataIndex: 'reservationAttemptStatus',
    key: 'reservation',
    title: '预留交接',
  },
  { key: 'actions', title: '操作', width: 250 },
];

function statusLabel(status?: number) {
  if (status === 0) return '草稿';
  if (status === 4) return '已完成';
  if (status === 5) return '已作废';
  return status === undefined ? '未知' : String(status);
}

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  try {
    const result = await getOutboundOrderPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
    });
    rows.value = result.list || [];
    total.value = result.total || 0;
  } finally {
    loading.value = false;
  }
}

function resetEditor() {
  editingId.value = undefined;
  Object.assign(form, {
    bizOrderNo: '',
    detailsText: '[]',
    orderTime: '',
    remark: '',
    totalPrice: 0,
    totalQuantity: 0,
    warehouseId: '',
  });
}

function openCreate() {
  resetEditor();
  editorOpen.value = true;
}

async function openEdit(row: Outbound) {
  if (!row.outboundOrderId) return;
  const detail = await getOutboundOrder(row.outboundOrderId);
  editingId.value = detail.outboundOrderId;
  Object.assign(form, {
    bizOrderNo: detail.bizOrderNo || '',
    detailsText: JSON.stringify(detail.details || [], null, 2),
    orderTime: detail.orderTime || '',
    remark: detail.remark || '',
    totalPrice: detail.totalPrice || 0,
    totalQuantity: detail.totalQuantity || 0,
    warehouseId: detail.warehouseId || '',
  });
  editorOpen.value = true;
}

function parseDetails() {
  const value = JSON.parse(form.detailsText || '[]') as unknown;
  if (!Array.isArray(value)) throw new TypeError('出库明细必须是 JSON 数组');
  return value as FdmWarehouseOutboundOrderApi.OutboundOrderLine[];
}

async function save() {
  if (!form.warehouseId.trim()) {
    message.warning('请输入仓库 ID');
    return;
  }
  let details: FdmWarehouseOutboundOrderApi.OutboundOrderLine[];
  try {
    details = parseDetails();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '明细 JSON 无效');
    return;
  }
  const payload: Outbound = {
    bizOrderNo: form.bizOrderNo.trim() || undefined,
    details,
    orderTime: form.orderTime || undefined,
    outboundOrderId: editingId.value,
    remark: form.remark.trim() || undefined,
    totalPrice: form.totalPrice,
    totalQuantity: form.totalQuantity,
    warehouseId: form.warehouseId.trim(),
  };
  saving.value = true;
  try {
    await (editingId.value
      ? updateOutboundOrder(payload)
      : createOutboundOrder(payload));
    message.success(editingId.value ? '出库单已更新' : '出库单已创建');
    editorOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

function createIdempotencyKey(row: Outbound) {
  const random = globalThis.crypto?.randomUUID?.() || String(Date.now());
  return `fdmwarehouse:outbound-order:${row.outboundOrderId}:${row.reservationVersionAtHandoff}:${random}`;
}

async function complete(row: Outbound) {
  if (!canCompleteReservationAttempt(row)) {
    message.warning('当前出库单没有可消费的完整预留交接身份');
    return;
  }
  const storage = globalThis.localStorage;
  const command = ensureReservationCompletionCommand(
    loadReservationCompletionCommand(storage, row),
    row,
    () => createIdempotencyKey(row),
  );
  saveReservationCompletionCommand(storage, command);
  const receipt = await completeOutboundOrder(command);
  if (!isExpectedReservationCompletionReceipt(receipt, command)) {
    throw new Error('服务端完成回执与当前预留版本不一致');
  }
  clearReservationCompletionCommand(storage, row);
  message.success(`整批出库完成，共消费 ${receipt.inventoryCount} 条库存`);
  await load();
}

async function remove(row: Outbound) {
  if (!row.outboundOrderId) return;
  await deleteOutboundOrder(row.outboundOrderId);
  message.success('出库单已删除');
  await load();
}

async function download() {
  const data = await exportOutboundOrder({ keyword: keyword.value.trim() });
  downloadFileFromBlobPart({ fileName: 'FDM出库单.xls', source: data });
}

onMounted(load);
</script>

<template>
  <Page auto-content-height>
    <Alert
      v-if="!canQuery"
      message="缺少 fdmwarehouse:outbound-order:query 权限"
      show-icon
      type="warning"
    />
    <Card v-else title="FDM 仓储出库">
      <Space class="toolbar" wrap>
        <Input
          v-model:value="keyword"
          allow-clear
          placeholder="出库单号 / 业务单号"
          @press-enter="load"
        />
        <Button @click="load">查询</Button>
        <Button
          v-if="hasPermission('fdmwarehouse:outbound-order:create')"
          type="primary"
          @click="openCreate"
        >
          新建
        </Button>
        <Button
          v-if="hasPermission('fdmwarehouse:outbound-order:export')"
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
        row-key="outboundOrderId"
      >
        <template #bodyCell="{ column, record }">
          <Tag
            v-if="column.key === 'status'"
            :color="record.status === 4 ? 'green' : 'blue'"
          >
            {{ statusLabel(record.status) }}
          </Tag>
          <Tag v-else-if="column.key === 'reservation'">
            {{ record.reservationAttemptStatus || '普通出库' }}
          </Tag>
          <Space v-else-if="column.key === 'actions'">
            <Button
              v-if="
                !record.reservationBacked &&
                record.status === 0 &&
                hasPermission('fdmwarehouse:outbound-order:update')
              "
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Button
              v-if="
                canCompleteReservationAttempt(record) &&
                hasPermission('fdmwarehouse:outbound-order:complete')
              "
              size="small"
              type="link"
              @click="complete(record)"
            >
              整批完成
            </Button>
            <Button
              v-if="
                !record.reservationBacked &&
                hasPermission('fdmwarehouse:outbound-order:delete')
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
      :title="editingId ? '编辑出库单' : '新建出库单'"
      width="760px"
      @ok="save"
    >
      <div class="editor">
        <label>仓库 ID<Input v-model:value="form.warehouseId" /></label>
        <label>业务单号<Input v-model:value="form.bizOrderNo" /></label>
        <label>出库时间<Input v-model:value="form.orderTime" type="datetime-local" /></label>
        <label>总数量<InputNumber v-model:value="form.totalQuantity" :min="0" /></label>
        <label>总金额<InputNumber v-model:value="form.totalPrice" :min="0" /></label>
        <label>备注<Input.TextArea v-model:value="form.remark" /></label>
        <label class="wide">
          出库明细（JSON 数组）
          <Input.TextArea v-model:value="form.detailsText" :rows="10" />
        </label>
      </div>
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
