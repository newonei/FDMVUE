<script lang="ts" setup>
import type { FdmdataExpressFeeRuleApi } from '#/api/fdmdata/expressfeerule';
import type { FdmdataExpressFeeTemplateApi } from '#/api/fdmdata/expressfeetemplate';

import { computed, reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Table,
} from 'ant-design-vue';

import {
  createExpressFeeRule,
  deleteExpressFeeRule,
  getExpressFeeRulePage,
  updateExpressFeeRule,
} from '#/api/fdmdata/expressfeerule';

defineOptions({ name: 'ExpressFeeRuleModal' });

const emit = defineEmits<{ success: [] }>();

const template = ref<
  FdmdataExpressFeeTemplateApi.ExpressFeeTemplate | undefined
>();
const loading = ref(false);
const saving = ref(false);
const rows = ref<FdmdataExpressFeeRuleApi.ExpressFeeRule[]>([]);

const formState = reactive<FdmdataExpressFeeRuleApi.ExpressFeeRule>({
  enabled: 1,
  extraUnitWeight: 1,
  sort: 0,
  weightMinKg: 0,
});

const columns = [
  { title: '省份', dataIndex: 'provinceName', width: 100 },
  { title: '重量下限', dataIndex: 'weightMinKg', width: 96 },
  { title: '重量上限', dataIndex: 'weightMaxKg', width: 96 },
  { title: '固定价', dataIndex: 'fixedFee', width: 88 },
  { title: '首重kg', dataIndex: 'baseWeightKg', width: 88 },
  { title: '首重费用', dataIndex: 'baseFee', width: 96 },
  { title: '续重单价', dataIndex: 'extraUnitFee', width: 96 },
  { title: '排序', dataIndex: 'sort', width: 72 },
  { title: '状态', dataIndex: 'enabled', width: 72 },
  { title: '操作', dataIndex: 'actions', width: 130, fixed: 'right' },
] as const;

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      template.value = undefined;
      rows.value = [];
      resetForm();
      return;
    }
    template.value =
      modalApi.getData<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate>();
    await loadRules();
  },
});

const title = computed(() =>
  template.value
    ? `规则管理：${template.value.templateName ?? template.value.templateCode}`
    : '规则管理',
);

function resetForm() {
  Object.assign(formState, {
    id: undefined,
    templateId: template.value?.id,
    provinceName: '',
    provinceNorm: '',
    weightMinKg: 0,
    weightMaxKg: undefined,
    fixedFee: undefined,
    baseWeightKg: undefined,
    baseFee: undefined,
    extraUnitWeight: 1,
    extraUnitFee: undefined,
    sort: 0,
    enabled: 1,
    remark: '',
  });
}

async function loadRules() {
  if (!template.value?.id) return;
  loading.value = true;
  try {
    const page = await getExpressFeeRulePage({
      pageNo: 1,
      pageSize: 200,
      templateId: template.value.id,
    } as any);
    rows.value = page.list;
    resetForm();
  } finally {
    loading.value = false;
  }
}

function editRule(row: FdmdataExpressFeeRuleApi.ExpressFeeRule) {
  Object.assign(formState, row);
}

async function deleteRule(row: FdmdataExpressFeeRuleApi.ExpressFeeRule) {
  if (!row.id) return;
  await deleteExpressFeeRule(row.id);
  message.success('删除成功');
  await loadRules();
  emit('success');
}

async function saveRule() {
  if (!template.value?.id) return;
  if (!formState.provinceName?.trim()) {
    message.warning('请填写省份');
    return;
  }
  formState.templateId = template.value.id;
  saving.value = true;
  try {
    if (formState.id) {
      await updateExpressFeeRule(formState);
      message.success('规则已更新');
    } else {
      await createExpressFeeRule(formState);
      message.success('规则已新增');
    }
    await loadRules();
    emit('success');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal :title="title" class="w-[1120px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-4">
      <Form layout="vertical" :model="formState">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
          <FormItem label="省份" required>
            <Input
              v-model:value="formState.provinceName"
              allow-clear
              placeholder="如 江苏省"
            />
          </FormItem>
          <FormItem label="重量下限 kg">
            <InputNumber
              v-model:value="formState.weightMinKg"
              class="w-full"
              :min="0"
              :precision="3"
            />
          </FormItem>
          <FormItem label="重量上限 kg">
            <InputNumber
              v-model:value="formState.weightMaxKg"
              class="w-full"
              :min="0"
              :precision="3"
              placeholder="为空表示无限"
            />
          </FormItem>
          <FormItem label="固定费用">
            <InputNumber
              v-model:value="formState.fixedFee"
              class="w-full"
              :min="0"
              :precision="4"
              placeholder="阶梯价填写"
            />
          </FormItem>
          <FormItem label="首重 kg">
            <InputNumber
              v-model:value="formState.baseWeightKg"
              class="w-full"
              :min="0"
              :precision="3"
            />
          </FormItem>
          <FormItem label="首重费用">
            <InputNumber
              v-model:value="formState.baseFee"
              class="w-full"
              :min="0"
              :precision="4"
            />
          </FormItem>
          <FormItem label="续重单位 kg">
            <InputNumber
              v-model:value="formState.extraUnitWeight"
              class="w-full"
              :min="0.001"
              :precision="3"
            />
          </FormItem>
          <FormItem label="续重费用">
            <InputNumber
              v-model:value="formState.extraUnitFee"
              class="w-full"
              :min="0"
              :precision="4"
            />
          </FormItem>
          <FormItem label="排序">
            <InputNumber
              v-model:value="formState.sort"
              class="w-full"
              :precision="0"
            />
          </FormItem>
          <FormItem label="状态">
            <Select
              v-model:value="formState.enabled"
              :options="[
                { label: '启用', value: 1 },
                { label: '停用', value: 0 },
              ]"
            />
          </FormItem>
          <FormItem label="备注" class="md:col-span-2">
            <Input v-model:value="formState.remark" allow-clear />
          </FormItem>
        </div>
        <div class="flex justify-end gap-2">
          <Button @click="resetForm">清空</Button>
          <Button type="primary" :loading="saving" @click="saveRule">
            <template #icon>
              <IconifyIcon icon="lucide:save" />
            </template>
            {{ formState.id ? '保存规则' : '新增规则' }}
          </Button>
        </div>
      </Form>

      <Table
        row-key="id"
        size="small"
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: false }"
        :scroll="{ x: 980 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'enabled'">
            {{ Number(record.enabled) === 1 ? '启用' : '停用' }}
          </template>
          <template v-if="column.dataIndex === 'actions'">
            <Button type="link" size="small" @click="editRule(record)">
              编辑
            </Button>
            <Popconfirm title="确认删除该规则？" @confirm="deleteRule(record)">
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </div>
  </Modal>
</template>
