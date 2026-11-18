<script setup lang="ts">
import type {
  ProductAttributeOption,
  ProductAttributeOptions,
  ProductCategory,
} from '#/api/fdmplatform/products';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Tabs,
} from 'ant-design-vue';

import {
  getProductAttributeOptions,
  getProductCategoryList,
} from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import { productCategoryGroupName } from '../category-model';

const props = defineProps<{
  cells?: Record<string, string>;
  companyId: number;
  open: boolean;
  rowMessage?: string;
  rowNumber?: number;
}>();
const emit = defineEmits<{
  close: [];
  save: [changes: Record<string, string>];
}>();
const { TabPane } = Tabs;

type Choices =
  | 'categories'
  | 'colorModes'
  | 'colors'
  | 'construction'
  | 'matTypes'
  | 'patternModes'
  | 'patterns'
  | 'stages'
  | 'states'
  | 'textures';
interface Field {
  key: string;
  label?: string;
  choices?: Choices;
  max?: number;
  multiline?: boolean;
  existingOnly?: boolean;
}
const sections: { fields: Field[]; key: string; label: string }[] = [
  {
    key: 'product',
    label: '基本资料',
    fields: [
      { key: '产品编号', max: 128 },
      { key: '产品名称', max: 200 },
      { key: '产品类别', choices: 'categories' },
      { key: '产品状态', choices: 'states' },
      { key: '单位', max: 64 },
      { key: '产品规格', max: 4000, multiline: true },
      { key: '产品型号', max: 200 },
      { key: '产品克重', max: 100 },
      { key: '材质', max: 200 },
    ],
  },
  {
    key: 'manufacturing',
    label: '尺寸与工艺',
    fields: [
      { key: '长度(mm)', label: '长度（mm）', max: 40 },
      { key: '宽度(mm)', label: '宽度（mm）', max: 40 },
      { key: '成品厚度(mm)', label: '成品厚度（mm）', max: 40 },
      { key: '颜色模式', choices: 'colorModes' },
      { key: '正面颜色', choices: 'colors' },
      { key: '反面颜色', choices: 'colors' },
      { key: '正面压花', label: '正面纹路', choices: 'textures' },
      { key: '反面压花', label: '反面纹路', choices: 'textures' },
      { key: '雕刻状态', choices: 'patternModes' },
      { key: '激光图案', choices: 'patterns' },
      { key: '图案生产版本', max: 100 },
      { key: '颜色编码', choices: 'colors', existingOnly: true },
      { key: '制造结构', choices: 'construction', existingOnly: true },
      { key: '正面层厚度(mm)', max: 40, existingOnly: true },
      { key: '反面层厚度(mm)', max: 40, existingOnly: true },
    ],
  },
  {
    key: 'other',
    label: '更多字段',
    fields: [
      { key: '产品阶段', choices: 'stages' },
      { key: '垫子类型', choices: 'matTypes' },
      { key: '颜色', label: '旧表颜色说明', max: 200 },
      { key: '尺寸', max: 200 },
      { key: '形状', max: 64 },
      { key: '展示名称', max: 200 },
      { key: '产品图地址', max: 4000, multiline: true },
      { key: '定制说明', max: 4000, multiline: true },
      { key: '包装要求', max: 4000, multiline: true },
      { key: '备注', max: 2000, multiline: true },
    ],
  },
];
const staticChoices = {
  colorModes: [
    { value: 'SINGLE', label: '单色' },
    { value: 'DUAL', label: '双色' },
    { value: 'UNKNOWN', label: '待确认' },
  ],
  construction: [
    { value: 'SINGLE_LAYER', label: '单层' },
    { value: 'DOUBLE_LAYER', label: '双层' },
    { value: 'UNKNOWN', label: '待确认' },
  ],
  patternModes: [
    { value: 'NONE', label: '不雕刻' },
    { value: 'LASER', label: '激光雕刻' },
    { value: 'UNKNOWN', label: '待确认' },
  ],
  states: [
    { value: '启用', label: '启用' },
    { value: '停用', label: '停用' },
  ],
};
const stageAliases = new Map([
  ['压花片材', 'EMBOSSED'],
  ['已包装', 'PACKED'],
  ['已折叠', 'FOLDED'],
  ['开片板材', 'SHEET'],
  ['成品', 'FINISHED'],
  ['板材', 'BOARD'],
  ['片材', 'CUT'],
  ['贴合片材', 'LAMINATED'],
]);

const activeSection = ref('product');
const original = ref<Record<string, string>>({});
const draft = ref<Record<string, string>>({});
const categories = ref<ProductCategory[]>();
const attributes = ref<ProductAttributeOptions>();
const loading = ref(false);
const lookupError = ref('');
let sequence = 0;
let optionsCompany: number | undefined;

const options = computed<Record<Choices, ProductAttributeOption[]>>(() => ({
  ...staticChoices,
  categories: (categories.value ?? [])
    .filter((category) => category.active)
    .map((category) => {
      const group = productCategoryGroupName(category.categoryGroup);
      return {
        value: category.name,
        label: group ? `${group} / ${category.name}` : category.name,
      };
    }),
  colors: attributes.value?.colors ?? [],
  matTypes: attributes.value?.matTypes ?? [],
  patterns: attributes.value?.patterns ?? [],
  stages: attributes.value?.stages ?? [],
  textures: [
    { value: 'NONE', label: '无纹路' },
    ...(attributes.value?.textures ?? []).filter(
      ({ value }) => value !== 'NONE',
    ),
  ],
}));
const problems = computed(
  () =>
    props.rowMessage
      ?.replace(/^导入失败[:：]\s*/, '')
      .split('；')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [],
);
const changes = computed(() =>
  Object.fromEntries(
    Object.entries(draft.value).filter(
      ([field, value]) => value !== (original.value[field] ?? ''),
    ),
  ),
);
const changedCount = computed(() => Object.keys(changes.value).length);
const visibleSections = computed(() =>
  sections.map((section) => ({
    ...section,
    fields: section.fields.filter(
      (field) =>
        !field.existingOnly || Object.hasOwn(original.value, field.key),
    ),
  })),
);

async function loadOptions() {
  const run = ++sequence;
  optionsCompany = props.companyId;
  loading.value = true;
  lookupError.value = '';
  const [attributeResult, categoryResult] = await Promise.allSettled([
    getProductAttributeOptions(),
    getProductCategoryList(props.companyId),
  ]);
  if (run !== sequence) return;
  const failures: string[] = [];
  if (attributeResult.status === 'fulfilled')
    attributes.value = attributeResult.value;
  else failures.push(errorText(attributeResult.reason));
  if (categoryResult.status === 'fulfilled')
    categories.value = categoryResult.value;
  else failures.push(errorText(categoryResult.reason));
  lookupError.value = failures.join('；');
  loading.value = false;
}

function initialSection() {
  const issue = problems.value.join('；');
  if (/颜色|压花|纹路|成品厚度|长度|宽度|层厚|雕刻|图案|制造结构/.test(issue))
    return 'manufacturing';
  if (visibleSections.value[2]?.fields.some(({ key }) => issue.includes(key)))
    return 'other';
  return 'product';
}

watch(
  () => [props.open, props.rowNumber, props.companyId] as const,
  ([open, _row, companyId]) => {
    if (!open) {
      sequence++;
      loading.value = false;
      return;
    }
    original.value = { ...props.cells };
    draft.value = { ...original.value };
    activeSection.value = initialSection();
    if (optionsCompany !== companyId) {
      categories.value = undefined;
      attributes.value = undefined;
    }
    if (!categories.value || !attributes.value) void loadOptions();
  },
  { immediate: true },
);

function readChoice(source: Choices, input: string) {
  const value = input.trim();
  if (!value || value === '/') return undefined;
  if (source === 'states') {
    if (['1', 'true', '启用', '是', '正常'].includes(value.toLowerCase()))
      return '启用';
    if (
      ['0', 'false', '下架', '停售', '停用', '否'].includes(value.toLowerCase())
    )
      return '停用';
  }
  if (source === 'textures' && ['NONE', '无压花', '无纹路'].includes(value))
    return 'NONE';
  const lookup =
    source === 'stages' ? (stageAliases.get(value) ?? value) : value;
  const byCode = options.value[source].find(
    (option) =>
      option.value === (source === 'stages' ? lookup.toUpperCase() : lookup),
  );
  if (byCode) return byCode.value;
  const byLabel = options.value[source].filter(
    (option) => option.label === value,
  );
  return byLabel.length === 1 ? byLabel[0]?.value : undefined;
}

const rows = computed(() =>
  visibleSections.value.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const raw = draft.value[field.key] ?? '';
      const source = field.choices;
      const selected = source ? readChoice(source, raw) : undefined;
      const hasUnmatchedValue = Boolean(
        source && raw.trim() && raw.trim() !== '/' && !selected,
      );
      const lookupReady =
        source === 'categories'
          ? Boolean(categories.value)
          : Boolean(
              source &&
              (Object.hasOwn(staticChoices, source) || attributes.value),
            );
      const known = source
        ? options.value[source].map((option) => ({
            ...option,
            label:
              ['colors', 'matTypes', 'patterns', 'textures'].includes(source) &&
              option.label !== option.value
                ? `${option.label} · ${option.value}`
                : option.label,
          }))
        : [];
      return {
        ...field,
        unmatched: hasUnmatchedValue && lookupReady,
        selection: selected ?? (hasUnmatchedValue ? raw : undefined),
        options: hasUnmatchedValue
          ? [
              {
                value: raw,
                label: lookupReady ? `原值：${raw}（未匹配）` : `原值：${raw}`,
                disabled: true,
              },
              ...known,
            ]
          : known,
      };
    }),
  })),
);

function updateChoice(field: string, value: unknown) {
  if (typeof value === 'string') draft.value[field] = value;
  else if (value === null || value === undefined) draft.value[field] = '';
}

function save() {
  if (changedCount.value > 0) emit('save', changes.value);
}
</script>

<template>
  <Modal
    :open="open"
    :title="`修改 Excel 第 ${rowNumber ?? '—'} 行`"
    ok-text="保存修改"
    cancel-text="取消"
    width="min(820px, 96vw)"
    :ok-button-props="{ disabled: changedCount === 0 }"
    :mask-closable="false"
    destroy-on-close
    @cancel="emit('close')"
    @ok="save"
  >
    <div class="import-row-editor">
      <Alert
        v-if="problems.length"
        type="warning"
        show-icon
        message="当前校验提示"
      >
        <template #description>
          <ul class="import-row-problems">
            <li v-for="(problem, index) in problems" :key="index">
              {{ problem }}
            </li>
          </ul>
        </template>
      </Alert>
      <Alert
        v-if="lookupError"
        type="error"
        show-icon
        message="部分可选项加载失败"
        :description="lookupError"
      />
      <div class="import-row-toolbar">
        <span>下拉字段可按名称或编码搜索。保存后返回预览重新校验。</span>
        <Button size="small" :loading="loading" @click="loadOptions">
          刷新选项
        </Button>
      </div>
      <Tabs v-model:active-key="activeSection" size="small">
        <TabPane
          v-for="section in rows"
          :key="section.key"
          :tab="section.label"
        >
          <Form class="import-row-fields" layout="vertical">
            <Form.Item
              v-for="field in section.fields"
              :key="field.key"
              :class="{ 'wide-field': field.multiline }"
              :label="field.label ?? field.key"
              :required="['产品编号', '产品名称'].includes(field.key)"
              :validate-status="field.unmatched ? 'warning' : undefined"
              :extra="
                field.unmatched && field.choices === 'colors'
                  ? '请选择现有颜色。确认为新色号时，维护字典后可刷新选项。'
                  : undefined
              "
            >
              <Select
                v-if="field.choices"
                :value="field.selection"
                :options="field.options"
                :aria-label="field.label ?? field.key"
                :placeholder="loading ? '正在加载可选项…' : '请选择'"
                option-filter-prop="label"
                show-search
                allow-clear
                @update:value="(value) => updateChoice(field.key, value)"
              />
              <Input.TextArea
                v-else-if="field.multiline"
                v-model:value="draft[field.key]"
                :aria-label="field.label ?? field.key"
                :maxlength="field.max"
                :auto-size="{ minRows: 2, maxRows: 4 }"
              />
              <Input
                v-else
                v-model:value="draft[field.key]"
                :aria-label="field.label ?? field.key"
                :maxlength="field.max"
              />
            </Form.Item>
          </Form>
        </TabPane>
      </Tabs>
    </div>
  </Modal>
</template>

<style scoped>
.import-row-editor {
  display: grid;
  gap: 12px;
  max-height: min(65dvh, 560px);
  padding: 0 6px 2px 0;
  overflow-y: auto;
}

.import-row-problems {
  padding-inline-start: 18px;
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  list-style: disc;
}

.import-row-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.import-row-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
}

.import-row-fields :deep(.ant-form-item) {
  min-width: 0;
  margin-bottom: 12px;
}

.wide-field {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .import-row-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
