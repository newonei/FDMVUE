<script setup lang="ts">
import type { DocumentKind } from '../documents/model';
import type { ContractDocumentKind } from './contract-document-launcher';

import type { Contract, DocumentRow } from '#/api/fdmplatform';
import type { BusinessDocument } from '#/api/fdmplatform/business-documents';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getBusinessPage, getContract } from '#/api/fdmplatform';

import { errorText, label } from '../data';
import BusinessDocumentDetail from '../documents/BusinessDocumentDetail.vue';
import DocumentAction from '../documents/DocumentAction.vue';
import { migrationCell, nativeMoney } from '../documents/migration-display';
import {
  actionTitle,
  allocationKind,
  documentDefinitions,
  procurementDocumentDefinition,
  procurementDocumentKind,
} from '../documents/model';
import RecordDetail from '../documents/RecordDetail.vue';
import { receiptFxDisplay } from '../finance/exchange-rates/model';
import {
  contractDocumentLaunch,
  contractDocumentQuery,
  contractDocumentRow,
} from './contract-document-launcher';
import CustomsPanel from './CustomsPanel.vue';

import './compact-tables.css';

const props = defineProps<{
  contract?: Contract;
  kind?: ContractDocumentKind;
  mode?: 'create' | 'list';
  open: boolean;
}>();
const emit = defineEmits<{ close: []; updated: [value: Contract] }>();
const currentKind = ref<ContractDocumentKind>('requests');
const currentContract = ref<Contract>();
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const keyword = ref('');
const records = ref<DocumentRow[]>([]);
const loading = ref(false);
const pageError = ref('');
const actionOpen = ref(false);
const selectedAction = ref<string>();
const actionRow = ref<DocumentRow>();
const selectedRow = ref<DocumentRow>();
const standaloneId = ref<string>();
const customsBusy = ref(false);
const procurementQueue = ref<'intake' | 'tasks'>('intake');
const assignmentStatus = ref<string>();
const nestedOpen = computed(
  () =>
    actionOpen.value ||
    !!selectedRow.value ||
    !!standaloneId.value ||
    customsBusy.value,
);
const documentKind = computed<DocumentKind>(() =>
  currentKind.value === 'customs'
    ? 'requests'
    : procurementDocumentKind(currentKind.value, procurementQueue.value),
);
const definition = computed(() =>
  procurementDocumentDefinition(
    currentKind.value === 'customs' ? 'requests' : currentKind.value,
    procurementQueue.value,
  ),
);
const isIntake = computed(
  () => currentKind.value === 'tasks' && procurementQueue.value === 'intake',
);
const title = computed(() =>
  currentKind.value === 'customs'
    ? '报关跟进'
    : documentDefinitions[currentKind.value].title,
);
const actions = computed(() =>
  currentKind.value === 'customs' ? [] : definition.value.create,
);
const columns = computed(() => [
  { key: 'document', title: '单据', width: 210 },
  ...definition.value.fields.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title!, width: 150, ellipsis: true };
  }),
  { key: 'action', title: '操作', width: 130, fixed: 'right' as const },
]);
const profit = computed(
  () => currentContract.value?.profit as Record<string, unknown> | undefined,
);
let sequence = 0;
let contextSequence = 0;
function resetNested() {
  actionOpen.value = false;
  selectedAction.value = undefined;
  actionRow.value = undefined;
  selectedRow.value = undefined;
  standaloneId.value = undefined;
  customsBusy.value = false;
}
function close() {
  if (nestedOpen.value) return;
  ++sequence;
  ++contextSequence;
  emit('close');
}
async function load(refreshContract = false) {
  const id = props.contract?.id;
  if (!props.open || !id) return;
  const kind = currentKind.value;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  records.value = [];
  total.value = 0;
  try {
    const query =
      kind === 'customs'
        ? undefined
        : contractDocumentQuery(
            id,
            documentKind.value,
            page.value,
            pageSize.value,
            keyword.value,
          );
    if (query) {
      query.resource = definition.value.resource;
      query.params.assignmentStatus = isIntake.value
        ? assignmentStatus.value
        : undefined;
    }
    const [result, contract] = await Promise.all([
      query
        ? getBusinessPage<DocumentRow>(query.resource, query.params)
        : Promise.resolve({ list: [], total: 0 }),
      refreshContract
        ? getContract(id)
        : Promise.resolve(currentContract.value),
    ]);
    if (
      run !== sequence ||
      !props.open ||
      id !== props.contract?.id ||
      kind !== currentKind.value
    )
      return;
    records.value = result.list;
    total.value = result.total;
    if (
      contract &&
      contract.id === id &&
      (!currentContract.value ||
        contract.version >= currentContract.value.version)
    )
      currentContract.value = contract;
    return currentContract.value;
  } catch (error) {
    if (run === sequence && props.open) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function create(action: string) {
  if (nestedOpen.value || !props.contract || currentKind.value === 'customs')
    return;
  selectedAction.value = action;
  actionRow.value = undefined;
  actionOpen.value = true;
}
function dispatch(row: DocumentRow) {
  if (nestedOpen.value || !props.contract) return;
  if (row.standaloneId) return show(row);
  try {
    contractDocumentRow(row, props.contract.id);
    actionRow.value = row;
    selectedAction.value = 'ASSIGN_FULFILLMENT';
    actionOpen.value = true;
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function show(row: DocumentRow) {
  if (nestedOpen.value || !props.contract) return;
  try {
    const target = contractDocumentRow(row, props.contract.id);
    selectedRow.value = target.row;
    standaloneId.value = target.standaloneId;
  } catch (error) {
    pageError.value = errorText(error);
  }
}
async function changed(value?: Contract) {
  const id = props.contract?.id;
  if (!props.open || !id || (value && value.id !== id)) return;
  if (value) {
    currentContract.value = value;
    emit('updated', value);
    await load();
  } else {
    const latest = await load(true);
    if (latest && props.open && props.contract?.id === id)
      emit('updated', latest);
  }
}
async function businessUpdated(value: BusinessDocument) {
  if (!props.open || value.contractId !== props.contract?.id) return;
  if (value.status === 'LINKED' || value.record.status === 'LINKED')
    standaloneId.value = undefined;
  await changed();
}
async function switchKind(kind: DocumentKind) {
  const context = ++contextSequence;
  resetNested();
  currentKind.value = kind;
  page.value = 1;
  keyword.value = '';
  procurementQueue.value = 'intake';
  assignmentStatus.value = undefined;
  await nextTick();
  if (!props.open || context !== contextSequence) return;
  void load(true);
  const launch = contractDocumentLaunch(kind);
  if (launch.action) create(launch.action);
}
function cell(row: DocumentRow, key: string) {
  if (key === 'allocationType') return allocationKind(row.record);
  return (
    migrationCell(row.record, key) ??
    receiptFxDisplay(row.record, key) ??
    label(row.record[key])
  );
}
function recordTitle(row: DocumentRow) {
  return String(
    row.code ||
      row.record.code ||
      row.record.invoiceNumber ||
      row.record.name ||
      row.record.batchNo ||
      definition.value.title,
  );
}
function contribution(key: string) {
  const value = profit.value?.[key];
  const amount =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>).contribution
      : undefined;
  return amount === null || amount === undefined
    ? '资料未完整'
    : nativeMoney(amount, profit.value?.currency);
}
function switchQueue() {
  page.value = 1;
  assignmentStatus.value = undefined;
  void load();
}
watch(
  () => [props.open, props.contract?.id, props.kind, props.mode],
  async () => {
    const context = ++contextSequence;
    ++sequence;
    resetNested();
    records.value = [];
    total.value = 0;
    loading.value = false;
    page.value = 1;
    keyword.value = '';
    procurementQueue.value = 'intake';
    assignmentStatus.value = undefined;
    pageError.value = '';
    currentContract.value = props.contract;
    if (!props.open || !props.contract || !props.kind) return;
    currentKind.value = props.kind;
    const id = props.contract.id;
    const kind = props.kind;
    void load(true);
    await nextTick();
    if (
      !props.open ||
      context !== contextSequence ||
      props.contract?.id !== id ||
      props.kind !== kind
    )
      return;
    const launch = contractDocumentLaunch(kind);
    if (launch.action && props.mode !== 'list') create(launch.action);
  },
  { immediate: true },
);
watch(
  () => props.contract,
  (value) => {
    if (
      value &&
      value.id === currentContract.value?.id &&
      value.version >= currentContract.value.version
    )
      currentContract.value = value;
  },
);
onBeforeUnmount(() => {
  ++sequence;
  ++contextSequence;
});
</script>

<template>
  <Drawer
    :open="open"
    :title="`${title} · ${contract?.code || contract?.name || ''}`"
    width="min(1220px, 97vw)"
    :closable="!nestedOpen"
    :mask-closable="false"
    :keyboard="!nestedOpen"
    @close="close"
  >
    <div class="contract-documents">
      <Descriptions v-if="contract" bordered size="small" :column="2">
        <Descriptions.Item label="关联合同">
          {{ contract.code }} · {{ contract.name }}
        </Descriptions.Item>
        <Descriptions.Item label="客户">
          {{ contract.customerName || '未注明' }}
        </Descriptions.Item>
      </Descriptions>
      <Alert v-if="pageError" :message="pageError" type="error" show-icon />
      <template v-if="currentKind !== 'customs'">
        <Tabs
          v-if="currentKind === 'tasks'"
          v-model:active-key="procurementQueue"
          @change="switchQueue"
        >
          <TabPane key="intake" tab="待接单申请" :disabled="nestedOpen" />
          <TabPane key="tasks" tab="履约任务" :disabled="nestedOpen" />
        </Tabs>
        <Card
          v-if="currentKind === 'costs'"
          title="当前合同成本与贡献"
          size="small"
        >
          <Descriptions size="small" :column="3">
            <Descriptions.Item label="成本记录">
              {{ total }} 条
            </Descriptions.Item>
            <Descriptions.Item label="预计贡献">
              {{ contribution('estimated') }}
            </Descriptions.Item>
            <Descriptions.Item label="归集贡献">
              {{ contribution('collected') }}
            </Descriptions.Item>
          </Descriptions>
          <p>
            {{
              profit?.notice ||
              '成本按本合同记录和现有利润口径计算，缺少资料时不推算金额。'
            }}
          </p>
        </Card>
        <Space wrap>
          <Button
            v-for="action in actions"
            :key="action"
            type="primary"
            :disabled="nestedOpen"
            @click="create(action)"
          >
            {{ actionTitle(action) }}
          </Button>
          <Input
            v-model:value="keyword"
            :disabled="nestedOpen"
            allow-clear
            placeholder="搜索本合同单据"
            @press-enter="
              page = 1;
              load();
            "
          />
          <Select
            v-if="isIntake"
            v-model:value="assignmentStatus"
            :disabled="nestedOpen"
            allow-clear
            placeholder="全部待分派状态"
            style="min-width: 170px"
            :options="[
              { value: 'UNASSIGNED', label: '未分派' },
              { value: 'PARTIALLY_ASSIGNED', label: '部分分派' },
            ]"
            @change="
              page = 1;
              load();
            "
          />
          <Button
            :loading="loading"
            :disabled="nestedOpen"
            @click="
              page = 1;
              load();
            "
          >
            查询
          </Button>
          <Button :disabled="nestedOpen" @click="load(true)">
            刷新本合同单据
          </Button>
        </Space>
        <p class="muted">
          {{ definition.description }}
          全部操作关联当前合同，关闭后仍回到合同详情。
        </p>
        <Table
          class="fdm-business-table"
          size="small"
          table-layout="fixed"
          :columns="columns"
          :data-source="records"
          :loading="loading"
          row-key="id"
          :scroll="{ x: Math.max(850, columns.length * 150 + 70) }"
          :pagination="{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
          }"
          @change="
            (value) => {
              page = value.current ?? 1;
              pageSize = value.pageSize ?? 10;
              load();
            }
          "
        >
          <template #emptyText>
            <Empty description="当前合同暂无此类单据，可使用上方按钮办理" />
          </template>
          <template #bodyCell="{ column, record }">
            <Button
              v-if="column.key === 'document'"
              type="link"
              :disabled="nestedOpen"
              :title="recordTitle(record as DocumentRow)"
              @click="show(record as DocumentRow)"
            >
              {{ recordTitle(record as DocumentRow) }}
            </Button>
            <Space v-else-if="column.key === 'action'" wrap>
              <Button
                v-if="isIntake"
                type="link"
                :disabled="nestedOpen"
                @click="dispatch(record as DocumentRow)"
              >
                接单 / 分派
              </Button>
              <Button
                type="link"
                :disabled="nestedOpen"
                @click="show(record as DocumentRow)"
              >
                查看 / 办理
              </Button>
            </Space>
            <Tag v-else-if="column.key === 'status'">
              {{ cell(record as DocumentRow, String(column.key)) }}
            </Tag>
            <span
              v-else
              class="fdm-cell-line"
              :title="cell(record as DocumentRow, String(column.key))"
              >{{ cell(record as DocumentRow, String(column.key)) }}</span>
          </template>
        </Table>
      </template>
      <CustomsPanel
        v-else-if="open && contract"
        :key="contract.id"
        embedded
        :company-id="contract.companyId"
        :contract-id="contract.id"
        @changed="changed()"
        @busy="(value) => (customsBusy = value)"
      />
    </div>
  </Drawer>
  <DocumentAction
    :open="open && actionOpen"
    :kind="documentKind"
    :action="selectedAction"
    :row="actionRow"
    :contract-id="contract?.id"
    lock-contract
    @close="actionOpen = false"
    @updated="changed"
  />
  <RecordDetail
    :open="open && !!selectedRow"
    :row="selectedRow"
    :kind="documentKind"
    embedded
    @close="selectedRow = undefined"
    @updated="changed()"
    @navigate="switchKind"
  />
  <BusinessDocumentDetail
    :open="open && !!standaloneId"
    :id="standaloneId"
    :kind="documentKind"
    :contract-id="contract?.id"
    embedded
    @close="standaloneId = undefined"
    @updated="businessUpdated"
  />
</template>
<style scoped>
.contract-documents {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.muted {
  color: var(--ant-color-text-secondary);
}
</style>
