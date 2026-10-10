<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FlowStage } from './model';

import type { Access, Contract, Directory } from '#/api/fdmplatform';
import type {
  ContractBoardOverview,
  ContractBoardQuery,
  ContractBoardRow,
  ContractBoardSort,
  ContractDueBucket,
} from '#/api/fdmplatform/contract-board';

import { computed, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { downloadFileFromBlobPart, formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  message,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getAccess, getContract, getDirectory } from '#/api/fdmplatform';
import {
  getContractBoard,
  getContractBoardOverview,
} from '#/api/fdmplatform/contract-board';

import ContractDetail from '../../components/ContractDetail.vue';
import {
  productCategoryLabel,
  productCategoryOptions,
} from '../../contract-categories';
import { errorText } from '../../data';
import { personLabel, personName } from '../../directory';
import {
  entityTarget,
  referenceId,
  withoutDetailQuery,
} from '../../documents/navigation';
import RelatedLink from '../../documents/RelatedLink.vue';
import { useRouteOwner } from '../../documents/useRouteOwner';
import ContractEditor from '../../products/components/ContractEditor.vue';
import ContractRowPanel from './ContractRowPanel.vue';
import {
  amountText,
  contractCsv,
  currencyLine,
  dueText,
  entryFromQuery,
  flowCounts,
  productText,
  progressText,
  quantityText,
  receiptBar,
  rowNext,
  sortOptions,
  stepNames,
  stepTones,
  tabLabels,
  yearRange,
} from './model';

import '../../components/compact-tables.css';

defineOptions({ name: 'FdmPlatformContractBoard' });

type Tab = 'ACTIVE' | 'ENDED' | 'JINZHI';
const SCOPE_KEY = 'fdm.contracts.scope';
const route = useRoute();
const router = useRouter();
const routeActive = useRouteOwner();
const accessStore = useAccessStore();

const access = ref<Access>();
const directory = ref<Directory>();
provide('fdmPlatformDirectory', directory);
const overview = ref<ContractBoardOverview>();
const rows = ref<ContractBoardRow[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const exporting = ref(false);
const pageError = ref('');
const expandedKeys = ref<string[]>([]);

const tab = ref<Tab>('ACTIVE');
const mine = ref(false);
const stage = ref<FlowStage>();
const due = ref<ContractDueBucket>();
const keyword = ref('');
const category = ref<string>();
const owner = ref<number>();
const company = ref<number>();
const signedRange = ref<[Dayjs, Dayjs]>();
const sort = ref<ContractBoardSort>('SIGNED');
const year = ref<'ALL' | 'EARLIER' | number>(new Date().getFullYear());
const shipState = ref<'ALL' | 'OPEN'>('OPEN');
/** 门户“金智合同未发齐”和提示条的入口：近半年签订、迁移时未发齐 */
const jinzhiRecent = ref(false);
const jinzhiSince = computed(
  () =>
    overview.value?.jinzhi.since ??
    dayjs().subtract(6, 'month').startOf('month').format('YYYY-MM-DD'),
);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detailTab = ref<string>('products');
const autoNext = ref(false);
const selected = ref<Contract>();
const editorOpen = ref(false);
const copySource = ref<Contract>();
let sequence = 0;
let detailSequence = 0;

const thisYear = new Date().getFullYear();
const yearOptions = [
  { label: '全部年份', value: 'ALL' },
  { label: String(thisYear), value: thisYear },
  { label: String(thisYear - 1), value: thisYear - 1 },
  { label: '更早', value: 'EARLIER' },
];
const flows = computed(() => flowCounts(overview.value));
const filtered = computed(
  () =>
    !!(
      keyword.value.trim() ||
      category.value ||
      owner.value ||
      company.value ||
      signedRange.value ||
      stage.value ||
      due.value
    ),
);
const companyName = (id?: null | number) =>
  access.value?.companies.find((item) => item.companyId === id)?.companyName ??
  directory.value?.companies.find((item) => item.companyId === id)
    ?.companyName ??
  '';
const ownerName = (id?: null | number) => personName(directory.value, id);
const ownerDepartment = (id?: null | number) =>
  directory.value?.users.find((user) => user.id === id)?.departmentName ?? '';

const columns = computed(() =>
  tab.value === 'JINZHI'
    ? [
        { title: '金智单号', key: 'contract', width: 190 },
        { title: '客户', key: 'customer', width: 190 },
        { title: '签订', key: 'signed', width: 96 },
        { title: '产品', key: 'product', width: 230 },
        { title: '金额', key: 'jzAmount', width: 130, align: 'right' as const },
        { title: '发货', key: 'ship', width: 86 },
        { title: '采购单', key: 'orders', width: 70, align: 'right' as const },
        { title: '操作', key: 'action', width: 100, fixed: 'right' as const },
      ]
    : [
        { title: '合同', key: 'contract', width: 196 },
        { title: '客户', key: 'customer', width: 150 },
        { title: '产品', key: 'product', width: 210 },
        { title: '进度', key: 'progress', width: 186 },
        { title: '交期', key: 'due', width: 92 },
        { title: '金额 / 收款', key: 'money', width: 178 },
        { title: '负责人', key: 'owner', width: 110 },
        {
          title: tab.value === 'ACTIVE' ? '下一步' : '操作',
          key: 'action',
          width: 92,
          fixed: 'right' as const,
        },
      ],
);

function signedFilter() {
  if (tab.value === 'JINZHI')
    return {
      ...(jinzhiRecent.value
        ? { signedFrom: jinzhiSince.value }
        : yearRange(year.value)),
      shipState: shipState.value === 'OPEN' ? ('OPEN' as const) : undefined,
    };
  const range = signedRange.value;
  return range
    ? {
        signedFrom: range[0].format('YYYY-MM-DD'),
        signedTo: range[1].format('YYYY-MM-DD'),
      }
    : {};
}
function query(page = pageNo.value, size = pageSize.value): ContractBoardQuery {
  const jinzhi = tab.value === 'JINZHI';
  return {
    pageNo: page,
    pageSize: size,
    tab: tab.value,
    keyword: keyword.value.trim() || undefined,
    mine: !jinzhi && mine.value ? true : undefined,
    stage: tab.value === 'ACTIVE' ? stage.value : undefined,
    due: tab.value === 'ACTIVE' ? due.value : undefined,
    productCategory: category.value,
    ownerUserId: !jinzhi && !mine.value ? owner.value : undefined,
    companyId: jinzhi ? undefined : company.value,
    ...signedFilter(),
    sort: sort.value,
    order: sort.value === 'DUE' ? 'ASC' : 'DESC',
  };
}

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getContractBoard(query());
    if (run !== sequence) return;
    rows.value = result.list;
    total.value = result.total;
    expandedKeys.value = expandedKeys.value.filter((key) =>
      result.list.some((row) => row.id === key),
    );
  } catch (error) {
    if (run === sequence) {
      rows.value = [];
      total.value = 0;
      pageError.value = errorText(error);
    }
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function loadOverview() {
  try {
    overview.value = await getContractBoardOverview(mine.value);
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function refresh() {
  void load();
  void loadOverview();
}

function rememberScope(value: boolean) {
  try {
    localStorage.setItem(
      `${SCOPE_KEY}.${access.value?.userId ?? ''}`,
      value ? 'mine' : 'all',
    );
  } catch {
    // Remembering the choice is a convenience; the page works without storage.
  }
}
function defaultScope(userId?: number) {
  try {
    const saved = localStorage.getItem(`${SCOPE_KEY}.${userId ?? ''}`);
    if (saved) return saved === 'mine';
  } catch {
    // Fall through to the role-based default.
  }
  return accessStore.accessCodes.includes('fdmplatform:portal:trade');
}
function setScope(value: boolean) {
  if (mine.value === value) return;
  mine.value = value;
  rememberScope(value);
  owner.value = undefined;
  void load(true);
  void loadOverview();
}
function selectTab(value: Tab) {
  tab.value = value;
  stage.value = undefined;
  due.value = undefined;
  expandedKeys.value = [];
  void load(true);
}
function selectStage(value?: FlowStage) {
  stage.value = stage.value === value ? undefined : value;
  void load(true);
}
function selectDue(value?: ContractDueBucket) {
  due.value = due.value === value ? undefined : value;
  if (tab.value !== 'ACTIVE') tab.value = 'ACTIVE';
  void load(true);
}
function showUnpaid() {
  tab.value = 'ACTIVE';
  sort.value = 'UNPAID';
  void load(true);
}
function showThisMonth() {
  tab.value = 'ACTIVE';
  signedRange.value = [dayjs().startOf('month'), dayjs().endOf('month')];
  void load(true);
}
function showJinzhiOpen() {
  tab.value = 'JINZHI';
  shipState.value = 'OPEN';
  year.value = 'ALL';
  jinzhiRecent.value = true;
  keyword.value = '';
  void load(true);
}
function resetFilters() {
  keyword.value = '';
  category.value = undefined;
  owner.value = undefined;
  company.value = undefined;
  signedRange.value = undefined;
  stage.value = undefined;
  due.value = undefined;
  void load(true);
}
function tableChange(pagination: { current?: number; pageSize?: number }) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  void load();
}
function expand(expanded: boolean, row: ContractBoardRow) {
  expandedKeys.value = expanded
    ? [...expandedKeys.value, row.id]
    : expandedKeys.value.filter((key) => key !== row.id);
}

async function openContract(
  id: string,
  options: { next?: boolean; tab?: string } = {},
) {
  detailTab.value = options.tab ?? 'products';
  autoNext.value = !!options.next;
  if (referenceId(route.query.contractId) === id) {
    await showContract(id);
    return;
  }
  await router.push({ query: { ...route.query, contractId: id } });
}
async function showContract(id: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  selected.value = undefined;
  const run = ++detailSequence;
  try {
    const contract = await getContract(id);
    if (run === detailSequence) selected.value = contract;
  } catch (error) {
    if (run === detailSequence) message.error(errorText(error));
  } finally {
    if (run === detailSequence) detailLoading.value = false;
  }
}
async function refreshDetail() {
  if (selected.value) await showContract(selected.value.id);
}
function onContractUpdated(contract: Contract) {
  selected.value = contract;
  refresh();
}
function closeDetail() {
  detailSequence++;
  detailOpen.value = false;
  autoNext.value = false;
  if (routeActive.value)
    void router.replace({
      query: withoutDetailQuery(route.query, 'contractId'),
    });
}
function locateFromRoute() {
  if (!routeActive.value) return;
  const id = referenceId(route.query.contractId);
  if (!id) {
    detailSequence++;
    detailOpen.value = false;
    return;
  }
  if (selected.value?.id === id && detailOpen.value) return;
  // 财务页面跳过来时带 ?tab=finance，直接打开对应页签
  if (typeof route.query.tab === 'string') detailTab.value = route.query.tab;
  void showContract(id);
}
function openEditor(source?: Contract) {
  copySource.value = source;
  editorOpen.value = true;
}
async function onNewContractSaved(contract: Contract) {
  editorOpen.value = false;
  copySource.value = undefined;
  refresh();
  await openContract(contract.id);
}

function applyEntry() {
  const entry = entryFromQuery(route.query);
  tab.value = entry.tab;
  if (route.query.scope === 'pending') {
    jinzhiRecent.value = true;
    shipState.value = 'OPEN';
    year.value = 'ALL';
  }
  stage.value = entry.stage;
  due.value = entry.due;
  if (entry.mine !== undefined) mine.value = entry.mine;
}
function consumeCreate() {
  if (route.query.create !== 'contract') return;
  openEditor();
  const next = { ...route.query };
  Reflect.deleteProperty(next, 'create');
  void router.replace({ query: next });
}
async function exportCsv() {
  exporting.value = true;
  try {
    const all: ContractBoardRow[] = [];
    for (let page = 1; page <= 50; page++) {
      const result = await getContractBoard(query(page, 100));
      all.push(...result.list);
      if (all.length >= result.total || result.list.length === 0) break;
    }
    downloadFileFromBlobPart({
      fileName: `合同订单-${tabLabels[tab.value]}-${formatDate(new Date(), 'YYYYMMDD-HHmm')}.csv`,
      source: new Blob(
        [contractCsv(all, (id) => personLabel(directory.value, id))],
        {
          type: 'text/csv;charset=utf-8',
        },
      ),
    });
    message.success(`已导出 ${all.length} 份合同`);
  } catch (error) {
    message.error(errorText(error));
  } finally {
    exporting.value = false;
  }
}

watch(
  () => [route.query.contractId, routeActive.value],
  () => locateFromRoute(),
);
watch(
  () => [
    route.query.mine,
    route.query.status,
    route.query.scope,
    route.query.stage,
    route.query.due,
    route.query.create,
  ],
  (current, previous) => {
    if (
      !routeActive.value ||
      current.every((value, index) => value === previous?.[index])
    )
      return;
    if (current[5] === 'contract') consumeCreate();
    if (current.slice(0, 5).some((value) => value !== undefined)) {
      applyEntry();
      void load(true);
      void loadOverview();
    }
  },
);
onMounted(async () => {
  try {
    const [accessResult, directoryResult] = await Promise.allSettled([
      getAccess(),
      getDirectory(0),
    ]);
    if (accessResult.status === 'fulfilled') access.value = accessResult.value;
    if (directoryResult.status === 'fulfilled')
      directory.value = directoryResult.value;
  } catch {
    // Labels fall back to ids; the list itself still loads.
  }
  mine.value = defaultScope(access.value?.userId);
  applyEntry();
  refresh();
  locateFromRoute();
  consumeCreate();
});
</script>

<template>
  <Page auto-content-height>
    <div class="board">
      <header class="head">
        <div>
          <h1>合同订单</h1>
          <p>
            外贸部门 · 新建合同、跟进到回款；金智迁入的合同在「金智历史合同」
          </p>
        </div>
        <div class="head-actions">
          <div class="seg" role="group" aria-label="查看范围">
            <button
              type="button"
              :class="{ on: mine }"
              :aria-pressed="mine"
              @click="setScope(true)"
            >
              我负责的
            </button>
            <button
              type="button"
              :class="{ on: !mine }"
              :aria-pressed="!mine"
              @click="setScope(false)"
            >
              全部
            </button>
          </div>
          <Button :loading="exporting" @click="exportCsv">导出</Button>
          <Button type="primary" @click="openEditor()">＋ 新建合同</Button>
        </div>
      </header>

      <Alert v-if="pageError" :message="pageError" type="error" show-icon />

      <section class="kpis" aria-label="合同概况">
        <button type="button" class="kpi" @click="selectTab('ACTIVE')">
          <span class="k">进行中合同</span>
          <b>{{ overview?.activeCount ?? '—' }}<small>份</small></b>
          <span class="d">{{ currencyLine(overview?.activeAmounts) }}</span>
        </button>
        <button type="button" class="kpi" @click="showUnpaid">
          <span class="k">未收款 · {{ overview?.unpaidContracts ?? 0 }} 份</span>
          <b class="money-line">{{
            currencyLine(
              overview?.unpaid,
              overview?.activeCount ? '已全部收齐' : '—',
            )
          }}</b>
          <span class="d">已登记待财务确认 {{ currencyLine(overview?.pending, '0') }}</span>
        </button>
        <button
          type="button"
          class="kpi"
          :class="{ alert: (overview?.due.OVERDUE ?? 0) > 0 }"
          @click="selectDue('OVERDUE')"
        >
          <span class="k">交期已过未发货</span>
          <b>{{ overview?.due.OVERDUE ?? '—' }}<small>份</small></b>
          <span class="d">{{ overview?.soonDays ?? 7 }} 天内到期
            {{ overview?.due.SOON ?? 0 }} 份 · 未约定交期
            {{ overview?.due.NONE ?? 0 }} 份</span>
        </button>
        <button type="button" class="kpi" @click="showThisMonth">
          <span class="k">本月签约</span>
          <b>{{ overview?.signed.thisMonth.count ?? '—' }}<small>份</small></b>
          <span class="d">上月 {{ overview?.signed.lastMonth.count ?? 0 }} 份 ·
            {{ currencyLine(overview?.signed.lastMonth.amounts, '0') }}</span>
        </button>
      </section>

      <section class="card">
        <div class="tabs" role="tablist" aria-label="合同范围">
          <button
            v-for="key in ['ACTIVE', 'JINZHI', 'ENDED'] as Tab[]"
            :key="key"
            type="button"
            role="tab"
            :aria-selected="tab === key"
            :class="{ on: tab === key }"
            @click="selectTab(key)"
          >
            {{ tabLabels[key]
            }}<em>{{ overview?.tabs[key]?.toLocaleString('en-US') ?? '' }}</em>
          </button>
        </div>

        <template v-if="tab === 'ACTIVE'">
          <div class="flow" role="group" aria-label="按阶段筛选">
            <button
              type="button"
              :class="{ on: !stage }"
              @click="selectStage(undefined)"
            >
              <span>全部</span><b>{{ overview?.tabs.ACTIVE ?? 0 }}</b>
            </button>
            <button
              v-for="entry in flows"
              :key="entry.key"
              type="button"
              :class="{ on: stage === entry.key, zero: !entry.count }"
              @click="selectStage(entry.key)"
            >
              <span>{{ entry.label }}</span><b>{{ entry.count }}</b>
            </button>
          </div>
        </template>
        <div v-else-if="tab === 'JINZHI' && overview" class="notice">
          <span><b>迁移截至 {{ overview.jinzhi.latestSigned ?? '—' }}。</b>{{ overview.jinzhi.since }} 以后签订、迁移时还没发齐的有
            {{ overview.jinzhi.open }} 份（未发货 {{ overview.jinzhi.none }} ·
            部分发货
            {{
              overview.jinzhi.partial
            }}）。之后的采购和发货要在新系统继续，请先「补齐资料」。金智合同没有负责人，这里总按全部显示。</span>
          <Button size="small" @click="showJinzhiOpen">只看未发齐</Button>
        </div>

        <div class="filters">
          <Input.Search
            v-model:value="keyword"
            :placeholder="
              tab === 'JINZHI'
                ? '金智单号 / 客户 / 产品'
                : '合同号 / 客户 / 产品 / 金智单号'
            "
            allow-clear
            class="search"
            @search="load(true)"
          />
          <template v-if="tab === 'JINZHI'">
            <Select
              v-model:value="year"
              :options="yearOptions"
              style="width: 110px"
              @change="
                jinzhiRecent = false;
                load(true);
              "
            />
            <Tag
              v-if="jinzhiRecent"
              closable
              color="orange"
              @close="
                jinzhiRecent = false;
                load(true);
              "
            >
              {{ jinzhiSince }} 以后签订
            </Tag>
            <div class="seg small" role="group" aria-label="发货情况">
              <button
                type="button"
                :class="{ on: shipState === 'OPEN' }"
                @click="
                  shipState = 'OPEN';
                  load(true);
                "
              >
                未发齐
              </button>
              <button
                type="button"
                :class="{ on: shipState === 'ALL' }"
                @click="
                  shipState = 'ALL';
                  load(true);
                "
              >
                全部
              </button>
            </div>
          </template>
          <template v-else>
            <Select
              v-model:value="category"
              :options="[
                ...productCategoryOptions,
                { value: 'NONE', label: '未分类' },
              ]"
              placeholder="产品分类"
              allow-clear
              style="width: 120px"
              @change="load(true)"
            />
            <Select
              v-if="!mine"
              v-model:value="owner"
              :options="
                directory?.users.map((user) => ({
                  value: user.id,
                  label: personLabel(directory, user.id),
                }))
              "
              placeholder="负责人"
              show-search
              option-filter-prop="label"
              allow-clear
              style="width: 130px"
              @change="load(true)"
            />
            <DatePicker.RangePicker
              v-model:value="signedRange"
              :placeholder="['签订从', '到']"
              style="width: 210px"
              @change="load(true)"
            />
            <Select
              v-model:value="company"
              :options="
                access?.companies.map((item) => ({
                  value: item.companyId,
                  label: item.companyName ?? `公司 ${item.companyId}`,
                }))
              "
              placeholder="订单所属公司"
              allow-clear
              style="width: 150px"
              @change="load(true)"
            />
          </template>
          <Button
            v-if="filtered && tab !== 'JINZHI'"
            type="link"
            @click="resetFilters"
          >
            清除筛选
          </Button>
          <span class="grow"></span>
          <span v-if="tab === 'ACTIVE' && overview" class="chips">
            <button
              type="button"
              class="chip bad"
              :class="{ on: due === 'OVERDUE' }"
              @click="selectDue('OVERDUE')"
            >
              交期已过 {{ overview.due.OVERDUE }}
            </button>
            <button
              type="button"
              class="chip"
              :class="{ on: due === 'SOON' }"
              @click="selectDue('SOON')"
            >
              {{ overview.soonDays }} 天内 {{ overview.due.SOON }}
            </button>
            <button
              type="button"
              class="chip"
              :class="{ on: due === 'NONE' }"
              @click="selectDue('NONE')"
            >
              未约定 {{ overview.due.NONE }}
            </button>
          </span>
          <Select
            v-model:value="sort"
            :options="
              sortOptions.map((option) => ({
                ...option,
                label: `排序：${option.label}`,
              }))
            "
            style="width: 140px"
            @change="load(true)"
          />
        </div>

        <Table
          class="fdm-business-table board-table"
          size="small"
          table-layout="fixed"
          :columns="columns"
          :data-source="rows"
          row-key="id"
          :loading="loading"
          :scroll="{ x: tab === 'JINZHI' ? 1090 : 1230 }"
          :expanded-row-keys="expandedKeys"
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (count: number) =>
              `共 ${count.toLocaleString('en-US')} 份合同`,
          }"
          @expand="expand"
          @change="tableChange"
        >
          <template #emptyText>
            <Empty
              :description="
                loading
                  ? '正在读取合同'
                  : mine && tab === 'ACTIVE'
                    ? '没有你负责的进行中合同，切到「全部」看看'
                    : '当前筛选条件下没有合同'
              "
            >
              <Button
                v-if="tab === 'ACTIVE' && !filtered"
                type="primary"
                @click="openEditor()"
              >
                新建合同
              </Button>
            </Empty>
          </template>
          <template #expandedRowRender="{ record }">
            <ContractRowPanel
              :row="record as ContractBoardRow"
              :directory="directory"
              @open="(tabKey) => openContract(record.id, { tab: tabKey })"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'contract'" class="cell">
              <button
                type="button"
                class="code"
                @click="openContract(record.id)"
              >
                {{ record.code || '订单号待补齐' }}
              </button>
              <span class="sub" :title="record.name">{{ record.name || '—'
                }}{{
                  tab !== 'JINZHI' && record.signedDate
                    ? ` · ${String(record.signedDate).slice(5)}`
                    : ''
                }}</span>
              <span
                v-if="
                  tab !== 'JINZHI' &&
                  (record.sample || record.status === 'DRAFT')
                "
                class="tags"
              >
                <Tag v-if="record.status === 'DRAFT'" class="mini">草稿</Tag>
                <Tag v-if="record.sample" class="mini">样品</Tag>
              </span>
            </div>
            <div v-else-if="column.key === 'customer'" class="cell">
              <RelatedLink
                :target="entityTarget('customer', record.customerId)"
              >
                <span class="strong" :title="record.customerName">{{
                  record.customerName || '未注明'
                }}</span>
              </RelatedLink>
              <span
                class="sub"
                :title="
                  companyName(record.companyId) || record.sourceCompanyName
                "
                >{{
                  companyName(record.companyId) ||
                  record.sourceCompanyName ||
                  '订单公司待补齐'
                }}</span>
            </div>
            <div v-else-if="column.key === 'product'" class="cell">
              <span
                class="strong"
                :title="productText(record as ContractBoardRow)"
                >{{ productText(record as ContractBoardRow) }}</span>
              <span class="sub">{{ quantityText(record as ContractBoardRow)
                }}<template v-if="tab !== 'JINZHI'">
                  ·
                  <span :class="{ bad: !record.productCategory }">{{
                    productCategoryLabel(record.productCategory)
                  }}</span></template></span>
            </div>
            <div v-else-if="column.key === 'progress'" class="cell">
              <span class="steps" :title="stepNames.join(' → ')">
                <i
                  v-for="(tone, index) in stepTones(record as ContractBoardRow)"
                  :key="index"
                  :class="tone"
                  :title="stepNames[index]"
                ></i>
              </span>
              <span class="sub">{{
                progressText(record as ContractBoardRow, (id) =>
                  personName(directory, id),
                )
              }}</span>
            </div>
            <div v-else-if="column.key === 'due'" class="cell">
              <span :class="dueText(record as ContractBoardRow).tone">{{
                dueText(record as ContractBoardRow).main
              }}</span>
              <span
                v-if="dueText(record as ContractBoardRow).sub"
                class="sub"
                :class="dueText(record as ContractBoardRow).tone"
                >{{ dueText(record as ContractBoardRow).sub }}</span>
            </div>
            <div v-else-if="column.key === 'money'" class="cell">
              <span class="strong num">{{
                amountText(record.amount, record.currency)
              }}</span>
              <span class="bar" aria-hidden="true">
                <i
                  class="paid"
                  :style="{
                    width: `${receiptBar(record as ContractBoardRow).paid}%`,
                  }"
                ></i><i
                  class="pend"
                  :style="{
                    width: `${receiptBar(record as ContractBoardRow).pending}%`,
                  }"
                ></i>
              </span>
              <span class="sub">{{
                receiptBar(record as ContractBoardRow).text
              }}</span>
            </div>
            <div v-else-if="column.key === 'owner'" class="cell">
              <span class="strong normal">{{
                ownerName(record.ownerUserId)
              }}</span>
              <span class="sub">{{ ownerDepartment(record.ownerUserId) }}</span>
            </div>
            <span v-else-if="column.key === 'signed'" class="num">{{
              record.signedDate ?? '—'
            }}</span>
            <div v-else-if="column.key === 'jzAmount'" class="cell end">
              <span class="strong num">{{
                amountText(record.amount, record.currency)
              }}</span>
              <span v-if="!record.currency" class="sub">币种未注明</span>
            </div>
            <Tag
              v-else-if="column.key === 'ship'"
              :color="
                record.shipState === 'ALL'
                  ? 'green'
                  : record.shipState === 'PARTIAL'
                    ? 'orange'
                    : record.shipState === 'NONE'
                      ? 'red'
                      : undefined
              "
              class="mini"
            >
              {{
                {
                  ALL: '已发齐',
                  PARTIAL: '部分发货',
                  NONE: '未发货',
                  UNKNOWN: '待核对',
                }[record.shipState as string]
              }}
            </Tag>
            <span v-else-if="column.key === 'orders'" class="num">{{
              record.counts.orders || '—'
            }}</span>
            <template v-else-if="column.key === 'action'">
              <Button
                v-if="tab === 'JINZHI'"
                size="small"
                @click="openContract(record.id, { next: true })"
              >
                补齐资料
              </Button>
              <Button
                v-else-if="
                  tab === 'ACTIVE' &&
                  rowNext(record as ContractBoardRow).primary
                "
                size="small"
                type="primary"
                @click="openContract(record.id, { next: true })"
              >
                {{ rowNext(record as ContractBoardRow).label }}
              </Button>
              <Button
                v-else
                type="link"
                size="small"
                @click="openContract(record.id)"
              >
                查看
              </Button>
            </template>
          </template>
        </Table>
        <p class="legend">
          进度六格依次是：合同 · 采购 · 到货 · 发货 · 回款 · 开票。
          <span><i class="done"></i>已完成</span><span><i class="active"></i>进行中</span><span><i class="late"></i>进行中但交期已过</span><span><i class="unknown"></i>数据待核对</span><span><i class="pend"></i>回款已登记、待财务确认</span>
        </p>
      </section>
    </div>

    <ContractEditor
      default-business-type="FOREIGN"
      :open="editorOpen"
      :directory="directory"
      :master="[]"
      :copy-from="copySource"
      @close="
        editorOpen = false;
        copySource = undefined;
      "
      @saved="onNewContractSaved"
    />
    <ContractDetail
      :contract="selected"
      workspace="trade-contracts"
      :initial-tab="detailTab as any"
      :directory="directory"
      :loading="detailLoading"
      :master="[]"
      :open="detailOpen && routeActive"
      :pools="[]"
      :auto-next="autoNext"
      @auto-next-done="autoNext = false"
      @close="closeDetail"
      @copy="(contract) => openEditor(contract)"
      @refresh="refreshDetail"
      @updated="onContractUpdated"
    />
  </Page>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 24px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: center;
  justify-content: space-between;
}

.head h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.head p {
  margin: 2px 0 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.seg {
  display: inline-flex;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.seg button {
  padding: 4px 14px;
  font: inherit;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.seg.small button {
  padding: 3px 10px;
}

.seg button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  padding: 12px 16px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.kpi:hover,
.kpi:focus-visible {
  outline: none;
  border-color: hsl(var(--primary) / 50%);
}

.kpi .k,
.kpi .d {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.kpi b {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.kpi b.money-line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 18px;
  white-space: nowrap;
}

.kpi b small {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.kpi.alert b {
  color: hsl(var(--destructive));
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  border-bottom: 1px solid hsl(var(--border));
}

.tabs button {
  padding: 11px 0 9px;
  font: inherit;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.tabs button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.tabs em {
  margin-left: 5px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.flow {
  display: flex;
}

.flow button {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  padding: 7px 12px 7px 22px;
  margin-right: -6px;
  font: inherit;
  color: hsl(var(--muted-foreground));
  text-align: left;
  cursor: pointer;
  background: hsl(var(--muted));
  border: 0;
  clip-path: polygon(
    0 0,
    calc(100% - 10px) 0,
    100% 50%,
    calc(100% - 10px) 100%,
    0 100%,
    10px 50%
  );
}

.flow button:first-child {
  padding-left: 14px;
  border-radius: 8px 0 0 8px;
  clip-path: polygon(
    0 0,
    calc(100% - 10px) 0,
    100% 50%,
    calc(100% - 10px) 100%,
    0 100%
  );
}

.flow button:last-child {
  margin-right: 0;
}

.flow span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.flow b {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  color: hsl(var(--foreground));
}

.flow .zero b {
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.flow button.on {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 12%);
}

.flow button.on b {
  color: hsl(var(--primary));
}

.notice {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  font-size: 13px;
  background: hsl(var(--warning) / 12%);
  border-radius: 10px;
}

.notice b {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.search {
  width: 230px;
  max-width: 100%;
}

.grow {
  flex: 1;
}

.chips {
  display: inline-flex;
  gap: 6px;
}

.chip {
  padding: 2px 10px;
  font: inherit;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: hsl(var(--muted));
  border: 1px solid transparent;
  border-radius: 999px;
}

.chip.bad {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 10%);
}

.chip.on {
  border-color: currentcolor;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
}

.cell.end {
  align-items: flex-end;
}

.cell > * {
  max-width: 100%;
}

.code {
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font: inherit;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--primary));
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.code:focus-visible,
.tabs button:focus-visible,
.flow button:focus-visible,
.chip:focus-visible,
.seg button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  white-space: nowrap;
}

.strong.normal {
  font-weight: 500;
}

.sub {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.bad,
.late {
  color: hsl(var(--destructive));
}

.sub.late {
  font-weight: 600;
}

.soon {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.muted {
  color: hsl(var(--muted-foreground));
}

.num {
  font-variant-numeric: tabular-nums;
}

.tags {
  display: flex;
  gap: 4px;
}

.mini {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

.steps {
  display: flex;
  gap: 3px;
  padding: 3px 0;
}

.steps i,
.legend i {
  display: block;
  width: 20px;
  height: 5px;
  background: hsl(var(--border));
  border-radius: 3px;
}

.steps i.done,
.legend i.done {
  background: hsl(var(--success));
}

.steps i.active,
.legend i.active {
  background: hsl(var(--primary));
}

.steps i.late,
.legend i.late {
  background: hsl(var(--destructive));
}

.steps i.unknown,
.legend i.unknown {
  background: repeating-linear-gradient(
    90deg,
    hsl(var(--muted-foreground) / 50%) 0 3px,
    transparent 3px 5px
  );
}

.bar {
  position: relative;
  display: flex;
  width: 100%;
  height: 5px;
  margin: 2px 0 1px;
  overflow: hidden;
  background: hsl(var(--border));
  border-radius: 3px;
}

.bar i {
  display: block;
  height: 100%;
}

.bar .paid {
  background: hsl(var(--success));
}

.bar .pend,
.legend i.pend {
  background: repeating-linear-gradient(
    135deg,
    hsl(var(--warning)) 0 3px,
    hsl(var(--warning) / 40%) 3px 6px
  );
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  align-items: center;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.legend span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}

.legend i {
  width: 14px;
}

.board-table :deep(.ant-table-expanded-row > td) {
  background: hsl(var(--muted) / 40%);
}

@media (max-width: 1100px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow {
    flex-wrap: wrap;
    gap: 6px;
  }

  .flow button,
  .flow button:first-child {
    flex: 1 1 30%;
    padding-left: 12px;
    margin-right: 0;
    border-radius: 8px;
    clip-path: none;
  }
}

@media (max-width: 600px) {
  .kpis {
    grid-template-columns: minmax(0, 1fr);
  }

  .notice {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
