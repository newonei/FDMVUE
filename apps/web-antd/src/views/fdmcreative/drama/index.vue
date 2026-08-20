<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Pagination,
  Select,
  Spin,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  archiveDramaProject,
  createDramaProject,
  getDramaProjectPage,
} from '#/api/fdmcreative';

import CreativeShell from '../shared/CreativeShell.vue';

defineOptions({ name: 'FdmCreativeDrama' });

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const createOpen = ref(false);
const rows = ref<FdmCreativeApi.DramaProject[]>([]);
const total = ref(0);
const query = reactive({
  keyword: '',
  pageNo: 1,
  pageSize: 20,
  status: undefined as FdmCreativeApi.ProjectStatus | undefined,
});
const form = reactive({
  aspectRatio: '9:16',
  description: '',
  dramaType: 'SERIES',
  language: 'zh-CN',
  name: '',
  targetDurationSeconds: 300,
  visualStyle: '',
});

const aspectOptions = [
  { label: '竖屏 9:16', value: '9:16' },
  { label: '横屏 16:9', value: '16:9' },
  { label: '方形 1:1', value: '1:1' },
];

function canEdit(project: FdmCreativeApi.DramaProject) {
  return (
    project.currentUserRole === 'OWNER' || project.currentUserRole === 'EDITOR'
  );
}

function resetForm() {
  Object.assign(form, {
    aspectRatio: '9:16',
    description: '',
    dramaType: 'SERIES',
    language: 'zh-CN',
    name: '',
    targetDurationSeconds: 300,
    visualStyle: '',
  });
}

async function load() {
  loading.value = true;
  try {
    const page = await getDramaProjectPage(query);
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  resetForm();
  createOpen.value = true;
}

async function create() {
  if (!form.name.trim()) {
    message.warning('请输入短剧项目名称');
    return;
  }
  saving.value = true;
  try {
    const projectId = await createDramaProject({
      ...form,
      description: form.description.trim() || undefined,
      visualStyle: form.visualStyle.trim() || undefined,
    });
    createOpen.value = false;
    message.success('短剧项目已创建');
    await router.push(`/fdmcreative/drama/${projectId}`);
  } finally {
    saving.value = false;
  }
}

function openProject(projectId: number) {
  void router.push(`/fdmcreative/drama/${projectId}`);
}

async function archive(project: FdmCreativeApi.DramaProject) {
  await archiveDramaProject({
    expectedVersion: project.version,
    projectId: project.projectId,
  });
  message.success('短剧项目已归档');
  await load();
}

function pageChanged(pageNo: number, pageSize: number) {
  query.pageNo = pageNo;
  query.pageSize = pageSize;
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <CreativeShell
    title="短剧生产"
    description="从故事设定、剧本和角色资产开始，逐步进入分镜、制作与合成。"
  >
    <template #actions>
      <Button
        v-access:code="['fdmcreative:drama:create']"
        type="primary"
        @click="openCreate"
      >
        <IconifyIcon icon="lucide:plus" />
        新建短剧
      </Button>
    </template>

    <div class="filter-bar">
      <Input
        v-model:value="query.keyword"
        allow-clear
        placeholder="搜索短剧项目"
        @press-enter="load"
      />
      <Select
        v-model:value="query.status"
        allow-clear
        placeholder="项目状态"
        :options="[
          { label: '进行中', value: 'ACTIVE' },
          { label: '已归档', value: 'ARCHIVED' },
        ]"
      />
      <Button type="primary" @click="load">查询</Button>
    </div>

    <section class="drama-library" aria-label="短剧项目列表">
      <div class="library-head">
        <div>
          <p class="eyebrow">DRAMA PROJECTS</p>
          <h2>项目</h2>
        </div>
        <span>{{ total }} 个项目</span>
      </div>

      <Spin :spinning="loading">
        <div class="drama-table" role="table">
          <div class="drama-table__head" role="row">
            <span role="columnheader">短剧项目</span>
            <span role="columnheader">设定</span>
            <span role="columnheader">剧本</span>
            <span role="columnheader">协作权限</span>
            <span role="columnheader">更新时间</span>
            <span role="columnheader">操作</span>
          </div>
          <article
            v-for="project in rows"
            :key="project.projectId"
            class="drama-row"
            role="button"
            tabindex="0"
            @click="openProject(project.projectId)"
            @keydown.enter="openProject(project.projectId)"
          >
            <span class="project-name">
              <span class="project-symbol"><IconifyIcon icon="lucide:clapperboard" /></span>
              <span>
                <strong>{{ project.name }}</strong>
                <small>{{ project.description || '尚未添加故事说明' }}</small>
              </span>
            </span>
            <span>{{ project.dramaType }} · {{ project.aspectRatio }}</span>
            <span>
              <Tag
                :color="project.currentScriptRevisionId ? 'blue' : 'default'"
              >
                {{
                  project.currentScriptRevisionId
                    ? `剧本 #${project.currentScriptRevisionId}`
                    : '尚无剧本'
                }}
              </Tag>
            </span>
            <span>{{ project.currentUserRole }}</span>
            <span>{{
              project.updateTime ? formatDateTime(project.updateTime) : '—'
            }}</span>
            <span class="row-actions" @click.stop>
              <Button
                size="small"
                type="link"
                @click="openProject(project.projectId)"
                >进入</Button>
              <Button
                v-if="canEdit(project) && project.status === 'ACTIVE'"
                v-access:code="['fdmcreative:drama:archive']"
                danger
                size="small"
                type="link"
                @click="archive(project)"
              >
                归档
              </Button>
            </span>
          </article>
          <div v-if="!loading && rows.length === 0" class="empty-state">
            还没有可访问的短剧项目。
          </div>
        </div>
      </Spin>
      <Pagination
        v-if="total > query.pageSize"
        :current="query.pageNo"
        :page-size="query.pageSize"
        :total="total"
        show-size-changer
        @change="pageChanged"
      />
    </section>

    <Modal
      v-model:open="createOpen"
      :confirm-loading="saving"
      title="新建短剧项目"
      width="640px"
      @ok="create"
    >
      <Form layout="vertical">
        <Form.Item label="项目名称" required>
          <Input
            v-model:value="form.name"
            :maxlength="100"
            placeholder="例如：霓虹雨夜"
          />
        </Form.Item>
        <Form.Item label="故事设定">
          <Textarea
            v-model:value="form.description"
            :maxlength="1000"
            :rows="3"
            placeholder="一句话梗概、受众或创作边界"
          />
        </Form.Item>
        <div class="create-grid">
          <Form.Item label="类型">
            <Input v-model:value="form.dramaType" placeholder="SERIES" />
          </Form.Item>
          <Form.Item label="语言">
            <Input v-model:value="form.language" placeholder="zh-CN" />
          </Form.Item>
          <Form.Item label="画幅">
            <Select v-model:value="form.aspectRatio" :options="aspectOptions" />
          </Form.Item>
          <Form.Item label="目标时长（秒）">
            <InputNumber
              v-model:value="form.targetDurationSeconds"
              :max="10800"
              :min="1"
              class="number"
            />
          </Form.Item>
        </div>
        <Form.Item label="视觉风格">
          <Input
            v-model:value="form.visualStyle"
            placeholder="例如：赛博水墨、现实主义电影光影"
          />
        </Form.Item>
      </Form>
    </Modal>
  </CreativeShell>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px auto;
  gap: 10px;
  margin-bottom: 16px;
}

.drama-library {
  min-width: 0;
}

.library-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 10px;
}

.eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ant-color-primary);
  letter-spacing: 0.12em;
}

.library-head h2 {
  margin: 0;
  font-size: 20px;
}

.library-head > span {
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.drama-table {
  overflow: hidden;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.drama-table__head,
.drama-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.6fr) minmax(130px, 0.75fr) minmax(
      110px,
      0.65fr
    ) minmax(100px, 0.55fr) minmax(150px, 0.85fr) minmax(88px, 0.45fr);
  gap: 12px;
  align-items: center;
}

.drama-table__head {
  padding: 9px 14px;
  font-size: 12px;
  color: var(--ant-color-text-tertiary);
  background: var(--ant-color-fill-quaternary);
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.drama-row {
  width: 100%;
  padding: 10px 14px;
  color: var(--ant-color-text);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.drama-row:last-child {
  border-bottom: 0;
}

.drama-row:hover {
  background: color-mix(in srgb, var(--ant-color-primary) 5%, transparent);
}

.project-name {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.project-name > span:last-child {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.project-name strong,
.project-name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-name small {
  color: var(--ant-color-text-secondary);
}

.project-symbol {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--ant-color-primary);
  background: color-mix(in srgb, var(--ant-color-primary) 8%, transparent);
  border: 1px solid
    color-mix(in srgb, var(--ant-color-primary) 30%, transparent);
  border-radius: 8px;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  padding: 40px;
  color: var(--ant-color-text-secondary);
  text-align: center;
}

.create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.number {
  width: 100%;
}

@media (max-width: 1100px) {
  .drama-table__head {
    display: none;
  }

  .drama-row {
    grid-template-columns: 1fr auto;
  }

  .drama-row > span:not(.project-name):not(.row-actions) {
    display: none;
  }
}

@media (max-width: 720px) {
  .filter-bar,
  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>
