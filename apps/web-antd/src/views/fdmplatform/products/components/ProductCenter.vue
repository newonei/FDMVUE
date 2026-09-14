<script setup lang="ts">
import type {
  Product,
  ProductPrice,
  TaxBasis,
} from '#/api/fdmplatform/products';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
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
const columns = computed(() =>
  props.mode === 'catalog'
    ? [
        { title: '产品 / SKU', key: 'product', width: 280 },
        { title: '分类', dataIndex: 'category', width: 180, ellipsis: true },
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
      <Card :title="`产品中心 · ${title}`" size="small">
        <template #extra>
          <Button size="small" :loading="loading" @click="load()">
            刷新资料
          </Button>
        </template>
        <div class="center-stack">
          <Alert
            type="info"
            show-icon
            :message="
              mode === 'catalog'
                ? '自行建立本业务产品档案，维护规格、单位、包装和标准资料，创建合同时直接选择带入。已有合同保留保存时的资料与成交价格。'
                : '为本业务产品维护销售参考价，按币种、单位、税费口径和有效期匹配，共用产品及销售价格。'
            "
          />
          <Space wrap>
            <Input
              v-if="mode === 'catalog'"
              v-model:value="keyword"
              placeholder="名称 / SKU 编号"
              allow-clear
              style="width: 250px"
              @press-enter="load(true)"
            />
            <Input
              v-if="mode === 'catalog'"
              v-model:value="category"
              placeholder="分类"
              allow-clear
              style="width: 150px"
              @press-enter="load(true)"
            />
            <Select
              v-if="mode === 'catalog'"
              v-model:value="active"
              :options="[
                { value: 'true', label: '已启用' },
                { value: 'false', label: '未启用' },
              ]"
              placeholder="全部状态"
              allow-clear
              style="width: 140px"
              @change="load(true)"
            />
            <Select
              v-if="mode === 'prices'"
              v-model:value="currency"
              :options="currencyOptions"
              allow-clear
              placeholder="全部币种"
              style="width: 140px"
              @change="load(true)"
            />
            <Button type="primary" @click="load(true)">查询</Button>
            <Button v-if="mode === 'catalog'" @click="openProduct()">
              新建产品
            </Button>
            <Button v-if="mode === 'prices'" @click="openPrice()">
              新增销售价格
            </Button>
          </Space>
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
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'product'">
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
              </template>
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
                <Tag :color="record.selectable ? 'green' : 'orange'">
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
