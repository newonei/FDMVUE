<script setup lang="ts">
import type { ActionDefinition } from '../../data';

import type { AttachmentView, Contract, DocumentRow } from '#/api/fdmplatform';
import type { MigrationInfo } from '#/api/fdmplatform/business-documents';
import type {
  ProcurementOrderRow,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Select,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getAttachments,
  getContract,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import {
  downloadProcurementFile,
  exportProcurementOrder,
  getProcurementOrder,
  getProcurementOrders,
  procurementOrderAction,
  uploadProcurementSigned,
} from '#/api/fdmplatform/procurement';

import ActionDialog from '../../components/ActionDialog.vue';
import AttachmentPanel from '../../components/AttachmentPanel.vue';
import RecordTable from '../../components/RecordTable.vue';
import { errorText, field, label, rows } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import DocumentAction from '../../documents/DocumentAction.vue';
import MigrationSource from '../../documents/MigrationSource.vue';
import { documentActionUnavailableReason } from '../../documents/model';
import {
  contractTarget,
  detailLocation,
  entityTarget,
  relatedDocumentLinks,
  resolveDocumentRow,
  standaloneLocation,
  withoutDetailQuery,
} from '../../documents/navigation';
import RelatedLink from '../../documents/RelatedLink.vue';
import { useRouteOwner } from '../../documents/useRouteOwner';
import OrderFinance from '../../finance/procurement/components/OrderFinance.vue';
import { procurementOrderAmount } from '../../finance/procurement/model';
import OrderContract from './components/OrderContract.vue';
import OrderDetails from './components/OrderDetails.vue';
import {
  downloadBlob,
  orderDetailsPayload,
  purchaseRowLabels,
  sumAmounts,
} from './model';

import '../../documents/procurement-tabs';

import '../../components/compact-tables.css';

const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const records = ref<ProcurementOrderRow[]>([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const keyword = ref(
  typeof route.query.keyword === 'string' ? route.query.keyword : '',
);
const status = ref<string | undefined>(
  typeof route.query.status === 'string' ? route.query.status : undefined,
);
const loading = ref(false);
const saving = ref(false);
const pageError = ref('');
const listError = ref('');
const view = ref<ProcurementOrderView>();
const contract = ref<Contract>();
const migration = computed(
  () => view.value?.order.migration as MigrationInfo | undefined,
);
const actionOpen = ref(false);
const reasonOpen = ref(false);
const reasonDefinition = ref<ActionDefinition>();
const orderAttachments = ref<AttachmentView>();
const attachmentsLoading = ref(false);
const attachmentsError = ref('');
const commandKeys = new Map<string, string>();
const historyActionNames: Record<string, string> = {
  SAVE_DETAILS: '保存采购资料',
  CONFIRM_DETAILS: '确认采购资料',
  WITHDRAW_DETAILS: '撤回并编辑',
  REVISE_DETAILS: '新建资料变更版本',
};
const historyRows = computed(() =>
  (view.value?.history ?? []).map((entry) => ({
    ...entry,
    action: historyActionNames[String(entry.action)] ?? entry.action,
    occurredAt:
      formatDate(
        entry.occurredAt === null || entry.occurredAt === undefined
          ? undefined
          : String(entry.occurredAt),
        'YYYY-MM-DD HH:mm',
      ) || '—',
  })),
);
let sequence = 0;
let listSequence = 0;
const detailId = computed(() =>
  typeof route.query.documentId === 'string'
    ? route.query.documentId
    : undefined,
);
const standaloneId = computed(() =>
  typeof route.query.standaloneId === 'string'
    ? route.query.standaloneId
    : undefined,
);
const contractId = computed(() =>
  typeof route.query.contractId === 'string'
    ? route.query.contractId
    : undefined,
);
const tab = computed({
  get: () =>
    typeof route.query.tab === 'string' ? route.query.tab : 'details',
  set: (tab: string) => {
    void router.replace({ query: { ...route.query, tab } });
  },
});
async function loadOrderAttachments() {
  const current = view.value;
  if (!current || !active.value) return;
  attachmentsLoading.value = true;
  attachmentsError.value = '';
  try {
    const value = await getAttachments(current.contractId, {
      targetKind: 'purchaseOrders',
      targetId: current.id,
    });
    if (view.value?.id === current.id && active.value)
      orderAttachments.value = value;
  } catch (error) {
    if (view.value?.id === current.id && active.value)
      attachmentsError.value = errorText(error);
  } finally {
    if (view.value?.id === current.id) attachmentsLoading.value = false;
  }
}
watch(
  () => [view.value?.id, tab.value, active.value],
  () => {
    orderAttachments.value = undefined;
    if (tab.value === 'attachments') void loadOrderAttachments();
  },
);
const links = computed(() =>
  view.value && contract.value
    ? relatedDocumentLinks(contract.value, 'orders', view.value.order)
    : [],
);
const mainLinks = computed(() =>
  links.value.filter(
    (link) =>
      link.target.type === 'contract' ||
      link.target.type === 'customer' ||
      link.target.type === 'supplier' ||
      (link.target.type === 'document' &&
        ['plans', 'requests'].includes(link.target.kind)),
  ),
);
const productLinks = computed(() =>
  links.value.filter((link) => !mainLinks.value.includes(link)),
);
const recordRow = computed(() =>
  view.value && contract.value
    ? resolveDocumentRow(contract.value, 'orders', view.value.id)
    : undefined,
);
const cancelReason = computed(() =>
  view.value && contract.value
    ? documentActionUnavailableReason(
        contract.value,
        'CANCEL_ORDER',
        view.value.order,
      )
    : undefined,
);
function key(action: string) {
  let id = commandKeys.get(action);
  if (!id) {
    id = newIdempotencyKey();
    commandKeys.set(action, id);
  }
  return id;
}
async function loadList() {
  if (!active.value) return;
  const run = ++listSequence;
  loading.value = true;
  listError.value = '';
  records.value = [];
  total.value = 0;
  try {
    const result = await getProcurementOrders({
      contractId: contractId.value,
      pageNo: page.value,
      pageSize: 10,
      keyword: keyword.value || undefined,
      status: status.value,
    });
    if (run === listSequence) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === listSequence) listError.value = errorText(error);
  } finally {
    if (run === listSequence) loading.value = false;
  }
}
async function loadDetail() {
  const run = ++sequence;
  view.value = undefined;
  contract.value = undefined;
  actionOpen.value = false;
  reasonOpen.value = false;
  pageError.value = '';
  if (!active.value) return;
  try {
    if (standaloneLocation(route.query)) return;
    const target = detailLocation(route.query);
    if (!target) return;
    loading.value = true;
    const [value, parent] = await Promise.all([
      getProcurementOrder(target.contractId, target.documentId),
      getContract(target.contractId),
    ]);
    if (run !== sequence || !active.value) return;
    view.value = value;
    contract.value = parent;
    commandKeys.clear();
  } catch (error) {
    if (run === sequence)
      pageError.value = `无法打开采购单：${errorText(error)}`;
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function refreshFacts() {
  if (!view.value) return;
  const currentId = view.value.id;
  try {
    const [value, parent] = await Promise.all([
      getProcurementOrder(view.value.contractId, currentId),
      getContract(view.value.contractId),
    ]);
    if (view.value?.id === currentId) {
      view.value = value;
      contract.value = parent;
    }
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function openRow(row: DocumentRow, selectedTab = 'details') {
  if (row.standaloneId) {
    void router.push({
      query: {
        ...withoutDetailQuery(route.query),
        standaloneId: row.standaloneId,
        page: page.value,
        keyword: keyword.value || undefined,
        status: status.value,
      },
    });
    return;
  }
  void router.push({
    query: {
      ...withoutDetailQuery(route.query),
      contractId: row.contractId,
      documentId: row.id,
      page: page.value,
      keyword: keyword.value || undefined,
      status: status.value,
      tab: selectedTab,
    },
  });
}
function back() {
  const query = withoutDetailQuery(route.query);
  delete query.tab;
  void router.push({ query });
}
function clear() {
  void router.replace({ query: {} });
}
async function command(
  action: string,
  payload: Record<string, unknown> = {},
  operationKey = key(action),
) {
  if (!view.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    const args = {
      expectedVersion: view.value.details.version,
      contractVersion: view.value.version,
      idempotencyKey: operationKey,
    };
    const previousExports = new Set(view.value.exports.map((file) => file.id));
    const value =
      action === 'EXPORT_CONTRACT'
        ? await exportProcurementOrder(
            view.value.contractId,
            view.value.id,
            args,
          )
        : await procurementOrderAction(view.value.contractId, view.value.id, {
            ...args,
            action,
            payload: orderDetailsPayload(payload),
          });
    view.value = value;
    if (action === 'EXPORT_CONTRACT') {
      const file =
        value.exports.find((entry) => !previousExports.has(entry.id)) ??
        value.exports.at(-1);
      if (file)
        downloadBlob(
          await downloadProcurementFile(value.contractId, value.id, file.id),
          file.name,
        );
    }
    commandKeys.delete(action);
    reasonOpen.value = false;
    message.success(
      action === 'WITHDRAW_DETAILS' || action === 'REVISE_DETAILS'
        ? '已进入资料草稿，可直接编辑'
        : action === 'EXPORT_CONTRACT'
          ? 'Word已生成，可在历史版本中下载'
          : '采购资料已更新',
    );
    void loadList();
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
function action(name: string) {
  if (['REVISE_DETAILS', 'WITHDRAW_DETAILS'].includes(name)) {
    reasonDefinition.value = {
      action: name,
      title: name === 'REVISE_DETAILS' ? '新建资料变更版本' : '撤回并编辑',
      description:
        name === 'REVISE_DETAILS'
          ? '保留原采购执行及已付事实，仅建立联系人、交货、签约资料的新版本。'
          : '撤回仅开放附加资料字段，已有执行事实时按后台条件阻断。',
      fields: [field('reason', '原因', 'textarea')],
    };
    reasonOpen.value = true;
  } else void command(name);
}
async function upload(file: File, exportId: string) {
  if (!view.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    view.value = await uploadProcurementSigned(
      view.value.contractId,
      view.value.id,
      file,
      {
        exportId,
        expectedVersion: view.value.details.version,
        contractVersion: view.value.version,
        idempotencyKey: key('UPLOAD_SIGNED'),
      },
    );
    commandKeys.delete('UPLOAD_SIGNED');
    message.success('签章版本已保存');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
watch(
  () => [
    active.value,
    route.query.documentId,
    route.query.standaloneId,
    route.query.contractId,
  ],
  () => {
    if (detailId.value) void loadDetail();
    else {
      view.value = undefined;
      sequence++;
      void loadList();
    }
  },
  { immediate: true, flush: 'post' },
);
</script>
<template>
  <Page
    title="采购单"
    description="沿批准采购方案办理下单资料、分期付款、成本归属和可编辑采购合同，保留每次变更版本。"
  >
    <Space direction="vertical" size="middle" style="width: 100%">
      <Alert v-if="pageError" type="error" :message="pageError" /><Alert
        v-if="listError"
        type="error"
        :message="listError"
      /><template v-if="!detailId">
        <Card>
          <Space wrap>
            <Input.Search
              v-model:value="keyword"
              placeholder="搜索合同、客户或供应商"
              @search="
                page = 1;
                loadList();
              "
            /><Select
              v-model:value="status"
              :options="
                ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map(
                  (value) => ({ value, label: label(value) }),
                )
              "
              allow-clear
              placeholder="全部采购状态"
              style="width: 170px"
              @change="
                page = 1;
                loadList();
              "
            /><Button :loading="loading" @click="loadList">刷新</Button><Button
              type="primary"
              @click="
                router.push({
                  path: '/fdmprocurement/platform-plans',
                  query: contractId ? { contractId } : {},
                })
              "
            >
              从批准方案生成采购单
</Button><Button v-if="contractId" @click="clear">
              清除合同筛选
            </Button>
</Space><Table
            class="fdm-business-table"
            size="small"
            table-layout="fixed"
            :scroll="{ x: 1480 }"
            :data-source="records"
            :loading="loading"
            row-key="id"
            :pagination="{ current: page, pageSize: 10, total }"
            :columns="[
              { title: '采购单 / 供应商', key: 'supplier', width: 250 },
              {
                title: '工厂联系人',
                key: 'contact',
                width: 150,
                ellipsis: true,
              },
              {
                title: '关联合同',
                key: 'contract',
                width: 250,
                ellipsis: true,
              },
              { title: '采购金额', key: 'amount', width: 150 },
              { title: '到货 / 退货', key: 'arrival', width: 140 },
              { title: '已付 / 待付', key: 'payment', width: 200 },
              { title: '状态', key: 'state', width: 120 },
              { title: '办理', key: 'action', width: 160, fixed: 'right' },
            ]"
            @change="
              (value) => {
                page = value.current ?? 1;
                loadList();
              }
            "
          >
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'supplier'">
                <Button
                  type="link"
                  :title="
                    purchaseRowLabels(record as ProcurementOrderRow).order
                  "
                  @click="openRow(record as DocumentRow)"
                >
                  {{ purchaseRowLabels(record as ProcurementOrderRow).order }} ·
                  采购单
                </Button>
                <div>
                  <RelatedLink
                    class="fdm-cell-line"
                    :title="
                      purchaseRowLabels(record as ProcurementOrderRow).supplier
                    "
                    :target="
                      entityTarget(
                        'supplier',
                        purchaseRowLabels(record as ProcurementOrderRow)
                          .supplierId,
                      )
                    "
                  >
                    {{
                      purchaseRowLabels(record as ProcurementOrderRow).supplier
                    }}
                  </RelatedLink>
                </div>
              </div>
              <span v-else-if="column.key === 'amount'">{{ record.record.currency }}
                {{ record.orderAmount ?? record.record.amount }}</span><span v-else-if="column.key === 'contact'">{{ record.details?.contactSnapshot?.name ?? '未选择' }}<br />{{
                  record.details?.contactSnapshot?.phone
                }}</span><RelatedLink
                v-else-if="column.key === 'contract'"
                class="fdm-cell-line"
                :title="
                  purchaseRowLabels(record as ProcurementOrderRow).contract
                "
                :target="contractTarget(record.contractId)"
              >
                {{
                  purchaseRowLabels(record as ProcurementOrderRow).contract
                }}
</RelatedLink><span v-else-if="column.key === 'arrival'">{{
                  sumAmounts(
                    rows(record.record.lines).map(
                      (line) => line.arrivedQuantity,
                    ),
                  )
                }}
                / 退货
                {{
                  sumAmounts(
                    rows(record.record.lines).map(
                      (line) => line.returnedQuantity,
                    ),
                  )
                }}</span><Button
                v-else-if="column.key === 'payment'"
                type="link"
                @click="openRow(record as DocumentRow, 'payments')"
              >
                {{ record.paidAmount ?? '进入详情查看' }} /
                {{ record.unpaidAmount ?? '—' }}
</Button><Tag v-else-if="column.key === 'state'">
                {{ label(record.record.status) }}
</Tag><Button
                v-else-if="column.key === 'action'"
                type="link"
                @click="openRow(record as DocumentRow)"
              >
                进入办理工作区
              </Button>
            </template>
          </Table>
        </Card>
</template><template v-else>
        <Space>
          <Button @click="back">返回采购单列表</Button><Button :loading="loading" @click="loadDetail">
            刷新当前采购单
          </Button>
</Space><Alert
          v-if="loading && !view"
          type="info"
          message="正在读取采购单…"
        /><template v-if="view && active">
          <MigrationSource
            :migration="migration"
            :native-source="{
              kind: 'CONTRACT',
              nativeId: view.contractId,
              recordId: view.id,
            }"
          />
          <Card size="small">
            <Space wrap>
              <strong>{{ view.order.code ?? view.order.supplierName }} ·
                采购单</strong><Tag>{{ label(view.order.status) }}</Tag><span>{{ view.order.currency }}
                {{
                  procurementOrderAmount(
                    rows(view.order.lines),
                    String(view.order.currency),
                  )
                }}</span><span>订单所属公司：{{ view.companyName }}</span>
            </Space>
            <div class="source-links">
              <Space
                v-for="link in mainLinks"
                :key="JSON.stringify(link.target)"
              >
                <span>{{ link.label }}：</span><RelatedLink :target="link.target">
                  {{ link.value }}
                </RelatedLink>
              </Space>
            </div>
            <details v-if="productLinks.length" class="more-actions">
              <summary>产品与履约关联（{{ productLinks.length }}）</summary>
              <div class="source-links">
                <Space
                  v-for="link in productLinks"
                  :key="JSON.stringify(link.target)"
                >
                  <span>{{ link.label }}：</span><RelatedLink :target="link.target">
                    {{ link.value }}
                  </RelatedLink>
                </Space>
              </div>
            </details>
            <details class="more-actions">
              <summary>更多采购操作</summary>
              <Space wrap>
                <Button
                  v-if="view.allowedActions.includes('REVISE_DETAILS')"
                  @click="action('REVISE_DETAILS')"
                >
                  新建资料变更版本
</Button><Button
                  v-if="contract?.allowedActions.includes('CANCEL_ORDER')"
                  danger
                  :disabled="!!cancelReason"
                  :title="cancelReason"
                  @click="actionOpen = true"
                >
                  取消采购余额
</Button><Button
                  @click="
                    router.push({
                      path: '/fdmprocurement/platform-arrivals',
                      query: { contractId: view.contractId },
                    })
                  "
                >
                  查看 / 登记到货
</Button><Button
                  @click="
                    router.push({
                      path: '/fdmprocurement/platform-plans',
                      query: { contractId: view.contractId },
                    })
                  "
                >
                  采购方案变更
                </Button>
              </Space>
              <p v-if="cancelReason">{{ cancelReason }}</p>
            </details>
</Card><Tabs v-model:active-key="tab">
            <TabPane key="details" tab="采购明细">
              <OrderDetails
                :view="view"
                :saving="saving"
                @save="(payload) => command('SAVE_DETAILS', payload)"
                @action="action"
              />
</TabPane><TabPane key="payments" tab="付款安排">
              <OrderFinance
                :contract-id="view.contractId"
                :order-id="view.id"
                mode="payments"
                @changed="refreshFacts"
              />
</TabPane><TabPane key="costs" tab="成本归属">
              <OrderFinance
                :contract-id="view.contractId"
                :order-id="view.id"
                mode="costs"
                @changed="refreshFacts"
              />
</TabPane><TabPane key="contract" tab="采购合同">
              <OrderContract
                :view="view"
                :saving="saving"
                @save="(payload) => command('SAVE_DETAILS', payload)"
                @action="action"
                @signed="upload"
              />
</TabPane><TabPane key="attachments" tab="单据附件">
              <AttachmentPanel
                :contract-id="view.contractId"
                :target="{ targetKind: 'purchaseOrders', targetId: view.id }"
                :view="orderAttachments"
                :categories="orderAttachments?.uploadCategories ?? []"
                :loading="attachmentsLoading"
                :error="attachmentsError"
                @refresh="loadOrderAttachments"
              />
</TabPane><TabPane key="history" tab="操作记录">
              <RecordTable
                :data="historyRows"
                :columns="[
                  { key: 'action', title: '操作' },
                  { key: 'actorId', title: '经办人' },
                  { key: 'occurredAt', title: '时间' },
                  { key: 'version', title: '资料版本' },
                  { key: 'reason', title: '原因' },
                ]"
              />
            </TabPane>
          </Tabs>
        </template>
      </template>
</Space><ActionDialog
      :open="reasonOpen && active"
      :definition="reasonDefinition"
      :saving="saving"
      :error="pageError"
      @close="reasonOpen = false"
      @submit="
        (payload, key) => command(reasonDefinition!.action, payload, key)
      "
    /><DocumentAction
      :open="actionOpen && active"
      kind="orders"
      action="CANCEL_ORDER"
      :row="recordRow"
      :contract-id="view?.contractId"
      @close="actionOpen = false"
      @updated="loadDetail"
    />
  </Page>
  <BusinessDocumentDetail
    :id="standaloneId"
    :open="Boolean(standaloneId) && active"
    kind="orders"
    @close="back"
    @updated="loadList"
  />
</template>
<style scoped>
.source-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  margin-top: 14px;
}

.more-actions {
  margin-top: 14px;
}

.more-actions summary {
  margin-bottom: 10px;
  color: var(--ant-color-text-secondary);
  cursor: pointer;
}
</style>
