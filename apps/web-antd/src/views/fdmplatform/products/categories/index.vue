<script setup lang="ts">
import type { CategoryNode } from '../category-model';

import type { ProductCategory } from '#/api/fdmplatform/products';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  deleteProductCategory,
  getProductCategories,
  mergeProductCategory,
  saveProductCategory,
} from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import {
  categoryList,
  categoryName,
  categoryOptions,
  searchCategories,
} from '../category-model';

defineOptions({ name: 'FdmPlatformProductCategories' });

/** 产品分类维护：一层分类。改名、合并会同步改写产品上的分类名称。 */
const companyId = 0;
const router = useRouter();
const categories = ref<ProductCategory[]>([]);
const list = ref<CategoryNode[]>([]);
const uncategorized = ref(0);
const loading = ref(false);
const panelError = ref('');
const search = ref('');
const rows = computed(() => searchCategories(list.value, search.value));

async function load() {
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getProductCategories({ companyId });
    categories.value = result.categories ?? [];
    list.value = categoryList(categories.value, result.items);
    uncategorized.value =
      result.items.find((item) => !item.categoryId)?.count ?? 0;
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());

function byId(id: string) {
  return categories.value.find((item) => item.id === id);
}
function openProducts(node: CategoryNode) {
  void router.push({
    path: '/fdmproducts/catalog',
    query: {
      catalogCategory: node.id,
      catalogCategoryLabel: node.name,
    },
  });
}

/* 新增 / 编辑 */
const editor = reactive({
  open: false,
  saving: false,
  error: '',
  key: '',
  id: undefined as string | undefined,
  version: undefined as number | undefined,
  name: '',
  sort: undefined as number | undefined,
  active: true,
});
function openEditor(category?: ProductCategory) {
  Object.assign(editor, {
    open: true,
    saving: false,
    error: '',
    key: newIdempotencyKey(),
    id: category?.id,
    version: category?.version,
    name: category?.name ?? '',
    sort: category?.sort,
    active: category?.active ?? true,
  });
}
async function saveEditor() {
  if (!editor.name.trim()) {
    editor.error = '请填写分类名称';
    return;
  }
  editor.saving = true;
  editor.error = '';
  try {
    await saveProductCategory({
      companyId,
      id: editor.id,
      expectedVersion: editor.version,
      name: editor.name.trim(),
      sort: editor.sort ?? undefined,
      active: editor.active,
      idempotencyKey: editor.key,
    });
    message.success(editor.id ? '分类已保存' : '分类已新增');
    editor.open = false;
    await load();
  } catch (error) {
    editor.error = errorText(error);
  } finally {
    editor.saving = false;
  }
}

/* 合并 */
const merger = reactive({
  open: false,
  saving: false,
  error: '',
  key: '',
  source: undefined as CategoryNode | undefined,
  targetId: undefined as string | undefined,
});
const mergeTargets = computed(() =>
  categoryOptions(categories.value).filter(
    (item) => item.value !== merger.source?.id,
  ),
);
function openMerge(node: CategoryNode) {
  Object.assign(merger, {
    open: true,
    saving: false,
    error: '',
    key: newIdempotencyKey(),
    source: node,
    targetId: undefined,
  });
}
async function saveMerge() {
  if (!merger.source || !merger.targetId) {
    merger.error = '请选择要并入的分类';
    return;
  }
  merger.saving = true;
  merger.error = '';
  try {
    const result = await mergeProductCategory(merger.source.id, {
      companyId,
      targetId: merger.targetId,
      idempotencyKey: merger.key,
    });
    message.success(
      `已把 ${result.movedCount} 个产品并入“${categoryName(categories.value, merger.targetId)}”`,
    );
    merger.open = false;
    await load();
  } catch (error) {
    merger.error = errorText(error);
  } finally {
    merger.saving = false;
  }
}

async function remove(node: CategoryNode) {
  try {
    await deleteProductCategory(node.id, {
      companyId,
      idempotencyKey: newIdempotencyKey(),
    });
    message.success('分类已删除');
    await load();
  } catch (error) {
    message.error(errorText(error));
  }
}

const columns = [
  { title: '分类名称', key: 'name', dataIndex: 'name' },
  {
    title: '产品数',
    key: 'count',
    dataIndex: 'count',
    width: 110,
    align: 'right' as const,
  },
  { title: '状态', key: 'active', width: 90 },
  { title: '排序', key: 'sort', width: 80, align: 'right' as const },
  { title: '操作', key: 'actions', width: 260 },
];
</script>

<template>
  <Page auto-content-height>
    <div class="category-stack">
      <header class="category-header">
        <div>
          <div class="category-eyebrow">产品中心</div>
          <h1>产品分类</h1>
          <p>
            新建、编辑和导入产品时只能选这里的分类。改名或合并后，产品档案中的分类会同步更新。
          </p>
        </div>
        <Button type="primary" @click="openEditor()">新增分类</Button>
      </header>
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        v-if="uncategorized > 0"
        type="warning"
        show-icon
        :message="`还有 ${uncategorized} 个产品未分类，可在产品档案左侧“未分类”中逐个编辑选择分类。`"
      />
      <Card :body-style="{ padding: '12px 16px' }">
        <Space direction="vertical" :size="12" style="width: 100%">
          <Input
            v-model:value="search"
            class="category-search"
            placeholder="搜索分类名称"
            allow-clear
          />
          <Table
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :pagination="false"
            row-key="id"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'count'">
                <Button
                  v-if="record.count > 0"
                  type="link"
                  size="small"
                  @click="openProducts(record as CategoryNode)"
                >
                  {{ record.count }}
                </Button>
                <span v-else class="muted">0</span>
              </template>
              <template v-else-if="column.key === 'active'">
                <Tag v-if="record.active" color="green">启用</Tag>
                <Tag v-else>停用</Tag>
              </template>
              <template v-else-if="column.key === 'sort'">
                {{ byId(record.id)?.sort }}
              </template>
              <template v-else-if="column.key === 'actions'">
                <Space :size="2" wrap>
                  <Button
                    type="link"
                    size="small"
                    @click="openEditor(byId(record.id))"
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    @click="openMerge(record as CategoryNode)"
                  >
                    合并到…
                  </Button>
                  <Popconfirm
                    :title="`删除“${record.name}”？`"
                    ok-text="删除"
                    cancel-text="取消"
                    @confirm="remove(record as CategoryNode)"
                  >
                    <Button type="link" size="small" danger>删除</Button>
                  </Popconfirm>
                </Space>
              </template>
            </template>
          </Table>
        </Space>
      </Card>
    </div>

    <Modal
      v-model:open="editor.open"
      :title="editor.id ? '编辑分类' : '新增分类'"
      :confirm-loading="editor.saving"
      ok-text="保存"
      cancel-text="取消"
      :mask-closable="false"
      @ok="saveEditor"
    >
      <Space direction="vertical" :size="12" style="width: 100%">
        <Alert
          v-if="editor.error"
          type="error"
          show-icon
          :message="editor.error"
        />
        <Form layout="vertical">
          <Form.Item label="名称" required>
            <Input
              v-model:value="editor.name"
              :maxlength="50"
              placeholder="例如：TPE瑜伽垫"
            />
          </Form.Item>
          <Form.Item label="排序" extra="数字小的排前面；不填则排在最后">
            <InputNumber
              v-model:value="editor.sort"
              :min="0"
              :max="99999"
              :precision="0"
              style="width: 160px"
            />
          </Form.Item>
          <Form.Item
            label="启用"
            extra="停用后不能再给产品选这个分类，已在其中的产品不受影响"
          >
            <Switch v-model:checked="editor.active" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>

    <Modal
      v-model:open="merger.open"
      title="合并分类"
      :confirm-loading="merger.saving"
      ok-text="合并"
      cancel-text="取消"
      :mask-closable="false"
      @ok="saveMerge"
    >
      <Space direction="vertical" :size="12" style="width: 100%">
        <Alert
          v-if="merger.error"
          type="error"
          show-icon
          :message="merger.error"
        />
        <Alert
          type="info"
          show-icon
          :message="`“${merger.source?.name}”下的 ${merger.source?.count ?? 0} 个产品将并入所选分类，合并后“${merger.source?.name}”删除，不能撤销。`"
        />
        <Select
          v-model:value="merger.targetId"
          :options="mergeTargets"
          placeholder="选择并入的分类"
          show-search
          option-filter-prop="label"
          :list-height="360"
          style="width: 100%"
        />
      </Space>
    </Modal>
  </Page>
</template>

<style scoped>
.category-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-header {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px 8px;
}

.category-eyebrow {
  margin-bottom: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.category-header h1 {
  margin: 0;
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.5px;
}

.category-header p {
  margin: 6px 0 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.category-search {
  max-width: 320px;
}

.muted {
  color: hsl(var(--muted-foreground));
}
</style>
