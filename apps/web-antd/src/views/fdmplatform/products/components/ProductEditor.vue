<script setup lang="ts">
import type {
  Product,
  ProductAttributeOption,
  ProductAttributeOptions,
  ProductAttributes,
  ProductCategory,
} from '#/api/fdmplatform/products';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Form,
  Input,
  message,
  Select,
  Space,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getProductAttributeOptions,
  getProductCategoryList,
  saveProduct,
} from '#/api/fdmplatform/products';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { errorText } from '../../data';
import { categoryOptions } from '../category-model';
import { manufacturingError, manufacturingPayload } from '../manufacturing';
import { missingProductFields } from '../model';
import ProductManufacturingFields from './ProductManufacturingFields.vue';
import ProductStageSelect from './ProductStageSelect.vue';

const props = defineProps<{
  companyId: number;
  open: boolean;
  product?: Product;
}>();
const emit = defineEmits<{ close: []; saved: [product: Product] }>();
const form = reactive<Record<string, string>>({});
const manufacturing = ref<ProductAttributes>({});
const active = ref(false);
const loading = ref(false);
const panelError = ref('');
const key = ref('');
const categories = ref<ProductCategory[]>([]);
const attributeOptions = ref<ProductAttributeOptions>({
  stages: [],
  colors: [],
  textures: [],
  matTypes: [],
});
let optionsSequence = 0;
const categorySelectOptions = computed(() =>
  categoryOptions(categories.value, props.product?.categoryId),
);
async function loadOptions() {
  const run = ++optionsSequence;
  const results = await Promise.allSettled([
    getProductCategoryList(props.companyId),
    getProductAttributeOptions(),
  ]);
  if (run !== optionsSequence || !props.open) return;
  const [categoryResult, attributesResult] = results;
  if (categoryResult.status === 'fulfilled')
    categories.value = categoryResult.value;
  if (attributesResult.status === 'fulfilled')
    attributeOptions.value = attributesResult.value;
  const errors = results.filter(
    (result) => result.status === 'rejected',
  ) as PromiseRejectedResult[];
  if (errors.length > 0)
    panelError.value = errors
      .map((result) => errorText(result.reason))
      .join('；');
}
// 前几项与金智产品档案顺序一致
const fields = [
  ['code', 'SKU 编号'],
  ['name', '产品名称'],
  ['model', '产品型号'],
  ['weight', '产品克重'],
  ['material', '材质'],
  ['spec', '产品规格'],
  ['printing', '定制说明'],
  ['categoryId', '产品类别'],
  ['unit', '单位'],
  ['displayName', '销售展示名称'],
  ['size', '尺寸'],
  ['shape', '形状'],
  ['packaging', '标准包装'],
  ['imageUrl', '产品图片地址'],
];
const productionFields = [
  ['productStage', '生产分类'],
  ['matType', '垫子类型'],
  ['textureFront', '正面压花'],
  ['textureBack', '反面压花'],
] as const;
type ProductionField = (typeof productionFields)[number][0];
function retainedOptions(
  options: ProductAttributeOption[],
  field: ProductionField,
) {
  const value = form[field];
  if (!value || options.some((item) => item.value === value)) return options;
  const label = props.product?.[`${field}Label`] || value;
  return [...options, { value, label }];
}
function selectOptions(field: Exclude<ProductionField, 'productStage'>) {
  if (field === 'matType')
    return retainedOptions(attributeOptions.value.matTypes, field);
  return retainedOptions(
    field.startsWith('texture')
      ? attributeOptions.value.textures
      : attributeOptions.value.colors,
    field,
  );
}
const stageOptions = computed(() =>
  retainedOptions(attributeOptions.value.stages, 'productStage').map(
    (item) => ({
      ...item,
      group: 'group' in item ? String(item.group) : '其他',
    }),
  ),
);
watch(
  () => [props.open, props.product?.id],
  () => {
    ++optionsSequence;
    if (!props.open) return;
    for (const [field] of [...fields, ...productionFields, ['color']])
      form[field!] = String(
        (props.product as unknown as Record<string, unknown> | undefined)?.[
          field!
        ] ?? '',
      );
    active.value = props.product?.active ?? false;
    manufacturing.value = {
      colorMode: props.product?.colorMode ?? 'UNKNOWN',
      constructionType: props.product?.constructionType ?? 'UNKNOWN',
      colorCode: props.product?.colorCode,
      colorCodeLabel: props.product?.colorCodeLabel,
      frontColor: props.product?.frontColor,
      frontColorLabel: props.product?.frontColorLabel,
      backColor: props.product?.backColor,
      backColorLabel: props.product?.backColorLabel,
      finishedThicknessMm: props.product?.finishedThicknessMm,
      frontThicknessMm: props.product?.frontThicknessMm,
      backThicknessMm: props.product?.backThicknessMm,
    };
    key.value = newIdempotencyKey();
    panelError.value = '';
    void loadOptions();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++optionsSequence;
});
async function save() {
  if (!String(form.code).trim() || !String(form.name).trim()) {
    panelError.value = '请填写 SKU 编号和产品名称';
    return;
  }
  if (!form.categoryId) {
    panelError.value = '请选择产品分类；没有合适的分类可先在“产品分类”中新增';
    return;
  }
  const structureError = manufacturingError(manufacturing.value);
  if (structureError) {
    panelError.value = structureError;
    return;
  }
  loading.value = true;
  panelError.value = '';
  try {
    const { spec, ...fieldsWithoutSpec } = form;
    const result = await saveProduct({
      ...fieldsWithoutSpec,
      ...manufacturingPayload(manufacturing.value),
      specification: spec,
      active: active.value,
      companyId: props.companyId,
      id: props.product?.id,
      expectedVersion: props.product?.version,
      idempotencyKey: key.value,
    });
    message.success(
      result.selectable
        ? '产品档案已保存，可用于合同选品'
        : `产品已保存，待补齐：${missingProductFields(result.missingFields) || '启用状态'}`,
    );
    emit('saved', result);
    emit('close');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <FdmResizableDrawer
    resize-key="product-editor"
    :open="open"
    :title="product ? '产品档案' : '新建产品档案'"
    width="min(760px, 96vw)"
    :mask-closable="false"
    @close="emit('close')"
  >
    <Space direction="vertical" :size="18" style="width: 100%">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        type="info"
        show-icon
        message="在产品中心建立和维护本业务产品。规格、单位、包装等填写一次，创建合同时直接选择带入；资料未齐可先保存，启用后供业务选用。"
      />
      <h3 class="section-title">基本资料</h3>
      <Form layout="vertical" class="product-fields">
        <Form.Item
          v-for="[field, title] in fields"
          :key="field"
          :label="title"
          :required="['categoryId', 'code', 'name'].includes(field!)"
        >
          <Select
            v-if="field === 'categoryId'"
            v-model:value="form[field]"
            :aria-label="title"
            :options="categorySelectOptions"
            placeholder="选择产品分类"
            show-search
            option-filter-prop="label"
            :list-height="360"
            allow-clear
          />
          <AutoComplete
            v-else-if="field === 'shape'"
            v-model:value="form[field]"
            :aria-label="title"
            :options="[{ value: '圆角' }, { value: '方形' }]"
            placeholder="选择圆角、方形，也可输入其他形状"
            :maxlength="64"
          />
          <Input
            v-else
            v-model:value="form[field!]"
            :aria-label="title"
            :placeholder="
              field === 'unit'
                ? '例如：张、个、套；请按实际资料填写'
                : field === 'weight'
                  ? '例如：800g'
                  : undefined
            "
          />
        </Form.Item>
      </Form>
      <ProductManufacturingFields
        v-model:value="manufacturing"
        :colors="attributeOptions.colors"
      />
      <section class="production-section">
        <h3 class="section-title">生产分类与工艺属性</h3>
        <p class="section-hint">
          先选大类，再选板材、开片板材、片材等具体类型。正反压花分别维护，未压花的一面可留空。
        </p>
        <Form layout="vertical" class="product-fields">
          <Form.Item
            v-for="[field, title] in productionFields"
            :key="field"
            :label="title"
          >
            <ProductStageSelect
              v-if="field === 'productStage'"
              :value="form[field]"
              :options="stageOptions"
              placeholder="选择生产大类 / 具体类型（选填）"
              :aria-label="title"
              @update:value="(value) => (form[field] = value ?? '')"
            />
            <Select
              v-else
              :value="form[field] || undefined"
              :options="selectOptions(field)"
              :aria-label="title"
              :placeholder="
                field.startsWith('texture')
                  ? '不压花 / 选择压花纹路'
                  : '请选择（选填）'
              "
              show-search
              option-filter-prop="label"
              allow-clear
              @update:value="(value) => (form[field] = String(value ?? ''))"
            />
          </Form.Item>
          <Form.Item label="颜色原文">
            <Input
              v-model:value="form.color"
              aria-label="颜色原文"
              placeholder="保留旧产品的颜色描述"
            />
          </Form.Item>
        </Form>
        <p class="section-hint">
          旧产品可保留颜色原文，新增属性可逐步补齐。颜色与压花从已维护选项中选择，保存后在订单和任务选品中展示。
        </p>
      </section>
      <Checkbox v-model:checked="active">
        启用产品（必要资料完整后可选入合同）
      </Checkbox>
      <Alert
        type="info"
        message="保存产品后，从产品列表的“标准资料”上传说明书与规格文件；选入合同时保留对应资料版本。"
      />
    </Space>
    <template #footer>
      <Space>
        <Button @click="emit('close')">取消</Button><Button type="primary" :loading="loading" @click="save">
          保存产品档案
        </Button>
      </Space>
    </template>
  </FdmResizableDrawer>
</template>

<style scoped>
.section-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.section-hint {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.production-section {
  padding-top: 16px;
  border-top: 1px solid hsl(var(--border));
}

.product-fields :deep(.ant-cascader) {
  width: 100%;
}

.product-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

@media (max-width: 600px) {
  .product-fields {
    grid-template-columns: 1fr;
  }
}
</style>
