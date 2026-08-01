<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmcaiwuRawMaterialApi } from '#/api/fdmcaiwu/raw-material';

import { nextTick, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Form,
  FormItem,
  InputNumber,
  message,
  Modal,
  Switch,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getRawMaterialPage,
  updateRawMaterial,
} from '#/api/fdmcaiwu/raw-material';

defineOptions({ name: 'FdmcaiwuRawMaterial' });

const CATEGORY_OPTIONS = [
  { label: '主材料', value: 'MAIN' },
  { label: '小料', value: 'ADDITIVE' },
  { label: '色母', value: 'COLOR_MASTER' },
];

const ENABLED_OPTIONS = [
  { label: '启用', value: true },
  { label: '停用', value: false },
];

interface EditFormModel {
  enabled: boolean;
  id?: number;
  materialCode: string;
  materialName: string;
  unitPricePerKg?: FdmcaiwuRawMaterialApi.DecimalValue;
}

const editOpen = ref(false);
const saving = ref(false);
const editFormRef = ref<FormInstance>();
const editForm = reactive<EditFormModel>({
  enabled: true,
  id: undefined,
  materialCode: '',
  materialName: '',
  unitPricePerKg: undefined,
});

const editRules: Record<string, Rule[]> = {
  unitPricePerKg: [
    {
      async validator(_rule, value) {
        if (value === undefined || value === null || value === '') {
          throw new Error('请输入当前单价');
        }
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue <= 0) {
          throw new Error('当前单价必须大于 0');
        }
        const decimals = String(value).split('.')[1]?.length ?? 0;
        if (decimals > 4) {
          throw new Error('当前单价最多保留 4 位小数');
        }
        return;
      },
      trigger: 'change',
    },
  ],
};

function formatCategory(value?: string) {
  return (
    CATEGORY_OPTIONS.find((item) => item.value === value)?.label ?? value ?? '—'
  );
}

function formatUnitPrice(value: unknown) {
  if (value === undefined || value === null || value === '') return '—';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return `${numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  })} 元/kg`;
}

function formatSource(row: FdmcaiwuRawMaterialApi.RawMaterial) {
  return (
    [row.sourceVersion, row.sourceLocation].filter(Boolean).join(' · ') || '—'
  );
}

const queryFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    componentProps: {
      allowClear: true,
      placeholder: '材料编码或名称',
    },
    fieldName: 'keyword',
    label: '关键词',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: CATEGORY_OPTIONS,
      placeholder: '全部分类',
    },
    fieldName: 'category',
    label: '分类',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: ENABLED_OPTIONS,
      placeholder: '全部状态',
    },
    fieldName: 'enabled',
    label: '状态',
  },
];

const gridColumns: VxeTableGridOptions<FdmcaiwuRawMaterialApi.RawMaterial>['columns'] =
  [
    {
      field: 'materialCode',
      fixed: 'left',
      minWidth: 150,
      title: '材料编码',
    },
    {
      field: 'materialName',
      fixed: 'left',
      minWidth: 180,
      title: '材料名称',
    },
    {
      field: 'category',
      slots: { default: 'category' },
      title: '分类',
      width: 110,
    },
    {
      align: 'right',
      field: 'unitPricePerKg',
      slots: { default: 'unitPrice' },
      title: '当前单价',
      width: 150,
    },
    {
      align: 'center',
      field: 'enabled',
      slots: { default: 'enabled' },
      title: '启用状态',
      width: 100,
    },
    {
      field: 'sourceVersion',
      minWidth: 260,
      slots: { default: 'source' },
      title: '来源',
    },
    {
      field: 'updateTime',
      formatter: 'formatDateTime',
      title: '更新时间',
      width: 170,
    },
    {
      fixed: 'right',
      slots: { default: 'actions' },
      title: '操作',
      width: 100,
    },
  ];

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: queryFormSchema,
  },
  gridOptions: {
    autoResize: true,
    columns: gridColumns,
    height: '100%',
    keepSource: false,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getRawMaterialPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { isHover: true, keyField: 'id' },
    stripe: true,
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmcaiwuRawMaterialApi.RawMaterial>,
});

function handleEdit(row: FdmcaiwuRawMaterialApi.RawMaterial) {
  Object.assign(editForm, {
    enabled: row.enabled,
    id: row.id,
    materialCode: row.materialCode,
    materialName: row.materialName,
    unitPricePerKg: row.unitPricePerKg ?? undefined,
  });
  editOpen.value = true;
  nextTick(() => editFormRef.value?.clearValidate());
}

async function handleSave() {
  try {
    await editFormRef.value?.validate();
  } catch {
    return;
  }
  if (editForm.id === undefined || editForm.unitPricePerKg === undefined)
    return;

  saving.value = true;
  try {
    await updateRawMaterial({
      enabled: editForm.enabled,
      id: editForm.id,
      unitPricePerKg: editForm.unitPricePerKg,
    });
    message.success('原材料价格已更新');
    editOpen.value = false;
    await gridApi.query();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      ok-text="保存"
      title="编辑原材料"
      @ok="handleSave"
    >
      <Form
        ref="editFormRef"
        class="pt-3"
        :label-col="{ span: 6 }"
        :model="editForm"
        :rules="editRules"
        :wrapper-col="{ span: 17 }"
      >
        <FormItem label="材料编码">
          <span>{{ editForm.materialCode }}</span>
        </FormItem>
        <FormItem label="材料名称">
          <span>{{ editForm.materialName }}</span>
        </FormItem>
        <FormItem label="当前单价" name="unitPricePerKg">
          <InputNumber
            v-model:value="editForm.unitPricePerKg"
            class="w-full"
            string-mode
            :min="0.0001"
            :precision="4"
            :step="0.0001"
            addon-after="元/kg"
          />
        </FormItem>
        <FormItem label="启用状态">
          <div class="flex items-center gap-2">
            <Switch v-model:checked="editForm.enabled" />
            <span class="text-xs text-muted-foreground">
              {{
                editForm.enabled
                  ? '启用后参与配方成本计算'
                  : '停用后不参与配方成本计算'
              }}
            </span>
          </div>
        </FormItem>
      </Form>
    </Modal>

    <div
      class="raw-material-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4"
    >
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            原材料价格维护
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            维护主材料、小料和色母的当前公斤单价；启用材料会参与配方成本的实时计算。
          </p>
        </div>
      </header>

      <div class="raw-material-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="raw-material-vxe-wrapper"
          grid-class="raw-material-vxe-grid"
          table-title="原材料价格"
        >
          <template #category="{ row }">
            <Tag>{{ formatCategory(row.category) }}</Tag>
          </template>
          <template #unitPrice="{ row }">
            <span class="font-medium">{{
              formatUnitPrice(row.unitPricePerKg)
            }}</span>
          </template>
          <template #enabled="{ row }">
            <Tag :color="row.enabled ? 'success' : 'default'">
              {{ row.enabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template #source="{ row }">
            <span class="source-text" :title="formatSource(row)">
              {{ formatSource(row) }}
            </span>
          </template>
          <template #actions="{ row }">
            <Button
              v-access:code="['fdmcaiwu:raw-material:update']"
              size="small"
              type="link"
              @click="handleEdit(row)"
            >
              <template #icon>
                <IconifyIcon icon="lucide:pencil" />
              </template>
              编辑
            </Button>
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.raw-material-page,
.raw-material-grid {
  min-height: 0;
}

.raw-material-page {
  height: 100%;
}

.raw-material-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.raw-material-grid :deep(.raw-material-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.raw-material-grid :deep(.raw-material-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.raw-material-grid :deep(.vxe-grid) {
  height: 100%;
}

.source-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .raw-material-grid {
    min-height: 520px;
  }
}
</style>
