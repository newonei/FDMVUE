<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { IconifyIcon } from '@vben/icons';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Empty,
  message,
  Modal,
  Radio,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import {
  deleteEcProfit,
  getEcProfitMonthlyView,
} from '#/api/fdmcaiwu/ec-profit';
import {
  ALL_METRICS,
  coverageText,
  expansionKeys,
  filterTree,
  financialColumns,
  findGroup,
  metricLabel,
  nodeMetric,
  nodeState,
  selectedTotal,
  tableTree,
} from '../tree-model';
import { formatMetric } from '../model';
import ReportForm from './report-form.vue';
import ScopeDialog from './scope-dialog.vue';

const props = defineProps<{
  month: string;
  focusGroupKey?: string;
  configRevision: number;
}>();
const emit = defineEmits<{
  'update:month': [month: string];
  configured: [];
  'clear-focus': [];
}>();
const view = ref<Api.MonthlyView>();
const loading = ref(false);
const error = ref('');
const departmentKey = ref<string>();
const groupKey = ref<string>();
const fullColumns = ref(false);
const received = ref(false);
const expandedKeys = ref<(number | string)[]>([]);
const formOpen = ref(false);
const editing = ref<Api.Report>();
const scopeOpen = ref(false);
const itemDetail = ref<Api.GroupNode>();
const detailOpen = ref(false);
let sequence = 0;

const departments = computed(() => view.value?.departments ?? []);
const departmentOptions = computed(() =>
  departments.value.map((node) => ({ label: node.name, value: node.key })),
);
const groupOptions = computed(() =>
  departments.value
    .filter((node) => !departmentKey.value || node.key === departmentKey.value)
    .flatMap((node) =>
      node.children.map((group) => ({
        label: `${node.name} / ${group.name}`,
        value: group.key,
      })),
    ),
);
const tree = computed(() =>
  filterTree(departments.value, departmentKey.value, groupKey.value),
);
const tableRows = computed(() => tableTree(tree.value));
const summaryNode = computed(() =>
  view.value
    ? selectedTotal(view.value, departmentKey.value, groupKey.value)
    : undefined,
);
const columns = computed<TableColumnsType<Api.GroupNode>>(() => [
  { title: '部门 / 小组 / 店铺', key: 'name', fixed: 'left', width: 285 },
  { title: '数据状态', key: 'state', width: 175 },
  ...(fullColumns.value
    ? [
        { title: '平台', key: 'platform', width: 110 },
        { title: '公司主体', key: 'company', width: 180 },
      ]
    : []),
  ...financialColumns(fullColumns.value),
]);
const editable = computed(
  () =>
    !!view.value?.report &&
    view.value.report.status === 'WAITING_IMPORT' &&
    view.value.total.importedShopCount === 0 &&
    view.value.total.adjustmentCount ===
      view.value.total.pendingAdjustmentCount,
);
const cardsUseReceived = computed(
  () => view.value?.total.dataState !== 'COMPLETE',
);
const cards = computed(() =>
  ['salesAmount', 'grossProfit', 'grossMargin'].map((key) => ({
    key,
    label: metricLabel(key),
    value: view.value
      ? nodeMetric(view.value.total, key, cardsUseReceived.value)
      : '—',
  })),
);
const missingMetrics = computed(() =>
  Object.entries(view.value?.total.missingMetricCounts ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${metricLabel(key)}：${count} 项`)
    .join('；'),
);

async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  view.value = undefined;
  try {
    const result = await getEcProfitMonthlyView(props.month);
    if (current !== sequence) return;
    view.value = result;
    expandedKeys.value = expansionKeys(result.departments, 'shop');
    departmentKey.value = undefined;
    groupKey.value = undefined;
    if (props.focusGroupKey) {
      const found = findGroup(result.departments, props.focusGroupKey);
      if (found) {
        departmentKey.value = found.department.key;
        groupKey.value = found.group.key;
      } else message.info('该月未找到此小组，已展示完整月报');
      emit('clear-focus');
    }
  } catch {
    if (current === sequence) error.value = '月度毛利加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [props.month, props.configRevision],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => sequence++);
function changeMonth(value: string) {
  if (value) emit('update:month', value);
}
function create() {
  editing.value = undefined;
  formOpen.value = true;
}
function edit() {
  if (view.value?.report && editable.value) {
    editing.value = view.value.report;
    formOpen.value = true;
  }
}
async function saved(month: string) {
  if (month !== props.month) emit('update:month', month);
  else await load();
}
function remove() {
  const report = view.value?.report;
  if (!report || !editable.value) return;
  Modal.confirm({
    title: `删除 ${report.month} 月报？`,
    content: '仅删除尚无导入数据的月报及店铺占位明细，财务归属配置不受影响。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteEcProfit(report.id, report.version);
      message.success('月报已删除');
      await load();
    },
  });
}
function openItem(node: Api.GroupNode) {
  itemDetail.value = node;
  detailOpen.value = true;
}
function metricValue(node: Api.GroupNode, key: string) {
  if (groupKey.value && node.nodeType === 'DEPARTMENT') return '—';
  return nodeMetric(node, key, received.value);
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <DatePicker
          :value="month"
          picker="month"
          value-format="YYYY-MM"
          format="YYYY 年 MM 月"
          :allow-clear="false"
          aria-label="毛利月份"
          @change="(_value, dateString) => changeMonth(dateString)"
        />
        <Tag
          v-if="view?.report"
          :color="view.report.status === 'READY' ? 'success' : 'orange'"
          >{{
            view.report.status === 'READY' ? '月报已就绪' : '月报待导入'
          }}</Tag
        >
        <span v-if="view?.report" class="text-xs text-muted-foreground">{{
          view.report.reportNo
        }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button :loading="loading" @click="load"
          ><template #icon><IconifyIcon icon="lucide:refresh-cw" /></template
          >刷新</Button
        >
        <template v-if="editable">
          <Button
            v-access:code="['fdmcaiwu:ec-profit:update']"
            @click="scopeOpen = true"
            >同步本月范围</Button
          >
          <Button v-access:code="['fdmcaiwu:ec-profit:update']" @click="edit"
            >编辑备注</Button
          >
          <Button
            v-access:code="['fdmcaiwu:ec-profit:delete']"
            danger
            @click="remove"
            >删除月报</Button
          >
        </template>
        <Button
          v-access:code="['fdmcaiwu:ec-profit:create']"
          type="primary"
          @click="create"
          ><template #icon><IconifyIcon icon="lucide:plus" /></template
          >新建月报</Button
        >
      </div>
    </div>
    <Alert v-if="error" :message="error" type="error" show-icon />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="card in cards"
        :key="card.key"
        class="rounded-xl border border-border bg-card p-5"
      >
        <div class="text-sm text-muted-foreground">{{ card.label }}</div>
        <div class="my-3 text-3xl font-semibold tabular-nums">
          {{ card.value }}
        </div>
        <div
          class="text-xs"
          :class="
            cardsUseReceived && view?.report
              ? 'text-amber-600'
              : 'text-muted-foreground'
          "
        >
          {{
            !view?.report
              ? '本月尚未建单'
              : cardsUseReceived
                ? '已导入小计 · 全月尚未完整'
                : '全月完整合计'
          }}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-5">
        <div class="text-sm text-muted-foreground">应报店铺完成进度</div>
        <div class="my-3 text-3xl font-semibold tabular-nums">
          {{ view?.total.importedShopCount ?? '—'
          }}<span class="ml-2 text-sm text-muted-foreground"
            >/ {{ view?.total.expectedShopCount ?? '—' }} 家</span
          >
        </div>
        <div class="text-xs text-muted-foreground">
          {{ view?.total.unassignedCount ?? 0 }} 项未分组 ·
          {{ view?.total.adjustmentCount ?? 0 }} 项费用调整
        </div>
      </div>
    </div>
    <Alert
      v-if="
        view?.report &&
        (view.total.dataState !== 'COMPLETE' || view.total.unassignedCount > 0)
      "
      type="warning"
      show-icon
      message="本月数据尚待核对，未导入店铺与未归属费用均保留在下表。"
    >
      <template #description
        ><span
          >{{ coverageText(view.total) }}；{{
            view.total.pendingAdjustmentCount
          }}
          项费用待导入。{{
            missingMetrics ? `缺失指标：${missingMetrics}` : ''
          }}</span
        ></template
      >
    </Alert>
    <div class="rounded-xl border border-border bg-card p-5">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <Select
            v-model:value="departmentKey"
            :options="departmentOptions"
            placeholder="全部部门"
            allow-clear
            class="w-40"
            aria-label="筛选财务部门"
            @change="groupKey = undefined"
          />
          <Select
            v-model:value="groupKey"
            :options="groupOptions"
            placeholder="全部小组"
            allow-clear
            class="w-56"
            aria-label="筛选财务小组"
          />
          <Button
            size="small"
            @click="expandedKeys = expansionKeys(tree, 'shop')"
            >展开到店铺</Button
          >
          <Button
            size="small"
            @click="expandedKeys = expansionKeys(tree, 'department')"
            >收起到小组</Button
          >
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Checkbox v-model:checked="received">显示已导入小计</Checkbox>
          <Radio.Group
            v-model:value="fullColumns"
            size="small"
            button-style="solid"
            ><Radio.Button :value="false">核心列</Radio.Button
            ><Radio.Button :value="true">完整列</Radio.Button></Radio.Group
          >
        </div>
      </div>
      <div class="mb-3 text-xs text-muted-foreground">
        人民币 / 元 ·
        {{
          received
            ? '当前为已导入小计，不代表全部应报数据'
            : '当前为完整合计，缺失值保留为「—」'
        }}{{ groupKey ? ' · 已筛选小组，部门金额不展示' : '' }}
      </div>
      <Table
        :columns="columns"
        :data-source="tableRows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: fullColumns ? 3470 : 1825, y: 620 }"
        :expanded-row-keys="expandedKeys"
        :indent-size="18"
        row-key="key"
        size="small"
        bordered
        @update:expanded-row-keys="expandedKeys = [...$event]"
      >
        <template #bodyCell="{ column, record }">
          <div
            v-if="column.key === 'name'"
            class="inline-flex max-w-full items-center gap-2"
          >
            <Button
              v-if="record.item"
              size="small"
              type="link"
              class="!h-auto !whitespace-normal !px-0 !text-left"
              @click="openItem(record as Api.GroupNode)"
              >{{ record.name }}</Button
            >
            <strong v-else>{{ record.name }}</strong>
            <Tag v-if="record.nodeType === 'ADJUSTMENT'">费用</Tag>
            <Tooltip
              v-if="record.legacyGroup"
              title="依据当月历史名称展示，不使用当前归属重分"
              ><Tag>历史</Tag></Tooltip
            >
          </div>
          <div v-else-if="column.key === 'state'">
            <span
              v-if="groupKey && record.nodeType === 'DEPARTMENT'"
              class="text-xs text-muted-foreground"
              >已筛选下属小组</span
            >
            <Tag
              v-else
              :color="
                record.dataState === 'COMPLETE'
                  ? 'success'
                  : record.dataState === 'PARTIAL'
                    ? 'orange'
                    : 'default'
              "
              >{{ nodeState(record as Api.GroupNode) }}</Tag
            >
            <div
              v-if="
                !record.item && !(groupKey && record.nodeType === 'DEPARTMENT')
              "
              class="mt-1 text-xs text-muted-foreground"
            >
              {{ coverageText(record as Api.GroupNode)
              }}<span v-if="record.adjustmentCount">
                · {{ record.adjustmentCount }} 项费用</span
              >
            </div>
          </div>
          <template v-else-if="column.key === 'platform'">{{
            record.item?.platformCode || '—'
          }}</template>
          <template v-else-if="column.key === 'company'">{{
            record.item?.companyName || '—'
          }}</template>
          <span
            v-else
            class="tabular-nums"
            :class="
              record.nodeType === 'SHOP' || record.nodeType === 'ADJUSTMENT'
                ? ''
                : 'font-semibold'
            "
            >{{
              metricValue(record as Api.GroupNode, String(column.key))
            }}</span
          >
        </template>
        <template #summary>
          <Table.Summary v-if="summaryNode && view?.report" fixed>
            <Table.Summary.Row class="bg-muted/60">
              <Table.Summary.Cell
                v-for="(column, index) in columns"
                :key="String(column.key)"
                :index="index"
                :align="column.align"
              >
                <div v-if="column.key === 'name'" class="font-semibold">
                  {{ departmentKey || groupKey ? '筛选范围合计' : '全月合计' }}
                  <div class="mt-1 text-xs font-normal text-muted-foreground">
                    {{ received ? '已导入小计' : '完整合计 · 缺失值不补零' }}
                  </div>
                </div>
                <div v-else-if="column.key === 'state'" class="text-xs">
                  <div>{{ nodeState(summaryNode) }}</div>
                  <div class="mt-1 text-muted-foreground">
                    {{ coverageText(summaryNode) }}
                  </div>
                </div>
                <span
                  v-else-if="
                    column.key === 'platform' || column.key === 'company'
                  "
                  >—</span
                >
                <strong v-else class="tabular-nums">{{
                  nodeMetric(summaryNode, String(column.key), received)
                }}</strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        </template>
        <template #emptyText>
          <Empty
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="
              error
                ? '数据暂不可用'
                : view?.report
                  ? '当前范围暂无明细'
                  : `${month} 尚未建立月报`
            "
          >
            <p
              v-if="!view?.report && !error"
              class="text-xs text-muted-foreground"
            >
              先配置本月应报店铺，再创建完整的待导入月报。
            </p>
            <Button v-if="!view?.report && !error" @click="emit('configured')"
              >查看店铺配置</Button
            >
          </Empty>
        </template>
      </Table>
      <p
        v-if="view?.report?.remark"
        class="mb-0 mt-3 text-xs text-muted-foreground"
      >
        月报备注：{{ view.report.remark }}
      </p>
    </div>
  </div>
  <ReportForm
    v-model:open="formOpen"
    :default-month="month"
    :report="editing"
    @saved="saved"
    @configure="
      formOpen = false;
      emit('configured');
    "
  />
  <ScopeDialog
    v-if="view?.report"
    v-model:open="scopeOpen"
    :report="view.report"
    @saved="load"
    @configure="
      scopeOpen = false;
      emit('configured');
    "
  />
  <Drawer
    v-model:open="detailOpen"
    :title="itemDetail?.name || '明细详情'"
    :width="680"
  >
    <template v-if="itemDetail?.item">
      <div class="mb-4 flex flex-wrap gap-2">
        <Tag>{{
          itemDetail.item.lineType === 'ADJUSTMENT' ? '费用调整' : '店铺'
        }}</Tag
        ><Tag>{{ nodeState(itemDetail) }}</Tag
        ><span>{{ itemDetail.item.platformCode || '—' }}</span>
      </div>
      <div class="mb-4 text-sm text-muted-foreground">
        {{ itemDetail.departmentName || '未分配部门' }} /
        {{ itemDetail.groupName || '未分组' }} ·
        {{ itemDetail.item.companyName || '未记录公司主体' }}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="metric in ALL_METRICS"
          :key="metric.key"
          class="rounded border border-border p-3"
        >
          <div class="text-xs text-muted-foreground">{{ metric.label }}</div>
          <div class="mt-2 text-lg tabular-nums">
            {{ formatMetric(itemDetail.item[metric.key], metric.rate) }}
          </div>
        </div>
      </div>
      <div class="mt-4 space-y-2 text-xs text-muted-foreground">
        <p>来源批次：{{ itemDetail.item.sourceBatchId ?? '—' }}</p>
        <p>
          工作表 / 行：{{ itemDetail.item.sourceSheetName || '—' }} /
          {{ itemDetail.item.sourceRowNumber ?? '—' }}
        </p>
        <p>备注：{{ itemDetail.item.remark || '—' }}</p>
      </div>
    </template>
  </Drawer>
</template>
