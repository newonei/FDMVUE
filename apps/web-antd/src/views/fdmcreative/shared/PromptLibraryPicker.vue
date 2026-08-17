<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  getCreativePromptCategories,
  getCreativePromptPage,
} from '#/api/fdmcreative';

import { promptTargetLabel } from './library-options';

interface PromptLibrarySelection {
  content: string;
  mode: 'append' | 'replace';
  prompt: FdmCreativeApi.CreativePrompt;
}

interface Props {
  buttonText?: string;
  currentText?: string;
  disabled?: boolean;
  targetType?: FdmCreativeApi.PromptTargetType;
}

const props = withDefaults(defineProps<Props>(), {
  buttonText: '提示词库',
  currentText: '',
  disabled: false,
  targetType: 'GENERAL',
});

const emit = defineEmits<{
  select: [selection: PromptLibrarySelection];
}>();

const open = ref(false);
const loading = ref(false);
const rows = ref<FdmCreativeApi.CreativePrompt[]>([]);
const categories = ref<FdmCreativeApi.CreativePromptCategory[]>([]);
const selected = ref<FdmCreativeApi.CreativePrompt>();
const total = ref(0);
const query = reactive<{
  category?: FdmCreativeApi.PromptCategory;
  keyword: string;
  pageNo: number;
  pageSize: number;
}>({ keyword: '', pageNo: 1, pageSize: 8 });

const categoryOptions = computed(() =>
  categories.value.map((item) => ({ label: item.label, value: item.code })),
);

async function loadCategories() {
  if (categories.value.length === 0) {
    categories.value = await getCreativePromptCategories();
  }
}

async function load() {
  loading.value = true;
  try {
    const data = await getCreativePromptPage({
      category: query.category,
      compatibleTargetType: props.targetType,
      keyword: query.keyword.trim() || undefined,
      pageNo: query.pageNo,
      pageSize: query.pageSize,
    });
    rows.value = data.list;
    total.value = data.total;
    if (
      selected.value &&
      !rows.value.some((item) => item.id === selected.value?.id)
    ) {
      selected.value = undefined;
    }
  } finally {
    loading.value = false;
  }
}

function show() {
  query.keyword = '';
  query.category = undefined;
  query.pageNo = 1;
  selected.value = undefined;
  open.value = true;
  void Promise.all([loadCategories(), load()]);
}

function apply(mode: 'append' | 'replace') {
  if (!selected.value) return;
  emit('select', {
    content: selected.value.content,
    mode,
    prompt: selected.value,
  });
  open.value = false;
}

function categoryLabel(code: FdmCreativeApi.PromptCategory) {
  return categories.value.find((item) => item.code === code)?.label || code;
}

function excerpt(content: string) {
  return content.length > 220 ? `${content.slice(0, 220)}…` : content;
}
</script>

<template>
  <Button :disabled="disabled" size="small" @click="show">
    <IconifyIcon icon="lucide:notebook-tabs" />
    {{ buttonText }}
  </Button>

  <Modal
    v-model:open="open"
    :footer="null"
    destroy-on-close
    title="从提示词库选择"
    :width="820"
  >
    <div class="prompt-picker-toolbar">
      <Input.Search
        v-model:value="query.keyword"
        allow-clear
        placeholder="搜索名称、内容或标签"
        @search="
          query.pageNo = 1;
          load();
        "
      />
      <Select
        v-model:value="query.category"
        allow-clear
        :options="categoryOptions"
        placeholder="全部分类"
        @change="
          query.pageNo = 1;
          load();
        "
      />
    </div>

    <Spin :spinning="loading">
      <div v-if="rows.length" class="prompt-picker-list">
        <button
          v-for="item in rows"
          :key="item.id"
          class="prompt-option"
          :class="{ selected: selected?.id === item.id }"
          type="button"
          @click="selected = item"
          @dblclick="
            selected = item;
            apply('replace');
          "
        >
          <span class="prompt-option__icon">
            <IconifyIcon
              :icon="
                item.targetType === 'VIDEO'
                  ? 'lucide:film'
                  : item.targetType === 'IMAGE'
                    ? 'lucide:image'
                    : 'lucide:sparkles'
              "
            />
          </span>
          <span class="prompt-option__content">
            <span class="prompt-option__title">
              <strong>{{ item.name }}</strong>
              <Tag :bordered="false">{{ categoryLabel(item.category) }}</Tag>
              <Tag :bordered="false">{{
                promptTargetLabel(item.targetType)
              }}</Tag>
              <Tag v-if="item.visibility === 'TENANT'" color="blue">团队</Tag>
            </span>
            <span>{{ excerpt(item.content) }}</span>
            <small v-if="item.tags">{{ item.tags }}</small>
          </span>
          <IconifyIcon
            v-if="selected?.id === item.id"
            class="prompt-option__check"
            icon="lucide:circle-check-big"
          />
        </button>
      </div>
      <Empty v-else description="没有找到匹配提示词" />
    </Spin>

    <div class="prompt-picker-pagination">
      <span>共 {{ total }} 条</span>
      <Pagination
        v-model:current="query.pageNo"
        :page-size="query.pageSize"
        :show-size-changer="false"
        :total="total"
        @change="load"
      />
    </div>

    <div class="prompt-picker-actions">
      <span v-if="selected">已选择“{{ selected.name }}”</span>
      <span v-else>选择一条提示词后使用</span>
      <div>
        <Button
          :disabled="!selected || !currentText.trim()"
          @click="apply('append')"
        >
          追加到现有内容
        </Button>
        <Button :disabled="!selected" type="primary" @click="apply('replace')">
          替换并使用
        </Button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.prompt-picker-toolbar {
  display: grid;
  grid-template-columns: 1fr 180px;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf0f5;
}

.prompt-picker-list {
  display: grid;
  gap: 8px;
  min-height: 420px;
  padding: 14px 0;
}

.prompt-option {
  position: relative;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 24px;
  gap: 10px;
  align-items: start;
  width: 100%;
  padding: 11px 12px;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e6ebf2;
  border-radius: 9px;
}

.prompt-option:hover,
.prompt-option.selected {
  background: #f7fbff;
  border-color: #69a7ff;
}

.prompt-option__icon {
  display: grid;
  place-content: center;
  width: 36px;
  height: 36px;
  color: #1677ff;
  background: #eaf3ff;
  border-radius: 9px;
}

.prompt-option__content {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.prompt-option__title {
  display: flex;
  gap: 5px;
  align-items: center;
}

.prompt-option__title strong {
  margin-right: 4px;
  color: #1e293b;
}

.prompt-option__content > span:nth-child(2) {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
  -webkit-box-orient: vertical;
}

.prompt-option__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  color: #94a3b8;
  white-space: nowrap;
}

.prompt-option__check {
  margin-top: 8px;
  color: #1677ff;
}

.prompt-picker-pagination,
.prompt-picker-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.prompt-picker-pagination {
  padding: 10px 0;
  color: #8491a5;
  border-top: 1px solid #edf0f5;
}

.prompt-picker-actions {
  padding: 14px 0 2px;
  color: #64748b;
  border-top: 1px solid #edf0f5;
}

.prompt-picker-actions > div {
  display: flex;
  gap: 8px;
}
</style>
