<script setup lang="ts">
import type {
  Product,
  ProductPrice,
  TaxBasis,
} from '#/api/fdmplatform/products';

import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  deleteProduct,
  getProduct,
  getProductPrices,
  getProducts,
  saveProductPrice,
} from '#/api/fdmplatform/products';

import { errorText, money } from '../../data';
import { useEntityDetail } from '../../documents/useEntityDetail';
import {
  currencyOptions,
  missingProductFields,
  productDescription,
  taxOptions,
} from '../model';
import ProductDetailDrawer from './ProductDetailDrawer.vue';
import ProductEditor from './ProductEditor.vue';
import ProductFiles from './ProductFiles.vue';
import ProductPicker from './ProductPicker.vue';

import '../../components/compact-tables.css';

const props = defineProps<{ mode: 'catalog' | 'prices' }>();
const ProductImportDialog = defineAsyncComponent(
  () => import('./ProductImportDialog.vue'),
);
const route = useRoute();
const router = useRouter();
function catalogQuery(key: string) {
  const value = route.query[key];
  return props.mode === 'catalog' && typeof value === 'string' ? value : '';
}
function catalogPage(key: string, fallback: number) {
  const value = Number(catalogQuery(key));
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000
    ? value
    : fallback;
}
const companyId = 0;
const title = computed(() =>
  props.mode === 'catalog' ? '产品档案' : '销售价格',
);
const panelError = ref('');
const loading = ref(false);
const pageNo = ref(catalogPage('catalogPage', 1));
const pageSize = ref(Math.min(catalogPage('catalogSize', 10), 100));
const total = ref(0);
const keyword = ref(catalogQuery('catalogKeyword'));
const category = ref(catalogQuery('catalogCategory'));
const active = ref<string | undefined>(
  ['false', 'true'].includes(catalogQuery('catalogActive'))
    ? catalogQuery('catalogActive')
    : undefined,
);
const currency = ref('CNY');
const products = ref<Product[]>([]);
const prices = ref<ProductPrice[]>([]);
const busy = ref(false);
const editorOpen = ref(false);
const importOpen = ref(false);
const importMounted = ref(false);
const imageErrors = ref(new Set<string>());
const detailOpen = ref(false);
const selectedProduct = ref<Product>();
const filesProduct = ref<Product>();
const priceOpen = ref(false);
const productPickerOpen = ref(false);
const priceProductName = ref('');
const priceKey = ref('');
const priceError = ref('');
const deletingProduct = ref<Product>();
const deleting = ref(false);
const deleteError = ref('');
const deleteKey = ref('');
const priceForm = reactive({
  id: undefined as string | undefined,
  expectedVersion: undefined as number | undefined,
  productId: '',
  currency: 'CNY',
  taxBasis: 'TAX_INCLUDED' as TaxBasis,
  unit: '',
  unitPrice: undefined as number | string | undefined,
  validFrom: '',
  validUntil: '',
  active: true,
});
let sequence = 0;
let detailRefreshSequence = 0;
const list = computed(() =>
  props.mode === 'catalog' ? products.value : prices.value,
);
const hasFilters = computed(() =>
  Boolean(keyword.value || category.value || active.value !== undefined),
);
const pageSelectableCount = computed(
  () => products.value.filter((product) => product.selectable).length,
);
const pageIncompleteCount = computed(
  () =>
    products.value.filter((product) => product.active && !product.selectable)
      .length,
);
const columns = computed(() =>
  props.mode === 'catalog'
    ? [
        { title: '产品 / SKU', key: 'product', width: 330 },
        {
          title: '分类',
          key: 'category',
          dataIndex: 'category',
          width: 130,
          ellipsis: true,
        },
        { title: '规格与包装', key: 'specification' },
        { title: '单位', dataIndex: 'unit', width: 60 },
        { title: '可用状态', key: 'state', width: 150 },
        { title: '操作', key: 'action', width: 210, fixed: 'right' as const },
      ]
    : [
        { title: '产品', key: 'priceProduct', width: 240 },
        { title: '销售参考价', key: 'price' },
        { title: '单位', dataIndex: 'unit' },
        { title: '税费口径', key: 'tax' },
        { title: '有效期', key: 'valid' },
        { title: '启用', key: 'active' },
        { title: '操作', key: 'action' },
      ],
);
onMounted(() => {
  void load();
});
function resetFilters() {
  keyword.value = '';
  category.value = '';
  active.value = undefined;
  void load(true);
}
function openImport() {
  importMounted.value = true;
  importOpen.value = true;
}
async function load(reset = false) {
  if (reset) pageNo.value = 1;
  const run = ++sequence;
  const scope = {
    companyId,
    pageNo: pageNo.value,
    pageSize: pageSize.value,
  };
  loading.value = true;
  panelError.value = '';
  try {
    if (props.mode === 'catalog') {
      const result = await getProducts({
        ...scope,
        keyword: keyword.value,
        category: category.value,
        active:
          active.value === undefined ? undefined : active.value === 'true',
      });
      if (run === sequence) {
        products.value = result.list;
        total.value = result.total;
      }
    } else {
      const result = await getProductPrices({
        ...scope,
        currency: currency.value || undefined,
      });
      if (run === sequence) {
        prices.value = result.list;
        total.value = result.total;
      }
    }
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function changePage(page: { current?: number; pageSize?: number }) {
  pageNo.value = page.current ?? 1;
  pageSize.value = page.pageSize ?? 10;
  void load();
}
const entityDetail = useEntityDetail(
  'productId',
  getProduct,
  (value) => {
    detailRefreshSequence++;
    selectedProduct.value = value;
    detailOpen.value = Boolean(value);
    editorOpen.value = !value;
  },
  () => {
    detailRefreshSequence++;
    editorOpen.value = false;
    detailOpen.value = false;
  },
  (value) => {
    panelError.value = value;
  },
);
function openProductDetail(id: string) {
  if (route.query.productId === id) {
    entityDetail.open(id);
    return;
  }
  void router.push({
    query: {
      ...route.query,
      productId: id,
      catalogKeyword: keyword.value || undefined,
      catalogCategory: category.value || undefined,
      catalogActive: active.value,
      catalogPage: String(pageNo.value),
      catalogSize: String(pageSize.value),
    },
  });
}
function openProduct(product?: Product) {
  detailRefreshSequence++;
  entityDetail.invalidatePending();
  if (!product) {
    entityDetail.open();
    return;
  }
  selectedProduct.value = product;
  editorOpen.value = true;
}
function closeEditor() {
  editorOpen.value = false;
  if (!detailOpen.value) entityDetail.close();
}
async function productSaved(product: Product) {
  detailRefreshSequence++;
  selectedProduct.value = product;
  editorOpen.value = false;
  await load();
}
async function refreshProductDetail() {
  const id = selectedProduct.value?.id;
  if (!id || !detailOpen.value) return;
  const run = ++detailRefreshSequence;
  try {
    const product = await getProduct(id);
    if (
      run === detailRefreshSequence &&
      detailOpen.value &&
      selectedProduct.value?.id === id &&
      product.version >= selectedProduct.value.version
    )
      selectedProduct.value = product;
  } catch (error) {
    if (run === detailRefreshSequence && detailOpen.value)
      panelError.value = errorText(error);
  }
}
function confirmDelete(product: Product) {
  deletingProduct.value = product;
  deleteError.value = '';
  deleteKey.value = newIdempotencyKey();
}
async function removeProduct() {
  const product = deletingProduct.value;
  if (!product || deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await deleteProduct(product.id, {
      companyId,
      expectedVersion: product.version,
      idempotencyKey: deleteKey.value,
    });
    deletingProduct.value = undefined;
    if (selectedProduct.value?.id === product.id) entityDetail.close();
    if (products.value.length === 1 && pageNo.value > 1) pageNo.value--;
    message.success('产品已删除，不再出现在产品目录和合同选品中');
    await load();
  } catch (error) {
    deleteError.value = errorText(error);
  } finally {
    deleting.value = false;
  }
}
function maintainInstead() {
  const product = deletingProduct.value;
  deletingProduct.value = undefined;
  if (product) openProduct(product);
}
function openPrice(price?: ProductPrice) {
  Object.assign(priceForm, {
    id: price?.id,
    expectedVersion: price?.version,
    productId: price?.productId ?? '',
    currency: price?.currency ?? 'CNY',
    taxBasis: price?.taxBasis ?? 'TAX_INCLUDED',
    unit: price?.unit ?? '',
    unitPrice: price?.unitPrice ?? undefined,
    validFrom: price?.validFrom ?? new Date().toLocaleDateString('sv-SE'),
    validUntil: price?.validUntil ?? '',
    active: price?.active ?? true,
  });
  priceProductName.value = price?.productName ?? price?.productId ?? '';
  priceKey.value = newIdempotencyKey();
  priceError.value = '';
  priceOpen.value = true;
}
function selectPriceProduct(selected: Product[]) {
  const product = selected[0];
  if (!product) return;
  if (selected.length > 1)
    message.info('每条价格对应一个产品，已采用第一个所选规格');
  priceForm.productId = product.id;
  priceForm.unit = product.unit ?? '';
  priceProductName.value = `${product.displayName || product.name} · ${product.code}`;
  productPickerOpen.value = false;
}
async function savePrice() {
  if (
    !priceForm.productId ||
    priceForm.unitPrice === null ||
    priceForm.unitPrice === undefined ||
    priceForm.unitPrice === '' ||
    !priceForm.validFrom
  ) {
    priceError.value = '请选择产品，填写销售参考价和生效日期';
    return;
  }
  busy.value = true;
  priceError.value = '';
  try {
    const { id: _id, ...pricePayload } = priceForm;
    await saveProductPrice({
      ...pricePayload,
      companyId,
      validUntil: priceForm.validUntil || null,
      idempotencyKey: priceKey.value,
    });
    priceOpen.value = false;
    message.success('销售价格已保存');
    await load();
  } catch (error) {
    priceError.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Page auto-content-height>
    <div class="center-stack">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <header v-if="mode === 'catalog'" class="catalog-header">
        <div>
          <div class="catalog-eyebrow">产品中心</div>
          <h1>产品目录</h1>
          <p>维护产品规格、包装及标准资料，供合同选品使用。</p>
        </div>
        <Space wrap class="catalog-header-actions">
          <Button :loading="loading" @click="load()">刷新</Button>
          <Button @click="openImport">Excel 导入</Button>
          <Button type="primary" @click="openProduct()">＋ 新建产品</Button>
        </Space>
      </header>
      <Card
        :title="mode === 'catalog' ? undefined : `产品中心 · ${title}`"
        size="small"
        :class="{ 'catalog-card': mode === 'catalog' }"
      >
        <template #extra>
          <Button
            v-if="mode === 'prices'"
            size="small"
            :loading="loading"
            @click="load()"
          >
            刷新资料
          </Button>
        </template>
        <div class="center-stack">
          <Alert
            v-if="mode === 'prices'"
            type="info"
            show-icon
            message="为本业务产品维护销售参考价，按币种、单位、税费口径和有效期匹配，共用产品及销售价格。"
          />
          <form
            v-if="mode === 'catalog'"
            class="catalog-filters"
            @submit.prevent="load(true)"
          >
            <label class="catalog-filter catalog-search">
              <span>搜索产品</span>
              <Input
                v-model:value="keyword"
                placeholder="名称 / SKU 编号"
                aria-label="搜索产品名称或 SKU 编号"
                allow-clear
              />
            </label>
            <label class="catalog-filter">
              <span>产品分类</span>
              <Input
                v-model:value="category"
                placeholder="输入分类"
                aria-label="产品分类"
                allow-clear
              />
            </label>
            <label class="catalog-filter">
              <span>启用状态</span>
              <Select
                v-model:value="active"
                :options="[
                  { value: 'true', label: '已启用' },
                  { value: 'false', label: '未启用' },
                ]"
                placeholder="全部状态"
                aria-label="启用状态"
                allow-clear
                @change="load(true)"
              />
            </label>
            <div class="catalog-filter-actions">
              <Button type="primary" html-type="submit" :loading="loading">
                查询
              </Button>
              <Button :disabled="!hasFilters" @click="resetFilters">
                重置
              </Button>
            </div>
          </form>
          <Space v-else wrap>
            <Select
              v-model:value="currency"
              :options="currencyOptions"
              allow-clear
              placeholder="全部币种"
              style="width: 140px"
              @change="load(true)"
            />
            <Button type="primary" @click="load(true)">查询</Button>
            <Button @click="openPrice()"> 新增销售价格 </Button>
          </Space>
          <div v-if="mode === 'catalog'" class="catalog-list-heading">
            <div class="catalog-list-title">
              <h2>产品档案</h2>
              <span class="catalog-count">{{ total }} 个</span>
              <span v-if="hasFilters" class="muted">筛选结果</span>
            </div>
            <div class="catalog-page-summary">
              <span>本页 <b>{{ products.length }}</b> 个</span>
              <span class="catalog-ready">可选用 <b>{{ pageSelectableCount }}</b></span>
              <span v-if="pageIncompleteCount" class="catalog-pending">待补资料 <b>{{ pageIncompleteCount }}</b></span>
            </div>
          </div>
          <Table
            class="fdm-business-table"
            :class="{ 'catalog-table': mode === 'catalog' }"
            size="small"
            table-layout="fixed"
            :data-source="list"
            :columns="columns"
            row-key="id"
            :loading="loading"
            :scroll="{ x: mode === 'catalog' ? 1240 : 1050 }"
            :pagination="{
              current: pageNo,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count: number) => `共 ${count} 条`,
            }"
            @change="changePage"
          >
            <template v-if="mode === 'catalog'" #emptyText>
              <Empty
                class="catalog-empty"
                :description="
                  hasFilters ? '没有找到符合条件的产品' : '还没有产品档案'
                "
              >
                <p>
                  {{
                    hasFilters
                      ? '试试其他关键词，或重置筛选查看全部产品。'
                      : '先建立产品资料，之后可在合同中直接选择使用。'
                  }}
                </p>
                <Button v-if="hasFilters" @click="resetFilters">
                  重置筛选
                </Button>
                <Space v-else>
                  <Button @click="openImport">Excel 批量导入</Button>
                  <Button type="primary" @click="openProduct()">
                    新建产品
                  </Button>
                </Space>
              </Empty>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'product'">
                <div class="catalog-product-cell">
                  <div class="catalog-thumbnail" aria-hidden="true">
                    <img
                      v-if="
                        record.imageUrl && !imageErrors.has(record.imageUrl)
                      "
                      :src="record.imageUrl"
                      alt=""
                      loading="lazy"
                      @error="imageErrors.add(record.imageUrl)"
                    />
                    <span v-else>暂无图片</span>
                  </div>
                  <div class="catalog-product-copy">
                    <button
                      class="cell-line product-detail-link"
                      :title="record.displayName || record.name"
                      @click="openProductDetail(record.id)"
                    >
                      {{ record.displayName || record.name }}
                    </button>
                    <div class="muted cell-line" :title="record.code">
                      {{ record.code }}
                    </div>
                  </div>
                </div>
              </template>
              <span
                v-else-if="column.key === 'category'"
                class="catalog-category"
                :title="record.category"
                >{{ record.category || '未分类' }}</span>
              <template v-else-if="column.key === 'specification'">
                <div
                  class="cell-line"
                  :title="productDescription(record as Product)"
                >
                  {{ productDescription(record as Product) }}
                </div>
                <div
                  class="muted cell-line"
                  :title="`形状：${record.shape || '未维护'} · ${record.packaging || '包装待补充'}`"
                >
                  形状：{{ record.shape || '未维护' }} ·
                  {{ record.packaging || '包装待补充' }}
                </div>
              </template>
              <template v-else-if="column.key === 'state'">
                <Tag
                  :color="
                    record.selectable
                      ? 'green'
                      : record.active
                        ? 'orange'
                        : 'default'
                  "
                >
                  {{
                    record.selectable
                      ? '可选用'
                      : record.active
                        ? '待补资料'
                        : '未启用'
                  }}
                </Tag>
                <div
                  v-if="record.missingFields?.length"
                  class="muted cell-line"
                  :title="missingProductFields(record.missingFields || [])"
                >
                  {{ missingProductFields(record.missingFields || []) }}
                </div>
              </template>
              <span
                v-else-if="column.key === 'priceProduct'"
                class="fdm-cell-line"
                :title="record.productName || record.productId"
                >{{ record.productName || record.productId }}</span>
              <span v-else-if="column.key === 'price'">{{
                money(record.unitPrice, record.currency)
              }}</span>
              <span v-else-if="column.key === 'tax'">{{
                record.taxBasis === 'TAX_INCLUDED' ? '含税' : '未税'
              }}</span>
              <span v-else-if="column.key === 'valid'">{{ record.validFrom }} ～
                {{ record.validUntil || '长期' }}</span>
              <Tag
                v-else-if="column.key === 'active'"
                :color="record.active ? 'green' : 'default'"
              >
                {{ record.active ? '启用' : '停用' }}
              </Tag>
              <template v-else-if="column.key === 'action'">
                <Space class="catalog-actions" :size="4">
                  <Button
                    v-if="mode === 'catalog'"
                    type="link"
                    size="small"
                    @click="openProduct(record as Product)"
                  >
                    维护档案
</Button><Button
                    v-if="mode === 'catalog'"
                    type="link"
                    size="small"
                    @click="filesProduct = record as Product"
                  >
                    标准资料
</Button><Button
                    v-if="mode === 'catalog'"
                    type="link"
                    size="small"
                    danger
                    @click="confirmDelete(record as Product)"
                  >
                    删除
</Button><Button
                    v-if="mode === 'prices'"
                    type="link"
                    @click="openPrice(record as ProductPrice)"
                  >
                    调整 / 停用
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </div>
      </Card>
      <p v-if="mode === 'catalog'" class="catalog-footnote">
        完善规格、单位等资料后即可选入合同；历史合同保留保存时的产品信息。
      </p>
      <ProductImportDialog
        v-if="importMounted"
        :open="importOpen"
        :company-id="companyId"
        @close="importOpen = false"
        @imported="load(true)"
      />
      <ProductDetailDrawer
        :open="detailOpen"
        :product="selectedProduct"
        @close="entityDetail.close"
        @edit="openProduct"
        @remove="confirmDelete"
        @refresh="refreshProductDetail"
      />
      <ProductEditor
        :company-id="companyId"
        :open="editorOpen"
        :product="selectedProduct"
        @close="closeEditor"
        @saved="productSaved"
      />
      <Drawer
        :open="Boolean(filesProduct)"
        :title="`产品标准资料 · ${filesProduct?.displayName || filesProduct?.name || ''}`"
        width="min(900px, 96vw)"
        @close="filesProduct = undefined"
      >
        <ProductFiles
          v-if="filesProduct"
          :company-id="companyId"
          :product-id="filesProduct.id"
          @changed="load()"
        />
      </Drawer>
      <Modal
        :open="Boolean(deletingProduct)"
        title="删除产品档案"
        ok-text="确认删除"
        cancel-text="取消"
        :confirm-loading="deleting"
        :ok-button-props="{ danger: true }"
        :cancel-button-props="{ disabled: deleting }"
        :closable="!deleting"
        :mask-closable="!deleting"
        :keyboard="!deleting"
        @ok="removeProduct"
        @cancel="!deleting && (deletingProduct = undefined)"
      >
        <p>
          确认删除“{{
            deletingProduct?.displayName || deletingProduct?.name
          }}”（{{ deletingProduct?.code }}）？
        </p>
        <p>
          删除后不再出现在产品目录、销售价格和合同选品中。已被合同、库存或采购分派引用的产品不能删除，可在维护档案中停用；历史业务资料会保留。
        </p>
        <Alert
          v-if="deleteError"
          :message="deleteError"
          type="error"
          show-icon
        />
        <Button
          v-if="deleteError"
          :disabled="deleting"
          type="link"
          @click="maintainInstead"
        >
          前往维护档案 / 停用
        </Button>
      </Modal>
      <Modal
        v-model:open="priceOpen"
        title="维护销售参考价"
        :confirm-loading="busy"
        :mask-closable="false"
        @ok="savePrice"
      >
        <Alert v-if="priceError" type="error" show-icon :message="priceError" />
        <Form layout="vertical">
          <Form.Item label="产品与规格" required>
            <Space>
              <span>{{ priceProductName || '尚未选择产品' }}</span><Button
                :disabled="Boolean(priceForm.id)"
                @click="productPickerOpen = true"
              >
                选择产品
              </Button>
            </Space>
</Form.Item><Form.Item label="币种 / 税费口径" required>
            <Space>
              <Select
                v-model:value="priceForm.currency"
                :disabled="Boolean(priceForm.id)"
                :options="currencyOptions"
                style="width: 150px"
              /><Select
                v-model:value="priceForm.taxBasis"
                :disabled="Boolean(priceForm.id)"
                :options="taxOptions"
                style="width: 150px"
              />
            </Space>
</Form.Item><Form.Item
            :label="`销售参考价 / ${priceForm.unit || '产品单位'}`"
            required
          >
            <InputNumber
              v-model:value="priceForm.unitPrice"
              :min="0"
              string-mode
              style="width: 100%"
            />
</Form.Item><Form.Item label="有效期" required>
            <Space>
              <Input v-model:value="priceForm.validFrom" type="date" /><span>至</span><Input v-model:value="priceForm.validUntil" type="date" />
            </Space>
</Form.Item><Checkbox v-model:checked="priceForm.active"> 启用此价格 </Checkbox>
        </Form>
      </Modal>
      <ProductPicker
        single
        :company-id="companyId"
        :open="productPickerOpen"
        @close="productPickerOpen = false"
        @selected="selectPriceProduct"
      />
    </div>
  </Page>
</template>

<style scoped>
.center-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.catalog-header {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px 8px;
}

.catalog-eyebrow {
  margin-bottom: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.catalog-header h1 {
  margin: 0;
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.5px;
}

.catalog-header p {
  margin: 6px 0 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.catalog-filters {
  display: grid;
  grid-template-columns:
    minmax(240px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr)
    auto;
  gap: 16px;
  align-items: end;
  padding: 6px 4px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.catalog-filter {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.catalog-filter-actions,
.catalog-list-heading,
.catalog-list-title,
.catalog-page-summary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.catalog-list-heading {
  flex-wrap: wrap;
  justify-content: space-between;
  padding: 9px 4px 3px;
}

.catalog-list-title h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.catalog-count {
  padding: 1px 8px;
  font-size: 12px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: 6px;
}

.catalog-page-summary {
  gap: 18px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.catalog-ready {
  color: #16a34a;
}

.catalog-pending {
  color: #d97706;
}

.catalog-product-cell {
  display: flex;
  gap: 12px;
  align-items: center;
}

.catalog-thumbnail {
  display: flex;
  flex: 0 0 48px;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.catalog-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.catalog-product-copy {
  flex: 1;
  min-width: 0;
}

.catalog-category {
  font-size: 12px;
}

.catalog-empty {
  padding: 30px 0;
}

.catalog-empty p {
  margin: 8px 0 18px;
  color: hsl(var(--muted-foreground));
}

.catalog-footnote {
  margin: 0 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 900px) {
  .catalog-header {
    flex-direction: column;
    gap: 14px;
    align-items: flex-start;
  }

  .catalog-filters {
    grid-template-columns: 1fr 1fr;
  }

  .catalog-search {
    grid-column: 1 / -1;
  }

  .catalog-filter-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 480px) {
  .catalog-filters {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .catalog-page-summary {
    gap: 10px;
  }
}

.muted {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.catalog-table .cell-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 20px;
  white-space: nowrap;
}

.catalog-table .muted {
  margin-top: 0;
  line-height: 18px;
}

.product-detail-link {
  width: 100%;
  padding: 0;
  font-weight: 600;
  color: #1677ff;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.product-detail-link:hover {
  text-decoration: underline;
}

.product-detail-link:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: 2px;
}

.catalog-table :deep(.ant-table.ant-table-small .ant-table-thead > tr > th) {
  padding: 8px 12px;
}

.catalog-table :deep(.ant-table.ant-table-small .ant-table-tbody > tr > td) {
  padding: 8px 12px;
  vertical-align: middle;
}

.catalog-table :deep(.catalog-actions) {
  white-space: nowrap;
}

.catalog-table :deep(.catalog-actions .ant-btn) {
  padding-inline: 4px;
}
</style>
