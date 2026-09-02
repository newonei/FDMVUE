<script lang="ts" setup>
import type { FdmProductApi } from '#/api/fdmproduct/product';

import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Image,
  Input,
  message,
  Select,
  Spin,
  Switch,
} from 'ant-design-vue';

import {
  createFdmProduct,
  getFdmProduct,
  getFdmProductCategoryList,
  getFdmProductFormOptions,
  updateFdmProduct,
} from '#/api/fdmproduct/product';
import { useFdmProductAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import ProductCategoryDrawer from '../components/ProductCategoryDrawer.vue';
import ProductSkuEditor from '../components/ProductSkuEditor.vue';
import ProductStatusTag from '../components/ProductStatusTag.vue';
import {
  buildProductSavePayload,
  buildProductUpdatePayload,
  createEmptyProductForm,
  hydrateProductForm,
  validateProductForm,
} from '../form-model';

defineOptions({ name: 'FdmProductProductForm' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const form = reactive(createEmptyProductForm());
const formOptions = ref<FdmProductApi.FormOptions>({ companies: [] });
const categories = ref<FdmProductApi.Category[]>([]);
const loading = ref(false);
const saving = ref(false);
const categoryLoading = ref(false);
const categoryDrawerOpen = ref(false);
const validationMessages = ref<string[]>([]);
let loadRequestId = 0;

const productId = computed(() => String(route.params.id || ''));
const queryCompanyId = computed(() => {
  const value = route.query.companyId;
  return String(Array.isArray(value) ? value[0] || '' : value || '');
});
const isEdit = computed(() => Boolean(productId.value));
const canCreate = computed(() =>
  hasAccessByCodes(['fdmproduct:product:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmproduct:product:update']),
);
const canSave = computed(() =>
  isEdit.value ? canUpdate.value : canCreate.value,
);
const companyOptions = computed(() =>
  formOptions.value.companies.map((item) => ({
    label: item.shortName || item.name,
    value: item.id,
  })),
);
const categoryOptions = computed(() =>
  categories.value
    .filter((item) => item.status === 0 || item.id === form.categoryId)
    .map((item) => ({ label: item.categoryName, value: item.id })),
);

useFdmProductAiContext(() => ({
  businessId: productId.value || undefined,
  companyId: form.companyId,
  context: {
    draft: { ...form },
    loading: loading.value,
    validationMessages: validationMessages.value,
  },
  contextMode: 'form',
  entityLabel:
    form.productName ||
    (isEdit.value ? `产品 ${productId.value}` : '未保存产品'),
  surfaceKey: 'product',
  volatile: true,
}));

function replaceForm(next: ReturnType<typeof createEmptyProductForm>) {
  for (const key of Object.keys(form)) Reflect.deleteProperty(form, key);
  Object.assign(form, next);
}

function resolveCompanyId(options: FdmProductApi.FormOptions) {
  const allowed = new Set(options.companies.map((item) => item.id));
  if (queryCompanyId.value && allowed.has(queryCompanyId.value))
    return queryCompanyId.value;
  if (options.defaultCompanyId && allowed.has(options.defaultCompanyId))
    return options.defaultCompanyId;
  return options.companies[0]?.id;
}

async function initialize() {
  const requestId = ++loadRequestId;
  loading.value = true;
  validationMessages.value = [];
  try {
    const options = await getFdmProductFormOptions();
    if (requestId !== loadRequestId) return;
    formOptions.value = options;
    const companyId = resolveCompanyId(options);
    if (!companyId) {
      replaceForm(createEmptyProductForm());
      categories.value = [];
      return;
    }
    if (queryCompanyId.value !== companyId) {
      await router.replace({ query: { ...route.query, companyId } });
      return;
    }
    const [categoryResult, detail] = await Promise.all([
      getFdmProductCategoryList({ companyId }),
      productId.value
        ? getFdmProduct(productId.value, companyId)
        : Promise.resolve(undefined),
    ]);
    if (requestId !== loadRequestId) return;
    categories.value = categoryResult;
    replaceForm(
      detail ? hydrateProductForm(detail) : createEmptyProductForm(companyId),
    );
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

async function loadCategories() {
  if (!form.companyId) return;
  categoryLoading.value = true;
  try {
    categories.value = await getFdmProductCategoryList({
      companyId: form.companyId,
    });
  } finally {
    categoryLoading.value = false;
  }
}

function changeCompany(value: unknown) {
  const companyId = String(value || '');
  if (isEdit.value || companyId === queryCompanyId.value) return;
  void router.replace({ query: { ...route.query, companyId } });
}

async function save() {
  if (!canSave.value || saving.value) return;
  const issues = validateProductForm(form);
  validationMessages.value = issues.map((item) => item.message);
  if (issues.length > 0) {
    message.error(issues[0]?.message || '请检查产品资料');
    return;
  }
  saving.value = true;
  try {
    let id: string;
    if (isEdit.value) {
      await updateFdmProduct(buildProductUpdatePayload(form));
      id = form.id!;
    } else {
      id = await createFdmProduct(buildProductSavePayload(form));
    }
    message.success(isEdit.value ? '产品资料已更新' : '产品已创建');
    await router.replace({
      path: `/fdmbase/product-center/detail/${id}`,
      query: { companyId: form.companyId },
    });
  } finally {
    saving.value = false;
  }
}

function backToList() {
  void router.push({
    path: '/fdmbase/product-center',
    query: form.companyId ? { companyId: form.companyId } : {},
  });
}

watch(() => [productId.value, queryCompanyId.value], initialize, {
  immediate: true,
});
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      isEdit
        ? `CAS 版本 ${form.version ?? '—'}；SKU 数组为完整权威集合`
        : '创建公司隔离的 SPU、SKU 与 EXPORT 销售资料。'
    "
    :title="isEdit ? `编辑产品 ${form.productCode}` : '新建产品'"
  >
    <template #extra>
      <Button @click="backToList">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>返回列表
      </Button>
      <ProductStatusTag :status="form.status" />
    </template>

    <ProductCategoryDrawer
      v-model:open="categoryDrawerOpen"
      :categories="categories"
      :company-id="form.companyId"
      :loading="categoryLoading"
      @changed="loadCategories"
    />

    <Spin :spinning="loading">
      <div class="product-form">
        <Alert
          v-if="formOptions.companies.length === 0"
          class="product-form__alert"
          message="当前账号没有可管理的公司，请先配置公司数据权限。"
          show-icon
          type="warning"
        />
        <Alert
          v-if="validationMessages.length"
          class="product-form__alert"
          closable
          type="error"
          @close="validationMessages = []"
        >
          <template #message>请完成以下产品资料</template>
          <template #description>
            <ul>
              <li v-for="item in validationMessages.slice(0, 8)" :key="item">
                {{ item }}
              </li>
            </ul>
          </template>
        </Alert>

        <section class="product-form__section">
          <h2><span>SPU 基础资料</span></h2>
          <div class="product-form__grid">
            <label class="product-form__field"><span>所属公司 <b>*</b></span><Select
                :disabled="isEdit"
                :options="companyOptions"
                :value="form.companyId"
                placeholder="请选择公司"
                show-search
                @change="changeCompany"
              /><small>分类、产品和 SKU 均按公司严格隔离</small></label>
            <label class="product-form__field"><span>产品分类 <b>*</b></span>
              <div class="product-form__category">
                <Select
                  v-model:value="form.categoryId"
                  :loading="categoryLoading"
                  :options="categoryOptions"
                  placeholder="选择当前公司的分类"
                  show-search
                /><Button @click="categoryDrawerOpen = true"><IconifyIcon icon="lucide:settings-2" /></Button></div></label>
            <label class="product-form__field"><span>产品编码 <b>*</b></span><Input
                v-model:value="form.productCode"
                :disabled="isEdit"
                :maxlength="64"
                placeholder="如 MAT-001"
            /></label>
            <label class="product-form__field"><span>产品名称 <b>*</b></span><Input
                v-model:value="form.productName"
                :maxlength="200"
                show-count
            /></label>
            <label class="product-form__field"><span>基础单位 <b>*</b></span><Input
                v-model:value="form.baseUnit"
                :maxlength="32"
                placeholder="如 PCS / SET"
            /></label>
            <label class="product-form__field"><span>产品状态</span><Switch
                :checked="form.status === 0"
                checked-children="启用"
                un-checked-children="停用"
                @change="form.status = $event ? 0 : 1"
            /></label>
          </div>
        </section>

        <section class="product-form__section">
          <h2><span>产品图片与备注</span></h2>
          <div class="product-form__media">
            <Image v-if="form.imageUrl" :src="form.imageUrl" :width="128" />
            <div v-else class="product-form__image-placeholder">
              <IconifyIcon icon="lucide:image" :width="32" /><span>产品图</span>
            </div>
            <div class="product-form__media-fields">
              <label class="product-form__field"><span>图片 URL</span><Input
                  v-model:value="form.imageUrl"
                  :maxlength="1024"
                  placeholder="系统文件服务 URL"
              /></label>
              <label class="product-form__field"><span>产品备注</span><Input.TextArea
                  v-model:value="form.remark"
                  :auto-size="{ minRows: 3, maxRows: 6 }"
                  :maxlength="1000"
                  show-count
              /></label>
            </div>
          </div>
        </section>

        <section class="product-form__section">
          <h2><span>SKU 与 EXPORT 销售资料</span></h2>
          <ProductSkuEditor
            v-model="form.skus"
            :category-options="categoryOptions"
            :default-unit="form.baseUnit"
          />
        </section>

        <div class="product-form__footer">
          <div>
            <strong>{{ form.productCode || '新产品' }}</strong><span>删除已有 SKU 行后，后端会在 CAS 成功时软删缺失的 SKU 与 EXPORT
              profile。</span>
          </div>
          <div>
            <Button @click="backToList">取消</Button><Button
              :disabled="!canSave || !form.companyId"
              :loading="saving"
              type="primary"
              @click="save"
            >
              <template #icon><IconifyIcon icon="lucide:save" /></template>保存产品
            </Button>
          </div>
        </div>
      </div>
    </Spin>
  </Page>
</template>

<style scoped>
.product-form {
  max-width: 1540px;
  margin: 0 auto;
  color: #172033;
}

.product-form__alert,
.product-form__section {
  margin-bottom: 14px;
}

.product-form__section {
  padding: 18px 20px 20px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.product-form__section h2 {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 20px;
  margin: -18px -20px 18px;
  font-size: 14px;
  color: #0f4c81;
  background: #f3f8fd;
  border-bottom: 1px solid #dbeaf7;
}

.product-form__section h2::before {
  width: 3px;
  height: 14px;
  margin-right: 8px;
  content: '';
  background: #1677ff;
  border-radius: 2px;
}

.product-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 28px;
}

.product-form__field,
.product-form__media-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.product-form__field > span:first-child {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.product-form__field small,
.product-form__footer span {
  font-size: 12px;
  color: #64748b;
}

.product-form__field b {
  color: #ef4444;
}

.product-form__category {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.product-form__media {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.product-form__image-placeholder {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  justify-content: center;
  width: 128px;
  height: 128px;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}

.product-form__footer,
.product-form__footer > div {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.product-form__footer {
  position: sticky;
  bottom: 0;
  z-index: 20;
  padding: 12px 18px;
  background: rgb(255 255 255 / 96%);
  border: 1px solid #dbe3ed;
  border-radius: 6px 6px 0 0;
  box-shadow: 0 -5px 18px rgb(15 23 42 / 8%);
}

.product-form__footer > div:first-child {
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}

@media (max-width: 760px) {
  .product-form__grid,
  .product-form__media {
    grid-template-columns: 1fr;
  }

  .product-form__footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
