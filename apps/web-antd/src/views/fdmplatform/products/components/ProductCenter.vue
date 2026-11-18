<script setup lang="ts">
import type {
  Product,
  ProductAttributeOptions,
  ProductPrice,
  ProductQuery,
  TaxBasis,
} from '#/api/fdmplatform/products';

import {
  computed,
  defineAsyncComponent,
  onActivated,
  onMounted,
  reactive,
  ref,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  getProductAttributeOptions,
  getProductPrices,
  getProducts,
  saveProductPrice,
} from '#/api/fdmplatform/products';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { errorText, money } from '../../data';
import { formatTemporalField } from '../../date-display';
import { useEntityDetail } from '../../documents/useEntityDetail';
import {
  productCategoryGroupName,
  productCategoryGroups,
} from '../category-model';
import { currencyOptions, taxOptions } from '../model';
import ProductCatalog from './ProductCatalog.vue';
import ProductDetailDrawer from './ProductDetailDrawer.vue';
import ProductEditor from './ProductEditor.vue';
import ProductFiles from './ProductFiles.vue';
import ProductPicker from './ProductPicker.vue';

import '../../components/compact-tables.css';

const props = defineProps<{ mode: 'catalog' | 'prices' }>();
const ProductImportDialog = defineAsyncComponent(
  () => import('./ProductImportDialog.vue'),
);
const ProductColorRepairDialog = defineAsyncComponent(
  () => import('./ProductColorRepairDialog.vue'),
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
const panelError = ref('');
const loading = ref(false);
const pageNo = ref(catalogPage('catalogPage', 1));
const pageSize = ref(Math.min(catalogPage('catalogSize', 10), 100));
const initialCodeOrder = catalogQuery('catalogCodeOrder');
const codeOrder = ref<ProductQuery['codeOrder']>(
  initialCodeOrder === 'asc' || initialCodeOrder === 'desc'
    ? initialCodeOrder
    : undefined,
);
const total = ref(0);
const keyword = ref(catalogQuery('catalogKeyword'));
const productStage = ref(catalogQuery('catalogProductStage') || undefined);
const appliedProductStage = ref(productStage.value);
const stageOptions = ref<ProductAttributeOptions['stages']>([]);
/** 分类 id：undefined 为全部分类，空字符串为未分类 */
const category = ref<string | undefined>(
  props.mode === 'catalog' && typeof route.query.catalogCategory === 'string'
    ? route.query.catalogCategory
    : undefined,
);
const initialCategoryGroup = catalogQuery('catalogCategoryGroup');
const categoryGroup = ref<ProductQuery['categoryGroup']>();
if (category.value === undefined) {
  categoryGroup.value =
    initialCategoryGroup === 'UNASSIGNED'
      ? initialCategoryGroup
      : productCategoryGroups.find(
          ({ value }) => value === initialCategoryGroup,
        )?.value;
}
/** 列表标题显示的分类名称 */
const categoryLabel = ref<string | undefined>(
  catalogQuery('catalogCategoryLabel') || undefined,
);
const categoryTitle = computed(() => {
  if (categoryGroup.value === 'UNASSIGNED') return '待归类';
  const group = productCategoryGroupName(categoryGroup.value);
  if (group) return group;
  if (category.value === undefined) return '全部产品';
  return categoryLabel.value || (category.value ? '所选分类' : '未分类');
});
/** 分类计数跟随已提交的搜索条件，输入过程中不重算 */
const appliedKeyword = ref(keyword.value);
const categoryRefresh = ref(0);
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
const colorRepairOpen = ref(false);
const colorRepairMounted = ref(false);

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
let activatedOnce = false;
const hasFilters = computed(() =>
  Boolean(
    keyword.value ||
    productStage.value ||
    category.value !== undefined ||
    categoryGroup.value !== undefined ||
    active.value !== undefined,
  ),
);
const codeSortOrder = computed(() => {
  if (codeOrder.value === undefined) return null;
  return codeOrder.value === 'asc' ? ('ascend' as const) : ('descend' as const);
});
const priceColumns = [
  { title: '产品', key: 'priceProduct', width: 240 },
  { title: '销售参考价', key: 'price' },
  { title: '单位', dataIndex: 'unit' },
  { title: '税费口径', key: 'tax' },
  { title: '有效期', key: 'valid' },
  { title: '启用', key: 'active' },
  { title: '操作', key: 'action' },
];
onMounted(() => {
  void load();
  if (props.mode === 'catalog') {
    void getProductAttributeOptions()
      .then((options) => {
        stageOptions.value = options.stages;
      })
      .catch((error) => {
        panelError.value = errorText(error);
      });
  }
});
onActivated(() => {
  if (activatedOnce && props.mode === 'catalog') refreshCatalog();
  activatedOnce = true;
});
function resetFilters() {
  keyword.value = '';
  productStage.value = undefined;
  category.value = undefined;
  categoryGroup.value = undefined;
  categoryLabel.value = undefined;
  active.value = undefined;
  void load(true);
}
function chooseCategory(value: string | undefined, label?: string) {
  category.value = value;
  categoryGroup.value = undefined;
  categoryLabel.value = label;
  void load(true);
}
function chooseCategoryGroup(
  value: NonNullable<ProductQuery['categoryGroup']>,
) {
  category.value = undefined;
  categoryGroup.value = value;
  categoryLabel.value = undefined;
  void load(true);
}
function refreshCategories() {
  categoryRefresh.value++;
}
function refreshCatalog() {
  refreshCategories();
  void load();
}
function productsImported() {
  refreshCategories();
  void load(true);
}
function openImport() {
  importMounted.value = true;
  importOpen.value = true;
}
function openColorRepair() {
  colorRepairMounted.value = true;
  colorRepairOpen.value = true;
}
async function load(reset = false) {
  if (reset) pageNo.value = 1;
  appliedKeyword.value = keyword.value;
  appliedProductStage.value = productStage.value;
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
        codeOrder: codeOrder.value,
        keyword: keyword.value,
        productStage: productStage.value,
        categoryId: category.value,
        categoryGroup: categoryGroup.value,
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
function changeTable(
  page: { current?: number; pageSize?: number },
  _filters: unknown,
  sorter: unknown,
  extra?: { action?: string },
) {
  if (props.mode === 'catalog' && extra?.action === 'sort') {
    const current = (Array.isArray(sorter) ? sorter[0] : sorter) as
      | undefined
      | { columnKey?: string; order?: 'ascend' | 'descend' | null };
    codeOrder.value = undefined;
    if (current?.columnKey === 'code' && current.order) {
      codeOrder.value = current.order === 'ascend' ? 'asc' : 'desc';
    }
    pageNo.value = 1;
  } else {
    pageNo.value = page.current ?? 1;
  }
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
      catalogProductStage: productStage.value,
      catalogCategory: category.value,
      catalogCategoryGroup: categoryGroup.value,
      catalogCategoryLabel: categoryLabel.value,
      catalogActive: active.value,
      catalogPage: String(pageNo.value),
      catalogSize: String(pageSize.value),
      catalogCodeOrder: codeOrder.value,
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
  refreshCategories();
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
    refreshCategories();
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
      <ProductCatalog
        v-if="mode === 'catalog'"
        v-model:keyword="keyword"
        v-model:active="active"
        v-model:product-stage="productStage"
        :applied-keyword="appliedKeyword"
        :applied-product-stage="appliedProductStage"
        :category="category"
        :category-group="categoryGroup"
        :category-refresh="categoryRefresh"
        :category-title="categoryTitle"
        :code-sort-order="codeSortOrder"
        :company-id="companyId"
        :has-filters="hasFilters"
        :loading="loading"
        :page-no="pageNo"
        :page-size="pageSize"
        :products="products"
        :stage-options="stageOptions"
        :total="total"
        @category="chooseCategory"
        @category-group="chooseCategoryGroup"
        @change-table="changeTable"
        @color-repair="openColorRepair"
        @create="openProduct()"
        @detail="openProductDetail"
        @edit="openProduct"
        @files="filesProduct = $event"
        @import="openImport"
        @refresh="refreshCatalog"
        @remove="confirmDelete"
        @reset="resetFilters"
        @search="load(true)"
      />
      <Card v-else title="产品中心 · 销售价格" size="small">
        <template #extra>
          <Button size="small" :loading="loading" @click="load()">
            刷新资料
          </Button>
        </template>
        <div class="center-stack">
          <Alert
            type="info"
            show-icon
            message="为本业务产品维护销售参考价，按币种、单位、税费口径和有效期匹配，共用产品及销售价格。"
          />
          <Space wrap>
            <Select
              v-model:value="currency"
              :options="currencyOptions"
              allow-clear
              placeholder="全部币种"
              style="width: 140px"
              @change="load(true)"
            />
            <Button type="primary" @click="load(true)">查询</Button>
            <Button @click="openPrice()">新增销售价格</Button>
          </Space>
          <Table
            class="fdm-business-table"
            size="small"
            table-layout="fixed"
            :data-source="prices"
            :columns="priceColumns"
            row-key="id"
            :loading="loading"
            :scroll="{ x: 1050 }"
            :pagination="{
              current: pageNo,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count: number) => `共 ${count} 条`,
            }"
            @change="changeTable"
          >
            <template #bodyCell="{ column, record }">
              <span
                v-if="column.key === 'priceProduct'"
                class="fdm-cell-line"
                :title="record.productName || record.productId"
                >{{ record.productName || record.productId }}</span>
              <span v-else-if="column.key === 'price'">{{
                money(record.unitPrice, record.currency)
              }}</span>
              <span v-else-if="column.key === 'tax'">{{
                record.taxBasis === 'TAX_INCLUDED' ? '含税' : '未税'
              }}</span>
              <span v-else-if="column.key === 'valid'">
                {{ formatTemporalField('validFrom', record.validFrom) }} ～
                {{
                  record.validUntil
                    ? formatTemporalField('validUntil', record.validUntil)
                    : '长期'
                }}
              </span>
              <Tag
                v-else-if="column.key === 'active'"
                :color="record.active ? 'green' : 'default'"
              >
                {{ record.active ? '启用' : '停用' }}
              </Tag>
              <Button
                v-else-if="column.key === 'action'"
                type="link"
                @click="openPrice(record as ProductPrice)"
              >
                调整 / 停用
              </Button>
            </template>
          </Table>
        </div>
      </Card>
      <ProductImportDialog
        v-if="importMounted"
        :open="importOpen"
        :company-id="companyId"
        @close="importOpen = false"
        @imported="productsImported"
      />
      <ProductDetailDrawer
        :open="detailOpen"
        :product="selectedProduct"
        @close="entityDetail.close"
        @edit="openProduct"
        @remove="confirmDelete"
        @refresh="refreshProductDetail"
      />
      <ProductColorRepairDialog
        v-if="colorRepairMounted"
        :open="colorRepairOpen"
        :company-id="companyId"
        @close="colorRepairOpen = false"
        @updated="productsImported"
        @edit="
          (id) => {
            colorRepairOpen = false;
            openProductDetail(id);
          }
        "
      />
      <ProductEditor
        :company-id="companyId"
        :open="editorOpen"
        :product="selectedProduct"
        @close="closeEditor"
        @saved="productSaved"
      />
      <FdmResizableDrawer
        resize-key="product-files"
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
      </FdmResizableDrawer>
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
</style>
