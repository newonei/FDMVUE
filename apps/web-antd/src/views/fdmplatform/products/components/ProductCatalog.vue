<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type {
  Product,
  ProductAttributeOptions,
  ProductQuery,
} from '#/api/fdmplatform/products';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { useMediaQuery } from '@vueuse/core';
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Menu,
  Select,
  Table,
} from 'ant-design-vue';

import FdmColorPreview from '#/components/fdm-color-preview/fdm-color-preview.vue';

import { productStageText } from '../attributes';
import { productCatalogColors } from '../color-preview';
import { productDimensionsText } from '../manufacturing';
import { missingProductFields } from '../model';
import ProductCatalogDetails from './ProductCatalogDetails.vue';
import ProductCategoryPanel from './ProductCategoryPanel.vue';
import ProductStageSelect from './ProductStageSelect.vue';

const props = defineProps<{
  appliedKeyword: string;
  appliedProductStage?: string;
  category?: string;
  categoryGroup?: ProductQuery['categoryGroup'];
  categoryRefresh: number;
  categoryTitle: string;
  codeSortOrder: 'ascend' | 'descend' | null;
  companyId: number;
  hasFilters: boolean;
  loading: boolean;
  pageNo: number;
  pageSize: number;
  products: Product[];
  stageOptions: ProductAttributeOptions['stages'];
  total: number;
}>();
const emit = defineEmits<{
  category: [id: string | undefined, label: string | undefined];
  categoryGroup: [value: NonNullable<ProductQuery['categoryGroup']>];
  changeTable: [
    page: { current?: number; pageSize?: number },
    filters: unknown,
    sorter: unknown,
    extra?: { action?: string },
  ];
  colorRepair: [];
  create: [];
  detail: [id: string];
  edit: [product: Product];
  files: [product: Product];
  import: [];
  refresh: [];
  remove: [product: Product];
  reset: [];
  search: [];
}>();

const keyword = defineModel<string>('keyword', { required: true });
const active = defineModel<string>('active');
const productStage = defineModel<string>('productStage');
const expandedColumns = ref(false);
const expandedProductId = ref<string>();
const expandedRowKeys = computed(() =>
  expandedProductId.value ? [expandedProductId.value] : [],
);
const compactLayout = useMediaQuery('(max-width: 760px)');
const compactCategoriesOpen = ref(false);
const imageErrors = ref(new Set<string>());
const categoryFilters = computed(() => ({
  productStage: props.appliedProductStage,
}));
function changeKeyword(value: string) {
  keyword.value = value;
  if (!value && props.appliedKeyword) emit('search');
}
function toggleDetails(id: string) {
  expandedProductId.value = expandedProductId.value === id ? undefined : id;
}
watch(
  () => props.products,
  (products) => {
    if (
      expandedProductId.value &&
      !products.some(({ id }) => id === expandedProductId.value)
    ) {
      expandedProductId.value = undefined;
    }
  },
);
const statusOptions = [
  { label: '已启用', value: 'true' },
  { label: '未启用', value: 'false' },
];
const countFormat = new Intl.NumberFormat('zh-CN');
const columns = computed<TableColumnsType<Product>>(() => {
  const result: TableColumnsType<Product> = [
    {
      title: '产品名称',
      key: 'product',
      width: compactLayout.value ? '34%' : 192,
    },
    {
      title: '产品编号',
      key: 'code',
      dataIndex: 'code',
      width: compactLayout.value ? undefined : 192,
      sorter: true,
      sortOrder: props.codeSortOrder,
      sortDirections: ['descend', 'ascend'],
    },
  ];
  if (!compactLayout.value) {
    result.push(
      { title: '型号', key: 'model', dataIndex: 'model', width: 136 },
      { title: '规格', key: 'specification', width: 168 },
      { title: '材质', key: 'material', width: 90 },
      { title: '颜色', key: 'color' },
      { title: '生产阶段', key: 'stage', width: 106 },
      { title: '状态', key: 'state', width: 94 },
    );
    if (expandedColumns.value) {
      result.push({ title: '定制说明', key: 'printing', width: 175 });
    }
  }
  result.push({
    title: '操作',
    key: 'action',
    width: compactLayout.value ? 84 : 152,
    fixed: compactLayout.value ? undefined : 'right',
  });
  return result;
});
const rows = computed(() =>
  props.products.map((product) => {
    const { size } = product;
    const colors = productCatalogColors(product);
    const stage = productStageText(product);
    const dimensions = productDimensionsText(product) || size;
    const specification = dimensions || product.spec || product.specification;
    let state = { label: '未启用', style: 'disabled' };
    if (product.selectable) state = { label: '可选用', style: 'ready' };
    else if (product.active) state = { label: '待补资料', style: 'pending' };
    return {
      ...product,
      catalog: {
        colors,
        dimensions,
        specification,
        stage,
        state,
      },
    };
  }),
);
</script>

<template>
  <div class="catalog-workspace">
    <header class="catalog-header">
      <h1>产品档案</h1>
      <div class="catalog-header-actions">
        <Dropdown :trigger="['click']" placement="bottomRight">
          <Button aria-label="更多档案操作">
            更多
            <IconifyIcon icon="lucide:chevron-down" />
          </Button>
          <template #overlay>
            <Menu>
              <Menu.Item key="color-repair" @click="emit('colorRepair')">
                历史颜色补录
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
        <Button @click="emit('import')">
          <template #icon><IconifyIcon icon="lucide:upload" /></template>
          Excel 导入
        </Button>
        <Button type="primary" @click="emit('create')">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新建产品
        </Button>
      </div>
    </header>

    <div class="catalog-layout">
      <button
        type="button"
        class="catalog-category-toggle"
        :aria-expanded="compactCategoriesOpen"
        aria-controls="product-catalog-categories"
        @click="compactCategoriesOpen = !compactCategoriesOpen"
      >
        <IconifyIcon icon="lucide:folder-tree" />
        分类筛选
        <IconifyIcon
          :icon="
            compactCategoriesOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'
          "
          class="catalog-category-chevron"
        />
      </button>
      <aside
        id="product-catalog-categories"
        class="catalog-side"
        :class="{ 'catalog-side--open': compactCategoriesOpen }"
      >
        <ProductCategoryPanel
          grouped
          :company-id="companyId"
          :value="category"
          :category-group="categoryGroup"
          :keyword="appliedKeyword"
          :filters="categoryFilters"
          :active="active === undefined ? undefined : active === 'true'"
          :refresh-key="categoryRefresh"
          @update:value="(id, label) => emit('category', id, label)"
          @select-group="emit('categoryGroup', $event)"
        />
      </aside>

      <section class="catalog-panel" aria-label="产品列表">
        <form class="catalog-filters" @submit.prevent="emit('search')">
          <div class="catalog-search">
            <Input
              :value="keyword"
              placeholder="名称 / SKU 编号"
              aria-label="搜索产品名称或 SKU 编号"
              allow-clear
              @update:value="changeKeyword"
            >
              <template #prefix>
                <IconifyIcon icon="lucide:search" class="search-icon" />
              </template>
            </Input>
            <Button html-type="submit" :loading="loading">查询</Button>
          </div>
          <ProductStageSelect
            v-model:value="productStage"
            class="catalog-stage"
            allow-groups
            :options="stageOptions"
            aria-label="筛选生产分类"
            @update:value="emit('search')"
          />
          <Select
            v-model:value="active"
            class="catalog-status-filter"
            :options="statusOptions"
            placeholder="全部状态"
            aria-label="启用状态"
            allow-clear
            @change="emit('search')"
          />
          <Button type="link" :disabled="!hasFilters" @click="emit('reset')">
            重置
          </Button>
        </form>

        <div class="catalog-list-heading">
          <div class="catalog-list-title">
            <h2 :title="categoryTitle">{{ categoryTitle }}</h2>
            <span class="catalog-count" aria-live="polite">
              {{ countFormat.format(total) }} 个产品
            </span>
          </div>
          <div class="catalog-table-tools">
            <Button
              v-if="!compactLayout"
              size="small"
              type="text"
              :aria-pressed="expandedColumns"
              @click="expandedColumns = !expandedColumns"
            >
              <template #icon><IconifyIcon icon="lucide:columns-3" /></template>
              {{ expandedColumns ? '收起扩展列' : '展开扩展列' }}
            </Button>
            <Button
              size="small"
              type="text"
              aria-label="刷新产品列表"
              title="刷新产品与分类计数"
              :loading="loading"
              @click="emit('refresh')"
            >
              <template #icon>
                <IconifyIcon icon="lucide:refresh-cw" />
              </template>
            </Button>
          </div>
        </div>

        <Table
          class="fdm-business-table catalog-table"
          size="small"
          table-layout="fixed"
          :data-source="rows"
          :columns="columns"
          row-key="id"
          :loading="loading"
          :expanded-row-keys="expandedRowKeys"
          :show-expand-column="false"
          :scroll="
            compactLayout ? undefined : { x: expandedColumns ? 1470 : 1295 }
          "
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (count: number, range: [number, number]) =>
              `第 ${range[0]}–${range[1]} 项 / 共 ${countFormat.format(count)} 项`,
          }"
          @change="
            (page, filters, sorter, extra) =>
              emit('changeTable', page, filters, sorter, extra)
          "
        >
          <template #emptyText>
            <Empty
              class="catalog-empty"
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              :description="
                hasFilters ? '没有符合筛选条件的产品' : '暂无产品档案'
              "
            >
              <Button v-if="hasFilters" @click="emit('reset')">
                重置筛选
              </Button>
              <Button v-else type="primary" @click="emit('create')">
                新建产品
              </Button>
            </Empty>
          </template>
          <template #expandedRowRender="{ record }">
            <ProductCatalogDetails
              v-if="expandedProductId === record.id"
              :key="record.id"
              :id="`catalog-details-${record.id}`"
              :product="record"
              @activity="emit('detail', record.id)"
              @files="emit('files', record)"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'product'" class="catalog-product">
              <div
                v-if="!compactLayout"
                class="catalog-thumbnail"
                aria-hidden="true"
              >
                <img
                  v-if="record.imageUrl && !imageErrors.has(record.imageUrl)"
                  :src="record.imageUrl"
                  loading="lazy"
                  alt=""
                  @error="imageErrors.add(record.imageUrl)"
                />
                <IconifyIcon v-else icon="lucide:package" />
              </div>
              <div class="catalog-product-copy">
                <button
                  type="button"
                  class="cell-line product-detail-link"
                  :title="record.name"
                  @click="emit('detail', record.id)"
                >
                  {{ record.name }}
                </button>
                <span class="cell-line secondary" :title="record.category">
                  {{ record.category || '未分类' }}
                </span>
              </div>
            </div>
            <div v-else-if="column.key === 'code'">
              <span class="catalog-value sku-code">{{
                record.code || '—'
              }}</span>
              <span
                v-if="
                  compactLayout && (record.model || record.catalog.dimensions)
                "
                class="catalog-value secondary"
              >
                {{
                  [record.model, record.catalog.dimensions]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </span>
            </div>
            <span
              v-else-if="column.key === 'specification'"
              class="catalog-value"
            >
              {{ record.catalog.specification || '—' }}
            </span>
            <span v-else-if="column.key === 'stage'" class="catalog-value">
              {{ record.catalog.stage || '—' }}
            </span>
            <div v-else-if="column.key === 'color'">
              <div v-if="record.catalog.colors.length" class="catalog-colors">
                <span
                  v-for="color in record.catalog.colors"
                  :key="color.side || color.label"
                  class="catalog-color"
                >
                  <span v-if="color.side" class="color-side">{{
                    color.side
                  }}</span>
                  <FdmColorPreview
                    v-if="color.sample"
                    :color="color.sample"
                    size="small"
                  />
                  <span class="catalog-value">{{ color.label }}</span>
                </span>
              </div>
              <span v-else class="secondary">—</span>
            </div>
            <span
              v-else-if="
                column.key === 'material' ||
                column.key === 'model' ||
                column.key === 'printing'
              "
              class="catalog-value"
            >
              {{ record[column.key] || '—' }}
            </span>
            <span
              v-else-if="column.key === 'state'"
              class="catalog-state"
              :class="`state-${record.catalog.state.style}`"
              :title="
                record.missingFields?.length
                  ? missingProductFields(record.missingFields)
                  : undefined
              "
            >
              <i aria-hidden="true"></i>{{ record.catalog.state.label }}
            </span>
            <div
              v-else-if="column.key === 'action'"
              class="catalog-row-actions"
            >
              <Button
                type="link"
                size="small"
                :aria-expanded="expandedProductId === record.id"
                :aria-controls="
                  expandedProductId === record.id
                    ? `catalog-details-${record.id}`
                    : undefined
                "
                :aria-label="`${expandedProductId === record.id ? '收起' : '查看'} ${record.code || record.name} 详情`"
                @click="toggleDetails(record.id)"
              >
                {{ expandedProductId === record.id ? '收起' : '详情' }}
              </Button>
              <Button
                v-if="record.canManage && !compactLayout"
                type="link"
                size="small"
                @click="emit('edit', record as Product)"
              >
                维护档案
              </Button>
              <Dropdown
                v-if="record.canManage || compactLayout"
                :trigger="['click']"
                placement="bottomRight"
              >
                <Button
                  type="text"
                  size="small"
                  :aria-label="`更多操作 · ${record.name}`"
                  title="更多操作"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:ellipsis" />
                  </template>
                </Button>
                <template #overlay>
                  <Menu>
                    <Menu.Item
                      v-if="record.canManage && compactLayout"
                      key="edit"
                      @click="emit('edit', record as Product)"
                    >
                      维护档案
                    </Menu.Item>
                    <Menu.Item
                      key="files"
                      @click="emit('files', record as Product)"
                    >
                      标准资料
                    </Menu.Item>
                    <Menu.Divider v-if="record.canManage" />
                    <Menu.Item
                      v-if="record.canManage"
                      key="delete"
                      danger
                      @click="emit('remove', record as Product)"
                    >
                      删除档案
                    </Menu.Item>
                  </Menu>
                </template>
              </Dropdown>
              <Button
                v-else
                type="link"
                size="small"
                @click="emit('files', record as Product)"
              >
                标准资料
              </Button>
            </div>
          </template>
        </Table>
      </section>
    </div>
  </div>
</template>

<style scoped>
.catalog-workspace {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.catalog-header,
.catalog-header-actions,
.catalog-list-heading,
.catalog-list-title,
.catalog-table-tools,
.catalog-row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.catalog-header {
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  min-height: 42px;
}

.catalog-header h1 {
  margin: 0;
  font-size: 23px;
  font-weight: 650;
  line-height: 1.35;
}

.catalog-header-actions {
  flex-wrap: wrap;
}

.catalog-header-actions :deep(.ant-btn),
.catalog-table-tools :deep(.ant-btn) {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
}

.catalog-layout {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.catalog-side,
.catalog-panel {
  min-width: 0;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.catalog-side {
  position: sticky;
  top: 12px;
  height: max(310px, calc(100dvh - 180px));
  min-height: 0;
  padding: 12px;
}

.catalog-category-toggle {
  display: none;
}

.catalog-panel {
  overflow: hidden;
}

.catalog-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid hsl(var(--border));
}

.catalog-search {
  display: flex;
  flex: 1 1 260px;
  gap: 6px;
  align-items: center;
  min-width: 0;
  max-width: 540px;
}

.catalog-search :deep(.ant-input-affix-wrapper) {
  min-width: 0;
}

.search-icon,
.secondary {
  color: hsl(var(--muted-foreground));
}

.catalog-stage {
  flex: 0 1 164px;
  min-width: 143px;
}

.catalog-status-filter {
  flex: 0 0 108px;
}

.catalog-list-heading {
  flex-wrap: wrap;
  justify-content: space-between;
  min-height: 48px;
  padding: 8px 14px;
}

.catalog-list-title {
  flex: 1 1 auto;
  min-width: 0;
}

.catalog-list-title h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
}

.catalog-count {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.catalog-table-tools {
  justify-content: flex-end;
  margin-left: auto;
}

.catalog-table-tools :deep(.ant-btn[aria-pressed='true']) {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
}

.catalog-product {
  display: flex;
  gap: 9px;
  align-items: center;
}

.catalog-thumbnail {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  height: 34px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.catalog-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: inherit;
}

.catalog-product-copy {
  flex: 1;
  min-width: 0;
}

.catalog-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  margin-bottom: 2px;
}

.catalog-color {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.color-side {
  flex: none;
  padding: 1px 4px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-radius: 4px;
}

.cell-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 18px;
  white-space: nowrap;
}

.secondary {
  font-size: 12px;
}

.product-detail-link {
  width: 100%;
  padding: 0;
  font-weight: 600;
  color: hsl(var(--primary));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.product-detail-link:hover {
  text-decoration: underline;
}

.product-detail-link:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.sku-code {
  font-variant-numeric: tabular-nums;
  user-select: all;
}

.catalog-value {
  display: block;
  line-height: 18px;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.catalog-state {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;
}

.catalog-state i {
  width: 6px;
  height: 6px;
  background: currentcolor;
  border-radius: 50%;
}

.state-ready i {
  background: hsl(var(--success));
}

.state-pending i {
  background: hsl(var(--warning));
}

.state-disabled {
  color: hsl(var(--muted-foreground));
}

.catalog-row-actions {
  gap: 2px;
  white-space: nowrap;
}

.catalog-row-actions :deep(.ant-btn) {
  padding-inline: 4px;
}

.catalog-table :deep(.ant-table.ant-table-small .ant-table-thead > tr > th),
.catalog-table :deep(.ant-table.ant-table-small .ant-table-tbody > tr > td) {
  padding: 7px 12px;
}

.catalog-table :deep(.ant-table.ant-table-small .ant-table-thead > tr > th) {
  font-size: 12px;
  font-weight: 600;
}

.catalog-table :deep(.ant-table-pagination.ant-pagination) {
  padding-inline: 14px;
  margin: 12px 0;
}

.catalog-empty {
  padding: 40px 0;
}

@media (max-width: 1100px) {
  .catalog-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .catalog-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .catalog-side {
    position: static;
    display: none;
    height: 230px;
  }

  .catalog-side--open {
    display: block;
  }

  .catalog-category-toggle {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 9px 12px;
    font-weight: 600;
    color: inherit;
    cursor: pointer;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
  }

  .catalog-category-chevron {
    margin-left: auto;
  }

  .catalog-table :deep(.ant-table.ant-table-small .ant-table-thead > tr > th),
  .catalog-table :deep(.ant-table.ant-table-small .ant-table-tbody > tr > td) {
    padding-inline: 6px;
  }

  .product-detail-link {
    overflow-wrap: anywhere;
    white-space: normal;
  }
}

@media (max-width: 480px) {
  .catalog-search {
    flex-basis: 100%;
  }

  .catalog-stage {
    flex: 1 0 120px;
    min-width: 115px;
  }

  .catalog-list-title {
    flex-basis: 100%;
  }
}
</style>
