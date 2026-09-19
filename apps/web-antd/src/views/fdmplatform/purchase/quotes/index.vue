<script setup lang="ts">
import type { DocumentKind } from '../../documents/model';
import type { RelatedDocumentSource } from '../../documents/related-creation';

import type { Contract, DocumentRow } from '#/api/fdmplatform';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Alert, Button, Empty, Input, Pagination, Spin } from 'ant-design-vue';

import { getBusinessPage, getContract } from '#/api/fdmplatform';

import { errorText } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import DocumentAction from '../../documents/DocumentAction.vue';
import { queryContractId } from '../../documents/model';
import {
  detailLocation,
  resolveDocumentRow,
  standaloneLocation,
  withoutDetailQuery,
} from '../../documents/navigation';
import RecordDetail from '../../documents/RecordDetail.vue';
import { useRouteOwner } from '../../documents/useRouteOwner';
import ProcurementPageHeader from '../components/ProcurementPageHeader.vue';
import ProcurementStatusBadge from '../components/ProcurementStatusBadge.vue';
import { quoteStatus } from './comparison';
import QuoteComparison from './QuoteComparison.vue';

import '../components/procurement.css';

defineOptions({ name: 'FdmPlatformPurchaseQuotes' });
const route = useRoute();
const router = useRouter();
const routeActive = useRouteOwner();
const contractId = computed(() => queryContractId(route.query.contractId));
const keyword = ref('');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref<number>();
const records = ref<DocumentRow[]>([]);
const loading = ref(false);
const pageError = ref('');
const selectedRow = ref<DocumentRow>();
const selectedContract = ref<Contract>();
const comparisonLoading = ref(false);
const comparisonError = ref('');
const detailOpen = ref(false);
const detailRow = ref<DocumentRow>();
const standaloneId = ref<string>();
const locateError = ref('');
const actionOpen = ref(false);
const action = ref<string>();
const actionKind = ref<DocumentKind>('quotes');
const actionContractId = ref<string>();
const actionSource = ref<RelatedDocumentSource>();
let listSequence = 0;
let comparisonSequence = 0;
let locateSequence = 0;

const scopeLabel = computed(() =>
  selectedContract.value && selectedContract.value.id === contractId.value
    ? selectedContract.value.code
    : contractId.value,
);
const actionDisabled = computed(
  () => comparisonLoading.value || Boolean(comparisonError.value),
);

async function loadComparison(row: DocumentRow) {
  const run = ++comparisonSequence;
  comparisonLoading.value = true;
  comparisonError.value = '';
  try {
    const contract = await getContract(row.contractId);
    if (run !== comparisonSequence || !routeActive.value) return;
    if (contract.id !== row.contractId)
      throw new Error('返回资料不属于当前订单');
    const current = resolveDocumentRow(contract, 'quotes', row.id);
    selectedContract.value = contract;
    selectedRow.value = current;
  } catch (error) {
    if (run === comparisonSequence)
      comparisonError.value = `报价资料未刷新：${errorText(error)}`;
  } finally {
    if (run === comparisonSequence) comparisonLoading.value = false;
  }
}
function chooseRow(row: DocumentRow) {
  ++locateSequence;
  locateError.value = '';
  if (row.standaloneId) {
    standaloneId.value = row.standaloneId;
    return;
  }
  if (
    selectedRow.value?.id !== row.id ||
    selectedRow.value?.contractId !== row.contractId
  )
    selectedContract.value = undefined;
  selectedRow.value = row;
  standaloneId.value = undefined;
  void loadComparison(row);
}
async function load(autoSelect = false) {
  if (!routeActive.value) return;
  const run = ++listSequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getBusinessPage<DocumentRow>('quotes', {
      companyId: 0,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      contractId: contractId.value,
    });
    if (run !== listSequence || !routeActive.value) return;
    records.value = result.list;
    total.value = result.total;
    if (
      autoSelect &&
      !selectedRow.value &&
      !route.query.documentId &&
      !route.query.standaloneId
    ) {
      const first = result.list.find((row) => !row.standaloneId);
      if (first) chooseRow(first);
    }
  } catch (error) {
    if (run === listSequence)
      pageError.value = `${total.value === undefined ? '列表暂不可用' : '列表未刷新，保留上次结果'}：${errorText(error)}`;
  } finally {
    if (run === listSequence) loading.value = false;
  }
}
function search() {
  pageNo.value = 1;
  void load(true);
}
function clearSearch() {
  keyword.value = '';
  search();
}
function refresh() {
  void load(true);
  if (selectedRow.value) void loadComparison(selectedRow.value);
}
function openDetail(row: DocumentRow) {
  if (row.standaloneId) {
    standaloneId.value = row.standaloneId;
    return;
  }
  detailRow.value = row;
  detailOpen.value = true;
}
function showComparisonDetail(id: string) {
  if (selectedContract.value)
    openDetail(resolveDocumentRow(selectedContract.value, 'quotes', id));
}
function closeDetail() {
  detailOpen.value = false;
  standaloneId.value = undefined;
  locateError.value = '';
  ++locateSequence;
  if (routeActive.value && (route.query.documentId || route.query.standaloneId))
    void router.replace({ query: withoutDetailQuery(route.query) });
}
function clearScope() {
  const query = withoutDetailQuery(route.query);
  delete query.contractId;
  void router.replace({ query });
}
function launch(
  kind: DocumentKind,
  actionName: string,
  source?: RelatedDocumentSource,
) {
  if (actionOpen.value || (source && actionDisabled.value)) return;
  actionKind.value = kind;
  action.value = actionName;
  actionSource.value = source;
  actionContractId.value = source
    ? selectedContract.value?.id
    : contractId.value;
  actionOpen.value = true;
}
function closeAction() {
  actionOpen.value = false;
}
function actionSaved(updated: Contract) {
  closeAction();
  if (updated && selectedContract.value?.id === updated.id) {
    ++comparisonSequence;
    selectedContract.value = updated;
    comparisonError.value = '';
    comparisonLoading.value = false;
  }
  refresh();
}
async function locate() {
  const run = ++locateSequence;
  locateError.value = '';
  detailOpen.value = false;
  standaloneId.value = undefined;
  if (!routeActive.value) return;
  try {
    const standalone = standaloneLocation(route.query);
    if (standalone) {
      standaloneId.value = standalone;
      return;
    }
    const location = detailLocation(route.query);
    if (!location) return;
    const contract = await getContract(location.contractId);
    if (run !== locateSequence || !routeActive.value) return;
    if (contract.id !== location.contractId)
      throw new Error('返回资料不属于当前订单');
    const row = resolveDocumentRow(contract, 'quotes', location.documentId);
    ++comparisonSequence;
    selectedContract.value = contract;
    selectedRow.value = row;
    comparisonError.value = '';
    comparisonLoading.value = false;
    openDetail(row);
  } catch (error) {
    if (run === locateSequence)
      locateError.value = `无法打开关联报价：${errorText(error)}`;
  }
}

watch(
  () => [contractId.value, routeActive.value] as const,
  () => {
    ++listSequence;
    ++comparisonSequence;
    pageNo.value = 1;
    selectedRow.value = undefined;
    selectedContract.value = undefined;
    comparisonError.value = '';
    comparisonLoading.value = false;
    actionOpen.value = false;
    if (routeActive.value) void load(true);
  },
  { immediate: true },
);
watch(
  () => [
    route.query.documentId,
    route.query.standaloneId,
    contractId.value,
    routeActive.value,
  ],
  () => {
    void locate();
  },
  { immediate: true, flush: 'post' },
);
onBeforeUnmount(() => {
  ++listSequence;
  ++comparisonSequence;
  ++locateSequence;
});
</script>

<template>
  <Page>
    <div class="procurement-workspace quotes-workspace">
      <ProcurementPageHeader
        title="询价与报价"
        description="围绕同一采购需求比较价格、交期与报价口径，直接编制采购方案。"
      >
        <template #actions>
          <Button :loading="loading" @click="refresh">刷新</Button>
          <Button type="primary" @click="launch('quotes', 'CREATE_QUOTE')">
            新增报价
          </Button>
        </template>
      </ProcurementPageHeader>

      <Alert v-if="contractId" type="info" show-icon class="scope-alert">
        <template #message>
          <div class="scope-message">
            <span>当前订单范围：{{ scopeLabel }}</span><Button type="link" size="small" @click="clearScope">
              查看全部订单报价
            </Button>
          </div>
        </template>
      </Alert>
      <Alert
        v-if="locateError"
        type="warning"
        show-icon
        :message="locateError"
        class="scope-alert"
      >
        <template #action>
          <Button size="small" @click="closeDetail">关闭定位</Button>
        </template>
      </Alert>

      <div class="quotes-layout">
        <aside class="quote-register" aria-label="报价记录">
          <header class="register-heading">
            <h2>报价记录</h2>
            <span class="procurement-muted">{{
              total === undefined
                ? loading
                  ? '读取中'
                  : '数量待读取'
                : `${total} 条 · 含历史版本`
            }}</span>
          </header>
          <div class="register-search">
            <Input.Search
              v-model:value="keyword"
              allow-clear
              placeholder="搜索供应商、订单或客户"
              @search="search"
            />
            <Button
              v-if="keyword.trim()"
              type="link"
              size="small"
              @click="clearSearch"
            >
              清除查询
            </Button>
          </div>
          <Alert
            v-if="pageError"
            type="error"
            show-icon
            :message="pageError"
            class="list-error"
          />
          <Spin :spinning="loading">
            <div v-if="records.length" class="quote-records">
              <article
                v-for="row in records"
                :key="row.standaloneId || row.id"
                class="quote-record"
                :class="{
                  'quote-record-selected':
                    selectedRow?.id === row.id &&
                    selectedRow?.contractId === row.contractId &&
                    !row.standaloneId,
                }"
              >
                <button
                  type="button"
                  class="quote-record-select"
                  :aria-pressed="
                    selectedRow?.id === row.id &&
                    selectedRow?.contractId === row.contractId &&
                    !row.standaloneId
                  "
                  @click="chooseRow(row)"
                >
                  <span class="record-supplier">{{
                      row.record.supplierName ||
                      row.record.name ||
                      row.name ||
                      '供应商待补齐'
                    }}<span v-if="row.standaloneId" class="migration-label">历史单据</span></span>
                  <span class="record-order procurement-muted">{{
                    row.contractCode || row.contractName || '关联订单待补齐'
                  }}</span>
                  <span
                    v-if="row.customerName"
                    class="record-customer procurement-muted"
                    >{{ row.customerName }}</span>
                  <span class="record-price procurement-number">{{ row.record.currency || '币种待补齐' }}
                    {{ row.record.unitPrice ?? '单价待补齐'
                    }}<span class="procurement-muted">
                      / {{ row.record.unit || '单位待补齐' }}</span></span>
                  <span class="record-state"><ProcurementStatusBadge
                      v-if="!row.standaloneId"
                      :status="quoteStatus(row.record).status"
                      :label="quoteStatus(row.record).label"
                    /><span class="procurement-muted">{{
                      row.record.validUntil
                        ? `有效至 ${row.record.validUntil}`
                        : '有效期待补齐'
                    }}</span></span>
                </button>
                <Button
                  class="record-detail-link"
                  type="text"
                  size="small"
                  @click="openDetail(row)"
                >
                  查看详情
                </Button>
              </article>
            </div>
            <div v-else class="register-empty">
              <Empty
                :description="
                  pageError
                    ? '列表未读取成功，请刷新重试'
                    : keyword.trim()
                      ? '没有符合条件的报价'
                      : '当前范围暂无报价'
                "
              /><Button v-if="keyword.trim()" @click="clearSearch">
                清除查询，查看当前范围
              </Button>
            </div>
          </Spin>
          <Pagination
            class="register-pagination"
            size="small"
            :current="pageNo"
            :page-size="pageSize"
            :total="total ?? 0"
            :show-size-changer="false"
            :show-less-items="true"
            @change="
              (page) => {
                pageNo = page;
                load();
              }
            "
          />
        </aside>

        <main class="comparison-workspace">
          <Alert
            v-if="comparisonError"
            type="error"
            show-icon
            :message="comparisonError"
            class="scope-alert"
          >
            <template #action>
              <Button
                size="small"
                @click="selectedRow && loadComparison(selectedRow)"
              >
                重试
              </Button>
            </template>
          </Alert>
          <Spin :spinning="comparisonLoading">
            <QuoteComparison
              v-if="selectedContract && selectedRow"
              :contract="selectedContract"
              :quote-id="selectedRow.id"
              :disabled="actionDisabled"
              @detail="showComparisonDetail"
              @new-quote="
                (id) => launch('quotes', 'CREATE_QUOTE', { kind: 'tasks', id })
              "
              @plan="
                (id) => launch('plans', 'SAVE_PLAN', { kind: 'quotes', id })
              "
            />
            <div v-else class="comparison-empty">
              <Empty
                :description="
                  comparisonLoading
                    ? '正在读取完整采购需求与报价'
                    : '选择一份报价，查看同一需求的全部供应商报价'
                "
              />
              <p class="procurement-muted">
                最新报价并排展示，历史报价与证据保留在原单据中。
              </p>
            </div>
          </Spin>
        </main>
      </div>

      <DocumentAction
        :open="actionOpen && routeActive"
        :kind="actionKind"
        :action="action"
        :contract-id="actionContractId"
        :lock-contract="Boolean(actionContractId)"
        :source="actionSource"
        @close="closeAction"
        @updated="actionSaved"
      />
      <RecordDetail
        :open="detailOpen && routeActive"
        kind="quotes"
        :row="detailRow"
        @close="closeDetail"
        @updated="refresh"
      />
      <BusinessDocumentDetail
        :open="Boolean(standaloneId) && routeActive"
        kind="quotes"
        :id="standaloneId"
        @close="closeDetail"
        @updated="refresh"
      />
    </div>
  </Page>
</template>

<style scoped>
.scope-alert {
  margin-bottom: 16px;
}

.scope-message {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.quotes-layout {
  display: grid;
  grid-template-columns: 304px minmax(0, 1fr);
  min-height: 580px;
  overflow: hidden;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 8px;
}

.quote-register {
  min-width: 0;
  border-right: 1px solid var(--procurement-line);
}

.register-heading {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  padding: 20px 16px 12px;
}

.register-heading h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.register-heading > span {
  font-size: 12px;
}

.register-search {
  padding: 0 16px 16px;
}

.list-error {
  margin: 0 12px 12px;
}

.quote-records {
  max-height: 760px;
  overflow-y: auto;
}

.quote-record {
  position: relative;
  border-top: 1px solid var(--procurement-line);
}

.quote-record-selected {
  background: var(--procurement-selected);
  box-shadow: inset 3px 0 0 var(--procurement-accent);
}

.quote-record-select {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding: 16px 16px 42px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.quote-record-select:hover {
  background: var(--procurement-muted);
}

.quote-record-select:focus-visible {
  outline: 2px solid var(--procurement-accent);
  outline-offset: -2px;
}

.record-supplier {
  font-weight: 600;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.record-order,
.record-customer,
.record-state {
  font-size: 12px;
  line-height: 1.6;
}

.record-price {
  margin-top: 6px;
  font-weight: 500;
}

.record-price > span {
  font-size: 12px;
  font-weight: 400;
}

.record-state {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.migration-label {
  display: inline-block;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--procurement-secondary);
}

.record-detail-link {
  position: absolute;
  right: 12px;
  bottom: 10px;
}

.register-pagination {
  padding: 16px 8px;
  text-align: center;
  border-top: 1px solid var(--procurement-line);
}

.register-empty {
  padding: 32px 12px;
  text-align: center;
}

.comparison-workspace {
  min-width: 0;
  padding: 24px;
}

.comparison-empty {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
}

.comparison-empty p {
  font-size: 12px;
}

@media (max-width: 1199px) {
  .quotes-layout {
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .comparison-workspace {
    padding: 20px;
  }
}

@media (max-width: 900px) {
  .quotes-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .quote-register {
    border-right: 0;
    border-bottom: 1px solid var(--procurement-line);
  }

  .quote-records {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 340px;
  }
}

@media (max-width: 575px) {
  .quote-records {
    grid-template-columns: minmax(0, 1fr);
  }

  .comparison-workspace {
    padding: 16px;
  }
}
</style>
