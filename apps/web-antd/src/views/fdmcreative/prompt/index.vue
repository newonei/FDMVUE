<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, onMounted, reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import {
  Button,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  Select,
  Spin,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  createCreativePrompt,
  deleteCreativePrompt,
  getCreativePromptCategories,
  getCreativePromptPage,
  updateCreativePrompt,
} from '#/api/fdmcreative';

import CreativeShell from '../shared/CreativeShell.vue';
import {
  PROMPT_TARGET_OPTIONS,
  PROMPT_VISIBILITY_OPTIONS,
  promptTargetLabel,
} from '../shared/library-options';

defineOptions({ name: 'FdmCreativePrompts' });

const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const sourceFilter = ref<'all' | 'mine'>('all');
const rows = ref<FdmCreativeApi.CreativePrompt[]>([]);
const categories = ref<FdmCreativeApi.CreativePromptCategory[]>([]);
const total = ref(0);
const query = reactive<FdmCreativeApi.CreativePromptPageParams>({
  keyword: '',
  pageNo: 1,
  pageSize: 12,
});
const form = reactive<FdmCreativeApi.CreativePromptSaveReq>({
  category: 'GENERAL',
  content: '',
  description: '',
  name: '',
  tags: '',
  targetType: 'GENERAL',
  visibility: 'PERSONAL',
});

const categoryOptions = computed(() =>
  categories.value.map((item) => ({ label: item.label, value: item.code })),
);

async function load() {
  loading.value = true;
  try {
    const data = await getCreativePromptPage({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function selectCategory(category?: FdmCreativeApi.PromptCategory) {
  query.category = category;
  query.pageNo = 1;
  void load();
}

function changeSourceFilter(value: unknown) {
  query.mineOnly = value === 'mine' ? true : undefined;
  query.pageNo = 1;
  void load();
}

function resetForm() {
  Object.assign(form, {
    category: query.category || 'GENERAL',
    content: '',
    description: '',
    id: undefined,
    name: '',
    tags: '',
    targetType: query.targetType || 'GENERAL',
    visibility: 'PERSONAL',
  });
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(item: FdmCreativeApi.CreativePrompt) {
  Object.assign(form, {
    category: item.category,
    content: item.content,
    description: item.description || '',
    id: item.id,
    name: item.name,
    tags: item.tags || '',
    targetType: item.targetType,
    visibility: item.visibility,
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.name.trim()) {
    message.warning('请输入提示词名称');
    return;
  }
  if (!form.content.trim()) {
    message.warning('请输入提示词内容');
    return;
  }
  saving.value = true;
  try {
    const data = {
      ...form,
      content: form.content.trim(),
      description: form.description?.trim() || undefined,
      name: form.name.trim(),
      tags: form.tags?.trim() || undefined,
    };
    await (data.id
      ? updateCreativePrompt({ ...data, id: data.id })
      : createCreativePrompt(data));
    modalOpen.value = false;
    message.success(data.id ? '提示词已更新' : '提示词已加入库');
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(id: number) {
  await deleteCreativePrompt(id);
  message.success('提示词已删除');
  await load();
}

async function copyContent(item: FdmCreativeApi.CreativePrompt) {
  await navigator.clipboard.writeText(item.content);
  message.success('提示词已复制');
}

function categoryLabel(code: FdmCreativeApi.PromptCategory) {
  return categories.value.find((item) => item.code === code)?.label || code;
}

function categoryIcon(code: FdmCreativeApi.PromptCategory) {
  return {
    BRAND_VISUAL: 'lucide:badge',
    CAMERA_SHOT: 'lucide:video',
    COPYWRITING: 'lucide:captions',
    GENERAL: 'lucide:sparkles',
    ILLUSTRATION_ANIME: 'lucide:palette',
    NEGATIVE_PROMPT: 'lucide:shield-minus',
    PORTRAIT: 'lucide:user-round',
    PRODUCT_ECOMMERCE: 'lucide:shopping-bag',
    PROMPT_OPTIMIZATION: 'lucide:wand-sparkles',
    SCENE_SPACE: 'lucide:building-2',
    SOCIAL_POSTER: 'lucide:panels-top-left',
    VIDEO_SCRIPT: 'lucide:clapperboard',
  }[code];
}

onMounted(async () => {
  categories.value = await getCreativePromptCategories();
  await load();
});
</script>

<template>
  <CreativeShell
    description="沉淀团队常用提示词，在图像、视频和规划节点中一键复用"
    title="提示词库"
  >
    <template #actions>
      <Button
        v-access:code="['fdmcreative:prompt:create']"
        type="primary"
        @click="openCreate"
      >
        <IconifyIcon icon="lucide:plus" />
        新建提示词
      </Button>
    </template>

    <div class="prompt-library">
      <aside class="category-panel">
        <strong>提示词分类</strong>
        <button
          :class="{ active: !query.category }"
          type="button"
          @click="selectCategory()"
        >
          <IconifyIcon icon="lucide:layout-list" />
          <span>全部提示词</span>
        </button>
        <button
          v-for="category in categories"
          :key="category.code"
          :class="{ active: query.category === category.code }"
          :title="category.description"
          type="button"
          @click="selectCategory(category.code)"
        >
          <IconifyIcon :icon="categoryIcon(category.code)" />
          <span>{{ category.label }}</span>
        </button>
      </aside>

      <section class="prompt-content">
        <header class="prompt-toolbar">
          <Input.Search
            v-model:value="query.keyword"
            allow-clear
            placeholder="搜索名称、提示词内容或标签"
            @search="
              query.pageNo = 1;
              load();
            "
          />
          <Select
            v-model:value="query.targetType"
            allow-clear
            :options="PROMPT_TARGET_OPTIONS"
            placeholder="全部用途"
            @change="
              query.pageNo = 1;
              load();
            "
          />
          <Select
            v-model:value="sourceFilter"
            :options="[
              { label: '个人与团队', value: 'all' },
              { label: '我创建的', value: 'mine' },
            ]"
            @change="changeSourceFilter"
          />
        </header>

        <Spin :spinning="loading">
          <div v-if="rows.length" class="prompt-list">
            <article v-for="item in rows" :key="item.id" class="prompt-row">
              <span class="prompt-row__icon">
                <IconifyIcon :icon="categoryIcon(item.category)" />
              </span>
              <div class="prompt-row__main">
                <header>
                  <strong>{{ item.name }}</strong>
                  <Tag :bordered="false">
                    {{ categoryLabel(item.category) }}
                  </Tag>
                  <Tag :bordered="false">
                    {{ promptTargetLabel(item.targetType) }}
                  </Tag>
                  <Tag v-if="item.visibility === 'TENANT'" color="blue">
                    团队共享
                  </Tag>
                </header>
                <p>{{ item.content }}</p>
                <footer>
                  <span v-if="item.tags">
                    <IconifyIcon icon="lucide:tags" />
                    {{ item.tags }}
                  </span>
                  <span>
                    更新于
                    {{
                      item.updateTime ? formatDateTime(item.updateTime) : '—'
                    }}
                  </span>
                </footer>
              </div>
              <div class="prompt-row__actions">
                <Button size="small" type="link" @click="copyContent(item)">
                  复制
                </Button>
                <Button
                  v-access:code="['fdmcreative:prompt:update']"
                  v-if="item.editable"
                  size="small"
                  type="link"
                  @click="openEdit(item)"
                >
                  编辑
                </Button>
                <Popconfirm
                  v-if="item.editable"
                  title="确定删除这条提示词吗？"
                  @confirm="remove(item.id)"
                >
                  <Button
                    v-access:code="['fdmcreative:prompt:delete']"
                    danger
                    size="small"
                    type="link"
                  >
                    删除
                  </Button>
                </Popconfirm>
              </div>
            </article>
          </div>
          <Empty v-else class="prompt-empty" description="暂无匹配提示词" />
        </Spin>

        <footer class="prompt-pagination">
          <span>共 {{ total }} 条提示词</span>
          <Pagination
            v-model:current="query.pageNo"
            v-model:page-size="query.pageSize"
            show-size-changer
            :page-size-options="['12', '24', '48']"
            :total="total"
            @change="load"
            @show-size-change="
              query.pageNo = 1;
              load();
            "
          />
        </footer>
      </section>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      ok-text="保存提示词"
      :title="form.id ? '编辑提示词' : '新建提示词'"
      :width="720"
      @ok="save"
    >
      <Form layout="vertical">
        <div class="form-grid">
          <Form.Item label="提示词名称" required>
            <Input
              v-model:value="form.name"
              :maxlength="100"
              placeholder="例如：极简产品主图"
            />
          </Form.Item>
          <Form.Item label="分类" required>
            <Select v-model:value="form.category" :options="categoryOptions" />
          </Form.Item>
          <Form.Item label="适用内容" required>
            <Radio.Group v-model:value="form.targetType" button-style="solid">
              <Radio.Button
                v-for="item in PROMPT_TARGET_OPTIONS"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="可见范围" required>
            <Select
              v-model:value="form.visibility"
              :options="PROMPT_VISIBILITY_OPTIONS"
            >
              <template #option="{ label, description }">
                <div class="visibility-option">
                  <strong>{{ label }}</strong>
                  <span>{{ description }}</span>
                </div>
              </template>
            </Select>
          </Form.Item>
        </div>
        <Form.Item label="提示词内容" required>
          <Textarea
            v-model:value="form.content"
            :auto-size="{ minRows: 7, maxRows: 14 }"
            :maxlength="10000"
            placeholder="输入完整提示词；可保留 {{input}}、{{context}} 等工作台变量"
            show-count
          />
        </Form.Item>
        <Form.Item label="使用说明">
          <Input
            v-model:value="form.description"
            :maxlength="500"
            placeholder="说明适用场景或使用注意事项"
          />
        </Form.Item>
        <Form.Item label="搜索标签">
          <Input
            v-model:value="form.tags"
            :maxlength="500"
            placeholder="多个标签用逗号分隔，例如：白底, 电商, 产品摄影"
          />
        </Form.Item>
      </Form>
    </Modal>
  </CreativeShell>
</template>

<style scoped>
.prompt-library {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  min-height: 620px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e7edf5;
  border-radius: 12px;
}

.category-panel {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 16px 10px;
  background: #f8fafc;
  border-right: 1px solid #e7edf5;
}

.category-panel > strong {
  padding: 0 9px 10px;
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.08em;
}

.category-panel button {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 8px 10px;
  color: #526176;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.category-panel button:hover,
.category-panel button.active {
  color: #1668dc;
  background: #eaf3ff;
}

.prompt-content {
  min-width: 0;
  padding: 14px;
}

.prompt-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 140px 150px;
  gap: 8px;
  padding-bottom: 13px;
  border-bottom: 1px solid #edf1f6;
}

.prompt-list {
  display: grid;
  min-height: 490px;
  padding: 4px 0;
}

.prompt-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 11px;
  align-items: start;
  padding: 12px 6px;
  border-bottom: 1px solid #edf1f6;
}

.prompt-row:hover {
  background: #fbfdff;
}

.prompt-row__icon {
  display: grid;
  place-content: center;
  width: 36px;
  height: 36px;
  color: #1677ff;
  background: #eaf3ff;
  border-radius: 9px;
}

.prompt-row__main {
  min-width: 0;
}

.prompt-row__main header,
.prompt-row__main footer,
.prompt-row__actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.prompt-row__main header strong {
  margin-right: 4px;
  color: #1e293b;
}

.prompt-row__main p {
  display: -webkit-box;
  max-width: 920px;
  margin: 7px 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.6;
  color: #526176;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
}

.prompt-row__main footer {
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
}

.prompt-row__main footer span {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.prompt-row__actions {
  padding-top: 2px;
}

.prompt-empty {
  min-height: 490px;
  padding-top: 170px;
}

.prompt-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 13px;
  color: #64748b;
  border-top: 1px solid #edf1f6;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.visibility-option {
  display: grid;
}

.visibility-option span {
  font-size: 11px;
  color: #94a3b8;
}

@media (max-width: 900px) {
  .prompt-library {
    grid-template-columns: 1fr;
  }

  .category-panel {
    flex-flow: row wrap;
    border-right: 0;
    border-bottom: 1px solid #e7edf5;
  }

  .category-panel > strong {
    width: 100%;
  }
}
</style>
