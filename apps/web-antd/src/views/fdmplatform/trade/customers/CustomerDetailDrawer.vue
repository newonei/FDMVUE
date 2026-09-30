<script setup lang="ts">
import type {
  Customer,
  CustomerActivityRecord,
  CustomerActivityType,
  CustomerActivityView,
} from '#/api/fdmplatform/customers';

import { computed, ref, watch } from 'vue';

import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Pagination,
  Radio,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getCustomerActivity } from '#/api/fdmplatform/customers';

import { errorText, label } from '../../data';
import { contractReferenceText } from '../../documents/migration-display';
import RelatedLink from '../../documents/RelatedLink.vue';
import {
  activityAmount,
  activityDate,
  activityLabel,
  activityName,
  activityTarget,
  dateRangeError,
  quantityText,
} from '../../products/activity-model';
import {
  customerActivityTypes,
  customerFields,
  customerMissingFields,
  customerRegion,
  customerSourceLabel,
} from './model';

const props = defineProps<{ customer?: Customer; open: boolean }>();
const emit = defineEmits<{
  close: [];
  edit: [customer: Customer];
  okki: [customer: Customer];
  toggle: [customer: Customer];
}>();
const { TabPane } = Tabs;
const view = ref<CustomerActivityView>();
const loading = ref(false);
const panelError = ref('');
const fullscreen = ref(false);
const tab = ref<'DETAIL' | CustomerActivityType>('ALL');
const display = ref<'list' | 'timeline'>('timeline');
const keyword = ref('');
const fromDate = ref('');
const toDate = ref('');
const pageNo = ref(1);
const pageSize = ref(20);
let sequence = 0;

const isActivity = computed(() => tab.value !== 'DETAIL');
const count = computed(() =>
  Object.values(view.value?.counts ?? {}).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  ),
);
/** 只列出有单据的类型，避免十几个空标签；当前选中的类型始终保留 */
const typeTabs = computed(() =>
  customerActivityTypes
    .filter(
      (item) =>
        (view.value?.counts[item.value] ?? 0) > 0 || tab.value === item.value,
    )
    .map((item) => ({
      key: item.value,
      label: item.label,
      tab: `${item.label} (${view.value?.counts[item.value] ?? 0})`,
      count: view.value?.counts[item.value] ?? 0,
    })),
);
const tabs = computed(() => [
  { key: 'ALL', tab: `全部单据 (${count.value})` },
  { key: 'DETAIL', tab: '客户资料' },
  ...typeTabs.value,
]);
const missing = computed(() =>
  props.customer ? customerMissingFields(props.customer) : [],
);
const columns = [
  { title: '日期', key: 'date', width: 150 },
  { title: '类型 / 单据', key: 'document', width: 300 },
  { title: '关联合同', key: 'contract', width: 200 },
  { title: '供应商', key: 'supplier', width: 170 },
  { title: '金额', key: 'amount', width: 170 },
  { title: '状态', key: 'status', width: 110 },
];

watch(
  () => [props.open, props.customer?.id],
  () => {
    sequence++;
    if (!props.open || !props.customer) return;
    view.value = undefined;
    tab.value = 'ALL';
    keyword.value = '';
    fromDate.value = '';
    toDate.value = '';
    pageNo.value = 1;
    fullscreen.value = false;
    void load();
  },
  { immediate: true },
);
watch(
  () => props.customer?.version,
  () => {
    if (props.open && view.value?.customerId === props.customer?.id)
      void load();
  },
);

async function load(reset = false) {
  const id = props.customer?.id;
  if (!id || !props.open) return;
  const run = ++sequence;
  panelError.value = dateRangeError(fromDate.value, toDate.value);
  if (panelError.value) {
    loading.value = false;
    return;
  }
  if (reset) pageNo.value = 1;
  loading.value = true;
  try {
    const result = await getCustomerActivity(id, {
      type: isActivity.value ? (tab.value as CustomerActivityType) : 'ALL',
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      fromDate: fromDate.value || undefined,
      toDate: toDate.value || undefined,
    });
    if (run === sequence && props.open && id === props.customer?.id)
      view.value = result;
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function changeTab(key: number | string) {
  tab.value = key as typeof tab.value;
  if (isActivity.value) void load(true);
}
function showType(type: CustomerActivityType) {
  keyword.value = '';
  fromDate.value = '';
  toDate.value = '';
  changeTab(type);
}
function resetFilters() {
  keyword.value = '';
  fromDate.value = '';
  toDate.value = '';
  void load(true);
}
function changePage(page: number, size: number) {
  pageNo.value = size === pageSize.value ? page : 1;
  pageSize.value = size;
  void load();
}
function amountText(row: CustomerActivityRecord) {
  return row.amounts.length > 0 ? activityAmount(row) : '—';
}
function money(value: unknown) {
  return quantityText(value);
}
function statusColor(status?: null | string) {
  if (['CANCELLED', 'REJECTED', 'VOID'].includes(status ?? ''))
    return 'default';
  if (
    [
      'ACTIVE',
      'APPROVED',
      'ARRIVED',
      'COMPLETED',
      'CONFIRMED',
      'SHIPPED',
      'VALID',
    ].includes(status ?? '')
  )
    return 'green';
  return 'blue';
}
function contractText(row: CustomerActivityRecord) {
  return contractReferenceText(
    row.contractCode,
    row.contractName,
    row.contractId,
  );
}
function close() {
  sequence++;
  emit('close');
}
</script>

<template>
  <Drawer
    :open="open"
    :width="fullscreen ? '100vw' : 'min(1440px, 96vw)'"
    :body-style="{
      padding: '16px',
      background: 'var(--customer-detail-background, #f5f7fa)',
    }"
    class="customer-detail-drawer"
    @close="close"
  >
    <template #title>
      <Space class="detail-title">
        <Tag color="blue">客户档案</Tag>
        <span>{{ customer?.name }}</span>
        <Tag v-if="customer" :color="customer.active ? 'green' : 'default'">
          {{ customer.active ? '启用' : '停用' }}
        </Tag>
      </Space>
    </template>
    <template #extra>
      <Space v-if="customer" :size="6" wrap>
        <Button type="primary" @click="emit('edit', customer)">维护资料</Button>
        <Button
          v-if="customer.sourceSystem === 'OKKI'"
          @click="emit('okki', customer)"
        >
          OKKI 预览刷新
        </Button>
        <Button :danger="customer.active" @click="emit('toggle', customer)">
          {{ customer.active ? '停用' : '启用' }}
        </Button>
        <Button :loading="loading" @click="load()">刷新</Button>
        <Button @click="fullscreen = !fullscreen">
          {{ fullscreen ? '退出全屏' : '展开全屏' }}
        </Button>
      </Space>
    </template>
    <div v-if="customer" class="customer-detail-layout">
      <div class="customer-detail-main">
        <Card size="small" class="customer-overview">
          <Descriptions
            :column="{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }"
            size="small"
            :colon="false"
          >
            <Descriptions.Item label="客户编号">
              {{ customer.code || '—' }}
              <span v-if="customer.shortName" class="muted">
                · {{ customer.shortName }}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="公司名称">
              {{ customer.companyName || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="国家 / 地区">
              {{ customerRegion(customer) || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="客户来源">
              {{ customer.customerSource || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="联系人">
              {{ customer.contactName || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="邮箱 / 电话">
              {{
                [customer.email, customer.phone].filter(Boolean).join(' / ') ||
                '—'
              }}
            </Descriptions.Item>
            <Descriptions.Item label="资料来源">
              {{ customerSourceLabel(customer.sourceSystem) }}
              <span v-if="customer.lastSyncedAt" class="muted">
                · 同步于
                {{ formatDate(customer.lastSyncedAt, 'YYYY-MM-DD HH:mm') }}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="资料完整度">
              <Tag
                :color="missing.length ? 'orange' : 'green'"
                class="wrap-tag"
              >
                {{
                  missing.length
                    ? `待补：${missing.join('、')}`
                    : '必要资料已完整'
                }}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card size="small" class="customer-relations">
          <Tabs :active-key="tab" size="small" @change="changeTab">
            <TabPane v-for="item in tabs" :key="item.key" :tab="item.tab" />
          </Tabs>

          <Descriptions
            v-if="tab === 'DETAIL'"
            bordered
            size="small"
            :column="1"
          >
            <Descriptions.Item
              v-for="[key, title] in customerFields"
              :key="key"
              :label="title"
            >
              <template v-if="key === 'country'">
                {{ customer.countryName || customer.country || '—' }}
              </template>
              <a
                v-else-if="key === 'website' && customer.website"
                :href="
                  /^https?:\/\//i.test(customer.website)
                    ? customer.website
                    : `https://${customer.website}`
                "
                target="_blank"
                rel="noopener noreferrer"
                >{{ customer.website }}</a>
              <template v-else>{{ customer[key] || '—' }}</template>
            </Descriptions.Item>
            <Descriptions.Item label="资料来源">
              {{ customerSourceLabel(customer.sourceSystem) }}
              <span v-if="customer.externalId" class="muted">
                · 外部编号 {{ customer.externalId }}
              </span>
            </Descriptions.Item>
            <Descriptions.Item v-if="customer.lastSyncedAt" label="最近同步">
              {{ formatDate(customer.lastSyncedAt, 'YYYY-MM-DD HH:mm') }}
            </Descriptions.Item>
            <Descriptions.Item label="备注">
              {{ customer.remark || '—' }}
            </Descriptions.Item>
          </Descriptions>
          <template v-else>
            <div class="activity-tools">
              <Radio.Group
                v-model:value="display"
                size="small"
                button-style="solid"
                aria-label="单据显示方式"
              >
                <Radio.Button value="timeline">时间线</Radio.Button>
                <Radio.Button value="list">表格</Radio.Button>
              </Radio.Group>
              <Input
                v-model:value="keyword"
                placeholder="搜索单号、合同或供应商"
                allow-clear
                class="activity-search"
                @press-enter="load(true)"
              />
              <Input
                v-model:value="fromDate"
                type="date"
                aria-label="开始日期"
                class="activity-date"
              />
              <span>至</span>
              <Input
                v-model:value="toDate"
                type="date"
                aria-label="结束日期"
                class="activity-date"
              />
              <Button type="primary" :loading="loading" @click="load(true)">
                查询
              </Button>
              <Button
                v-if="keyword || fromDate || toDate"
                @click="resetFilters"
              >
                清空
              </Button>
            </div>
            <Alert
              v-if="panelError"
              :message="panelError"
              type="error"
              show-icon
              class="activity-error"
            />
            <Spin :spinning="loading">
              <Empty
                v-if="!view?.list.length && !loading"
                :description="
                  panelError
                    ? '单据加载失败，请重试'
                    : keyword || fromDate || toDate
                      ? '没有符合筛选条件的单据'
                      : '该客户还没有关联单据'
                "
                class="activity-empty"
              />
              <ol v-else-if="display === 'timeline'" class="activity-timeline">
                <li
                  v-for="row in view?.list ?? []"
                  :key="row.id"
                  class="activity-item"
                >
                  <div class="activity-time">
                    {{ row.timeLabel || '业务时间' }} · {{ activityDate(row) }}
                  </div>
                  <div class="activity-heading">
                    <Tag color="blue">{{ activityLabel(row.type) }}</Tag>
                    <RelatedLink :target="activityTarget(row)">
                      {{ activityName(row) }}
                    </RelatedLink>
                    <span v-if="row.amounts.length" class="activity-amount">{{
                      amountText(row)
                    }}</span>
                  </div>
                  <div v-if="row.note" class="activity-note" :title="row.note">
                    {{ row.note }}
                  </div>
                  <div
                    v-if="
                      (row.contractId && row.type !== 'CONTRACT') ||
                      row.supplierName
                    "
                    class="activity-meta"
                  >
                    <span v-if="row.contractId && row.type !== 'CONTRACT'">关联合同：<RelatedLink
                        :target="{
                          type: 'contract',
                          contractId: row.contractId,
                        }"
                        >{{ contractText(row) }}</RelatedLink></span>
                    <span v-if="row.supplierName">供应商：<RelatedLink
                        :target="
                          row.supplierId
                            ? { type: 'supplier', id: row.supplierId }
                            : undefined
                        "
                        >{{ row.supplierName }}</RelatedLink></span>
                  </div>
                  <div
                    v-else-if="row.type === 'CONTRACT' && row.contractName"
                    class="activity-meta"
                  >
                    {{ row.contractName }}
                  </div>
                  <Tag v-if="row.status" :color="statusColor(row.status)">
                    {{ label(row.status) }}
                  </Tag>
                </li>
              </ol>
              <Table
                v-else
                size="small"
                :data-source="view?.list ?? []"
                :columns="columns"
                row-key="id"
                :pagination="false"
                :scroll="{ x: 1100 }"
              >
                <template #bodyCell="{ column, record }">
                  <span v-if="column.key === 'date'">{{
                    activityDate(record as CustomerActivityRecord)
                  }}</span>
                  <template v-else-if="column.key === 'document'">
                    <Tag>{{ activityLabel(record.type) }}</Tag>
                    <RelatedLink
                      :target="activityTarget(record as CustomerActivityRecord)"
                    >
                      {{ activityName(record as CustomerActivityRecord) }}
                    </RelatedLink>
                    <div
                      v-if="record.note"
                      class="activity-note"
                      :title="record.note"
                    >
                      {{ record.note }}
                    </div>
                  </template>
                  <template v-else-if="column.key === 'contract'">
                    <RelatedLink
                      v-if="record.contractId && record.type !== 'CONTRACT'"
                      :target="{
                        type: 'contract',
                        contractId: record.contractId,
                      }"
                    >
                      {{ contractText(record as CustomerActivityRecord) }}
                    </RelatedLink>
                    <span v-else-if="record.type === 'CONTRACT'">{{
                      record.contractName || '—'
                    }}</span>
                    <span v-else>—</span>
                  </template>
                  <template v-else-if="column.key === 'supplier'">
                    <RelatedLink
                      v-if="record.supplierName"
                      :target="
                        record.supplierId
                          ? { type: 'supplier', id: record.supplierId }
                          : undefined
                      "
                    >
                      {{ record.supplierName }}
                    </RelatedLink>
                    <span v-else>—</span>
                  </template>
                  <span v-else-if="column.key === 'amount'">{{
                    amountText(record as CustomerActivityRecord)
                  }}</span>
                  <Tag
                    v-else-if="column.key === 'status' && record.status"
                    :color="statusColor(record.status)"
                  >
                    {{ label(record.status) }}
                  </Tag>
                </template>
              </Table>
            </Spin>
            <Pagination
              v-if="view && view.total > 0"
              :current="pageNo"
              :page-size="pageSize"
              :total="view.total"
              :show-total="(total: number) => `共 ${total} 条单据`"
              show-size-changer
              :page-size-options="['10', '20', '50']"
              class="activity-pagination"
              @change="changePage"
            />
          </template>
        </Card>
      </div>
      <aside class="customer-detail-aside">
        <Card title="往来汇总" size="small">
          <p v-if="view?.summary.firstDate" class="muted">
            首次业务 {{ view.summary.firstDate }} · 最近业务
            {{ view.summary.lastDate }}
          </p>
          <Empty
            v-if="!view?.summary.amounts.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="loading ? '统计中…' : '暂无金额记录'"
          />
          <div
            v-for="row in view?.summary.amounts ?? []"
            :key="row.currency ?? ''"
            class="money-block"
          >
            <div class="money-currency">
              {{ row.currency || '币种未注明' }}
            </div>
            <div class="summary-row">
              <span>合同金额</span>
              <Button type="link" size="small" @click="showType('CONTRACT')">
                {{ money(row.contractAmount) }}
              </Button>
            </div>
            <div class="summary-row">
              <span>回款</span>
              <Button type="link" size="small" @click="showType('RECEIPT')">
                {{ money(row.receivedAmount) }}
              </Button>
            </div>
            <div class="summary-row">
              <span>退款</span>
              <Button type="link" size="small" @click="showType('REFUND')">
                {{ money(row.refundedAmount) }}
              </Button>
            </div>
            <div class="summary-row">
              <span>开票</span>
              <Button
                type="link"
                size="small"
                @click="showType('SALES_INVOICE')"
              >
                {{ money(row.invoicedAmount) }}
              </Button>
            </div>
          </div>
        </Card>
        <Card title="单据数量" size="small">
          <Empty
            v-if="!typeTabs.some((item) => item.count > 0)"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="loading ? '统计中…' : '暂无关联单据'"
          />
          <div
            v-for="item in typeTabs.filter((entry) => entry.count > 0)"
            :key="item.key"
            class="summary-row"
          >
            <span>{{ item.label }}</span>
            <Button type="link" size="small" @click="showType(item.key)">
              {{ item.count }}
            </Button>
          </div>
        </Card>
        <Card v-if="view?.notes.length" title="统计口径" size="small">
          <ul class="statistics-notes">
            <li v-for="note in view.notes" :key="note">{{ note }}</li>
          </ul>
        </Card>
      </aside>
    </div>
  </Drawer>
</template>

<style scoped>
.customer-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 286px;
  gap: 16px;
  align-items: start;
}

.customer-detail-main,
.customer-detail-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.detail-title {
  max-width: 640px;
}

.customer-overview :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
}

.customer-overview :deep(.ant-descriptions-item-label) {
  white-space: nowrap;
}

.wrap-tag {
  white-space: normal;
}

.muted {
  font-size: 12px;
  color: #64748b;
}

.activity-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}

.activity-search {
  width: 235px;
}

.activity-date {
  width: 145px;
}

.activity-error {
  margin-bottom: 12px;
}

.activity-empty {
  padding: 45px 0;
}

.activity-timeline {
  padding: 0 0 0 18px;
  margin: 0;
  list-style: none;
}

.activity-item {
  position: relative;
  padding: 4px 0 18px 22px;
  border-left: 2px solid #e8edf3;
}

.activity-item::before {
  position: absolute;
  top: 8px;
  left: -6px;
  width: 10px;
  height: 10px;
  content: '';
  background: #fff;
  border: 2px solid #91caff;
  border-radius: 50%;
}

.activity-item + .activity-item {
  padding-top: 14px;
  border-top: 1px solid #f0f0f0;
}

.activity-item + .activity-item::before {
  top: 18px;
}

.activity-time {
  margin-bottom: 8px;
  font-size: 12px;
  color: #64748b;
}

.activity-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
  margin-bottom: 7px;
}

.activity-heading :deep(.business-reference) {
  font-weight: 600;
}

.activity-amount {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: #334155;
}

.activity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 7px;
  line-height: 1.6;
}

.activity-note {
  display: -webkit-box;
  margin-bottom: 7px;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
  white-space: pre-line;
  -webkit-box-orient: vertical;
}

.activity-pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 18px;
}

.money-block + .money-block {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.money-currency {
  margin-bottom: 4px;
  font-weight: 600;
}

.summary-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  border-bottom: 1px solid #f0f0f0;
}

.summary-row:last-child {
  border-bottom: 0;
}

.statistics-notes {
  padding-left: 16px;
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: #64748b;
}

@media (max-width: 1080px) {
  .customer-detail-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .customer-detail-aside {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }
}
</style>
