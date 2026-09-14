<script setup lang="ts">
import type {
  ProductActivityRecord,
  ProductActivityType,
  ProductActivityView,
  ProductQuantitySummary,
} from '#/api/fdmplatform/product-activity';
import type { Product } from '#/api/fdmplatform/products';

import { computed, ref, watch } from 'vue';

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
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getProductActivity } from '#/api/fdmplatform/product-activity';

import { errorText, label } from '../../data';
import { contractReferenceText } from '../../documents/migration-display';
import RelatedLink from '../../documents/RelatedLink.vue';
import {
  activityAmount,
  activityDate,
  activityLabel,
  activityName,
  activityQuantity,
  activityTarget,
  activityTypes,
  dateRangeError,
  quantityText,
} from '../activity-model';
import { missingProductFields } from '../model';
import ProductFiles from './ProductFiles.vue';

const props = defineProps<{ open: boolean; product?: Product }>();
const emit = defineEmits<{
  close: [];
  edit: [product: Product];
  refresh: [];
  remove: [product: Product];
}>();
const { TabPane } = Tabs;
const view = ref<ProductActivityView>();
const loading = ref(false);
const panelError = ref('');
const fullscreen = ref(false);
const tab = ref<'DETAIL' | 'FILES' | ProductActivityType>('ALL');
const display = ref<'list' | 'timeline'>('timeline');
const keyword = ref('');
const fromDate = ref('');
const toDate = ref('');
const pageNo = ref(1);
const pageSize = ref(20);
const summaryUnit = ref('');
const expandedLineId = ref<string>();
let sequence = 0;

const isActivity = computed(
  () => tab.value !== 'DETAIL' && tab.value !== 'FILES',
);
const count = computed(() =>
  Object.values(view.value?.counts ?? {}).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  ),
);
const tabs = computed(() => [
  { key: 'ALL', tab: `业务动态 (${count.value})` },
  { key: 'DETAIL', tab: '产品详情' },
  { key: 'FILES', tab: '标准附件' },
  ...activityTypes
    .filter((item) => item.value !== 'ALL')
    .map((item) => ({
      key: item.value,
      tab: `${item.label} (${view.value?.counts[item.value as Exclude<ProductActivityType, 'ALL'>] ?? 0})`,
    })),
]);
const quantities = computed(() => view.value?.summary.quantities ?? []);
const selectedSummary = computed(
  () =>
    quantities.value.find((item) => (item.unit ?? '') === summaryUnit.value) ??
    quantities.value[0],
);
const unitOptions = computed(() =>
  quantities.value.map((item) => ({
    value: item.unit ?? '',
    label: item.unit || '未记录单位',
  })),
);
const summaryRows: {
  field: keyof ProductQuantitySummary;
  label: string;
  target: ProductActivityType;
}[] = [
  { label: '合同订购', field: 'contractQuantity', target: 'CONTRACT' },
  { label: '采购申请', field: 'requestedQuantity', target: 'PURCHASE_REQUEST' },
  { label: '采购有效量', field: 'orderedQuantity', target: 'PURCHASE_ORDER' },
  {
    label: '采购取消',
    field: 'cancelledOrderQuantity',
    target: 'PURCHASE_ORDER',
  },
  { label: '累计到货', field: 'arrivedQuantity', target: 'ARRIVAL' },
  { label: '合格到货净量', field: 'netAcceptedQuantity', target: 'ARRIVAL' },
  {
    label: '采购退货',
    field: 'purchaseReturnedQuantity',
    target: 'PURCHASE_RETURN',
  },
  { label: '累计发货', field: 'shippedQuantity', target: 'SHIPMENT' },
  { label: '销售退货', field: 'salesReturnedQuantity', target: 'SALES_RETURN' },
  { label: '发货净量', field: 'netShippedQuantity', target: 'SHIPMENT' },
  {
    label: '生产累计完成',
    field: 'productionCompletedQuantity',
    target: 'PRODUCTION_PROGRESS',
  },
];
const columns = [
  { title: '日期', key: 'date', width: 150 },
  { title: '类型 / 单据', key: 'document', width: 290 },
  { title: '客户 / 供应商', key: 'party', width: 200 },
  { title: '本产品数量', key: 'quantity', width: 160 },
  { title: '本产品金额', key: 'amount', width: 170 },
  { title: '状态', key: 'status', width: 120 },
];
const lineColumns = [
  { title: '规格版本', dataIndex: 'specVersion', width: 80 },
  { title: '单据中的规格', dataIndex: 'specification', width: 240 },
  { title: '数量', dataIndex: 'quantity', width: 100 },
  { title: '单位', dataIndex: 'unit', width: 60 },
  { title: '单价', dataIndex: 'unitPrice', width: 100 },
  { title: '币种', dataIndex: 'currency', width: 70 },
  { title: '净数量', dataIndex: 'netQuantity', width: 100 },
];

watch(
  () => [props.open, props.product?.id],
  () => {
    sequence++;
    if (!props.open || !props.product) return;
    view.value = undefined;
    tab.value = 'ALL';
    keyword.value = '';
    fromDate.value = '';
    toDate.value = '';
    pageNo.value = 1;
    summaryUnit.value = '';
    expandedLineId.value = undefined;
    fullscreen.value = false;
    void load();
  },
  { immediate: true },
);
watch(
  () => props.product?.version,
  () => {
    if (props.open && view.value?.productId === props.product?.id) void load();
  },
);

async function load(reset = false) {
  const id = props.product?.id;
  if (!id || !props.open) return;
  const run = ++sequence;
  if (view.value) view.value = { ...view.value, list: [], total: 0 };
  panelError.value = dateRangeError(fromDate.value, toDate.value);
  if (panelError.value) {
    loading.value = false;
    return;
  }
  if (reset) pageNo.value = 1;
  loading.value = true;
  try {
    const result = await getProductActivity(id, {
      companyId: 0,
      type: isActivity.value ? (tab.value as ProductActivityType) : 'ALL',
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      fromDate: fromDate.value || undefined,
      toDate: toDate.value || undefined,
    });
    if (run === sequence && props.open && id === props.product?.id) {
      view.value = result;
      if (
        !result.summary.quantities.some(
          (item) => (item.unit ?? '') === summaryUnit.value,
        )
      ) {
        summaryUnit.value = result.summary.quantities[0]?.unit ?? '';
      }
    }
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
function showType(type: ProductActivityType) {
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
function amountText(row: ProductActivityRecord) {
  return activityAmount(row);
}
function lineValue(value: unknown, field: string) {
  if (['netQuantity', 'quantity', 'unitPrice'].includes(field))
    return quantityText(value);
  return value === null || value === undefined || value === ''
    ? '—'
    : String(value);
}
function statusColor(status?: null | string) {
  if (['CANCELLED', 'REJECTED', 'VOID'].includes(status ?? ''))
    return 'default';
  if (
    ['ACTIVE', 'APPROVED', 'ARRIVED', 'COMPLETED', 'CONFIRMED'].includes(
      status ?? '',
    )
  )
    return 'green';
  return 'blue';
}
function close() {
  sequence++;
  emit('close');
}
function refresh() {
  emit('refresh');
  void load();
}
</script>

<template>
  <Drawer
    :open="open"
    :width="fullscreen ? '100vw' : 'min(1440px, 96vw)'"
    :body-style="{
      padding: '16px',
      background: 'var(--product-detail-background, #f5f7fa)',
    }"
    class="product-detail-drawer"
    @close="close"
  >
    <template #title>
      <Space class="detail-title">
        <Tag color="blue">产品档案</Tag>
        <span>{{ product?.displayName || product?.name }}</span>
      </Space>
    </template>
    <template #extra>
      <Space :size="6" wrap>
        <Button v-if="product?.canManage" @click="emit('edit', product)">
          维护档案
        </Button>
        <Button @click="changeTab('FILES')">标准附件</Button>
        <Button
          v-if="product?.canManage"
          danger
          @click="emit('remove', product)"
        >
          删除
        </Button>
        <Button :loading="loading" @click="refresh">刷新</Button>
        <Button @click="fullscreen = !fullscreen">
          {{ fullscreen ? '退出全屏' : '展开全屏' }}
        </Button>
      </Space>
    </template>
    <div v-if="product" class="product-detail-layout">
      <div class="product-detail-main">
        <Card size="small" class="product-overview">
          <Descriptions :column="2" size="small" :colon="false">
            <Descriptions.Item label="产品编号">
              {{ product.code }}
            </Descriptions.Item>
            <Descriptions.Item label="产品名称">
              {{ product.name }}
            </Descriptions.Item>
            <Descriptions.Item label="分类">
              {{ product.category || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="单位">
              {{ product.unit || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="规格">
              {{ product.specification || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="材质 / 尺寸">
              {{
                [product.material, product.size].filter(Boolean).join(' / ') ||
                '—'
              }}
            </Descriptions.Item>
            <Descriptions.Item label="颜色 / 形状">
              {{
                [product.color, product.shape].filter(Boolean).join(' / ') ||
                '—'
              }}
            </Descriptions.Item>
            <Descriptions.Item label="可用状态">
              <Tag :color="product.selectable ? 'green' : 'orange'">
                {{
                  product.selectable
                    ? '可选用'
                    : product.active
                      ? '待补资料'
                      : '已停用'
                }}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card size="small" class="product-relations">
          <Tabs :active-key="tab" size="small" @change="changeTab">
            <TabPane v-for="item in tabs" :key="item.key" :tab="item.tab" />
          </Tabs>

          <template v-if="tab === 'DETAIL'">
            <Descriptions bordered size="small" :column="1">
              <Descriptions.Item label="销售展示名称">
                {{ product.displayName || product.name }}
              </Descriptions.Item>
              <Descriptions.Item label="完整规格">
                {{ product.specification || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="材质">
                {{ product.material || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="尺寸">
                {{ product.size || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="颜色">
                {{ product.color || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="形状">
                {{ product.shape || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="印刷要求">
                {{ product.printing || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="标准包装">
                {{ product.packaging || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="备注">
                {{ product.remark || '—' }}
              </Descriptions.Item>
              <Descriptions.Item label="待补资料">
                {{
                  missingProductFields(product.missingFields ?? []) ||
                  '必要资料已完整'
                }}
              </Descriptions.Item>
            </Descriptions>
          </template>
          <ProductFiles
            v-else-if="tab === 'FILES'"
            :key="product.id"
            :company-id="0"
            :product-id="product.id"
            @changed="emit('refresh')"
          />
          <template v-else>
            <div class="activity-tools">
              <Radio.Group
                v-model:value="display"
                size="small"
                button-style="solid"
                aria-label="业务记录显示方式"
              >
                <Radio.Button value="timeline">时间线</Radio.Button>
                <Radio.Button value="list">表格</Radio.Button>
              </Radio.Group>
              <Input
                v-model:value="keyword"
                placeholder="搜索单据、客户或供应商"
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
                    ? '业务记录加载失败，请重试'
                    : keyword || fromDate || toDate
                      ? '没有符合筛选条件的记录'
                      : '此产品尚无相关业务记录'
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
                    <span
                      v-if="row.amounts.length || row.amountBasis"
                      class="activity-amount"
                      >{{ amountText(row) }}</span>
                  </div>
                  <div
                    v-if="row.contractId && row.type !== 'CONTRACT'"
                    class="activity-meta"
                  >
                    关联合同：<RelatedLink
                      :target="{ type: 'contract', contractId: row.contractId }"
                    >
                      {{
                        contractReferenceText(
                          row.contractCode,
                          row.contractName,
                          row.contractId,
                        )
                      }}
                    </RelatedLink>
                  </div>
                  <div class="activity-meta">
                    <span v-if="row.customerName">客户：<RelatedLink
                        :target="
                          row.customerId
                            ? { type: 'customer', id: row.customerId }
                            : undefined
                        "
                        >{{ row.customerName }}</RelatedLink></span>
                    <span v-if="row.supplierName">供应商：<RelatedLink
                        :target="
                          row.supplierId
                            ? { type: 'supplier', id: row.supplierId }
                            : undefined
                        "
                        >{{ row.supplierName }}</RelatedLink></span>
                  </div>
                  <Space wrap size="small">
                    <Tag v-if="row.status" :color="statusColor(row.status)">
                      {{ label(row.status) }}
                    </Tag>
                    <span
                      v-if="row.amountBasis === 'DOCUMENT_TOTAL_NOT_ALLOCATED'"
                      >关联采购单，数量与付款尚未分摊至本产品。</span>
                    <span v-else class="activity-quantity">{{
                        row.type === 'PRODUCTION_PROGRESS'
                          ? '累计完成'
                          : '本产品数量'
                      }}：{{ activityQuantity(row) }}</span>
                    <span
                      v-for="(quantity, index) in row.quantities.filter(
                        (entry) =>
                          entry.netQuantity != null &&
                          String(entry.netQuantity) !== String(entry.quantity),
                      )"
                      :key="index"
                      class="activity-muted"
                      >净量：{{
                        quantityText(quantity.netQuantity, quantity.unit)
                      }}</span>
                    <Button
                      v-if="row.lines.length"
                      size="small"
                      type="link"
                      @click="
                        expandedLineId =
                          expandedLineId === row.id ? undefined : row.id
                      "
                    >
                      {{
                        expandedLineId === row.id
                          ? '收起明细'
                          : `本产品明细 (${row.lines.length})`
                      }}
                    </Button>
                  </Space>
                  <Table
                    v-if="expandedLineId === row.id"
                    size="small"
                    :columns="lineColumns"
                    :data-source="row.lines"
                    :pagination="false"
                    :scroll="{ x: 750 }"
                    class="activity-lines"
                  >
                    <template #bodyCell="{ text, column }">
                      {{ lineValue(text, String(column.dataIndex ?? '')) }}
                    </template>
                  </Table>
                </li>
              </ol>
              <Table
                v-else
                size="small"
                :data-source="view?.list ?? []"
                :columns="columns"
                row-key="id"
                :pagination="false"
                :scroll="{ x: 1090 }"
              >
                <template #bodyCell="{ column, record }">
                  <span v-if="column.key === 'date'">{{
                    activityDate(record as ProductActivityRecord)
                  }}</span>
                  <template v-else-if="column.key === 'document'">
                    <Tag>{{ activityLabel(record.type) }}</Tag>
                    <RelatedLink
                      :target="activityTarget(record as ProductActivityRecord)"
                    >
                      {{ activityName(record as ProductActivityRecord) }}
                    </RelatedLink>
                  </template>
                  <Space
                    v-else-if="column.key === 'party'"
                    direction="vertical"
                    :size="0"
                  >
                    <RelatedLink
                      v-if="record.customerName"
                      :target="
                        record.customerId
                          ? { type: 'customer', id: record.customerId }
                          : undefined
                      "
                    >
                      {{ record.customerName }}
                    </RelatedLink>
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
                  </Space>
                  <span v-else-if="column.key === 'quantity'">{{
                    activityQuantity(record as ProductActivityRecord)
                  }}</span>
                  <span v-else-if="column.key === 'amount'">{{
                    amountText(record as ProductActivityRecord)
                  }}</span>
                  <Tag
                    v-else-if="column.key === 'status'"
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
              :show-total="(total: number) => `共 ${total} 条相关记录`"
              show-size-changer
              :page-size-options="['10', '20', '50']"
              class="activity-pagination"
              @change="changePage"
            />
          </template>
        </Card>
      </div>
      <aside class="product-detail-aside">
        <Card title="业务数量" size="small">
          <Select
            v-if="unitOptions.length > 1"
            v-model:value="summaryUnit"
            :options="unitOptions"
            aria-label="数量统计单位"
            class="summary-unit"
          />
          <p class="activity-muted">
            按产品明细及单位分别汇总；原始数量、已履约余额与后续办理记录保留各自业务含义。
          </p>
          <div
            v-for="item in summaryRows"
            :key="item.field"
            class="quantity-summary-row"
          >
            <span>{{ item.label }}</span>
            <Button
              type="link"
              size="small"
              :disabled="!view || selectedSummary?.[item.field] == null"
              @click="showType(item.target)"
            >
              {{
                quantityText(
                  selectedSummary?.[item.field],
                  selectedSummary?.unit,
                )
              }}
            </Button>
          </div>
        </Card>
        <Card title="产品库存" size="small">
          <p class="activity-muted">
            原记录库存量与平台可用量分别显示；外部主账库存核实盘点并接管后，才可用于新业务扣减。
          </p>

          <Empty
            v-if="!view?.inventoryPools.length"
            description="尚未找到该产品的库存池；原出入库与盘点记录可从上方对应业务类型查询。"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
          />
          <div
            v-for="pool in view?.inventoryPools ?? []"
            :key="pool.id"
            class="stock-summary"
          >
            <RelatedLink :target="{ type: 'stock', poolId: pool.id }">
              {{
                pool.warehouseName ||
                (pool.warehouseId ? `仓库 ${pool.warehouseId}` : '查看库存池')
              }}
            </RelatedLink>
            <div class="activity-muted">
              规格版本 {{ pool.specVersion ?? '—' }} ·
              {{
                pool.stockOwnerName ||
                (pool.stockOwnerId ? `货权 ${pool.stockOwnerId}` : '货权未记录')
              }}
            </div>
            <Descriptions size="small" :column="1">
              <Descriptions.Item
                v-if="pool.sourceOnHandQuantity != null"
                label="原记录现存量"
              >
                {{ quantityText(pool.sourceOnHandQuantity, pool.sourceUnit) }}
              </Descriptions.Item>
              <Descriptions.Item
                v-if="pool.sourceAvailableQuantity != null"
                label="原记录可用量"
              >
                {{
                  quantityText(pool.sourceAvailableQuantity, pool.sourceUnit)
                }}
              </Descriptions.Item>
              <Descriptions.Item label="现存量">
                {{ quantityText(pool.onHand, pool.unit) }}
              </Descriptions.Item>
              <Descriptions.Item label="已预留">
                {{ quantityText(pool.reserved, pool.unit) }}
              </Descriptions.Item>
              <Descriptions.Item label="可用量">
                {{
                  pool.authority === 'EXTERNAL'
                    ? '待盘点接管'
                    : quantityText(pool.available, pool.unit)
                }}
              </Descriptions.Item>
            </Descriptions>
          </div>
          <Button
            v-if="view?.inventoryPools.length"
            type="link"
            @click="showType('STOCK_EVENT')"
          >
            查看本产品库存流水
          </Button>
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
.product-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 286px;
  gap: 16px;
  align-items: start;
}

.product-detail-main,
.product-detail-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.detail-title {
  max-width: 580px;
}

.product-overview :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
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

.activity-muted {
  font-size: 12px;
  line-height: 1.7;
  color: #64748b;
}

.activity-lines {
  margin-top: 10px;
}

.activity-quantity {
  font-variant-numeric: tabular-nums;
  color: #1677ff;
}

.activity-pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 18px;
}

.quantity-summary-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  border-bottom: 1px solid #f0f0f0;
}

.quantity-summary-row:last-child {
  border-bottom: 0;
}

.summary-unit {
  width: 100%;
  margin-bottom: 6px;
}

.stock-summary + .stock-summary {
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.statistics-notes {
  padding-left: 16px;
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: #64748b;
}

@media (max-width: 1080px) {
  .product-detail-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .product-detail-aside {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }
}
</style>
