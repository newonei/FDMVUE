<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';
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
  Select,
  Spin,
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
  pageSize: 20,
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

function creatorName(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Project;
  const creatorId = row.creator || row.ownerUserId;
  const creator = users.value.find(
    (item) => Number(item.id) === Number(creatorId),
  );
  if (creator) {
    return `${creator.nickname || creator.username} (${creator.id})`;
  }
  return creatorId ? String(creatorId) : '—';
}

const ownerName = computed(() => {
  const ownerId = ownerMember.value?.userId ?? shareProject.value?.ownerUserId;
  const owner = users.value.find((item) => Number(item.id) === Number(ownerId));
  if (owner) {
    return `${owner.nickname || owner.username} (${owner.id})`;
  }
  return ownerId ? `用户 ${ownerId}` : '—';
});

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

async function loadUsers() {
  if (users.value.length > 0) return;
  users.value = await getSimpleUserList();
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
  return (
    row.currentUserRole === 'OWNER' ||
    Number(row.ownerUserId) === Number(userStore.userInfo?.id)
  );
}

function canEditProject(record: FdmCreativeApi.Project) {
  return ['EDITOR', 'OWNER'].includes(record.currentUserRole);
}

function projectRoleLabel(role: FdmCreativeApi.ProjectMemberRole) {
  return {
    EDITOR: '编辑者',
    OWNER: '所有者',
    RUNNER: '运行者',
    VIEWER: '只读',
  }[role];
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

function handlePageChange(page: number, pageSize: number) {
  const nextPageSize = pageSize || query.pageSize || 20;
  const changed = query.pageSize !== nextPageSize;
  query.pageNo = changed ? 1 : page;
  query.pageSize = nextPageSize;
  void load();
}

onMounted(() => {
  void load();
  void loadUsers();
});
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

    <section class="project-library" aria-label="创作项目">
      <div class="library-heading">
        <div>
          <h2>创作项目</h2>
          <p>管理并继续编辑图像、视频工作流</p>
        </div>
        <div class="project-count" aria-label="项目总数">
          <strong>{{ total }}</strong>
          <span>个项目</span>
        </div>
      </div>

      <Spin :spinning="loading">
        <div class="project-content">
          <div v-if="rows.length > 0" class="project-table-wrap">
            <div class="project-table" role="table" aria-label="创作项目列表">
              <div class="project-table__header" role="row">
                <span role="columnheader">项目</span>
                <span role="columnheader">状态</span>
                <span role="columnheader">版本与权限</span>
                <span role="columnheader">创建人</span>
                <span role="columnheader">更新时间</span>
                <span role="columnheader">操作</span>
              </div>
              <article
                v-for="record in rows"
                :key="record.id"
                class="project-row"
                role="row"
                tabindex="0"
                @click="openEditor(record.id)"
                @keydown.enter.self="openEditor(record.id)"
              >
                <div class="project-primary" role="cell">
                  <div class="project-icon" aria-hidden="true">
                    <IconifyIcon icon="lucide:workflow" />
                  </div>
                  <div class="project-copy">
                    <div class="project-name-line">
                      <h3 :title="record.name">{{ record.name }}</h3>
                      <span class="project-id">#{{ record.id }}</span>
                    </div>
                    <p :title="record.description || '尚未添加创作说明'">
                      {{ record.description || '尚未添加创作说明' }}
                    </p>
                  </div>
                </div>

                <div class="project-status" role="cell" data-label="状态">
                  <Tag :color="record.status === 'ACTIVE' ? 'blue' : 'default'">
                    {{ record.status === 'ACTIVE' ? '进行中' : '已归档' }}
                  </Tag>
                </div>

                <div class="project-version" role="cell" data-label="版本权限">
                  <strong>v{{ record.draftVersion }}</strong>
                  <span>{{ projectRoleLabel(record.currentUserRole) }}</span>
                </div>

                <div
                  class="project-creator"
                  role="cell"
                  data-label="创建人"
                  :title="creatorName(record)"
                >
                  {{ creatorName(record) }}
                </div>

                <time class="project-updated" role="cell" data-label="更新时间">
                  {{ formatDateTime(record.updateTime) || '—' }}
                </time>

                <div class="project-actions" role="cell" @click.stop>
                  <Button
                    size="small"
                    type="primary"
                    @click="openEditor(record.id)"
                  >
                    打开
                  </Button>
                  <Button
                    v-access:code="['fdmcreative:project:update']"
                    v-if="canEditProject(record)"
                    size="small"
                    type="text"
                    @click="openEdit(record)"
                  >
                    编辑
                  </Button>
                  <Button
                    v-access:code="['fdmcreative:project:share']"
                    v-if="canShare(record)"
                    size="small"
                    type="text"
                    @click="openShare(record)"
                  >
                    分享
                  </Button>
                  <Popconfirm
                    v-if="canShare(record)"
                    title="删除项目后无法恢复，确认继续？"
                    @confirm="remove(record.id)"
                  >
                    <Button
                      v-access:code="['fdmcreative:project:delete']"
                      danger
                      size="small"
                      type="text"
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </article>
            </div>
          </div>

          <Empty v-else class="project-empty" description="暂无匹配的创作项目">
            <Button
              v-access:code="['fdmcreative:project:create']"
              type="primary"
              @click="openCreate"
            >
              新建第一个项目
            </Button>
          </Empty>
        </div>
      </Spin>

      <div v-if="total > 0" class="project-pagination">
        <Pagination
          :current="query.pageNo"
          :page-size="query.pageSize"
          :show-size-changer="true"
          :total="total"
          @change="handlePageChange"
        />
      </div>
    </section>

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
:deep(.creative-shell__header) {
  background: linear-gradient(
    135deg,
    hsl(var(--card)) 0%,
    hsl(var(--muted) / 52%) 100%
  );
  border-color: hsl(var(--border));
}

:deep(.creative-shell__header h1) {
  color: hsl(var(--foreground));
}

:deep(.creative-shell__header p) {
  color: hsl(var(--muted-foreground));
}

.filter-bar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px auto;
  gap: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.project-library {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.library-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 0;
}

.library-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: hsl(var(--foreground));
}

.library-heading p {
  margin: 3px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.project-count {
  display: flex;
  gap: 5px;
  align-items: baseline;
  padding: 7px 11px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 46%);
  border: 1px solid hsl(var(--border) / 78%);
  border-radius: 999px;
}

.project-count strong {
  font-size: 15px;
  color: hsl(var(--foreground));
}

.project-count span {
  font-size: 11px;
}

.project-content {
  min-height: 220px;
}

.project-table-wrap {
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.project-table {
  min-width: 1040px;
}

.project-table__header,
.project-row {
  display: grid;
  grid-template-columns:
    minmax(280px, 2fr) 82px 116px minmax(150px, 0.9fr) 156px
    minmax(210px, auto);
  column-gap: 14px;
  align-items: center;
}

.project-table__header {
  min-height: 38px;
  padding: 0 16px;
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 42%);
  border-bottom: 1px solid hsl(var(--border));
}

.project-table__header span:last-child {
  text-align: right;
}

.project-row {
  min-height: 66px;
  padding: 8px 16px;
  color: hsl(var(--foreground));
  cursor: pointer;
  border-bottom: 1px solid hsl(var(--border) / 72%);
  transition: background-color 140ms ease;
}

.project-row:last-child {
  border-bottom: 0;
}

.project-row:hover,
.project-row:focus-visible {
  outline: none;
  background: hsl(var(--primary) / 4.5%);
}

.project-primary {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.project-icon {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
  border: 1px solid hsl(var(--primary) / 18%);
  border-radius: 8px;
}

.project-copy {
  min-width: 0;
}

.project-name-line {
  display: flex;
  gap: 7px;
  align-items: baseline;
  min-width: 0;
}

.project-name-line h3 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.project-id {
  flex: none;
  font-size: 10px;
  color: hsl(var(--muted-foreground) / 72%);
}

.project-copy p {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  line-height: 17px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.project-status :deep(.ant-tag) {
  margin: 0;
}

.project-version {
  display: flex;
  gap: 2px;
  align-items: baseline;
}

.project-version strong {
  font-size: 12px;
  font-weight: 600;
}

.project-version span {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.project-version span::before {
  margin: 0 4px;
  content: '·';
}

.project-creator,
.project-updated {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: hsl(var(--foreground) / 78%);
  white-space: nowrap;
}

.project-updated {
  color: hsl(var(--muted-foreground));
}

.project-actions {
  display: flex;
  gap: 1px;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.project-actions :deep(.ant-btn-sm) {
  padding-inline: 8px;
}

.project-empty {
  padding: 54px 16px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
  border: 1px dashed hsl(var(--border));
  border-radius: 10px;
}

.project-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
}

.share-loading {
  padding: 48px;
  color: hsl(var(--muted-foreground));
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
  background: hsl(var(--muted) / 48%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.share-list {
  display: grid;
  gap: 10px;
}

.share-tip {
  margin: 12px 0 0;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 800px) {
  .filter-bar {
    grid-template-columns: 1fr;
  }

  .library-heading {
    align-items: flex-end;
  }

  .library-heading p {
    display: none;
  }

  .project-table-wrap {
    overflow: visible;
    background: transparent;
    border: 0;
  }

  .project-table {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .project-table__header {
    display: none;
  }

  .project-row {
    grid-template-columns: 1fr auto;
    gap: 8px 12px;
    padding: 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 10px;
  }

  .project-row:last-child {
    border-bottom: 1px solid hsl(var(--border));
  }

  .project-primary {
    grid-column: 1 / 3;
  }

  .project-status,
  .project-version,
  .project-creator,
  .project-updated {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .project-creator::before,
  .project-updated::before {
    flex: none;
    font-size: 10px;
    color: hsl(var(--muted-foreground) / 76%);
    content: attr(data-label);
  }

  .project-actions {
    grid-column: 1 / 3;
    justify-content: flex-start;
    padding-top: 8px;
    border-top: 1px solid hsl(var(--border) / 72%);
  }

  .project-pagination {
    justify-content: center;
    overflow-x: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-row {
    transition: none;
  }
}
</style>
