<script setup lang="ts">
import type { CountryOption, Customer } from '#/api/fdmplatform/customers';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  message,
  Select,
  Space,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import { getCustomerOptions, saveCustomer } from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import {
  countryMatches,
  countrySelectOptions,
  customerFields,
  customerForm,
} from './model';

const props = defineProps<{ customer?: Customer; open: boolean }>();
const emit = defineEmits<{ close: []; saved: [customer: Customer] }>();
const form = reactive<Record<string, string>>({});
const active = ref(true);
const remark = ref('');
const saving = ref(false);
const panelError = ref('');
const requestKey = ref('');
const countries = ref<CountryOption[]>([]);
const optionsLoading = ref(false);
const optionsError = ref('');
const countryOptions = computed(() => countrySelectOptions(countries.value));
const currentCountryKnown = computed(() =>
  countries.value.some((item) => item.code === form.country),
);
let optionsSequence = 0;
async function loadOptions() {
  const run = ++optionsSequence;
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    const result = await getCustomerOptions();
    if (run === optionsSequence && props.open)
      countries.value = result.countries;
  } catch (error) {
    if (run === optionsSequence && props.open)
      optionsError.value = errorText(error);
  } finally {
    if (run === optionsSequence) optionsLoading.value = false;
  }
}
function close() {
  if (!saving.value) emit('close');
}
watch(
  () => props.open,
  (open) => {
    ++optionsSequence;
    if (!open) return;
    Object.assign(form, customerForm(props.customer));
    active.value = props.customer?.active ?? true;
    remark.value = props.customer?.remark ?? '';
    panelError.value = '';
    requestKey.value = newIdempotencyKey();
    void loadOptions();
  },
  { immediate: true },
);
async function save() {
  if (saving.value) return;
  if (!form.name?.trim() || !currentCountryKnown.value) {
    panelError.value = '请填写客户全称，并从国家 / 地区列表选择一个有效选项';
    return;
  }
  saving.value = true;
  panelError.value = '';
  try {
    const customer = await saveCustomer({
      ...Object.fromEntries(
        Object.entries(form).filter(([field]) => field !== 'code'),
      ),
      active: active.value,
      remark: remark.value,
      id: props.customer?.id,
      expectedVersion: props.customer?.version,
      idempotencyKey: requestKey.value,
    });
    emit('saved', customer);
    emit('close');
    message.success('客户档案已保存，可在新合同中选择');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="customer ? '维护客户档案' : '新建客户'"
    width="min(820px, 96vw)"
    :mask-closable="false"
    :closable="!saving"
    :keyboard="!saving"
    @close="close"
  >
    <div class="customer-editor">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert v-if="optionsError" type="error" show-icon :message="optionsError">
        <template #action>
          <Button size="small" :loading="optionsLoading" @click="loadOptions">
            重新加载国家
          </Button>
        </template>
      </Alert>
      <Alert
        v-if="customer?.sourceSystem === 'OKKI'"
        type="info"
        show-icon
        message="OKKI 公司名称随来源同步。刷新会更新客户名称、公司名称和联系资料；系统客户编号、客户来源、本地备注及启用状态保留，刷新前会展示预览。"
      />
      <Form layout="vertical" class="customer-fields">
        <Form.Item
          v-for="[key, title] in customerFields"
          :key="key"
          :label="title"
          :required="['name', 'country'].includes(key)"
          :extra="
            key === 'code'
              ? '首次保存时由系统自动生成，已有编号保持不变。'
              : key === 'customerSource'
                ? '填写展会、客户转介绍等业务来源，与资料同步来源分别记录。'
                : undefined
          "
          :class="{ wide: key === 'address' }"
        >
          <template v-if="key === 'country'">
            <Select
              v-model:value="form.country"
              :options="countryOptions"
              :filter-option="countryMatches"
              show-search
              :loading="optionsLoading"
              :disabled="saving || optionsLoading"
              placeholder="搜索中文、英文或国家代码"
            />
            <p
              v-if="form.country && !currentCountryKnown && !optionsLoading"
              class="muted"
            >
              原记录国家：{{ form.country }}。请从固定国家 /
              地区列表重新选择后保存。
            </p>
          </template>
          <Input
            v-else-if="key === 'code'"
            :value="form.code"
            readonly
            placeholder="首次保存后自动生成"
          />
          <Input
            v-else
            v-model:value="form[key]"
            :maxlength="
              ['customerSource', 'companyName'].includes(key) ? 200 : undefined
            "
            :disabled="saving"
          />
        </Form.Item>
        <Form.Item label="本地备注" class="wide">
          <Input.TextArea v-model:value="remark" :rows="3" :disabled="saving" />
        </Form.Item>
      </Form>
      <Checkbox v-model:checked="active" :disabled="saving">
        启用客户，允许在新合同中选择
      </Checkbox>
      <p class="muted">停用只影响后续选取，已有合同保留原客户快照。</p>
    </div>
    <template #footer>
      <Space>
        <Button :disabled="saving" @click="close">取消</Button><Button
          type="primary"
          :loading="saving"
          :disabled="optionsLoading || Boolean(optionsError)"
          @click="save"
        >
          保存客户
        </Button>
      </Space>
    </template>
  </Drawer>
</template>

<style scoped>
.customer-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.customer-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.wide {
  grid-column: 1 / -1;
}

.muted {
  color: var(--ant-color-text-secondary);
}

@media (max-width: 600px) {
  .customer-fields {
    grid-template-columns: 1fr;
  }
}
</style>
