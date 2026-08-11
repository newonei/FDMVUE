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
  Space,
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
  const nextPageSize = pageSize || query.pageSize || 12;
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
          <span class="library-eyebrow">STORYBOARD PROJECTS</span>
          <h2>从故事板进入创作画布</h2>
          <p>继续编排提示词、图像、视频与成果输出节点</p>
        </div>
        <div class="project-count" aria-label="项目总数">
          <strong>{{ total }}</strong>
          <span>个项目</span>
        </div>
      </div>

      <Spin :spinning="loading">
        <div class="project-content">
          <div v-if="rows.length > 0" class="project-grid">
            <article
              v-for="record in rows"
              :key="record.id"
              class="project-card"
              role="button"
              tabindex="0"
              @click="openEditor(record.id)"
              @keydown.enter.self="openEditor(record.id)"
            >
              <div class="storyboard-cover">
                <div class="cover-grid" aria-hidden="true">
                  <div class="story-frame story-frame--hero">
                    <IconifyIcon icon="lucide:image" />
                    <span>关键帧</span>
                  </div>
                  <div class="story-frame">
                    <IconifyIcon icon="lucide:video" />
                  </div>
                  <div class="story-frame">
                    <IconifyIcon icon="lucide:sparkles" />
                  </div>
                </div>
                <div class="cover-node cover-node--source"></div>
                <div class="cover-link"></div>
                <div class="cover-node cover-node--output"></div>
                <Tag
                  class="status-tag"
                  :color="record.status === 'ACTIVE' ? 'blue' : 'default'"
                >
                  {{ record.status === 'ACTIVE' ? '进行中' : '已归档' }}
                </Tag>
                <span class="open-hint">
                  <IconifyIcon icon="lucide:arrow-up-right" />
                  进入画布
                </span>
              </div>

              <div class="project-card__body">
                <div class="project-title-row">
                  <div class="project-title-icon">
                    <IconifyIcon icon="lucide:workflow" />
                  </div>
                  <div class="project-title-copy">
                    <h3 :title="record.name">{{ record.name }}</h3>
                    <span>
                      草稿版本 v{{ record.draftVersion }} ·
                      {{ projectRoleLabel(record.currentUserRole) }}
                    </span>
                  </div>
                </div>
                <p class="project-description">
                  {{ record.description || '尚未添加创作说明' }}
                </p>
                <dl class="project-meta">
                  <div>
                    <dt>创建人</dt>
                    <dd :title="creatorName(record)">
                      {{ creatorName(record) }}
                    </dd>
                  </div>
                  <div>
                    <dt>最近更新</dt>
                    <dd>{{ formatDateTime(record.updateTime) || '—' }}</dd>
                  </div>
                </dl>
              </div>

              <footer class="project-actions" @click.stop>
                <Button
                  size="small"
                  type="primary"
                  @click="openEditor(record.id)"
                >
                  <IconifyIcon icon="lucide:panels-top-left" />
                  打开画布
                </Button>
                <Space :size="2">
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
                </Space>
              </footer>
            </article>
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

.library-eyebrow {
  display: block;
  margin-bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  color: hsl(var(--primary));
  letter-spacing: 0.14em;
}

.library-heading h2 {
  margin: 0;
  font-size: 17px;
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
  min-height: 260px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
}

.project-card {
  min-width: 0;
  overflow: hidden;
  color: hsl(var(--foreground));
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow: 0 6px 18px hsl(var(--foreground) / 5%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.project-card:hover,
.project-card:focus-visible {
  outline: none;
  border-color: hsl(var(--primary) / 55%);
  box-shadow: 0 14px 32px hsl(var(--foreground) / 11%);
  transform: translateY(-2px);
}

.storyboard-cover {
  position: relative;
  height: 146px;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 86% 10%,
      hsl(var(--primary) / 20%),
      transparent 36%
    ),
    linear-gradient(145deg, hsl(var(--muted) / 76%), hsl(var(--card)));
  border-bottom: 1px solid hsl(var(--border) / 72%);
}

.storyboard-cover::before {
  position: absolute;
  inset: 0;
  content: '';
  background-image:
    linear-gradient(hsl(var(--border) / 26%) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--border) / 26%) 1px, transparent 1px);
  background-size: 20px 20px;
  mask-image: linear-gradient(to bottom, black, transparent 86%);
}

.cover-grid {
  position: absolute;
  inset: 31px 22px 18px;
  display: grid;
  grid-template-rows: 1fr 1fr;
  grid-template-columns: 1.5fr 1fr;
  gap: 6px;
  padding: 7px;
  background: hsl(var(--card) / 82%);
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: 0 12px 28px hsl(var(--foreground) / 10%);
  transform: rotate(-1deg);
}

.story-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 76%);
  border: 1px solid hsl(var(--border) / 70%);
  border-radius: 6px;
}

.story-frame--hero {
  flex-direction: column;
  grid-row: 1 / 3;
  gap: 5px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
  border-color: hsl(var(--primary) / 24%);
}

.story-frame :deep(svg) {
  width: 17px;
  height: 17px;
}

.story-frame--hero :deep(svg) {
  width: 23px;
  height: 23px;
}

.story-frame span {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.cover-node {
  position: absolute;
  z-index: 2;
  width: 7px;
  height: 7px;
  background: hsl(var(--primary));
  border: 2px solid hsl(var(--card));
  border-radius: 50%;
}

.cover-node--source {
  top: 71px;
  left: 15px;
}

.cover-node--output {
  top: 71px;
  right: 15px;
}

.cover-link {
  position: absolute;
  top: 74px;
  right: 12px;
  left: 12px;
  height: 1px;
  background: linear-gradient(
    90deg,
    hsl(var(--primary) / 55%),
    transparent 22%,
    transparent 78%,
    hsl(var(--primary) / 55%)
  );
}

.status-tag {
  position: absolute;
  top: 10px;
  left: 11px;
  z-index: 3;
  margin: 0;
  font-size: 10px;
}

.open-hint {
  position: absolute;
  top: 12px;
  right: 13px;
  z-index: 3;
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  opacity: 0;
  transition: opacity 160ms ease;
}

.project-card:hover .open-hint,
.project-card:focus-visible .open-hint {
  opacity: 1;
}

.project-card__body {
  padding: 14px 15px 12px;
}

.project-title-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.project-title-icon {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border: 1px solid hsl(var(--primary) / 18%);
  border-radius: 9px;
}

.project-title-copy {
  min-width: 0;
}

.project-title-copy h3 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
}

.project-title-copy span {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.project-description {
  display: -webkit-box;
  min-height: 38px;
  margin: 11px 0 12px;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 19px;
  color: hsl(var(--muted-foreground));
  -webkit-box-orient: vertical;
}

.project-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  margin: 0;
}

.project-meta div {
  min-width: 0;
}

.project-meta dt {
  margin-bottom: 2px;
  font-size: 9px;
  color: hsl(var(--muted-foreground) / 78%);
}

.project-meta dd {
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: hsl(var(--foreground) / 78%);
  white-space: nowrap;
}

.project-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 8px 11px 9px 15px;
  background: hsl(var(--muted) / 28%);
  border-top: 1px solid hsl(var(--border) / 68%);
}

.project-empty {
  padding: 68px 16px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
  border: 1px dashed hsl(var(--border));
  border-radius: 14px;
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

  .project-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .project-pagination {
    justify-content: center;
    overflow-x: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-card,
  .open-hint {
    transition: none;
  }
}
</style>
