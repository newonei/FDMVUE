<script lang="ts" setup>
import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { getTemplateSelectPage } from '#/api/fdmperformance';
import { getSimpleDeptList } from '#/api/system/dept';

import { PERIOD_OPTIONS } from '../../shared/constants';

defineOptions({ name: 'JixiaoTemplatePickerModal' });

const props = defineProps<{
  open: boolean;
  selected?: JixiaoApi.TemplateSelectItem[];
}>();

const emit = defineEmits<{
  confirm: [templates: JixiaoApi.TemplateSelectItem[]];
  'update:open': [open: boolean];
}>();

const PAGE_SIZE = 20;
const loading = ref(false);
const departmentsLoaded = ref(false);
const rows = ref<JixiaoApi.TemplateSelectItem[]>([]);
const departments = ref<SystemDeptApi.Dept[]>([]);
const draftSelected = ref<JixiaoApi.TemplateSelectItem[]>([]);
const total = ref(0);
let latestRequestId = 0;
const query = reactive<JixiaoApi.TemplateSelectPageParams>({
  deptId: undefined,
  keyword: '',
  pageNo: 1,
  pageSize: PAGE_SIZE,
  periodType: undefined,
});

const departmentOptions = computed(() => {
  const options: Array<{ label: string; value: number }> = [];
  const walk = (items: SystemDeptApi.Dept[]) => {
    for (const item of items) {
      if (item.id !== undefined) {
        options.push({ label: item.name, value: item.id });
      }
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(departments.value);
  return options;
});
const selectedIds = computed(
  () => new Set(draftSelected.value.map((item) => item.id)),
);

function periodLabel(periodType?: string) {
  return (
    PERIOD_OPTIONS.find((item) => item.value === periodType)?.label ||
    periodType ||
    '-'
  );
}

async function loadTemplates() {
  const requestId = ++latestRequestId;
  loading.value = true;
  try {
    const data = await getTemplateSelectPage(query);
    if (requestId !== latestRequestId) return;
    rows.value = data.list;
    total.value = data.total;
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false;
    }
  }
}

async function loadDepartments() {
  if (departmentsLoaded.value) return;
  try {
    departments.value = await getSimpleDeptList();
  } finally {
    departmentsLoaded.value = true;
  }
}

async function initialize() {
  draftSelected.value = [...(props.selected || [])];
  rows.value = [];
  total.value = 0;
  Object.assign(query, {
    deptId: undefined,
    keyword: '',
    pageNo: 1,
    pageSize: PAGE_SIZE,
    periodType: undefined,
  });
  await Promise.allSettled([loadTemplates(), loadDepartments()]);
}

function toggleTemplate(item: JixiaoApi.TemplateSelectItem) {
  if (selectedIds.value.has(item.id)) {
    draftSelected.value = draftSelected.value.filter(
      (selected) => selected.id !== item.id,
    );
    return;
  }
  draftSelected.value = [...draftSelected.value, item];
}

function removeTemplate(id: number) {
  draftSelected.value = draftSelected.value.filter((item) => item.id !== id);
}

function handleSearch() {
  query.keyword = query.keyword?.trim() || '';
  query.pageNo = 1;
  void loadTemplates();
}

function handleKeywordChange(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (!value) {
    handleSearch();
  }
}

function handleFilterChange() {
  query.pageNo = 1;
  void loadTemplates();
}

function handlePageChange(page: number) {
  query.pageNo = page;
  void loadTemplates();
}

function close() {
  emit('update:open', false);
}

function confirm() {
  if (draftSelected.value.length === 0) return;
  emit('confirm', draftSelected.value);
  close();
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void initialize();
    }
  },
);
</script>

<template>
  <Modal
    :destroy-on-close="false"
    :open="open"
    :width="960"
    title="选择考评表"
    wrap-class-name="jixiao-template-picker"
    @cancel="close"
  >
    <div class="picker-layout">
      <section class="template-browser">
        <div class="filter-row">
          <Input.Search
            v-model:value="query.keyword"
            allow-clear
            placeholder="搜索考评表名称"
            @change="handleKeywordChange"
            @search="handleSearch"
          />
          <Select
            v-model:value="query.periodType"
            :options="PERIOD_OPTIONS"
            allow-clear
            placeholder="全部周期"
            @change="handleFilterChange"
          />
          <Select
            v-model:value="query.deptId"
            :options="departmentOptions"
            allow-clear
            option-filter-prop="label"
            placeholder="全部部门"
            show-search
            @change="handleFilterChange"
          />
        </div>

        <div class="list-region">
          <Spin :spinning="loading">
            <div v-if="rows.length" class="template-list">
              <div
                v-for="item in rows"
                :key="item.id"
                :aria-checked="selectedIds.has(item.id)"
                class="template-row"
                :class="[{ 'is-selected': selectedIds.has(item.id) }]"
                role="checkbox"
                tabindex="0"
                @click="toggleTemplate(item)"
                @keydown.enter.prevent="toggleTemplate(item)"
                @keydown.space.prevent="toggleTemplate(item)"
              >
                <Checkbox
                  :checked="selectedIds.has(item.id)"
                  @change="toggleTemplate(item)"
                  @click.stop
                />
                <div class="template-content">
                  <div class="template-name" :title="item.name">
                    {{ item.name }}
                  </div>
                  <div class="template-meta">
                    <Tag color="blue">{{ periodLabel(item.periodType) }}</Tag>
                    <span>{{ item.personCount }} 人</span>
                    <span>{{ item.indicatorCount }} 项指标</span>
                  </div>
                  <div
                    class="department-names"
                    :title="item.deptNames.join('、')"
                  >
                    {{
                      item.deptNames.length
                        ? item.deptNames.join('、')
                        : '未设置部门'
                    }}
                  </div>
                </div>
                <IconifyIcon
                  v-if="selectedIds.has(item.id)"
                  class="selected-icon"
                  icon="lucide:check"
                />
              </div>
            </div>
            <Empty
              v-else-if="!loading"
              class="empty-list"
              description="暂无可用考评表"
            />
          </Spin>
        </div>

        <Pagination
          v-if="total > PAGE_SIZE"
          :current="query.pageNo"
          :page-size="PAGE_SIZE"
          :show-size-changer="false"
          :total="total"
          class="pagination"
          show-less-items
          @change="handlePageChange"
        />
      </section>

      <aside class="selected-pane">
        <div class="selected-heading">
          <span>已选择 {{ draftSelected.length }} 项</span>
          <Tooltip v-if="draftSelected.length" title="清空选择">
            <Button
              aria-label="清空选择"
              shape="circle"
              size="small"
              type="text"
              @click="draftSelected = []"
            >
              <template #icon>
                <IconifyIcon icon="lucide:x" />
              </template>
            </Button>
          </Tooltip>
        </div>

        <div v-if="draftSelected.length" class="selected-list">
          <div
            v-for="item in draftSelected"
            :key="item.id"
            class="selected-summary"
          >
            <div class="selected-name-row">
              <div class="selected-name" :title="item.name">
                {{ item.name }}
              </div>
              <Button
                :aria-label="`移除${item.name}`"
                shape="circle"
                size="small"
                type="text"
                @click="removeTemplate(item.id)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:x" />
                </template>
              </Button>
            </div>
            <div class="summary-line">
              <span>考核周期</span>
              <strong>{{ periodLabel(item.periodType) }}</strong>
            </div>
            <div class="summary-line">
              <span>人员 / 指标</span>
              <strong>
                {{ item.personCount }} 人 / {{ item.indicatorCount }} 项
              </strong>
            </div>
            <div class="selected-departments">
              {{
                item.deptNames.length ? item.deptNames.join('、') : '未设置部门'
              }}
            </div>
          </div>
        </div>
        <Empty v-else class="empty-selection" description="尚未选择考评表" />
      </aside>
    </div>

    <template #footer>
      <Button @click="close">取消</Button>
      <Button
        :disabled="draftSelected.length === 0"
        type="primary"
        @click="confirm"
      >
        确定
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.picker-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
  min-height: 500px;
  margin: -8px -24px;
}

.template-browser {
  display: flex;
  min-width: 0;
  padding: 20px 20px 16px;
  border-right: 1px solid #edf0f4;
  flex-direction: column;
}

.filter-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 115px 130px;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf0f4;
}

.list-region {
  height: 372px;
  overflow-y: auto;
}

.template-list {
  padding-top: 8px;
}

.template-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  gap: 8px;
  min-height: 72px;
  padding: 10px 8px;
  cursor: pointer;
  border-bottom: 1px solid #f0f2f5;
  outline: none;
  align-items: center;
}

.template-row:hover,
.template-row:focus-visible {
  background: #f7f9fc;
}

.template-row.is-selected {
  background: #f0f7ff;
}

.template-content {
  min-width: 0;
}

.template-name,
.selected-name {
  overflow: hidden;
  font-weight: 600;
  color: #1f2329;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-meta {
  display: flex;
  gap: 10px;
  margin-top: 5px;
  font-size: 12px;
  color: #646a73;
  align-items: center;
}

.template-meta :deep(.ant-tag) {
  margin-inline-end: 0;
}

.department-names {
  overflow: hidden;
  margin-top: 4px;
  font-size: 12px;
  color: #8f959e;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-icon {
  color: #1677ff;
}

.empty-list {
  display: flex;
  min-height: 372px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.pagination {
  margin-top: auto;
  padding-top: 14px;
  text-align: right;
}

.selected-pane {
  min-width: 0;
  padding: 20px;
  background: #fafbfc;
}

.selected-heading {
  display: flex;
  min-height: 32px;
  padding-bottom: 12px;
  font-weight: 600;
  border-bottom: 1px solid #e8ebef;
  align-items: center;
  justify-content: space-between;
}

.selected-list {
  max-height: 430px;
  overflow-y: auto;
}

.selected-summary {
  padding: 16px;
  margin-top: 16px;
  background: #fff;
  border: 1px solid #d9e7f7;
  border-radius: 6px;
}

.selected-name-row {
  display: flex;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid #edf0f4;
  align-items: center;
  justify-content: space-between;
}

.selected-name {
  min-width: 0;
  font-size: 15px;
}

.summary-line {
  display: flex;
  margin-top: 10px;
  font-size: 13px;
  color: #646a73;
  justify-content: space-between;
}

.summary-line strong {
  color: #1f2329;
}

.selected-departments {
  padding-top: 12px;
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.6;
  color: #8f959e;
  border-top: 1px solid #edf0f4;
}

.empty-selection {
  margin-top: 150px;
}

@media (max-width: 760px) {
  .picker-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .template-browser {
    border-right: 0;
  }

  .filter-row {
    grid-template-columns: 1fr;
  }

  .selected-pane {
    border-top: 1px solid #edf0f4;
  }

  .empty-selection {
    margin: 32px 0;
  }
}
</style>
