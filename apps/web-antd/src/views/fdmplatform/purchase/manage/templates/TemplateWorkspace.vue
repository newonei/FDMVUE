<script setup lang="ts">
import type { ActionDefinition } from '../../../data';

import type {
  ProcurementSetting,
  SettingType,
} from '#/api/fdmplatform/procurement';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  message,
  Modal,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getDirectory, newIdempotencyKey } from '#/api/fdmplatform';
import {
  deleteProcurementSetting,
  getAccessoryCatalog,
  getProcurementSettings,
  saveProcurementSetting,
} from '#/api/fdmplatform/procurement';

import ActionDialog from '../../../components/ActionDialog.vue';
import { useInMergedView } from '../../../components/merged-view';
import { errorText, field, selectField } from '../../../data';

defineOptions({ name: 'FdmPlatformPurchaseTemplateWorkspace' });
const inMergedView = useInMergedView();
/** 仓库在「仓库管理」维护，这里管签约主体、模板、条款、采购分类和常用辅料。 */
type TemplateType = Exclude<SettingType, 'warehouses'>;
const tab = ref<TemplateType>('entities');
const data = ref<Record<TemplateType, ProcurementSetting[]>>({
  entities: [],
  templates: [],
  clauses: [],
  categories: [],
  accessories: [],
});
const companies = ref<{ label: string; value: number }[]>([]);
const pageError = ref('');
const loading = ref(false);
const saving = ref(false);
const editorOpen = ref(false);
const editing = ref<ProcurementSetting>();
const titles = {
  entities: '主体与签约资料',
  templates: '采购单模板',
  clauses: '可选条款',
  categories: '采购分类',
  accessories: '常用辅料',
};
const TEXT_HINT =
  '保存已由业务确认的模板与条款正文。导出采购单会冻结当时版本，修改后旧文件继续保留。';
const descriptions: Partial<Record<TemplateType, string>> = {
  entities:
    '付款主体、签约公司和成本归属分别选择。签约资料按导出版本保存，不回写已生成的采购单。',
  accessories:
    '采购单下单资料「辅料明细表」里可勾选的辅料。已保存的采购单保留当时的清单。',
};
function typeFields() {
  if (tab.value === 'categories') return [];
  if (tab.value === 'accessories')
    return [
      field('sortNo', '排序（小的在前）', 'number', {
        required: false,
        default: (data.value.accessories.length + 1) * 10,
      }),
    ];
  if (tab.value === 'entities')
    return [
      field('code', '主体编码'),
      selectField('companyId', '关联公司（可选）', companies.value, {
        required: false,
      }),
      field('legalName', '完整法定抬头', undefined, { required: false }),
      field('address', '地址', undefined, { required: false }),
      field('contactName', '联系人', undefined, { required: false }),
      field('phone', '电话', undefined, { required: false }),
      field('taxNo', '税号', undefined, { required: false }),
      field('bankName', '开户行', undefined, { required: false }),
      field('bankAccount', '银行账户', undefined, { required: false }),
      field('usages', '可用用途', 'multiselect', {
        options: [
          { value: 'SIGN', label: '采购签约' },
          { value: 'PAY', label: '实际付款' },
          { value: 'COST', label: '成本归属' },
        ],
      }),
      field('remark', '备注', 'textarea', { required: false }),
    ];
  if (tab.value === 'templates')
    return [
      field('title', '采购单标题'),
      field('headerText', '前言正文', 'textarea', { required: false }),
      field('footerText', '结尾正文', 'textarea', { required: false }),
      field('requiredClauseGroups', '必要条款组', 'references', {
        required: false,
        options: [
          ...new Set(
            data.value.clauses.map((entry) => entry.groupCode).filter(Boolean),
          ),
        ].map((value) => ({
          label: String(value),
          value: String(value),
        })),
      }),
    ];
  return [field('groupCode', '条款组'), field('text', '条款正文', 'textarea')];
}
const definition = computed<ActionDefinition>(() => ({
  action: 'SAVE_SETTING',
  title: `${editing.value ? '维护' : '新建'}${titles[tab.value]}`,
  description: descriptions[tab.value] ?? TEXT_HINT,
  fields: [
    field('name', '名称'),
    ...typeFields(),
    field('active', '启用', 'boolean', { default: true }),
  ],
  initialValues: editing.value ? { ...editing.value } : undefined,
}));
async function load() {
  loading.value = true;
  pageError.value = '';
  try {
    const [entities, templates, clauses, categories, accessories, directory] =
      await Promise.all([
        getProcurementSettings('entities'),
        getProcurementSettings('templates'),
        getProcurementSettings('clauses'),
        getProcurementSettings('categories'),
        getProcurementSettings('accessories'),
        getDirectory(0),
      ]);
    data.value = { entities, templates, clauses, categories, accessories };
    companies.value = directory.companies.map((entry) => ({
      label: entry.companyName,
      value: entry.companyId,
    }));
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
async function save(payload: Record<string, unknown>, idempotencyKey: string) {
  saving.value = true;
  pageError.value = '';
  try {
    await saveProcurementSetting(tab.value, {
      ...payload,
      id: editing.value?.id,
      expectedVersion: editing.value?.version,
      idempotencyKey,
    });
    editorOpen.value = false;
    await load();
    message.success('资料已保存');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
/** 还没维护常用辅料时采购单用默认清单；一键把默认清单存成可维护的资料。 */
async function seedAccessories() {
  saving.value = true;
  pageError.value = '';
  try {
    const names = await getAccessoryCatalog();
    for (const [index, name] of names.entries())
      await saveProcurementSetting('accessories', {
        name,
        sortNo: (index + 1) * 10,
        active: true,
        idempotencyKey: newIdempotencyKey(),
      });
    await load();
    message.success(`已载入 ${names.length} 项常用辅料`);
  } catch (error) {
    pageError.value = errorText(error);
    await load();
  } finally {
    saving.value = false;
  }
}
function disable(record: ProcurementSetting) {
  const key = newIdempotencyKey();
  Modal.confirm({
    title: `停用“${record.name}”？`,
    content: '停用后不能用于新单据，历史版本保留。',
    okText: '停用',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteProcurementSetting(tab.value, record.id, {
          expectedVersion: record.version,
          idempotencyKey: key,
        });
        await load();
      } catch (error) {
        pageError.value = errorText(error);
        throw error;
      }
    },
  });
}
onMounted(load);
</script>
<template>
  <Page
    :title="inMergedView ? undefined : '采购单模板'"
    description="统一维护签约与付款主体、采购单模板及分组条款，已生成的采购单保留原始版本。"
  >
    <Card>
      <Alert v-if="pageError" type="error" :message="pageError" /><Tabs
        v-model:active-key="tab"
      >
        <TabPane
          v-for="(title, key) in titles"
          :key="key"
          :tab="title"
        />
</Tabs><Alert
        v-if="
          tab === 'accessories' && !loading && data.accessories.length === 0
        "
        type="info"
        show-icon
        message="还没有维护常用辅料，采购单「辅料明细表」暂用系统默认清单（OPP透明膜、定制卡纸、定制网包、定制内盒等）"
        style="margin-bottom: 12px"
      >
        <template #action>
          <Button size="small" :loading="saving" @click="seedAccessories">
            以默认清单开始维护
          </Button>
        </template>
</Alert><Space>
        <Button
          type="primary"
          @click="
            editing = undefined;
            editorOpen = true;
          "
        >
          新建{{ titles[tab] }}
</Button><Button :loading="loading" @click="load">刷新</Button>
</Space><Table
        :data-source="data[tab]"
        row-key="id"
        :loading="loading"
        :columns="[
          { title: '名称', dataIndex: 'name' },
          { title: '用途 / 条款组', key: 'context' },
          { title: '版本', dataIndex: 'version' },
          { title: '状态', key: 'state' },
          { title: '操作', key: 'action' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'context'">{{
            tab === 'entities'
              ? (record.usages ?? [])
                  .map(
                    (value: string) =>
                      ({ SIGN: '签约', PAY: '付款', COST: '成本' })[value] ??
                      value,
                  )
                  .join(' / ')
              : tab === 'clauses'
                ? record.groupCode
                : tab === 'accessories'
                  ? `排序 ${record.sortNo ?? 0}`
                  : (record.title ?? '—')
          }}</span><Tag v-else-if="column.key === 'state'">
            {{ record.active ? '启用' : '停用' }}
</Tag><Space v-else-if="column.key === 'action'">
            <Button
              type="link"
              @click="
                editing = record as ProcurementSetting;
                editorOpen = true;
              "
            >
              维护
</Button><Button
              v-if="record.active"
              type="link"
              danger
              @click="disable(record as ProcurementSetting)"
            >
              停用
            </Button>
          </Space>
        </template>
      </Table>
</Card><ActionDialog
      :open="editorOpen"
      :definition="definition"
      :saving="saving"
      :error="pageError"
      @close="editorOpen = false"
      @submit="save"
    />
  </Page>
</template>
