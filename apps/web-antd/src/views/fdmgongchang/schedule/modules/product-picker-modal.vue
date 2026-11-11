<script setup lang="ts">
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { ProductAttributeOptions } from '#/api/fdmplatform/products';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { Alert, Button, Empty, Image, Input, Modal, Table } from 'ant-design-vue';

import {
  getScheduleProductAttributeOptions,
  getScheduleProductCategories,
  getScheduleProductPage,
} from '#/api/fdmgongchang/schedule';
import { errorText } from '#/views/fdmplatform/data';
import { productStageText, productStageValue } from '#/views/fdmplatform/products/attributes';
import ProductCategoryPanel from '#/views/fdmplatform/products/components/ProductCategoryPanel.vue';
import ProductStageSelect from '#/views/fdmplatform/products/components/ProductStageSelect.vue';

import { specText } from '../../production-order/shared';
import { dimensionTextInMm } from '../../shared/dimensions';

const props = defineProps<{ open: boolean; requiredStage?: string; title?: string }>();
const emit = defineEmits<{ close: []; selected: [product: Api.Product] }>();

const filters = reactive({ keyword: '', material: '', size: '', color: '', shape: '', productStage: '' });
const attributeOptions = ref<ProductAttributeOptions>({ stages: [], colors: [], textures: [], matTypes: [] });
const requiredStage = computed(() => props.requiredStage?.trim() || '');
const requiredStageLabel = computed(() => attributeOptions.value.stages.find((stage) => stage.value === requiredStage.value)?.label || requiredStage.value);
const attributeError = ref('');
let attributeSequence = 0;
const appliedFilters = ref<Api.ProductFilters>({});
/** undefined 表示全部，空字符串表示未分类。 */
const category = ref<string>();
const data = ref<Api.Product[]>([]);
const selected = ref<Api.Product>();
const selectedKeys = computed(() => selected.value ? [selected.value.id] : []);
const selectionLabel = computed(() => selected.value
  ? [selected.value.displayName || selected.value.name, selected.value.code].filter(Boolean).join(' · ')
  : '');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const loadError = ref('');
let sequence = 0;
let lastOpenedStage = '';

function matchesRequiredStage(product: Api.Product) {
  return !requiredStage.value || productStageValue(product) === requiredStage.value;
}

function stockText(value: Api.Product['currentStock']) {
  if (value === null || value === undefined || value === '') return '—';
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : '—';
}

async function loadAttributeOptions() {
  const run = ++attributeSequence;
  attributeError.value = '';
  try {
    const options = await getScheduleProductAttributeOptions();
    if (run === attributeSequence) attributeOptions.value = options;
  } catch (error) {
    if (run === attributeSequence) attributeError.value = errorText(error);
  }
}

async function load() {
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getScheduleProductPage({
      ...appliedFilters.value,
      productStage: requiredStage.value || appliedFilters.value.productStage,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      categoryId: category.value,
    });
    if (run !== sequence) return;
    data.value = result.list;
    total.value = result.total;
  } catch (error) {
    if (run === sequence) {
      data.value = [];
      total.value = 0;
      loadError.value = errorText(error);
    }
  } finally {
    if (run === sequence) loading.value = false;
  }
}

function search() {
  appliedFilters.value = Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, value.trim() || undefined]),
  );
  if (requiredStage.value) appliedFilters.value.productStage = requiredStage.value;
  pageNo.value = 1;
  void load();
}

function resetFilters() {
  Object.assign(filters, { keyword: '', material: '', size: '', color: '', shape: '', productStage: requiredStage.value });
  category.value = undefined;
  search();
}

function chooseProductStage(value: string | undefined) {
  filters.productStage = requiredStage.value || value || '';
  search();
}

function chooseCategory(value: string | undefined) {
  category.value = value;
  pageNo.value = 1;
  void load();
}

function changePage(page: { current?: number; pageSize?: number }) {
  const nextSize = page.pageSize ?? pageSize.value;
  pageNo.value = nextSize === pageSize.value ? (page.current ?? 1) : 1;
  pageSize.value = nextSize;
  void load();
}

function changeSelection(keys: (number | string)[]) {
  selected.value = data.value.find((item) => item.id === String(keys[0]) && matchesRequiredStage(item));
}

function selectProduct(product: Api.Product) {
  if (!loading.value && matchesRequiredStage(product)) selected.value = product;
}

function confirm(product = selected.value) {
  if (product && !loading.value && matchesRequiredStage(product)) emit('selected', product);
}

watch([() => props.open, requiredStage], ([open, stage]) => {
  ++sequence;
  ++attributeSequence;
  loading.value = false;
  selected.value = undefined;
  if (!open) return;
  // 切换领料工序或重新打开限定选品时，不能沿用上次的分类和搜索条件。
  if (stage || stage !== lastOpenedStage) {
    Object.assign(filters, { keyword: '', material: '', size: '', color: '', shape: '', productStage: stage });
    appliedFilters.value = { productStage: stage || undefined };
    category.value = undefined;
  }
  lastOpenedStage = stage;
  for (const key of Object.keys(filters) as (keyof typeof filters)[]) {
    filters[key] = appliedFilters.value[key] ?? '';
  }
  pageNo.value = 1;
  data.value = [];
  void loadAttributeOptions();
  void load();
}, { immediate: true });

onBeforeUnmount(() => { ++sequence; ++attributeSequence; });
</script>

<template>
  <Modal
    :open="open"
    :title="title || '从产品中心选择'"
    width="min(1280px, 96vw)"
    :mask-closable="false"
    centered
    @cancel="emit('close')"
  >
    <div class="picker-layout">
      <aside class="picker-side">
        <div class="stage-filter">
          <label class="picker-hint">生产分类（大类 / 细分）</label>
          <div v-if="requiredStage" class="required-stage-filter" role="status">已限定：{{ requiredStageLabel }}</div>
          <ProductStageSelect v-else allow-groups :value="filters.productStage || undefined" :options="attributeOptions.stages" @update:value="chooseProductStage" />
        </div>
        <ProductCategoryPanel
          v-if="open"
          :company-id="0"
          :value="category"
          :keyword="appliedFilters.keyword"
          :filters="appliedFilters"
          :load-categories="getScheduleProductCategories"
          @update:value="chooseCategory"
        />
      </aside>
      <div class="picker-main">
        <div class="picker-filters">
          <Input
            v-model:value="filters.keyword"
            class="keyword-input"
            placeholder="名称 / 产品编码 / 规格"
            aria-label="搜索产品"
            allow-clear
            @press-enter="search"
          />
          <Input
            v-for="entry in ['material', 'size', 'color', 'shape'] as const"
            :key="entry"
            v-model:value="filters[entry]"
            class="attribute-input"
            :placeholder="{ material: '材质', size: '尺寸', color: '颜色', shape: '形状' }[entry]"
            :aria-label="{ material: '筛选材质', size: '筛选尺寸', color: '筛选颜色', shape: '筛选形状' }[entry]"
            allow-clear
            @press-enter="search"
          />
          <Button type="primary" @click="search">查询</Button>
          <Button @click="resetFilters">重置</Button>
        </div>
        <div class="picker-hint">按分类筛选后选择一个产品，点击确定；也可双击产品直接选入。当前库存为本厂账面数量。</div>
        <Alert v-if="attributeError" type="warning" show-icon :message="`生产分类加载失败：${ attributeError}`" />
        <Alert v-if="loadError" type="error" show-icon :message="loadError" />
        <Table
          size="small"
          row-key="id"
          :data-source="data"
          :loading="loading"
          :scroll="{ x: 800, y: 'min(430px, calc(100vh - 420px))' }"
          :row-selection="{
            type: 'radio',
            selectedRowKeys: selectedKeys,
            preserveSelectedRowKeys: true,
            onChange: changeSelection,
            getCheckboxProps: (record: Api.Product) => ({ disabled: !matchesRequiredStage(record) }),
          }"
          :custom-row="(record: Api.Product) => ({
            onClick: () => selectProduct(record),
            onDblclick: () => confirm(record),
          })"
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            size: 'small',
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (count: number) => `共 ${count} 个产品`,
          }"
          :columns="[
            { title: '产品', key: 'product', width: 280 },
            { title: '分类 / 阶段', key: 'category', dataIndex: 'category', width: 110 },
            { title: '规格', key: 'specification', width: 210 },
            { title: '当前库存', key: 'currentStock', width: 100, align: 'right' },
            { title: '单位', key: 'unit', dataIndex: 'unit', width: 60 },
          ]"
          @change="changePage"
        >
          <template #emptyText>
            <Empty description="没有符合条件的产品，请调整分类或搜索条件" />
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'product'" class="product-cell">
              <Image v-if="record.imageUrl" :src="record.imageUrl" :width="40" :height="40" :preview="false" />
              <span v-else class="image-placeholder">暂无图</span>
              <div class="product-copy">
                <strong :title="record.displayName || record.name">{{ record.displayName || record.name }}</strong>
                <span class="product-code">{{ record.code || '—' }}</span>
              </div>
            </div>
            <div v-else-if="column.key === 'category'">
              <span>{{ record.category || '未分类' }}</span>
              <div v-if="productStageText(record)" class="picker-hint">{{ productStageText(record) }}</div>
            </div>
            <span v-else-if="column.key === 'specification'">{{ dimensionTextInMm(specText(record)) || '—' }}</span>
            <span v-else-if="column.key === 'currentStock'" class="whitespace-nowrap tabular-nums" :class="Number(record.currentStock) < 0 ? 'text-destructive' : record.currentStock == null ? 'text-muted-foreground' : 'text-foreground'" :title="record.currentStock == null ? '暂无对应的工厂库存数据' : undefined">{{ stockText(record.currentStock) }}</span>
            <span v-else-if="column.key === 'unit'">{{ record.stockUnit || record.unit || '—' }}</span>
          </template>
        </Table>
      </div>
    </div>
    <template #footer>
      <div class="picker-footer">
        <div class="selection" :title="selectionLabel || undefined">
          {{ selected ? `已选：${selectionLabel}` : '请选择一个产品' }}
        </div>
        <div class="picker-actions">
          <Button @click="emit('close')">取消</Button>
          <Button type="primary" :disabled="!selected || loading || !matchesRequiredStage(selected)" @click="confirm()">确定</Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.picker-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 16px;
  height: min(640px, calc(100vh - 230px));
  min-height: 320px;
}

.picker-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding-right: 12px;
  border-right: 1px solid hsl(var(--border));
}

.stage-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.required-stage-filter {
  padding: 6px 10px;
  color: #1677ff;
  background: #e6f4ff;
  border: 1px solid #91caff;
  border-radius: 6px;
}

.picker-side :deep(.category-panel) {
  flex: 1;
  height: auto;
}

.picker-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.picker-filters,
.picker-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.keyword-input {
  width: 210px;
}

.attribute-input {
  width: 86px;
}

.picker-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.product-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}

.product-copy {
  min-width: 0;
}

.product-copy strong {
  display: block;
  overflow-wrap: anywhere;
}

.product-code {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.image-placeholder {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 6px;
}

.picker-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.selection {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  white-space: nowrap;
}

.picker-actions {
  flex-shrink: 0;
}

@media (max-width: 760px) {
  .picker-layout {
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 8px;
}

  .picker-side {
  padding-right: 8px;
}

  .keyword-input {
  width: 100%;
}

  .picker-footer {
  align-items: flex-end;
}

  .selection {
  max-height: 48px;
  overflow-wrap: anywhere;
  white-space: normal;
}
}
</style>
