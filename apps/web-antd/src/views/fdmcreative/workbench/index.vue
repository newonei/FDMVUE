<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmCreativeApi } from '#/api/fdmcreative';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  createCreativeProject,
  deleteCreativeProject,
  getCreativeProjectMembers,
  getCreativeProjectPage,
  saveCreativeProjectMembers,
  updateCreativeProject,
} from '#/api/fdmcreative';
import { getSimpleUserList } from '#/api/system/user';

import CreativeShell from '../shared/CreativeShell.vue';

defineOptions({ name: 'FdmCreativeWorkbench' });

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const shareOpen = ref(false);
const shareLoading = ref(false);
const shareSaving = ref(false);
const shareProject = ref<FdmCreativeApi.Project>();
const users = ref<SystemUserApi.User[]>([]);
const ownerMember = ref<FdmCreativeApi.ProjectMember>();
const shareMembers = ref<
  Array<{
    role: Exclude<FdmCreativeApi.ProjectMemberRole, 'OWNER'>;
    userId?: number;
  }>
>([]);
const rows = ref<FdmCreativeApi.Project[]>([]);
const total = ref(0);
const query = reactive<FdmCreativeApi.ProjectPageParams>({
  keyword: '',
  pageNo: 1,
  pageSize: 12,
});
const form = reactive<FdmCreativeApi.ProjectSaveReq>({
  description: '',
  name: '',
});

const userOptions = computed(() =>
  users.value.map((item) => ({
    label: `${item.nickname || item.username} (${item.id})`,
    value: item.id,
  })),
);

const ownerName = computed(() => {
  const ownerId = ownerMember.value?.userId ?? shareProject.value?.ownerUserId;
  const owner = users.value.find((item) => Number(item.id) === Number(ownerId));
  return owner
    ? `${owner.nickname || owner.username} (${owner.id})`
    : ownerId
      ? `用户 ${ownerId}`
      : '—';
});

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '项目名称', width: 230 },
  { dataIndex: 'description', title: '创作说明' },
  { dataIndex: 'draftVersion', title: '草稿版本', width: 100 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'updateTime', title: '更新时间', width: 180 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 200 },
];

async function load() {
  loading.value = true;
  try {
    const data = await getCreativeProjectPage(query);
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, { description: '', id: undefined, name: '' });
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Project;
  Object.assign(form, {
    coverAssetId: row.coverAssetId,
    description: row.description,
    id: row.id,
    name: row.name,
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.name.trim()) {
    message.warning('请输入项目名称');
    return;
  }
  saving.value = true;
  try {
    await (form.id ? updateCreativeProject(form) : createCreativeProject(form));
    modalOpen.value = false;
    message.success('项目已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(id: number) {
  await deleteCreativeProject(id);
  message.success('项目已删除');
  await load();
}

function canShare(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Project;
  return Number(row.ownerUserId) === Number(userStore.userInfo?.id);
}

async function openShare(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Project;
  shareProject.value = row;
  shareOpen.value = true;
  shareLoading.value = true;
  try {
    const [memberList, userList] = await Promise.all([
      getCreativeProjectMembers(row.id),
      users.value.length > 0
        ? Promise.resolve(users.value)
        : getSimpleUserList(),
    ]);
    users.value = userList;
    ownerMember.value = memberList.find((item) => item.role === 'OWNER');
    shareMembers.value = memberList
      .filter((item) => item.role !== 'OWNER')
      .map((item) => ({
        role: item.role as Exclude<FdmCreativeApi.ProjectMemberRole, 'OWNER'>,
        userId: item.userId,
      }));
  } finally {
    shareLoading.value = false;
  }
}

function addShareMember() {
  shareMembers.value.push({ role: 'VIEWER', userId: undefined });
}

function removeShareMember(index: number) {
  shareMembers.value.splice(index, 1);
}

async function saveShare() {
  if (!shareProject.value) return;
  const completeMembers = shareMembers.value.filter(
    (
      item,
    ): item is {
      role: Exclude<FdmCreativeApi.ProjectMemberRole, 'OWNER'>;
      userId: number;
    } => typeof item.userId === 'number',
  );
  if (completeMembers.length !== shareMembers.value.length) {
    message.warning('请选择所有成员账号');
    return;
  }
  if (
    new Set(completeMembers.map((item) => item.userId)).size !==
    completeMembers.length
  ) {
    message.warning('同一成员不能重复添加');
    return;
  }
  if (
    completeMembers.some(
      (item) => Number(item.userId) === Number(shareProject.value?.ownerUserId),
    )
  ) {
    message.warning('项目所有者无需重复添加');
    return;
  }
  shareSaving.value = true;
  try {
    await saveCreativeProjectMembers({
      members: completeMembers,
      projectId: shareProject.value.id,
    });
    shareOpen.value = false;
    message.success('共享成员已保存');
  } finally {
    shareSaving.value = false;
  }
}

function openEditor(projectId: number) {
  void router.push(`/fdmcreative/workbench/${projectId}`);
}

function handleTableChange(pagination: TablePaginationConfig) {
  const nextPageSize = pagination.pageSize ?? query.pageSize ?? 12;
  const changed = query.pageSize !== nextPageSize;
  query.pageNo = changed ? 1 : (pagination.current ?? 1);
  query.pageSize = nextPageSize;
  void load();
}

onMounted(load);
</script>

<template>
  <CreativeShell
    description="使用节点连接提示词规划、图片生成、视频生成和成果输出"
    title="图像视频工作台"
  >
    <template #actions>
      <Button
        v-access:code="['fdmcreative:project:create']"
        type="primary"
        @click="openCreate"
      >
        <IconifyIcon icon="lucide:plus" />
        新建项目
      </Button>
    </template>

    <div class="filter-bar">
      <Input
        v-model:value="query.keyword"
        allow-clear
        placeholder="搜索项目名称或说明"
        @press-enter="load"
      />
      <Select
        v-model:value="query.status"
        allow-clear
        :options="[
          { label: '进行中', value: 'ACTIVE' },
          { label: '已归档', value: 'ARCHIVED' },
        ]"
        placeholder="项目状态"
      />
      <Button type="primary" @click="load">查询</Button>
    </div>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: query.pageNo,
        pageSize: query.pageSize,
        showSizeChanger: true,
        total,
      }"
      row-key="id"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'name'">
          <button class="project-link" @click="openEditor(record.id)">
            <IconifyIcon icon="lucide:workflow" />
            <span>{{ record.name }}</span>
          </button>
        </template>
        <template v-else-if="column.dataIndex === 'description'">
          <span class="description">{{ record.description || '—' }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <Tag :color="record.status === 'ACTIVE' ? 'blue' : 'default'">
            {{ record.status === 'ACTIVE' ? '进行中' : '已归档' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button size="small" type="link" @click="openEditor(record.id)">
              打开画布
            </Button>
            <Button
              v-access:code="['fdmcreative:project:update']"
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Button
              v-access:code="['fdmcreative:project:share']"
              v-if="canShare(record)"
              size="small"
              type="link"
              @click="openShare(record)"
            >
              分享
            </Button>
            <Popconfirm
              title="删除项目后无法恢复，确认继续？"
              @confirm="remove(record.id)"
            >
              <Button
                v-access:code="['fdmcreative:project:delete']"
                danger
                size="small"
                type="link"
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="form.id ? '编辑创作项目' : '新建创作项目'"
      @cancel="resetForm"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="项目名称" required>
          <Input v-model:value="form.name" :maxlength="64" />
        </Form.Item>
        <Form.Item label="创作说明">
          <Textarea
            v-model:value="form.description"
            :maxlength="500"
            :rows="4"
            show-count
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="shareOpen"
      :confirm-loading="shareSaving"
      :title="`项目分享 · ${shareProject?.name || ''}`"
      :width="680"
      @ok="saveShare"
    >
      <div v-if="shareLoading" class="share-loading">正在加载成员…</div>
      <template v-else>
        <div class="share-owner">
          <span>所有者</span>
          <strong>{{ ownerName }}</strong>
          <Tag color="gold">OWNER</Tag>
        </div>
        <div class="share-list">
          <div
            v-for="(member, index) in shareMembers"
            :key="index"
            class="share-row"
          >
            <Select
              v-model:value="member.userId"
              show-search
              :filter-option="
                (input, option) =>
                  String(option?.label || '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
              "
              :options="userOptions"
              placeholder="选择成员"
            />
            <Select
              v-model:value="member.role"
              :options="[
                { label: '编辑者 · 可编辑与运行', value: 'EDITOR' },
                { label: '运行者 · 可运行与查看', value: 'RUNNER' },
                { label: '查看者 · 只读', value: 'VIEWER' },
              ]"
            />
            <Button danger type="text" @click="removeShareMember(index)">
              移除
            </Button>
          </div>
          <Button block type="dashed" @click="addShareMember">
            <IconifyIcon icon="lucide:user-plus" />
            添加共享成员
          </Button>
        </div>
        <p class="share-tip">
          保存时会整体替换当前共享成员；项目所有者始终保留全部权限。
        </p>
      </template>
    </Modal>
  </CreativeShell>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px auto;
  gap: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
  border: 1px solid #e8edf4;
  border-radius: 10px;
}

.project-link {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 0;
  color: #2563eb;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.project-link :deep(svg) {
  width: 16px;
  height: 16px;
}

.description {
  display: inline-block;
  max-width: 520px;
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-loading {
  padding: 48px;
  color: #64748b;
  text-align: center;
}

.share-owner,
.share-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.share-owner {
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #f8fafc;
  border: 1px solid #e8edf4;
  border-radius: 8px;
}

.share-list {
  display: grid;
  gap: 10px;
}

.share-tip {
  margin: 12px 0 0;
  color: #64748b;
}

@media (max-width: 800px) {
  .filter-bar {
    grid-template-columns: 1fr;
  }
}
</style>
