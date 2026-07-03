<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Card, Input, Modal, Popconfirm, Space, Table, Tag, message } from 'ant-design-vue';

import {
  createFdmPerformanceTemplateGroup,
  deleteFdmPerformanceTemplate,
  deleteFdmPerformanceTemplateGroup,
  duplicateFdmPerformanceTemplate,
  getFdmPerformanceTemplateGroupSimpleList,
  getFdmPerformanceTemplatePage,
  type FdmPerformanceTemplateApi,
} from '#/api/fdmperformance/template';

import PerformanceShell from '../shared/PerformanceShell.vue';
import { mapApiTemplate } from '../shared/api-adapter';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceTemplates' });

const router = useRouter();
const { performancePath } = usePerformancePath();
const ALL_GROUP_NAME = '全部考评表';
const keyword = ref('');
const groupKeyword = ref('');
const newGroupName = ref('');
const activeGroup = ref(ALL_GROUP_NAME);
const selectedRowKeys = ref<number[]>([]);
const previewOpen = ref(false);
const loading = ref(false);
const groupCreating = ref(false);
const apiTemplates = ref<ReturnType<typeof mapApiTemplate>[]>([]);
const apiTemplateGroups = ref<FdmPerformanceTemplateApi.TemplateGroup[]>([]);
type TemplateGroupItem = { count: number; id?: number; name: string };

const templates = computed(() => apiTemplates.value);

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '考评表名称' },
  { dataIndex: 'participants', title: '参与人数', width: 120 },
  { dataIndex: 'periodType', title: '周期类型', width: 120 },
  { dataIndex: 'autoLaunch', title: '自动发起考核', width: 140 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'updatedAt', title: '更新时间', width: 170 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 260 },
];

const filteredTemplates = computed(() => {
  const text = keyword.value.trim();
  return templates.value.filter((item) => {
    const groupMatched = activeGroup.value === ALL_GROUP_NAME || item.group === activeGroup.value;
    const textMatched = !text || [item.name, item.group, item.scoringRule].some((value) => value.includes(text));
    return groupMatched && textMatched;
  });
});

const templateGroups = computed<TemplateGroupItem[]>(() => {
  const counts = new Map<string, number>();
  templates.value.forEach((item) => counts.set(item.group, (counts.get(item.group) || 0) + 1));
  const names = new Set<string>();
  const groupIdMap = new Map<string, number>();
  apiTemplateGroups.value.forEach((group) => {
    if (group.name) {
      names.add(group.name);
      groupIdMap.set(group.name, group.id);
    }
  });
  counts.forEach((_, name) => names.add(name));
  const searchText = groupKeyword.value.trim();
  return [
    { count: templates.value.length, name: ALL_GROUP_NAME },
    ...Array.from(names)
      .filter((name) => !searchText || name.includes(searchText))
      .map((name) => ({ count: counts.get(name) || 0, id: groupIdMap.get(name), name })),
  ];
});
const activeGroupTitle = computed(() =>
  activeGroup.value === ALL_GROUP_NAME ? ALL_GROUP_NAME : `${activeGroup.value}考评表`,
);
const previewRows = computed(() => {
  const keys = selectedRowKeys.value.length
    ? new Set(selectedRowKeys.value)
    : new Set(filteredTemplates.value.map((item) => item.id));
  return filteredTemplates.value.filter((item) => keys.has(item.id));
});
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (number | string)[]) => {
    selectedRowKeys.value = keys.map(Number);
  },
}));

function createTemplate() {
  const group = activeGroup.value === ALL_GROUP_NAME ? undefined : activeGroup.value;
  router.push({
    path: performancePath('/templates/new/edit'),
    query: group ? { group } : undefined,
  });
}

function selectGroup(name: string) {
  activeGroup.value = name;
  selectedRowKeys.value = [];
}

async function copyTemplate(id: number) {
  await duplicateFdmPerformanceTemplate(id);
  await loadTemplates();
  message.success('已复制考评表');
}

async function removeTemplate(id: number) {
  await deleteFdmPerformanceTemplate(id);
  selectedRowKeys.value = selectedRowKeys.value.filter((item) => item !== id);
  await loadTemplates();
  message.success('已删除考评表');
}

function openBatchPreview() {
  if (filteredTemplates.value.length === 0) {
    message.warning('当前分组没有可预览的考评表');
    return;
  }
  previewOpen.value = true;
}

function aiGenerateTemplate() {
  const group = activeGroup.value === ALL_GROUP_NAME ? '未分类考评表' : activeGroup.value;
  router.push({
    path: performancePath('/templates/new/edit'),
    query: {
      ai: '1',
      group,
    },
  });
}

async function createTemplateGroup() {
  const name = newGroupName.value.trim();
  if (!name) {
    message.warning('请输入分组名称');
    return;
  }
  if (name === ALL_GROUP_NAME) {
    message.warning('不能使用系统分组名称');
    return;
  }
  if (templateGroups.value.some((group) => group.name === name)) {
    groupKeyword.value = '';
    selectGroup(name);
    newGroupName.value = '';
    message.info('分组已存在，已为你选中');
    return;
  }
  groupCreating.value = true;
  try {
    await createFdmPerformanceTemplateGroup({ name });
    await loadTemplateGroups();
    groupKeyword.value = '';
    selectGroup(name);
    newGroupName.value = '';
    message.success('已新增考评表分组');
  } finally {
    groupCreating.value = false;
  }
}

function canDeleteTemplateGroup(group: TemplateGroupItem) {
  return Boolean(group.id) && group.name !== ALL_GROUP_NAME && group.name !== '未分类考评表';
}

async function removeTemplateGroup(group: TemplateGroupItem) {
  if (!group.id) {
    return;
  }
  await deleteFdmPerformanceTemplateGroup(group.id);
  if (activeGroup.value === group.name) {
    selectGroup(ALL_GROUP_NAME);
  }
  selectedRowKeys.value = [];
  await Promise.all([loadTemplates(), loadTemplateGroups()]);
  message.success('已删除考评表分组');
}

async function loadTemplates() {
  loading.value = true;
  try {
    const page = await getFdmPerformanceTemplatePage({
      name: keyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 100,
    });
    apiTemplates.value = (page.list || []).map(mapApiTemplate);
  } finally {
    loading.value = false;
  }
}

async function loadTemplateGroups() {
  apiTemplateGroups.value = await getFdmPerformanceTemplateGroupSimpleList();
}

onMounted(async () => {
  await Promise.all([loadTemplates(), loadTemplateGroups()]);
});
</script>

<template>
  <PerformanceShell
    description="维护各岗位考评表模板，编辑后进入基础信息、考核指标和考核流程三步配置。"
    title="考评表"
  >
    <template #actions>
      <Button @click="openBatchPreview">批量预览</Button>
      <Button @click="aiGenerateTemplate">AI生成</Button>
      <Button type="primary" @click="createTemplate">新增考评表</Button>
    </template>

    <div class="template-layout">
      <Card class="group-panel">
        <Input v-model:value="groupKeyword" allow-clear placeholder="搜索考评表分组" />
        <div class="group-create">
          <Input v-model:value="newGroupName" placeholder="输入新分组名称" @press-enter="createTemplateGroup" />
          <Button :loading="groupCreating" type="primary" @click="createTemplateGroup">添加</Button>
        </div>
        <div class="group-list">
          <div
            v-for="group in templateGroups"
            :key="group.name"
            class="group-item"
            :class="{ active: activeGroup === group.name }"
            role="button"
            tabindex="0"
            @click="selectGroup(group.name)"
            @keydown.enter="selectGroup(group.name)"
          >
            <span>{{ group.name }}</span>
            <span class="group-meta" @click.stop>
              <em>{{ group.count }}</em>
              <Popconfirm
                v-if="canDeleteTemplateGroup(group)"
                title="确认删除该分组？该分组下的考评表会移入未分类。"
                @confirm="removeTemplateGroup(group)"
              >
                <Button class="group-delete" danger size="small" type="link">删除</Button>
              </Popconfirm>
            </span>
          </div>
        </div>
      </Card>

      <Card class="table-panel" :title="activeGroupTitle">
        <div class="toolbar">
          <Input v-model:value="keyword" allow-clear placeholder="请输入考评表名称" />
        </div>
        <Table
          :columns="columns"
          :data-source="filteredTemplates"
          :loading="loading"
          :pagination="{ pageSize: 10 }"
          :row-selection="rowSelection"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'participants'">
              {{ record.participants.length }}
            </template>
            <template v-else-if="column.dataIndex === 'autoLaunch'">
              {{ record.autoLaunch ? '已开启' : '未开启' }}
            </template>
            <template v-else-if="column.dataIndex === 'status'">
              <Tag :color="record.status === 'enabled' ? 'green' : 'default'">
                {{ record.status === 'enabled' ? '启用' : '草稿' }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space>
                <Button size="small" type="link" @click="router.push(performancePath(`/templates/${record.id}/edit`))">编辑</Button>
                <Button size="small" type="link" @click="copyTemplate(record.id)">复制</Button>
                <Button size="small" type="link" @click="router.push({ path: performancePath('/launch'), query: { templateId: record.id } })">发起考核</Button>
                <Popconfirm title="确认删除该考评表？" @confirm="removeTemplate(record.id)">
                  <Button danger size="small" type="link">删除</Button>
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
      </Card>
    </div>

    <Modal v-model:open="previewOpen" title="批量预览考评表" width="900px" :footer="null">
      <div class="preview-list">
        <Card v-for="item in previewRows" :key="item.id" size="small">
          <div class="preview-card">
            <div>
              <strong>{{ item.name }}</strong>
              <p>{{ item.group }} · {{ item.periodType }} · {{ item.scoringRule }}</p>
            </div>
            <Space>
              <Tag>{{ item.participants.length }}人</Tag>
              <Tag :color="item.autoLaunch ? 'blue' : 'default'">{{ item.autoLaunch ? '自动发起' : '手动发起' }}</Tag>
              <Button size="small" type="link" @click="router.push(performancePath(`/templates/${item.id}/edit`))">
                编辑
              </Button>
            </Space>
          </div>
        </Card>
      </div>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.template-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
}

.group-panel :deep(.ant-card-body) {
  display: grid;
  gap: 12px;
}

.group-create {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px;
  gap: 8px;
}

.group-list {
  display: grid;
  gap: 4px;
}

.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  color: #374151;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.group-item.active {
  color: #1677ff;
  background: #eaf3ff;
}

.group-item em {
  color: #94a3b8;
  font-style: normal;
}

.group-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.group-delete {
  height: 24px;
  padding: 0;
  opacity: 0;
}

.group-item:hover .group-delete,
.group-item.active .group-delete {
  opacity: 1;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
}

.toolbar :deep(.ant-input-affix-wrapper) {
  width: 260px;
}

.preview-list {
  display: grid;
  gap: 10px;
}

.preview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.preview-card p {
  margin: 6px 0 0;
  color: #64748b;
}

@media (max-width: 960px) {
  .template-layout {
    grid-template-columns: 1fr;
  }
}
</style>
