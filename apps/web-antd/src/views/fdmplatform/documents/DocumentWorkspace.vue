<script setup lang="ts">
import type { DocumentKind } from './model';

import type { Directory, DocumentRow } from '#/api/fdmplatform';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getBusinessPage, getContract, getDirectory } from '#/api/fdmplatform';

import { errorText, label, statusLabels } from '../data';
import { personLabel } from '../directory';
import { receiptFxDisplay } from '../finance/exchange-rates/model';
import BusinessDocumentDetail from './BusinessDocumentDetail.vue';
import DocumentAction from './DocumentAction.vue';
import { contractReferenceText, migrationCell } from './migration-display';
import {
  actionTitle,
  allocationKind,
  documentDefinitions,
  documentStatuses,
  procurementDocumentDefinition,
  procurementDocumentKind,
  queryContractId,
} from './model';
import {
  contractTarget,
  detailLocation,
  entityTarget,
  resolveDocumentRow,
  standaloneLocation,
  withoutDetailQuery,
} from './navigation';
import RecordDetail from './RecordDetail.vue';
import RelatedLink from './RelatedLink.vue';
import { useRouteOwner } from './useRouteOwner';

import '../components/compact-tables.css';

const props = defineProps<{ kind: DocumentKind }>();
const route = useRoute();
const router = useRouter();
const routeActive = useRouteOwner();
const procurementQueue = computed<'intake' | 'tasks'>({
  get: () => (route.query.queue === 'tasks' ? 'tasks' : 'intake'),
  set: (queue) => {
    if (routeActive.value)
      void router.push({
        query: { ...withoutDetailQuery(route.query), queue },
      });
  },
});
const isIntake = computed(
  () => props.kind === 'tasks' && procurementQueue.value === 'intake',
);
const purchaseInvoice = computed(
  () => props.kind === 'invoices' && route.query.invoiceType === 'PURCHASE',
);
const invoiceTab = computed({
  get: () => (purchaseInvoice.value ? 'PURCHASE' : 'SALES'),
  set: (invoiceType: string) => {
    void router.push({
      query: { ...withoutDetailQuery(route.query), invoiceType },
    });
  },
});
const effectiveKind = computed(() =>
  procurementDocumentKind(props.kind, procurementQueue.value),
);
const config = computed(() =>
  purchaseInvoice.value
    ? {
        ...procurementDocumentDefinition(props.kind, procurementQueue.value),
        resource: 'purchase-invoices' as const,
        title: '采购进项票',
        description: '核实供应商提供的实际进项发票，保留原状态与金额。',
        create: [],
        fields: [
          'invoiceNo|发票号码',
          'currency|币种',
          'amount|金额',
          'issuedAt|开票日期',
          'status|状态',
        ],
      }
    : procurementDocumentDefinition(props.kind, procurementQueue.value),
);
const contractId = computed(() => queryContractId(route.query.contractId));
const contractLabel = ref('');
const directory = ref<Directory>();
const records = ref<DocumentRow[]>([]);
const loading = ref(false);
const pageError = ref('');
const keyword = ref('');
const status = ref<string>();
const assignmentStatus = ref<string>();
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const detailOpen = ref(false);
const selectedRow = ref<DocumentRow>();
const selectedStandaloneId = ref<string>();
const actionOpen = ref(false);
const selectedAction = ref<string>();
const actionRow = ref<DocumentRow>();
let sequence = 0;
let locateSequence = 0;
const locateError = ref('');
function openRow(row: DocumentRow) {
  if (row.standaloneId) {
    void router.push({
      query: {
        ...withoutDetailQuery(route.query),
        standaloneId: row.standaloneId,
      },
    });
    return;
  }
  if (
    route.query.documentId === row.id &&
    route.query.contractId === row.contractId
  ) {
    void locateDocument();
    return;
  }
  void router.push({
    query: {
      ...withoutDetailQuery(route.query),
      contractId: row.contractId,
      documentId: row.id,
    },
  });
}
function closeDetail() {
  detailOpen.value = false;
  selectedStandaloneId.value = undefined;
  ++locateSequence;
  if (routeActive.value)
    void router.replace({ query: withoutDetailQuery(route.query) });
}
async function locateDocument() {
  const run = ++locateSequence;
  locateError.value = '';
  detailOpen.value = false;
  selectedRow.value = undefined;
  selectedStandaloneId.value = undefined;
  actionOpen.value = false;
  if (!routeActive.value) return;
  try {
    const standaloneId = standaloneLocation(route.query);
    if (standaloneId) {
      selectedStandaloneId.value = standaloneId;
      return;
    }
    const location = detailLocation(route.query);
    if (!location) return;
    const contract = await getContract(location.contractId);
    if (run !== locateSequence || !routeActive.value) return;
    selectedRow.value = resolveDocumentRow(
      contract,
      effectiveKind.value,
      location.documentId,
    );
    detailOpen.value = true;
  } catch (error) {
    if (run === locateSequence)
      locateError.value = `无法打开关联单据：${errorText(error)}。可关闭定位并返回列表。`;
  }
}
watch(
  () => [
    route.query.documentId,
    route.query.standaloneId,
    route.query.contractId,
    effectiveKind.value,
    purchaseInvoice.value,
    routeActive.value,
  ],
  () => {
    void locateDocument();
  },
  { immediate: true, flush: 'post' },
);
const columns = computed(() => [
  { title: '单据 / 关联合同', key: 'contract', width: 280 },
  { title: '客户', key: 'customer', width: 190, ellipsis: true },
  { title: '订单所属公司', key: 'company', width: 180 },
  ...config.value.fields.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title!, width: 150, ellipsis: true };
  }),
  {
    title: '办理',
    key: 'action',
    width: isIntake.value ? 200 : 115,
    fixed: 'right' as const,
  },
]);
const statusOptions = computed(() =>
  (isIntake.value ? [] : documentStatuses(effectiveKind.value)).map(
    (value) => ({ value, label: statusLabels[value] }),
  ),
);
const assignmentOptions = computed(() =>
  (isIntake.value
    ? ['UNASSIGNED', 'PARTIALLY_ASSIGNED']
    : ['UNASSIGNED', 'PARTIALLY_ASSIGNED', 'ASSIGNED']
  ).map((value) => ({ value, label: label(value) })),
);
function cell(row: DocumentRow, key: string) {
  if (key === 'allocationType') return allocationKind(row.record);
  const value = row.record[key];
  return (
    migrationCell(row.record, key) ??
    receiptFxDisplay(row.record, key) ??
    (/UserId$/i.test(key) ? personLabel(directory.value, value) : label(value))
  );
}
async function load() {
  const current = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getBusinessPage<DocumentRow>(config.value.resource, {
      companyId: 0,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      status: status.value,
      assignmentStatus:
        effectiveKind.value === 'requests' ? assignmentStatus.value : undefined,
      contractId: contractId.value,
    });
    if (current === sequence) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (current === sequence) pageError.value = errorText(error);
  } finally {
    if (current === sequence) loading.value = false;
  }
}
function search() {
  pageNo.value = 1;
  void load();
}
async function loadContext() {
  contractLabel.value = '';
  if (contractId.value) {
    try {
      const current = contractId.value;
      const contract = await getContract(current);
      if (current === contractId.value)
        contractLabel.value = `${contract.code} · ${contract.name}`;
    } catch (error) {
      pageError.value = errorText(error);
    }
  }
}
function clearContext() {
  const query = withoutDetailQuery(route.query);
  delete query.contractId;
  void router.replace({ query });
}
function create(action: string) {
  actionRow.value = undefined;
  selectedAction.value = action;
  actionOpen.value = true;
}
function dispatch(row: DocumentRow) {
  if (row.standaloneId) {
    openRow(row);
    return;
  }
  actionRow.value = row;
  selectedAction.value = 'ASSIGN_FULFILLMENT';
  actionOpen.value = true;
}
watch(
  () => [
    props.kind,
    procurementQueue.value,
    purchaseInvoice.value,
    contractId.value,
    routeActive.value,
  ],
  () => {
    pageNo.value = 1;
    detailOpen.value = false;
    actionOpen.value = false;
    selectedRow.value = undefined;
    selectedAction.value = undefined;
    actionRow.value = undefined;
    status.value = undefined;
    assignmentStatus.value = undefined;
    if (!routeActive.value) return;
    void loadContext();
    void load();
  },
);
onBeforeUnmount(() => {
  sequence++;
  locateSequence++;
});
onMounted(async () => {
  void loadContext();
  void load();
  try {
    directory.value = await getDirectory(0);
  } catch (error) {
    pageError.value = errorText(error);
  }
});
</script>
<template>
  <Page
    :title="kind === 'tasks' ? documentDefinitions.tasks.title : config.title"
    :description="config.description"
  >
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <Tabs v-if="kind === 'invoices'" v-model:active-key="invoiceTab">
          <TabPane key="SALES" tab="销售开票" /><TabPane
            key="PURCHASE"
            tab="采购进项票"
          />
        </Tabs>
        <Tabs v-if="kind === 'tasks'" v-model:active-key="procurementQueue">
          <TabPane key="intake" tab="待接单申请" />
          <TabPane key="tasks" tab="履约任务" />
        </Tabs>
        <Space wrap>
          <Button
            v-for="(action, index) in config.create"
            :key="action"
            :type="index === 0 ? 'primary' : 'default'"
            @click="create(action)"
          >
            {{
              index === 0 && kind !== 'tasks'
                ? `新建${config.title}`
                : actionTitle(action)
            }}
</Button><Button :loading="loading" @click="load">刷新</Button>
</Space><Alert v-if="contractId" type="info" show-icon>
          <template #message>
            <Space>
              仅查看关联合同：{{ contractLabel || '读取中'
              }}<Button size="small" @click="clearContext">
                清除合同筛选，查看全部
              </Button>
            </Space>
          </template>
</Alert><Space wrap>
          <Input.Search
            v-model:value="keyword"
            placeholder="搜索合同、客户或单据内容"
            style="width: 310px"
            allow-clear
            @search="search"
          /><Select
            v-if="statusOptions.length"
            v-model:value="status"
            :options="statusOptions"
            allow-clear
            placeholder="全部状态"
            style="width: 160px"
            @change="search"
          />
          <Select
            v-if="effectiveKind === 'requests'"
            v-model:value="assignmentStatus"
            :options="assignmentOptions"
            allow-clear
            placeholder="全部分派进度"
            style="width: 180px"
            @change="search"
          />
</Space><Alert
          v-if="locateError"
          :message="locateError"
          type="warning"
          show-icon
        >
          <template #action>
            <Button @click="closeDetail">关闭定位</Button>
          </template>
</Alert><Alert
          v-if="pageError"
          :message="pageError"
          type="error"
          show-icon
        /><Table
          class="fdm-business-table"
          size="small"
          table-layout="fixed"
          :columns="columns"
          :data-source="records"
          :loading="loading"
          :locale="{
            emptyText:
              kind === 'tasks'
                ? isIntake
                  ? '当前没有未分派或部分分派的采购申请'
                  : '尚无履约任务，请先在待接单申请中接单分派'
                : '暂无数据',
          }"
          row-key="id"
          :scroll="{ x: Math.max(1300, columns.length * 150 + 170) }"
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 张单据`,
          }"
          @change="
            (pagination) => {
              pageNo = pagination.current ?? 1;
              pageSize = pagination.pageSize ?? 10;
              load();
            }
          "
        >
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'contract'">
              <Button
                v-if="record.standaloneId"
                type="link"
                :title="
                  record.code ||
                  record.record.code ||
                  record.name ||
                  record.record.name
                "
                @click="openRow(record as DocumentRow)"
              >
                {{
                  record.code ||
                  record.record.code ||
                  record.name ||
                  record.record.name
                }}
              </Button>
              <div class="fdm-cell-line">
                <Tag v-if="record.migration?.sourceSystem === 'JINZHI'">
                  金智
                </Tag>
                <RelatedLink
                  :style="{
                    maxWidth:
                      record.migration?.sourceSystem === 'JINZHI'
                        ? 'calc(100% - 50px)'
                        : '100%',
                  }"
                  :title="
                    [record.contractCode, record.contractName]
                      .filter(Boolean)
                      .join(' · ')
                  "
                  :target="contractTarget(record.contractId)"
                >
                  <strong>{{
                    contractReferenceText(
                      record.contractCode,
                      record.contractName,
                      record.contractId,
                    )
                  }}</strong>
                </RelatedLink>
              </div>
              <div
                v-if="
                  !record.standaloneId &&
                  record.contractCode &&
                  record.contractName
                "
                class="fdm-cell-line"
                :title="record.contractName"
              >
                {{ record.contractName }}
              </div>
            </div>
            <RelatedLink
              v-else-if="column.key === 'customer'"
              class="fdm-cell-line"
              :title="record.customerName"
              :target="entityTarget('customer', record.customerId)"
            >
              {{ record.customerName || '未注明' }}
            </RelatedLink>
            <span v-else-if="column.key === 'company'">{{
              directory?.companies.find(
                (item) => item.companyId === record.companyId,
              )?.companyName ??
              record.companyName ??
              (record.companyId ? `公司 #${record.companyId}` : '待补齐')
            }}</span><Space v-else-if="column.key === 'action' && isIntake">
              <Button
                v-if="record.allowedActions?.includes('ASSIGN_FULFILLMENT')"
                type="link"
                @click="dispatch(record as DocumentRow)"
              >
                接单 / 分派
              </Button>
              <Button type="link" @click="openRow(record as DocumentRow)">
                查看申请
              </Button>
</Space><Button
              v-else-if="column.key === 'action'"
              type="link"
              @click="openRow(record as DocumentRow)"
            >
              查看 / 办理
</Button><Tag v-else-if="column.key === 'status'">
              {{ cell(record as DocumentRow, String(column.key)) }}
</Tag><span
              v-else
              class="fdm-cell-line"
              :title="cell(record as DocumentRow, String(column.key))"
              >{{ cell(record as DocumentRow, String(column.key)) }}</span>
          </template>
        </Table>
      </Space>
</Card><BusinessDocumentDetail
      :id="selectedStandaloneId"
      :open="Boolean(selectedStandaloneId) && routeActive"
      :kind="effectiveKind"
      @close="closeDetail"
      @updated="load"
    /><RecordDetail
      :open="detailOpen && routeActive"
      :kind="effectiveKind"
      :row="selectedRow"
      @close="closeDetail"
      @updated="load"
    /><DocumentAction
      :open="actionOpen && routeActive"
      :kind="effectiveKind"
      :action="selectedAction"
      :row="actionRow"
      :contract-id="contractId"
      @close="actionOpen = false"
      @updated="load"
    />
  </Page>
</template>
