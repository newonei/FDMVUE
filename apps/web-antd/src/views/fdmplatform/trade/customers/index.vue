<script setup lang="ts">
import type {
  Customer,
  CustomerActivityType,
  CustomerListTier,
  CustomerOptions,
  CustomerOverview,
  CustomerSort,
} from '#/api/fdmplatform/customers';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart, formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Input,
  Menu,
  message,
  Modal,
  Popover,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getCustomer,
  getCustomerOptions,
  getCustomerOverview,
  getCustomers,
  setCustomerStatus,
} from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import RelatedLink from '../../documents/RelatedLink.vue';
import { useEntityDetail } from '../../documents/useEntityDetail';
import CustomerDetailDrawer from './CustomerDetailDrawer.vue';
import CustomerEditor from './CustomerEditor.vue';
import CustomerOverviewCards from './CustomerOverviewCards.vue';
import CustomerSnapshotPanel from './CustomerSnapshotPanel.vue';
import CustomerTrendCell from './CustomerTrendCell.vue';
import {
  countryMatches,
  countrySelectOptions,
  currencyLabel,
  customerCsv,
  customerMissingFields,
  customerRegion,
  customerSourceLabel,
  customerTiers,
  moneyShort,
  receivableHint,
  signedAgo,
} from './model';
import OkkiCustomerPicker from './OkkiCustomerPicker.vue';

import '../../components/compact-tables.css';

defineOptions({ name: 'FdmPlatformTradeCustomers' });
const customers = ref<Customer[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const active = ref<string>();
const source = ref<string>();
const country = ref<string>();
const customerSource = ref<string>();
const missing = ref(false);
const tier = ref<'ALL' | CustomerListTier>('ALL');
const sort = ref<CustomerSort>('LAST_SIGNED');
const order = ref<'ASC' | 'DESC'>('DESC');
const loading = ref(false);
const panelError = ref('');
const overview = ref<CustomerOverview>();
const overviewLoading = ref(false);
const options = ref<CustomerOptions>();
const exporting = ref(false);
const expandedKeys = ref<string[]>([]);
const editorOpen = ref(false);
/** 点击客户打开客户档案（资料 + 全部关联单据）；「维护」才打开编辑 */
const detailOpen = ref(false);
const detailTab = ref<CustomerActivityType>();
const selected = ref<Customer>();
const okkiOpen = ref(false);
const refreshCustomer = ref<Customer>();
const changing = ref<string>();
let sequence = 0;
let overviewSequence = 0;

const tierNames: Record<CustomerListTier, string> = {
  ACTIVE: '活跃',
  FOLLOW: '需跟进',
  SLEEP: '沉睡',
  NONE: '未成交',
  NEW: '今年新客户',
  RECEIVABLE: '有未回款',
};
const sortColumns: Record<string, CustomerSort> = {
  contractAmount: 'CONTRACT_AMOUNT',
  recent12: 'RECENT_12',
  receivable: 'RECEIVABLE',
  lastSigned: 'LAST_SIGNED',
};
/** 可在「列设置」里加回的列，默认隐藏以免表格横向滚动 */
const optionalColumns = [
  { value: 'businessSource', label: '公司名称 / 客户来源' },
  { value: 'source', label: '资料来源与同步时间' },
  { value: 'firstSigned', label: '首次签约' },
];
const COLUMN_STORAGE = 'fdm-platform-customer-columns';
const extras = ref<string[]>(readExtras());

function readExtras() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE) ?? '[]');
    return Array.isArray(saved)
      ? saved.filter((value) =>
          optionalColumns.some((column) => column.value === value),
        )
      : [];
  } catch {
    return [];
  }
}
function saveExtras(values: unknown[]) {
  extras.value = values.map(String);
  try {
    localStorage.setItem(COLUMN_STORAGE, JSON.stringify(extras.value));
  } catch {
    // 浏览器禁用存储时只在本次打开期间生效
  }
}

function sortOrder(key: string) {
  if (sortColumns[key] !== sort.value) return null;
  return order.value === 'ASC' ? ('ascend' as const) : ('descend' as const);
}
const columns = computed(() => {
  const sortable = (key: string) => ({
    sorter: true,
    sortOrder: sortOrder(key),
    sortDirections: ['descend', 'ascend'] as ('ascend' | 'descend')[],
  });
  const list = [
    { title: '客户', key: 'name', width: 250 },
    { title: '分层', key: 'tier', width: 108 },
    {
      title: '累计合同额',
      key: 'contractAmount',
      width: 140,
      align: 'right' as const,
      ...sortable('contractAmount'),
    },
    {
      title: '近 12 个月',
      key: 'recent12',
      width: 204,
      align: 'right' as const,
      ...sortable('recent12'),
    },
    {
      title: '未回款',
      key: 'receivable',
      width: 128,
      align: 'right' as const,
      ...sortable('receivable'),
    },
    {
      title: '最近签约',
      key: 'lastSigned',
      width: 150,
      ...sortable('lastSigned'),
    },
    { title: '首次签约', key: 'firstSigned', width: 110 },
    { title: '公司名称 / 客户来源', key: 'businessSource', width: 210 },
    { title: '资料来源', key: 'source', width: 140 },
    { title: '联系人 / 地区', key: 'contact', width: 190 },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
    },
  ];
  return list.filter(
    (column) =>
      !optionalColumns.some((item) => item.value === column.key) ||
      extras.value.includes(column.key),
  );
});
const scrollX = computed(
  () => columns.value.reduce((sum, column) => sum + column.width, 0) + 48,
);
const countryOptions = computed(() =>
  countrySelectOptions(options.value?.countries ?? []),
);
const sourceOptions = computed(() =>
  (options.value?.customerSources ?? []).map((value) => ({
    label: value,
    value,
  })),
);

function query() {
  return {
    keyword: keyword.value.trim() || undefined,
    sourceSystem: source.value,
    active: active.value === undefined ? undefined : active.value === 'true',
    country: country.value,
    customerSource: customerSource.value,
    missing: missing.value || undefined,
    tier: tier.value === 'ALL' ? undefined : tier.value,
    sort: sort.value,
    order: order.value,
    withStats: true,
  };
}
async function load(reset = false) {
  if (reset) page.value = 1;
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getCustomers({
      ...query(),
      pageNo: page.value,
      pageSize: pageSize.value,
    });
    if (run !== sequence) return;
    customers.value = result.list;
    total.value = result.total;
    if (!result.list.some((row) => expandedKeys.value.includes(row.id)))
      expandedKeys.value = [];
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
/** 概况按全部客户统计；无共用范围的账号没有统计，不显示卡片 */
async function loadOverview() {
  const run = ++overviewSequence;
  overviewLoading.value = true;
  try {
    const result = await getCustomerOverview();
    if (run === overviewSequence) overview.value = result ?? undefined;
  } catch {
    if (run === overviewSequence) overview.value = undefined;
  } finally {
    if (run === overviewSequence) overviewLoading.value = false;
  }
}
function reload() {
  void load();
  void loadOverview();
}
function selectTier(value: 'ALL' | CustomerListTier) {
  tier.value = value;
  void load(true);
}
function keywordChanged(event: Event) {
  if (!(event.target as HTMLInputElement | null)?.value) void load(true);
}
function tableChange(
  pagination: { current?: number; pageSize?: number },
  _filters: unknown,
  sorter: unknown,
  extra?: { action?: string },
) {
  if (extra?.action === 'sort') {
    const current = (Array.isArray(sorter) ? sorter[0] : sorter) as
      | undefined
      | { columnKey?: string; order?: 'ascend' | 'descend' | null };
    const key = current?.order
      ? sortColumns[current.columnKey ?? '']
      : undefined;
    sort.value = key ?? 'LAST_SIGNED';
    order.value = key && current?.order === 'ascend' ? 'ASC' : 'DESC';
    page.value = 1;
  } else {
    page.value = pagination.current ?? 1;
    pageSize.value = pagination.pageSize ?? 20;
  }
  void load();
}
function expand(expanded: boolean, record: Customer) {
  expandedKeys.value = expanded ? [record.id] : [];
}

async function exportCsv() {
  exporting.value = true;
  try {
    const rows: Customer[] = [];
    for (let pageNo = 1; ; pageNo++) {
      const result = await getCustomers({ ...query(), pageNo, pageSize: 100 });
      rows.push(...result.list);
      if (result.list.length === 0 || rows.length >= result.total) break;
    }
    downloadFileFromBlobPart({
      source: new Blob([customerCsv(rows)], { type: 'text/csv;charset=utf-8' }),
      fileName: `外贸客户-${formatDate(new Date(), 'YYYYMMDD-HHmm')}.csv`,
    });
    message.success(`已导出 ${rows.length} 个客户`);
  } catch (error) {
    message.error(errorText(error));
  } finally {
    exporting.value = false;
  }
}

const entityDetail = useEntityDetail(
  'customerId',
  getCustomer,
  (value) => {
    selected.value = value;
    detailOpen.value = Boolean(value);
    editorOpen.value = !value;
  },
  () => {
    editorOpen.value = false;
    detailOpen.value = false;
  },
  (value) => {
    panelError.value = value;
  },
);
function view(customer: Customer) {
  detailTab.value = undefined;
  entityDetail.open(customer.id);
}
function viewContracts(customer: Customer) {
  detailTab.value = 'CONTRACT';
  entityDetail.open(customer.id);
}
function closeDetail() {
  detailTab.value = undefined;
  entityDetail.close();
}
function create() {
  entityDetail.open();
}
function edit(customer: Customer) {
  entityDetail.invalidatePending();
  selected.value = customer;
  editorOpen.value = true;
}
function closeEditor() {
  editorOpen.value = false;
  if (!detailOpen.value) entityDetail.close();
}
async function saved(customer: Customer) {
  if (detailOpen.value && selected.value?.id === customer.id)
    selected.value = customer;
  await Promise.all([load(), loadOverview()]);
}
async function okkiSaved() {
  await Promise.all([load(), loadOverview(), refreshSelected()]);
}
/** 档案打开时，状态或 OKKI 刷新后同步最新客户资料 */
async function refreshSelected() {
  const id = selected.value?.id;
  if (!id || !detailOpen.value) return;
  try {
    const customer = await getCustomer(id);
    if (detailOpen.value && selected.value?.id === id)
      selected.value = customer;
  } catch (error) {
    panelError.value = errorText(error);
  }
}
function chooseOkki(customer?: Customer) {
  refreshCustomer.value = customer;
  okkiOpen.value = true;
}
function toggle(customer: Customer) {
  const key = newIdempotencyKey();
  Modal.confirm({
    title: `${customer.active ? '停用' : '启用'}客户“${customer.name}”？`,
    content: customer.active
      ? '停用后不可在新合同中选取，历史合同与资料保留。'
      : '启用后可在新合同中选择。',
    okText: '确认',
    cancelText: '取消',
    async onOk() {
      changing.value = customer.id;
      try {
        await setCustomerStatus(customer.id, {
          active: !customer.active,
          expectedVersion: customer.version!,
          idempotencyKey: key,
        });
        message.success('客户状态已更新');
        await Promise.all([load(), loadOverview(), refreshSelected()]);
      } catch (error) {
        panelError.value = errorText(error);
        message.error(panelError.value);
        throw error;
      } finally {
        changing.value = undefined;
      }
    },
  });
}
function moreAction(customer: Customer, key: number | string) {
  if (key === 'okki') chooseOkki(customer);
  if (key === 'toggle') toggle(customer);
}
function tierOf(customer: Customer) {
  return customer.stats ? customerTiers[customer.stats.tier] : undefined;
}
function otherCurrencyTitle(customer: Customer) {
  return (customer.stats?.otherCurrencies ?? [])
    .map(
      (item) =>
        `${currencyLabel(item.currency)} ${moneyShort(item.contractAmount)}`,
    )
    .join('\n');
}
function owes(customer: Customer) {
  return Number(customer.stats?.receivable ?? 0) > 0;
}
function contactLine(customer: Customer) {
  return [customerRegion(customer), customer.email || customer.phone]
    .filter(Boolean)
    .join(' · ');
}
function missingText(customer: Customer) {
  const fields = customerMissingFields(customer);
  return fields.length > 2
    ? `缺${fields.slice(0, 2).join('、')}等 ${fields.length} 项`
    : `缺${fields.join('、')}`;
}
onMounted(() => {
  void load();
  void loadOverview();
  getCustomerOptions()
    .then((result) => {
      options.value = result;
    })
    .catch(() => {
      // 选项加载失败时国家与客户来源筛选为空，不影响列表
    });
});
onBeforeUnmount(() => {
  sequence++;
  overviewSequence++;
});
</script>

<template>
  <Page
    title="外贸客户管理"
    description="客户资料与往来业务一览。点客户名称打开完整档案，点行首箭头快速展开。"
  >
    <template #extra>
      <div class="header-actions">
        <Button @click="chooseOkki()">从 OKKI 选择客户</Button>
        <Button type="primary" @click="create()">新建客户</Button>
      </div>
    </template>
    <div class="customer-stack">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <template v-if="overview || overviewLoading">
        <CustomerOverviewCards
          :overview="overview"
          :active="tier"
          :loading="overviewLoading"
          @select="selectTier"
        />
        <p v-if="overview" class="statistics-note">
          统计截至 {{ overview.asOf }} · 按最近一次签约日期分层 ·
          金额满一万显示为「万」；金智迁入的历史合同未注明币种，单独合计，不与
          USD / CNY 相加
        </p>
      </template>
      <Card :body-style="{ padding: '16px' }">
        <div class="customer-stack compact">
          <div class="toolbar">
            <Input
              v-model:value="keyword"
              placeholder="名称、编号、联系人、邮箱或合同号"
              allow-clear
              class="search-input"
              @press-enter="load(true)"
              @change="keywordChanged"
            />
            <Select
              v-model:value="country"
              :options="countryOptions"
              :filter-option="countryMatches"
              show-search
              placeholder="国家 / 地区"
              allow-clear
              style="width: 170px"
              @change="load(true)"
            />
            <Select
              v-model:value="customerSource"
              :options="sourceOptions"
              placeholder="客户来源"
              allow-clear
              style="width: 130px"
              @change="load(true)"
            />
            <Select
              v-model:value="source"
              :options="[
                { label: '本地新增', value: 'LOCAL' },
                { label: 'OKKI 同步', value: 'OKKI' },
                { label: '金智导入', value: 'JINZHI' },
              ]"
              placeholder="资料来源"
              allow-clear
              style="width: 130px"
              @change="load(true)"
            />
            <Select
              v-model:value="active"
              :options="[
                { label: '启用', value: 'true' },
                { label: '停用', value: 'false' },
              ]"
              placeholder="状态"
              allow-clear
              style="width: 100px"
              @change="load(true)"
            />
            <Checkbox v-model:checked="missing" @change="load(true)">
              只看资料待补
              <span v-if="overview" class="muted">{{
                overview.missingProfile.toLocaleString('en-US')
              }}</span>
            </Checkbox>
            <Tag
              v-if="tier !== 'ALL'"
              color="blue"
              closable
              @close.prevent="selectTier('ALL')"
            >
              分层：{{ tierNames[tier] }}
            </Tag>
            <div class="toolbar-actions">
              <Button :loading="loading" @click="reload">刷新</Button>
              <Button :loading="exporting" @click="exportCsv">导出</Button>
              <Popover
                trigger="click"
                placement="bottomRight"
                title="显示更多列"
              >
                <template #content>
                  <Checkbox.Group
                    :value="extras"
                    :options="optionalColumns"
                    class="column-options"
                    @change="saveExtras"
                  />
                </template>
                <Button>列设置</Button>
              </Popover>
            </div>
          </div>
          <Table
            class="fdm-business-table customer-table"
            size="small"
            table-layout="fixed"
            :columns="columns"
            :data-source="customers"
            row-key="id"
            :loading="loading"
            :scroll="{ x: scrollX }"
            :expanded-row-keys="expandedKeys"
            :pagination="{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count: number) =>
                `共 ${count.toLocaleString('en-US')} 个客户`,
            }"
            @expand="expand"
            @change="tableChange"
          >
            <template #expandedRowRender="{ record }">
              <CustomerSnapshotPanel
                :customer="record as Customer"
                @contracts="viewContracts"
                @edit="edit"
                @view="view"
              />
            </template>
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'name'" class="name-cell">
                <div class="name-line">
                  <Button
                    type="link"
                    class="name-link"
                    :title="`查看客户档案：${record.name}`"
                    @click="view(record as Customer)"
                  >
                    {{ record.name }}
                  </Button>
                  <Tag
                    v-if="record.stats?.newThisYear"
                    color="green"
                    class="mini-tag"
                  >
                    新客户
                  </Tag>
                  <Tag v-if="!record.active" class="mini-tag">停用</Tag>
                </div>
                <div
                  class="muted fdm-cell-line"
                  :title="
                    [record.code, record.shortName].filter(Boolean).join(' · ')
                  "
                >
                  {{ record.code }}
                  <span class="source-tag">{{
                    customerSourceLabel(record.sourceSystem).replace(
                      ' 同步',
                      '',
                    )
                  }}</span>
                  {{ record.shortName ? `· ${record.shortName}` : '' }}
                </div>
              </div>
              <div v-else-if="column.key === 'tier'" class="stack-cell">
                <template v-if="tierOf(record as Customer)">
                  <Tag
                    :color="tierOf(record as Customer)?.color"
                    class="tier-tag"
                  >
                    {{ tierOf(record as Customer)?.label }}
                  </Tag>
                  <span class="muted">{{
                    signedAgo(record.stats.daysSinceLastSigned)
                  }}</span>
                </template>
                <span v-else class="muted">—</span>
              </div>
              <div
                v-else-if="column.key === 'contractAmount'"
                class="stack-cell align-end"
              >
                <template v-if="record.stats?.contractCount">
                  <span class="amount">{{
                    moneyShort(
                      record.stats.contractAmount,
                      record.stats.currency,
                    )
                  }}</span>
                  <span class="muted">
                    {{ record.stats.contractCount }} 份合同 ·
                    {{ record.stats.firstSignedDate?.slice(0, 4) ?? '—' }} 年起
                  </span>
                  <span
                    v-if="record.stats.otherCurrencies?.length"
                    class="muted other-currency"
                    :title="otherCurrencyTitle(record as Customer)"
                  >
                    另有 {{ record.stats.otherCurrencies.length }} 种币种
                  </span>
                </template>
                <span v-else class="muted">—</span>
              </div>
              <CustomerTrendCell
                v-else-if="column.key === 'recent12'"
                :stats="record.stats"
                :months="overview?.months"
              />
              <div
                v-else-if="column.key === 'receivable'"
                class="stack-cell align-end"
              >
                <template v-if="owes(record as Customer)">
                  <span class="amount owed">{{
                    moneyShort(record.stats.receivable, record.stats.currency)
                  }}</span>
                  <span class="muted">{{
                    receivableHint(record.stats.receivableSource)
                  }}</span>
                </template>
                <span v-else class="muted">—</span>
              </div>
              <div v-else-if="column.key === 'lastSigned'" class="stack-cell">
                <template v-if="record.stats?.lastSignedDate">
                  <span>{{ record.stats.lastSignedDate }}</span>
                  <RelatedLink
                    v-if="record.stats.lastContractId"
                    class="fdm-cell-line contract-code"
                    :target="{
                      type: 'contract',
                      contractId: record.stats.lastContractId,
                    }"
                  >
                    {{ record.stats.lastContractCode || '查看合同' }}
                  </RelatedLink>
                </template>
                <span v-else class="muted">暂无合同</span>
              </div>
              <span v-else-if="column.key === 'firstSigned'">{{
                record.stats?.firstSignedDate || '—'
              }}</span>
              <div
                v-else-if="column.key === 'businessSource'"
                class="stack-cell"
              >
                <span class="fdm-cell-line" :title="record.companyName">{{
                  record.companyName || '公司未填写'
                }}</span>
                <span
                  class="muted fdm-cell-line"
                  :title="record.customerSource"
                  >{{ record.customerSource || '客户来源未填写' }}</span>
              </div>
              <div v-else-if="column.key === 'source'" class="stack-cell">
                <Tag
                  :color="record.sourceSystem === 'OKKI' ? 'blue' : 'default'"
                  class="tier-tag"
                >
                  {{ customerSourceLabel(record.sourceSystem) }}
                </Tag>
                <span v-if="record.lastSyncedAt" class="muted">
                  {{ formatDate(record.lastSyncedAt, 'YYYY-MM-DD HH:mm') }}
                </span>
              </div>
              <div v-else-if="column.key === 'contact'" class="stack-cell">
                <template v-if="record.contactName">
                  <span class="fdm-cell-line" :title="record.contactName">{{
                    record.contactName
                  }}</span>
                  <span
                    class="muted fdm-cell-line"
                    :title="contactLine(record as Customer)"
                  >
                    {{ contactLine(record as Customer) || '未填写联系方式' }}
                  </span>
                </template>
                <template v-else>
                  <span class="needs-profile">资料待补</span>
                  <span
                    class="muted fdm-cell-line"
                    :title="`待补：${customerMissingFields(record as Customer).join('、')}`"
                  >
                    {{ missingText(record as Customer) }}
                  </span>
                </template>
              </div>
              <div v-else-if="column.key === 'action'" class="action-cell">
                <Button type="link" @click="view(record as Customer)">
                  档案
                </Button>
                <Button type="link" @click="edit(record as Customer)">
                  维护
                </Button>
                <Dropdown :trigger="['click']" placement="bottomRight">
                  <Button
                    type="link"
                    aria-label="更多操作"
                    :loading="changing === record.id"
                  >
                    更多
                  </Button>
                  <template #overlay>
                    <Menu
                      @click="({ key }) => moreAction(record as Customer, key)"
                    >
                      <Menu.Item
                        v-if="record.sourceSystem === 'OKKI'"
                        key="okki"
                      >
                        OKKI 预览刷新
                      </Menu.Item>
                      <Menu.Item key="toggle" :danger="record.active">
                        {{ record.active ? '停用客户' : '启用客户' }}
                      </Menu.Item>
                    </Menu>
                  </template>
                </Dropdown>
              </div>
            </template>
          </Table>
        </div>
      </Card>
    </div>
    <CustomerDetailDrawer
      :open="detailOpen"
      :customer="selected"
      :initial-tab="detailTab"
      @close="closeDetail"
      @edit="edit"
      @okki="chooseOkki"
      @toggle="toggle"
    />
    <CustomerEditor
      :open="editorOpen"
      :customer="selected"
      @close="closeEditor"
      @saved="saved"
    />
    <OkkiCustomerPicker
      :open="okkiOpen"
      :refresh-customer="refreshCustomer"
      @close="okkiOpen = false"
      @saved="okkiSaved"
    />
  </Page>
</template>

<style scoped>
.customer-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.statistics-note {
  margin: -2px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.search-input {
  width: 280px;
}

.column-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.name-cell,
.stack-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stack-cell {
  align-items: flex-start;
}

.stack-cell.align-end {
  align-items: flex-end;
}

.name-line {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.customer-table :deep(.ant-table-cell .ant-btn-link.name-link) {
  min-width: 0;
  padding: 0;
  font-weight: 600;
}

.mini-tag {
  flex-shrink: 0;
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

.tier-tag {
  margin: 0;
}

.source-tag {
  display: inline-block;
  padding: 0 5px;
  margin: 0 2px;
  font-size: 11px;
  line-height: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 3px;
}

.amount {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.amount.owed {
  color: hsl(var(--destructive));
}

.other-currency {
  text-decoration: underline dotted;
  cursor: help;
}

.needs-profile {
  font-weight: 500;
  color: hsl(var(--warning));
}

.action-cell {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  white-space: nowrap;
}

.customer-table :deep(.ant-table-expanded-row > td) {
  background: hsl(var(--primary) / 4%);
}
</style>
