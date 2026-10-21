<script setup lang="ts">
import type { SalesChannel } from '../../sales-channel';
import type { ContractFilterPreset, ContractFilters } from './filters';

import type { Directory } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Button,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Radio,
  Select,
  Switch,
  Tag,
} from 'ant-design-vue';

import { getCustomers } from '#/api/fdmplatform/customers';

import { productCategoryOptions } from '../../contract-categories';
import { errorText } from '../../data';
import { personLabel } from '../../directory';
import {
  activeFilterCount,
  cloneFilters,
  loadPresets,
  normalizeFilters,
  savePresets,
  shipStateOptions,
  upsertPreset,
} from './filters';

const props = defineProps<{
  channel: SalesChannel;
  companies: Array<{ label: string; value: number }>;
  directory?: Directory;
  filters: ContractFilters;
  mine: boolean;
  open: boolean;
  userId?: number;
}>();
const emit = defineEmits<{
  apply: [filters: ContractFilters];
  close: [];
}>();

const draft = ref<ContractFilters>(normalizeFilters({}));
const presets = ref<ContractFilterPreset[]>([]);
const presetName = ref('');
const customerOptions = ref<Array<{ label: string; value: string }>>([]);
const customerLoading = ref(false);
let customerSequence = 0;
let customerTimer: ReturnType<typeof setTimeout> | undefined;

const userOptions = computed(
  () =>
    props.directory?.users.map((user) => ({
      value: user.id,
      label: personLabel(props.directory, user.id),
    })) ?? [],
);
const categoryOptions = [
  ...productCategoryOptions,
  { value: 'NONE', label: '未分类' },
];
const count = computed(() => activeFilterCount(draft.value, props.mine));
const selectedCustomers = computed({
  get: () => draft.value.customers.map((item) => item.id),
  set: (ids: string[]) => {
    const known = new Map([
      ...draft.value.customers.map((item) => [item.id, item.name] as const),
      ...customerOptions.value.map((item) => [item.value, item.label] as const),
    ]);
    draft.value.customers = ids.map((id) => ({
      id,
      name: known.get(id) ?? id,
    }));
  },
});
const customerChoices = computed(() => {
  const seen = new Set(customerOptions.value.map((item) => item.value));
  return [
    ...draft.value.customers
      .filter((item) => !seen.has(item.id))
      .map((item) => ({ value: item.id, label: item.name })),
    ...customerOptions.value,
  ];
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    draft.value = cloneFilters(props.filters);
    presets.value = loadPresets(props.channel, props.userId);
    presetName.value = '';
    void searchCustomers('');
  },
);

function searchCustomers(keyword: string) {
  clearTimeout(customerTimer);
  customerTimer = setTimeout(async () => {
    const run = ++customerSequence;
    customerLoading.value = true;
    try {
      const result = await getCustomers({
        keyword: keyword.trim() || undefined,
        salesChannel: props.channel,
        pageNo: 1,
        pageSize: 30,
      });
      if (run !== customerSequence) return;
      customerOptions.value = result.list.map((item) => ({
        value: item.id,
        label: item.name,
      }));
    } catch (error) {
      if (run === customerSequence) message.error(errorText(error));
    } finally {
      if (run === customerSequence) customerLoading.value = false;
    }
  }, 250);
}

function apply() {
  emit('apply', cloneFilters(draft.value));
}
function clearAll() {
  draft.value = normalizeFilters({});
}
function usePreset(preset: ContractFilterPreset) {
  emit('apply', cloneFilters(preset.filters));
}
function savePreset() {
  const name = presetName.value.trim();
  if (!name) {
    message.warning('先给这组筛选起个名字');
    return;
  }
  if (count.value === 0) {
    message.warning('还没有选择任何筛选条件');
    return;
  }
  const next = upsertPreset(presets.value, name, draft.value);
  if (!savePresets(props.channel, props.userId, next)) {
    message.error('浏览器不允许保存，常用筛选没有存下');
    return;
  }
  presets.value = next;
  presetName.value = '';
  message.success(`已保存常用筛选「${name}」`);
}
function removePreset(name: string) {
  const next = presets.value.filter((item) => item.name !== name);
  savePresets(props.channel, props.userId, next);
  presets.value = next;
}
</script>

<template>
  <Drawer
    :open="open"
    title="高级筛选"
    width="min(480px, 100vw)"
    @close="emit('close')"
  >
    <section class="presets">
      <h4>常用筛选</h4>
      <div v-if="presets.length" class="preset-list">
        <Tag
          v-for="preset in presets"
          :key="preset.name"
          closable
          class="preset"
          @click="usePreset(preset)"
          @close.prevent="removePreset(preset.name)"
        >
          {{ preset.name }}
        </Tag>
      </div>
      <Empty
        v-else
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="把常用的条件组合保存下来，下次点一下就能用"
      />
    </section>

    <Form layout="vertical" class="filter-form">
      <Form.Item
        label="负责人"
        :extra="
          mine ? '当前是「我负责的」，切到「全部」后负责人筛选才生效' : ''
        "
      >
        <Select
          v-model:value="draft.owners"
          mode="multiple"
          :options="userOptions"
          :disabled="mine"
          placeholder="可选多人"
          show-search
          option-filter-prop="label"
          allow-clear
        />
      </Form.Item>
      <Form.Item label="合同主体">
        <Select
          v-model:value="draft.companies"
          mode="multiple"
          :options="companies"
          placeholder="可选多个签约公司"
          option-filter-prop="label"
          allow-clear
        />
      </Form.Item>
      <Form.Item label="客户">
        <Select
          v-model:value="selectedCustomers"
          mode="multiple"
          :options="customerChoices"
          :loading="customerLoading"
          :filter-option="false"
          placeholder="搜索客户名称或编号，可选多个"
          show-search
          allow-clear
          @search="searchCustomers"
        />
      </Form.Item>
      <Form.Item label="产品分类">
        <Select
          v-model:value="draft.categories"
          mode="multiple"
          :options="categoryOptions"
          placeholder="可选多个分类"
          allow-clear
        />
      </Form.Item>
      <Form.Item label="采购员" extra="合同下任一采购任务的负责人">
        <Select
          v-model:value="draft.buyers"
          mode="multiple"
          :options="userOptions"
          placeholder="可选多人"
          show-search
          option-filter-prop="label"
          allow-clear
        />
      </Form.Item>
      <Form.Item label="发货情况">
        <Select
          v-model:value="draft.shipStates"
          mode="multiple"
          :options="[...shipStateOptions]"
          placeholder="可选多个"
          allow-clear
        />
      </Form.Item>
      <Form.Item label="签订日期">
        <DatePicker.RangePicker
          v-model:value="draft.signed"
          value-format="YYYY-MM-DD"
          :placeholder="['从', '到']"
          style="width: 100%"
        />
      </Form.Item>
      <Form.Item label="交期">
        <DatePicker.RangePicker
          v-model:value="draft.due"
          value-format="YYYY-MM-DD"
          :placeholder="['从', '到']"
          style="width: 100%"
        />
      </Form.Item>
      <Form.Item label="合同金额">
        <div class="amount">
          <InputNumber
            v-model:value="draft.amountMin"
            :min="0"
            placeholder="最低"
            style="flex: 1"
          />
          <span>—</span>
          <InputNumber
            v-model:value="draft.amountMax"
            :min="0"
            placeholder="最高"
            style="flex: 1"
          />
        </div>
      </Form.Item>
      <Form.Item label="单据类型">
        <Radio.Group v-model:value="draft.kind" button-style="solid">
          <Radio.Button :value="undefined">全部</Radio.Button>
          <Radio.Button value="FORMAL">正式合同</Radio.Button>
          <Radio.Button value="SAMPLE">样品单</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item label="只看还有未收款的">
        <Switch v-model:checked="draft.unpaid" />
      </Form.Item>
    </Form>

    <template #footer>
      <div class="footer">
        <div class="save">
          <Input
            v-model:value="presetName"
            :maxlength="20"
            placeholder="给当前条件起个名字"
            @press-enter="savePreset"
          />
          <Button @click="savePreset">保存为常用</Button>
        </div>
        <div class="actions">
          <Button type="link" @click="clearAll">清空条件</Button>
          <Button @click="emit('close')">取消</Button>
          <Button type="primary" @click="apply">
            筛选{{ count ? `（${count} 项）` : '' }}
          </Button>
        </div>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.presets {
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.presets h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset {
  margin: 0;
  cursor: pointer;
}

.filter-form :deep(.ant-form-item) {
  margin-bottom: 14px;
}

.amount {
  display: flex;
  gap: 8px;
  align-items: center;
}

.footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.save {
  display: flex;
  gap: 8px;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
