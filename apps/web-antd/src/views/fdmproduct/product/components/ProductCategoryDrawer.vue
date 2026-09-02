<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmProductApi } from '#/api/fdmproduct/product';

import { computed, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Drawer,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createFdmProductCategory,
  deleteFdmProductCategory,
  updateFdmProductCategory,
} from '#/api/fdmproduct/product';

defineOptions({ name: 'FdmProductCategoryDrawer' });

const props = defineProps<{
  categories: FdmProductApi.Category[];
  companyId?: string;
  loading?: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  changed: [];
  'update:open': [open: boolean];
}>();

const { hasAccessByCodes } = useAccess();
const columns: ColumnsType<FdmProductApi.Category> = [
  { dataIndex: 'categoryName', key: 'name', title: '分类', width: 180 },
  { dataIndex: 'categoryCode', key: 'code', title: '编码', width: 120 },
  { key: 'status', title: '状态', width: 80 },
  { key: 'action', title: '操作', width: 120 },
];

const editing = ref<FdmProductApi.Category>();
const saving = ref(false);
const form = reactive({
  categoryCode: '',
  categoryName: '',
  parentId: undefined as string | undefined,
  remark: '',
  sort: 0,
  status: 0 as FdmProductApi.CommonStatus,
});

const canCreate = computed(() =>
  hasAccessByCodes(['fdmproduct:category:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmproduct:category:update']),
);
const canDelete = computed(() =>
  hasAccessByCodes(['fdmproduct:category:delete']),
);
const canSave = computed(
  () =>
    Boolean(props.companyId) &&
    (editing.value ? canUpdate.value : canCreate.value),
);
const blockedParentIds = computed(() => {
  const blocked = new Set<string>();
  const editingId = editing.value?.id;
  if (!editingId) return blocked;
  blocked.add(editingId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of props.categories) {
      if (
        item.parentId &&
        blocked.has(item.parentId) &&
        !blocked.has(item.id)
      ) {
        blocked.add(item.id);
        changed = true;
      }
    }
  }
  return blocked;
});
const parentOptions = computed(() =>
  props.categories
    .filter((item) => !blockedParentIds.value.has(item.id))
    .filter((item) => item.status === 0 || item.id === editing.value?.parentId)
    .map((item) => ({
      label: `${item.categoryName}${item.status === 1 ? '（已停用，仅保留）' : ''}`,
      value: item.id,
    })),
);

function parentName(parentId?: null | string) {
  return props.categories.find((item) => item.id === parentId)?.categoryName;
}

function resetForm() {
  editing.value = undefined;
  Object.assign(form, {
    categoryCode: '',
    categoryName: '',
    parentId: undefined,
    remark: '',
    sort: 0,
    status: 0,
  });
}

function edit(row: FdmProductApi.Category) {
  editing.value = row;
  Object.assign(form, {
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    parentId: row.parentId ?? undefined,
    remark: row.remark ?? '',
    sort: row.sort,
    status: row.status,
  });
}

function editRecord(row: Record<string, any>) {
  edit(row as FdmProductApi.Category);
}

async function save() {
  const companyId = props.companyId;
  if (!canSave.value || !companyId || saving.value) return;
  if (!form.categoryCode.trim() || !form.categoryName.trim()) {
    message.error('请填写分类编码和分类名称');
    return;
  }
  const payload = {
    categoryCode: form.categoryCode.trim(),
    categoryName: form.categoryName.trim(),
    companyId,
    parentId: form.parentId,
    remark: form.remark.trim() || undefined,
    sort: Number(form.sort || 0),
    status: form.status,
  };
  saving.value = true;
  try {
    await (editing.value
      ? updateFdmProductCategory({
          ...payload,
          expectedVersion: editing.value.version,
          id: editing.value.id,
        })
      : createFdmProductCategory(payload));
    message.success(editing.value ? '分类已更新' : '分类已创建');
    resetForm();
    emit('changed');
  } finally {
    saving.value = false;
  }
}

async function remove(row: FdmProductApi.Category) {
  await deleteFdmProductCategory({
    companyId: row.companyId,
    expectedVersion: row.version,
    id: row.id,
  });
  message.success('分类已删除');
  if (editing.value?.id === row.id) resetForm();
  emit('changed');
}

function removeRecord(row: Record<string, any>) {
  return remove(row as FdmProductApi.Category);
}

watch(
  () => [props.open, props.companyId],
  ([open]) => {
    if (open) resetForm();
  },
);
</script>

<template>
  <Drawer
    :open="open"
    title="产品分类管理"
    width="min(920px, 100vw)"
    @update:open="emit('update:open', $event)"
  >
    <Alert
      v-if="!companyId"
      class="mb-3"
      message="请先选择公司"
      show-icon
      type="warning"
    />
    <div class="product-category-drawer">
      <section>
        <div class="product-category-drawer__heading">
          <div>
            <strong>分类清单</strong><small>分类严格隔离于当前公司</small>
          </div>
          <Button size="small" @click="resetForm">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>新建分类
          </Button>
        </div>
        <Table
          :columns="columns"
          :data-source="categories"
          :loading="loading"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <strong>{{ record.categoryName }}</strong>
              <small v-if="parentName(record.parentId)">上级：{{ parentName(record.parentId) }}</small>
            </template>
            <Tag
              v-else-if="column.key === 'status'"
              :color="record.status === 0 ? 'success' : 'default'"
            >
              {{ record.status === 0 ? '启用' : '停用' }}
            </Tag>
            <div v-else-if="column.key === 'action'">
              <Button
                :disabled="!canUpdate"
                size="small"
                type="link"
                @click="editRecord(record)"
              >
                编辑
              </Button>
              <Popconfirm
                v-if="canDelete"
                description="仍有子分类或产品使用时，后端会拒绝删除。"
                title="确认删除该分类？"
                @confirm="removeRecord(record)"
              >
                <Button danger size="small" type="link">删除</Button>
              </Popconfirm>
            </div>
          </template>
        </Table>
      </section>

      <section class="product-category-drawer__form">
        <div class="product-category-drawer__heading">
          <div>
            <strong>{{ editing ? '编辑分类' : '新建分类' }}</strong><small>{{
              editing ? `版本 ${editing.version}` : '保存到当前公司'
            }}</small>
          </div>
          <Tag>{{ editing ? '编辑' : '新增' }}</Tag>
        </div>
        <Alert
          v-if="!canSave"
          message="未选择公司或当前账号没有保存权限"
          show-icon
          type="warning"
        />
        <label><span>分类编码 <b>*</b></span><Input
            v-model:value="form.categoryCode"
            :disabled="Boolean(editing)"
            :maxlength="64"
            placeholder="仅字母、数字、点、下划线、短横线"
        /></label>
        <label><span>分类名称 <b>*</b></span><Input v-model:value="form.categoryName" :maxlength="128" /></label>
        <label><span>上级分类</span><Select
            v-model:value="form.parentId"
            allow-clear
            :options="parentOptions"
            placeholder="不选择则为一级分类"
            show-search
        /></label>
        <label><span>排序</span><InputNumber
            v-model:value="form.sort"
            class="w-full"
            :max="999999"
            :min="0"
            :precision="0"
        /></label>
        <label><span>状态</span><Switch
            :checked="form.status === 0"
            checked-children="启用"
            un-checked-children="停用"
            @change="form.status = $event ? 0 : 1"
        /></label>
        <label><span>备注</span><Input.TextArea
            v-model:value="form.remark"
            :maxlength="500"
            :rows="4"
            show-count
        /></label>
        <div class="product-category-drawer__actions">
          <Button @click="resetForm">重置</Button><Button
            :disabled="!canSave"
            :loading="saving"
            type="primary"
            @click="save"
          >
            保存分类
          </Button>
        </div>
      </section>
    </div>
  </Drawer>
</template>

<style scoped>
.product-category-drawer {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 18px;
}

.product-category-drawer > section {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.product-category-drawer__heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.product-category-drawer__heading > div,
:deep(.ant-table-cell:first-child) {
  display: grid;
  gap: 2px;
}

.product-category-drawer__heading small,
:deep(.ant-table-cell:first-child small) {
  font-size: 12px;
  color: #64748b;
}

.product-category-drawer__form {
  display: flex;
  flex-direction: column;
  gap: 13px;
  background: #f8fafc;
}

.product-category-drawer__form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.product-category-drawer__form label > span {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.product-category-drawer__form b {
  color: #ef4444;
}

.product-category-drawer__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  margin-top: auto;
}

@media (max-width: 760px) {
  .product-category-drawer {
    grid-template-columns: 1fr;
  }
}
</style>
