<script setup lang="ts">
import type { Directory, DocumentRow } from '#/api/fdmplatform';
import type {
  ProcurementStage,
  ProcurementWorkbenchResult,
  ProcurementWorkItem,
} from '#/api/fdmplatform/procurement-workbench';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Empty,
  Input,
  Pagination,
  Select,
  Table,
} from 'ant-design-vue';

import { getContract, getDirectory } from '#/api/fdmplatform';
import { getProcurementWorkbench } from '#/api/fdmplatform/procurement-workbench';

import { errorText } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import DocumentAction from '../../documents/DocumentAction.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';
import { contractReferenceText } from '../../documents/migration-display';
import {
  contractTarget,
  detailLocation,
  resolveDocumentRow,
  standaloneLocation,
  withoutDetailQuery,
} from '../../documents/navigation';
import RecordDetail from '../../documents/RecordDetail.vue';
import RelatedLink from '../../documents/RelatedLink.vue';
import { useRouteOwner } from '../../documents/useRouteOwner';
import ProcurementPageHeader from '../components/ProcurementPageHeader.vue';
import ProcurementStatusBadge from '../components/ProcurementStatusBadge.vue';
import QuoteComparisonDialog from '../quotes/QuoteComparisonDialog.vue';
import {
  procurementStageLabel,
  procurementStages,
  workbenchAction,
} from './model';

import '../components/procurement.css';

const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const archive = ref(false);
const stage = ref<'all' | ProcurementStage>('all');
const mine = ref(false);
const keyword = ref('');
const page = ref(1);
const pageSize = 10;
const display = ref<'board' | 'list'>('list');
const density = ref<'comfortable' | 'compact'>('compact');
const loading = ref(false);
const loadError = ref('');
const locateError = ref('');
const result = ref<ProcurementWorkbenchResult>();
const directory = ref<Directory>();
const selectedKey = ref<string>();
const actionEntry = ref<ProcurementWorkItem>();
const compareEntry = ref<ProcurementWorkItem>();
const detail = ref<{ kind: ProcurementWorkItem['kind']; row: DocumentRow }>();
const standalone = ref<{ id: string; kind: 'requests' | 'tasks' }>();
const childOpen = computed(
  () =>
    !!actionEntry.value ||
    !!compareEntry.value ||
    !!detail.value ||
    !!standalone.value,
);
const entries = computed(() => result.value?.list ?? []);
const selected = computed(() =>
  entries.value.find((entry) => entry.key === selectedKey.value),
);
const selectedIndex = computed(() =>
  entries.value.findIndex((entry) => entry.key === selectedKey.value),
);
const contractId = computed(() =>
  typeof route.query.contractId === 'string'
    ? route.query.contractId
    : undefined,
);
const boardColumns = computed(() =>
  procurementStages
    .filter(
      (item) =>
        item.key !== 'all' &&
        (stage.value === 'all' || stage.value === item.key),
    )
    .map((item) => ({
      ...item,
      entries: entries.value.filter((entry) => entry.stage === item.key),
    })),
);
let sequence = 0;
let locateSequence = 0;
let lastQuery = '';
let disposed = false;
let trigger: HTMLElement | undefined;

function ownerNames(entry: ProcurementWorkItem) {
  return entry.ownerUserIds.length > 0
    ? entry.ownerUserIds
        .map(
          (id) =>
            directory.value?.users.find((user) => user.id === id)?.nickname ??
            `用户 #${id}`,
        )
        .join('、')
    : '待分派';
}
function quantityText(entry: ProcurementWorkItem) {
  if (
    entry.quantity === undefined ||
    entry.quantity === null ||
    String(entry.quantity).trim() === '' ||
    !entry.unit?.trim()
  )
    return '数量与单位见明细';
  return `${entry.quantity} ${entry.unit}`;
}
function count(key: 'all' | ProcurementStage) {
  const value = result.value?.counts?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : '—';
}
function select(entry: ProcurementWorkItem, event?: Event) {
  if (childOpen.value) return;
  trigger =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : undefined;
  selectedKey.value = entry.key;
}
async function closePanel() {
  if (childOpen.value) return;
  selectedKey.value = undefined;
  await nextTick();
  trigger?.focus();
}
function adjacent(offset: number) {
  const entry = entries.value[selectedIndex.value + offset];
  if (entry) select(entry);
}
function showDetails(entry: ProcurementWorkItem) {
  if (childOpen.value) return;
  detail.value = { kind: entry.kind, row: entry.row };
}
function perform(entry: ProcurementWorkItem) {
  if (childOpen.value) return;
  const action = workbenchAction(entry);
  if (action.action) actionEntry.value = entry;
  else if (action.title === '比较报价') compareEntry.value = entry;
  else showDetails(entry);
}
function changeStage(value: 'all' | ProcurementStage) {
  stage.value = value;
  page.value = 1;
  void load();
}
function applyFilters() {
  page.value = 1;
  void load();
}
async function clearFilters() {
  stage.value = 'all';
  mine.value = false;
  keyword.value = '';
  page.value = 1;
  if (contractId.value) {
    const query = withoutDetailQuery(route.query);
    delete query.contractId;
    await router.replace({ query });
  } else await load();
}
async function load() {
  if (!active.value || archive.value || disposed) return;
  const run = ++sequence;
  const params = {
    stage: stage.value,
    mine: mine.value,
    keyword: keyword.value.trim() || undefined,
    contractId: contractId.value,
    pageNo: page.value,
    pageSize,
  };
  const queryKey = JSON.stringify(params);
  if (queryKey !== lastQuery) {
    result.value = undefined;
    selectedKey.value = undefined;
    lastQuery = queryKey;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const response = await getProcurementWorkbench(params);
    if (run !== sequence || disposed || !active.value || archive.value) return;
    const lastPage = Math.max(1, Math.ceil(response.total / pageSize));
    if (page.value > lastPage) {
      page.value = lastPage;
      await load();
      return;
    }
    result.value = response;
    if (
      selectedKey.value &&
      !response.list.some((entry) => entry.key === selectedKey.value)
    )
      selectedKey.value = undefined;
  } catch (error) {
    if (run === sequence && !disposed && active.value)
      loadError.value = errorText(error);
  } finally {
    if (run === sequence && !disposed) loading.value = false;
  }
}
async function updated() {
  actionEntry.value = undefined;
  await load();
}
async function closeDetail() {
  detail.value = undefined;
  standalone.value = undefined;
  if (
    route.query.documentId !== undefined ||
    route.query.standaloneId !== undefined
  )
    await router.replace({ query: withoutDetailQuery(route.query) });
}
async function locate() {
  const run = ++locateSequence;
  detail.value = undefined;
  standalone.value = undefined;
  locateError.value = '';
  if (!active.value || archive.value || disposed) return;
  try {
    const kind = route.query.queue === 'tasks' ? 'tasks' : 'requests';
    const native = standaloneLocation(route.query);
    if (native) {
      standalone.value = { kind, id: native };
      return;
    }
    const target = detailLocation(route.query);
    if (!target) return;
    const parent = await getContract(target.contractId);
    if (run === locateSequence && !disposed && active.value && !archive.value)
      detail.value = {
        kind,
        row: resolveDocumentRow(parent, kind, target.documentId),
      };
  } catch (error) {
    if (run === locateSequence && !disposed)
      locateError.value = errorText(error);
  }
}
watch(
  () => [active.value, archive.value, contractId.value],
  (current, previous) => {
    if (previous && current[2] !== previous[2]) page.value = 1;
    actionEntry.value = undefined;
    compareEntry.value = undefined;
    if (!active.value || archive.value) {
      sequence++;
      loading.value = false;
      return;
    }
    void load();
    if (!directory.value)
      void getDirectory(0)
        .then((value) => {
          if (!disposed) directory.value = value;
        })
        .catch(() => undefined);
  },
  { immediate: true },
);
watch(
  () => [
    active.value,
    archive.value,
    route.query.contractId,
    route.query.documentId,
    route.query.standaloneId,
    route.query.queue,
  ],
  () => {
    void locate();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  disposed = true;
  sequence++;
  locateSequence++;
});
</script>

<template>
  <div v-if="archive">
    <div class="workbench-archive-bar">
      <Button @click="archive = false">返回采购工作台</Button><span class="procurement-muted">全部申请与任务 · 包含历史和已完成单据</span>
    </div>
    <DocumentWorkspace kind="tasks" />
  </div>
  <Page v-else auto-content-height>
    <div class="procurement-workspace workbench" :data-density="density">
      <ProcurementPageHeader
        title="采购工作台"
        description="集中处理待办，查看上下文，在当前页面完成下一步。"
      >
        <template #actions>
          <Button :disabled="childOpen" @click="archive = true">
            全部申请与任务
</Button><Button :loading="loading" @click="load">刷新</Button>
        </template>
      </ProcurementPageHeader>
      <Alert
        v-if="loadError"
        type="error"
        :message="loadError"
        :description="
          result ? '刷新失败，已保留上次结果。' : '待办暂未读取，请重试。'
        "
        show-icon
      />
      <Alert v-if="locateError" type="error" :message="locateError" show-icon />
      <Alert
        v-if="contractId"
        type="info"
        message="当前仅查看关联订单的采购待办"
        banner
      />
      <nav class="workbench-stages" aria-label="采购阶段">
        <button
          v-for="item in procurementStages"
          :key="item.key"
          type="button"
          :class="{ selected: stage === item.key }"
          :aria-pressed="stage === item.key"
          :disabled="childOpen"
          @click="changeStage(item.key)"
        >
          <span>{{ item.label }}</span><strong class="procurement-number">{{ count(item.key) }}</strong>
        </button>
      </nav>
      <div class="procurement-toolbar">
        <div class="procurement-toolbar-actions">
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="搜索产品、订单、客户"
            class="workbench-search"
            :disabled="childOpen"
            @search="applyFilters"
          />
          <Button
            :type="mine ? 'default' : 'primary'"
            :disabled="childOpen"
            @click="
              mine = false;
              applyFilters();
            "
          >
            全部
          </Button>
          <Button
            :type="mine ? 'primary' : 'default'"
            :disabled="childOpen"
            @click="
              mine = true;
              applyFilters();
            "
          >
            我负责的
          </Button>
          <Button
            v-if="mine || keyword || stage !== 'all' || contractId"
            type="text"
            :disabled="childOpen"
            @click="clearFilters"
          >
            清除筛选
          </Button>
        </div>
        <div class="procurement-toolbar-actions">
          <Select
            v-model:value="density"
            aria-label="列表密度"
            :options="[
              { value: 'compact', label: '紧凑' },
              { value: 'comfortable', label: '舒适' },
            ]"
          />
          <Button
            :type="display === 'list' ? 'primary' : 'default'"
            @click="display = 'list'"
          >
            列表
          </Button>
          <Button
            :type="display === 'board' ? 'primary' : 'default'"
            @click="display = 'board'"
          >
            看板
          </Button>
        </div>
      </div>
      <div class="workbench-layout" :class="{ 'has-selection': selected }">
        <section class="workbench-records" aria-label="采购待办列表">
          <div class="workbench-result-label procurement-muted">
            {{ display === 'board' ? '当前页看板' : '待办列表' }} ·
            {{ result ? `共 ${result.total} 条` : '尚未读取' }}
          </div>
          <Table
            v-if="display === 'list'"
            :loading="loading"
            :data-source="entries"
            row-key="key"
            :pagination="false"
            :size="density === 'compact' ? 'small' : 'middle'"
            :scroll="{ x: 820 }"
            :row-class-name="
              (entry: ProcurementWorkItem) =>
                entry.key === selectedKey ? 'procurement-row-selected' : ''
            "
            :columns="[
              { title: '产品 / 需求', key: 'title', width: 245 },
              { title: '关联订单 / 客户', key: 'contract', width: 200 },
              { title: '阶段 / 经办人', key: 'stage', width: 160 },
              { title: '期望到货', key: 'date', width: 120 },
              { title: '下一步', key: 'action', width: 130, fixed: 'right' },
            ]"
          >
            <template #emptyText>
              <Empty
                :description="
                  loading
                    ? '正在读取待办…'
                    : loadError
                      ? '待办暂未读取'
                      : '当前条件下没有待办'
                "
              >
                <Button
                  v-if="
                    !loading &&
                    (keyword || mine || stage !== 'all' || contractId)
                  "
                  @click="clearFilters"
                >
                  清除筛选
                </Button>
              </Empty>
            </template>
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'title'" class="workbench-cell">
                <button
                  type="button"
                  class="workbench-record-link"
                  :disabled="childOpen"
                  @click="select(record as ProcurementWorkItem, $event)"
                >
                  {{ record.title }}
</button><span class="procurement-muted">{{
                  record.subtitle || quantityText(record as ProcurementWorkItem)
                }}</span>
              </div>
              <div v-else-if="column.key === 'contract'" class="workbench-cell">
                <RelatedLink :target="contractTarget(record.row.contractId)">
                  {{
                    contractReferenceText(
                      record.row.contractCode,
                      record.row.contractName,
                      record.row.contractId,
                    )
                  }}
</RelatedLink><span class="procurement-muted">{{
                  record.row.customerName || '客户未注明'
                }}</span>
              </div>
              <div v-else-if="column.key === 'stage'" class="workbench-cell">
                <ProcurementStatusBadge
                  :status="record.stage"
                  :label="procurementStageLabel(record.stage)"
                /><span class="procurement-muted">{{
                  ownerNames(record as ProcurementWorkItem)
                }}</span>
              </div>
              <span
                v-else-if="column.key === 'date'"
                class="procurement-number"
                >{{ record.dueDate || '未约定' }}</span>
              <Button
                v-else-if="column.key === 'action'"
                type="link"
                :disabled="childOpen"
                @click="perform(record as ProcurementWorkItem)"
              >
                {{ workbenchAction(record as ProcurementWorkItem).title }}
              </Button>
            </template>
          </Table>
          <div v-else class="workbench-board" :aria-busy="loading">
            <section
              v-for="column in boardColumns"
              :key="column.key"
              class="workbench-board-column"
            >
              <h3>
                {{ column.label }}
                <span class="procurement-muted">本页 {{ column.entries.length }}</span>
              </h3>
              <article
                v-for="entry in column.entries"
                :key="entry.key"
                class="workbench-board-card"
                :class="{ selected: entry.key === selectedKey }"
              >
                <button
                  type="button"
                  class="workbench-record-link"
                  :disabled="childOpen"
                  @click="select(entry, $event)"
                >
                  {{ entry.title }}
                </button>
                <p class="procurement-muted">
                  {{
                    contractReferenceText(
                      entry.row.contractCode,
                      entry.row.contractName,
                      entry.row.contractId,
                    )
                  }}
                </p>
                <p class="procurement-muted">
                  {{ quantityText(entry) }} · {{ ownerNames(entry) }}
                </p>
                <p class="procurement-muted">
                  交期 {{ entry.dueDate || '未约定' }}
                </p>
                <Button
                  size="small"
                  :disabled="childOpen"
                  @click="perform(entry)"
                >
                  {{ workbenchAction(entry).title }}
                </Button>
              </article>
              <p v-if="!column.entries.length" class="procurement-muted">
                {{ loading ? '读取中…' : '本页暂无此阶段事项' }}
              </p>
            </section>
          </div>
          <Pagination
            v-if="result && result.total > 0"
            :current="page"
            :page-size="pageSize"
            :total="result.total"
            :show-size-changer="false"
            :disabled="childOpen || loading"
            class="workbench-pagination"
            @change="
              (value) => {
                page = value;
                load();
              }
            "
          />
        </section>
        <aside
          v-if="selected"
          class="workbench-panel"
          aria-label="当前待办摘要"
        >
          <div class="workbench-panel-nav">
            <span class="procurement-muted">{{ selectedIndex + 1 }} / {{ entries.length }} · 当前页</span>
            <div>
              <Button
                size="small"
                :disabled="childOpen || selectedIndex <= 0"
                @click="adjacent(-1)"
              >
                上一条
</Button><Button
                size="small"
                :disabled="childOpen || selectedIndex >= entries.length - 1"
                @click="adjacent(1)"
              >
                下一条
</Button><Button
                size="small"
                type="text"
                :disabled="childOpen"
                @click="closePanel"
              >
                关闭
              </Button>
            </div>
          </div>
          <ProcurementStatusBadge
            :status="selected.stage"
            :label="procurementStageLabel(selected.stage)"
          />
          <h2>{{ selected.title }}</h2>
          <p v-if="selected.subtitle" class="procurement-muted">
            {{ selected.subtitle }}
          </p>
          <dl>
            <dt>关联订单</dt>
            <dd>
              <RelatedLink :target="contractTarget(selected.row.contractId)">
                {{
                  contractReferenceText(
                    selected.row.contractCode,
                    selected.row.contractName,
                    selected.row.contractId,
                  )
                }}
              </RelatedLink>
            </dd>
            <dt>客户</dt>
            <dd>{{ selected.row.customerName || '待补齐' }}</dd>
            <dt>数量</dt>
            <dd>{{ quantityText(selected) }}</dd>
            <dt>经办人</dt>
            <dd>{{ ownerNames(selected) }}</dd>
            <dt>期望到货</dt>
            <dd>{{ selected.dueDate || '未约定' }}</dd>
          </dl>
          <div class="workbench-next-step">
            <span class="procurement-muted">下一步</span>
            <p>{{ selected.hint || workbenchAction(selected).title }}</p>
            <Button
              type="primary"
              block
              :disabled="childOpen"
              @click="perform(selected)"
            >
              {{ workbenchAction(selected).title }}
</Button><Button
              v-if="
                workbenchAction(selected).action ||
                workbenchAction(selected).title === '比较报价'
              "
              type="text"
              block
              :disabled="childOpen"
              @click="showDetails(selected)"
            >
              查看完整单据
            </Button>
          </div>
          <Alert
            v-if="selected.row.blockReasons?.length"
            type="warning"
            :message="selected.row.blockReasons.join('；')"
            show-icon
          />
        </aside>
      </div>
    </div>
    <DocumentAction
      :open="!!actionEntry && active"
      :kind="actionEntry ? workbenchAction(actionEntry).kind : 'tasks'"
      :action="actionEntry ? workbenchAction(actionEntry).action : undefined"
      :contract-id="actionEntry?.row.contractId"
      :source="
        actionEntry
          ? { kind: actionEntry.kind, id: actionEntry.row.id }
          : undefined
      "
      lock-contract
      @close="actionEntry = undefined"
      @updated="updated"
    />
    <RecordDetail
      :open="!!detail && active"
      :kind="detail?.kind ?? 'tasks'"
      :row="detail?.row"
      @close="closeDetail"
      @updated="load"
    />
    <BusinessDocumentDetail
      :open="!!standalone && active"
      :id="standalone?.id"
      :kind="standalone?.kind ?? 'tasks'"
      @close="closeDetail"
      @updated="load"
    />
    <QuoteComparisonDialog
      :open="!!compareEntry && active"
      :contract-id="compareEntry?.row.contractId"
      :source-quote-id="compareEntry?.row.id"
      @close="compareEntry = undefined"
      @updated="load"
    />
  </Page>
</template>

<style scoped>
.workbench {
  container-name: procurement-workbench;
  container-type: inline-size;
}

.workbench-stages {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
  margin-top: 20px;
}

.workbench-stages button {
  display: flex;
  flex-direction: column;
  gap: 9px;
  align-items: flex-start;
  min-width: 0;
  padding: 12px;
  color: var(--procurement-secondary);
  text-align: left;
  cursor: pointer;
  background: var(--procurement-muted);
  border: 1px solid transparent;
  border-radius: 8px;
}

.workbench-stages strong {
  font-size: 22px;
  font-weight: 600;
  color: var(--procurement-text);
}

.workbench-stages .selected {
  color: var(--procurement-accent);
  background: var(--procurement-selected);
  border-color: var(--procurement-accent);
}

.workbench-stages .selected strong {
  color: inherit;
}

.workbench-stages button:focus-visible,
.workbench-record-link:focus-visible {
  outline: 2px solid var(--procurement-accent);
  outline-offset: 3px;
}

.workbench-search {
  width: 290px;
  max-width: 100%;
}

.workbench-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.workbench-layout.has-selection {
  grid-template-columns: minmax(0, 1fr) 330px;
}

.workbench-records {
  min-width: 0;
}

.workbench-result-label {
  margin-bottom: 12px;
}

.workbench-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.workbench-record-link {
  padding: 0;
  font-weight: 600;
  color: var(--procurement-text);
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.workbench-record-link:hover {
  color: var(--procurement-accent);
}

.workbench-record-link:disabled {
  cursor: default;
}

.workbench-panel {
  align-self: start;
  padding: 20px;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 8px;
}

.workbench-panel-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.workbench-panel-nav > div {
  display: flex;
  gap: 4px;
}

.workbench-panel h2 {
  margin: 12px 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.workbench-panel dl {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 14px 12px;
  margin: 24px 0;
}

.workbench-panel dt {
  font-size: 12px;
  color: var(--procurement-secondary);
}

.workbench-panel dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.workbench-next-step {
  padding: 16px;
  margin-top: 24px;
  background: var(--procurement-muted);
  border-radius: 8px;
}

.workbench-next-step p {
  margin: 8px 0 16px;
}

.workbench-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.workbench-board {
  display: flex;
  gap: 16px;
  padding-bottom: 12px;
  overflow-x: auto;
}

.workbench-board-column {
  flex: 1 0 255px;
  min-width: 0;
  max-width: 360px;
  padding: 12px;
  background: var(--procurement-muted);
  border-radius: 8px;
}

.workbench-board-column h3 {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 600;
}

.workbench-board-card {
  padding: 14px;
  margin-bottom: 10px;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 8px;
}

.workbench-board-card.selected {
  border-color: var(--procurement-accent);
}

.workbench-board-card p {
  margin: 9px 0;
}

.workbench[data-density='comfortable'] :deep(.ant-table-tbody > tr > td) {
  padding-top: 19px;
  padding-bottom: 19px;
}

.workbench-archive-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 16px 24px 0;
}

@container procurement-workbench (max-width: 1200px) {
  .workbench-layout.has-selection {
    grid-template-columns: minmax(0, 1fr);
  }

  .workbench-panel {
    grid-row: 1;
  }

  .workbench-stages {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .workbench-stages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workbench-search {
    width: 100%;
  }

  .workbench-panel {
    padding: 16px;
  }
}
</style>
