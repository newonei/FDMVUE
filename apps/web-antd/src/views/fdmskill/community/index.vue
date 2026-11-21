<script lang="ts" setup>
import type {
  CommunitySkill,
  SkillDepartment,
  SkillVisibility,
} from '#/api/fdmskill/community';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  deleteCommunitySkill,
  downloadCommunityArchive,
  getCommunityCatalog,
  getCommunityDepartments,
  getCommunityDetail,
  publishCommunitySkill,
  updateCommunityVisibility,
  uploadCommunitySkill,
} from '#/api/fdmskill/community';

import {
  archiveFileName,
  assertArchiveDownload,
  departmentOptions,
  errorText,
  filterSkills,
  formatBytes,
  isSharedSkill,
  ownsSkill,
  skillVisibility,
  uploadError,
  userIdentity,
  visibilityLabels,
} from './model';
import VisibilityFields from './visibility-fields.vue';

defineOptions({ name: 'FdmSkillCommunity' });

const userStore = useUserStore();
const currentUserId = computed(() => userIdentity(userStore.userInfo));
const entries = ref<CommunitySkill[]>([]);
const tab = ref('square');
const query = ref('');
const category = ref<string>();
const loading = ref(false);
const loadError = ref('');
const operationError = ref('');
const operationId = ref('');
const downloading = ref('');
const busy = computed(() => Boolean(operationId.value || downloading.value));
const visible = computed(() =>
  filterSkills(entries.value, {
    category: category.value,
    query: query.value,
    tab: tab.value,
    userId: currentUserId.value,
  }),
);
const categories = computed(() =>
  [...new Set(entries.value.map((entry) => entry.category))]
    .toSorted()
    .map((value) => ({ value, label: value })),
);
const ownCount = computed(
  () =>
    entries.value.filter((entry) => ownsSkill(entry, currentUserId.value))
      .length,
);
const publishedCount = computed(
  () => entries.value.filter(isSharedSkill).length,
);

function manageable(entry: CommunitySkill) {
  return ownsSkill(entry, currentUserId.value);
}

async function loadCatalog() {
  loading.value = true;
  loadError.value = '';
  try {
    const catalog = await getCommunityCatalog();
    entries.value = catalog.entries;
  } catch (error) {
    loadError.value = errorText(error, '技能列表加载失败，请重试');
  } finally {
    loading.value = false;
  }
}

function replaceEntry(entry: CommunitySkill) {
  const position = entries.value.findIndex((row) => row.id === entry.id);
  if (position === -1) entries.value.unshift(entry);
  else entries.value.splice(position, 1, entry);
  if (detail.value?.entry.id === entry.id) detail.value.entry = entry;
}

const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detail = ref<{ entry: CommunitySkill; readme: string }>();
let detailSequence = 0;
async function openDetail(entry: CommunitySkill) {
  const sequence = ++detailSequence;
  detail.value = undefined;
  detailError.value = '';
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const result = await getCommunityDetail(entry.id);
    if (sequence === detailSequence) detail.value = result;
  } catch (error) {
    if (sequence === detailSequence)
      detailError.value = errorText(error, '技能详情加载失败，请关闭后重试');
  } finally {
    if (sequence === detailSequence) detailLoading.value = false;
  }
}

async function download(entry: CommunitySkill) {
  if (busy.value) return;
  downloading.value = entry.id;
  operationError.value = '';
  try {
    const archive = await downloadCommunityArchive(entry);
    assertArchiveDownload(archive, entry);
    downloadFileFromBlobPart({
      fileName: archiveFileName(entry),
      source: archive,
    });
    message.success('技能包已下载，可在桌面端技能广场中安装');
  } catch (error) {
    operationError.value = errorText(error, '技能包下载失败，请重试');
    message.error(operationError.value);
  } finally {
    downloading.value = '';
  }
}

function changePublished(entry: CommunitySkill) {
  if (!manageable(entry) || busy.value) return;
  const publishing = !entry.published;
  const scope = skillVisibility(entry).scope;
  const publicationNotice = {
    COMPANY: '发布后，全公司同事可以在技能广场查看和下载此技能包。',
    DEPARTMENTS: '发布后，所选部门的同事可以在技能广场查看和下载此技能包。',
    PRIVATE: '当前范围为「仅自己」，发布后仍只有你可以查看和下载。',
  };
  Modal.confirm({
    title: `${publishing ? '发布' : '下架'}「${entry.title || entry.name}」？`,
    content: publishing
      ? publicationNotice[scope]
      : '下架后此技能将从技能广场移除，你仍可在「我的技能」管理它。',
    okText: publishing ? '确认发布' : '确认下架',
    onOk: async () => {
      operationId.value = entry.id;
      operationError.value = '';
      try {
        replaceEntry(await publishCommunitySkill(entry.id, publishing));
        message.success(publishing ? '技能已发布' : '技能已下架');
      } catch (error) {
        operationError.value = errorText(error, '修改发布状态失败，请重试');
        message.error(operationError.value);
      } finally {
        operationId.value = '';
      }
    },
  });
}

function remove(entry: CommunitySkill) {
  if (!manageable(entry) || busy.value) return;
  Modal.confirm({
    title: `删除「${entry.title || entry.name}」？`,
    content: '技能包和分享记录会被删除，删除后无法继续下载此版本。',
    okText: '确认删除',
    okButtonProps: { danger: true },
    onOk: async () => {
      operationId.value = entry.id;
      operationError.value = '';
      try {
        const removed = await deleteCommunitySkill(entry.id);
        if (!removed) throw new Error('技能未删除，请刷新后重试');
        entries.value = entries.value.filter((row) => row.id !== entry.id);
        if (detail.value?.entry.id === entry.id) detailOpen.value = false;
        message.success('技能已删除');
      } catch (error) {
        operationError.value = errorText(error, '删除失败，请重试');
        message.error(operationError.value);
      } finally {
        operationId.value = '';
      }
    },
  });
}

const departments = ref<SkillDepartment[]>([]);
const departmentsLoading = ref(false);
const departmentsLoaded = ref(false);
const departmentsError = ref('');
const departmentChoices = computed(() => departmentOptions(departments.value));

async function loadDepartments() {
  if (departmentsLoading.value || departmentsLoaded.value) return;
  departmentsLoading.value = true;
  departmentsError.value = '';
  try {
    departments.value = await getCommunityDepartments();
    departmentsLoaded.value = true;
  } catch (error) {
    departmentsError.value = errorText(error, '部门列表加载失败，请重试');
  } finally {
    departmentsLoading.value = false;
  }
}

function invalidVisibility(visibility: SkillVisibility): string {
  if (visibility.scope !== 'DEPARTMENTS') return '';
  if (!departmentsLoaded.value) return '请先加载部门列表';
  if (visibility.departmentIds.length === 0) return '请至少选择一个部门';
  if (visibility.departmentIds.length > 100) return '最多选择 100 个部门';
  const available = new Set(departments.value.map(({ id }) => id));
  return visibility.departmentIds.every((id) => available.has(id))
    ? ''
    : '请移除不可用的部门并重新选择';
}

const visibilityTarget = ref<CommunitySkill>();
const editingVisibility = ref<SkillVisibility>({
  scope: 'PRIVATE',
  departmentIds: [],
});
const visibilityError = ref('');
const visibilityOpen = computed({
  get: () => visibilityTarget.value !== undefined,
  set: (open) => {
    if (!open) visibilityTarget.value = undefined;
  },
});

function openVisibility(entry: CommunitySkill) {
  if (!manageable(entry) || busy.value) return;
  const original = skillVisibility(entry);
  editingVisibility.value = {
    scope: original.scope,
    departmentIds: [...original.departmentIds],
  };
  visibilityError.value = '';
  visibilityTarget.value = entry;
}

async function saveVisibility() {
  const target = visibilityTarget.value;
  if (!target || !manageable(target) || busy.value) return;
  visibilityError.value = invalidVisibility(editingVisibility.value);
  if (visibilityError.value) return;

  operationId.value = target.id;
  operationError.value = '';
  try {
    const saved = await updateCommunityVisibility(
      target.id,
      editingVisibility.value,
    );
    entries.value = entries.value.map((entry) =>
      ownsSkill(entry, currentUserId.value) && entry.name === target.name
        ? { ...entry, visibility: saved.visibility }
        : entry,
    );
    replaceEntry(saved);
    visibilityTarget.value = undefined;
    await loadCatalog();
    const refreshed = entries.value.find(
      (entry) => entry.id === detail.value?.entry.id,
    );
    if (refreshed && detail.value) detail.value.entry = refreshed;
    message.success('可见范围已更新');
  } catch (error) {
    visibilityError.value = errorText(error, '保存可见范围失败，请重试');
  } finally {
    operationId.value = '';
  }
}

const uploadOpen = ref(false);
const uploading = ref(false);
const uploadFailure = ref('');
const selectedFile = ref<File>();
const fileInput = ref<HTMLInputElement>();
const form = reactive({
  title: '',
  version: '1.0.0',
  category: '通用',
  license: '未声明',
});
const uploadVisibility = ref<SkillVisibility>({
  scope: 'PRIVATE',
  departmentIds: [],
});
watch(
  () =>
    (uploadOpen.value && uploadVisibility.value.scope === 'DEPARTMENTS') ||
    (visibilityOpen.value && editingVisibility.value.scope === 'DEPARTMENTS'),
  (needsDepartments) => {
    if (needsDepartments) void loadDepartments();
  },
);

function openUpload() {
  selectedFile.value = undefined;
  if (fileInput.value) fileInput.value.value = '';
  Object.assign(form, {
    title: '',
    version: '1.0.0',
    category: '通用',
    license: '未声明',
  });
  uploadVisibility.value = { scope: 'PRIVATE', departmentIds: [] };
  uploadFailure.value = '';
  uploadOpen.value = true;
}
function chooseFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0];
  uploadFailure.value = '';
}
async function upload() {
  if (uploading.value) return;
  uploadFailure.value =
    uploadError(selectedFile.value, form.version) ||
    invalidVisibility(uploadVisibility.value);
  if (uploadFailure.value || !selectedFile.value) return;
  uploading.value = true;
  try {
    const entry = await uploadCommunitySkill({
      ...form,
      file: selectedFile.value,
      visibility: uploadVisibility.value,
    });
    if (!entry.visibility)
      throw new Error('服务器未返回可见范围，请刷新确认草稿后再发布');
    replaceEntry(entry);
    tab.value = 'mine';
    query.value = '';
    category.value = undefined;
    uploadOpen.value = false;
    message.success(
      `技能包已上传，当前可见范围为「${visibilityLabels[skillVisibility(entry).scope]}」`,
    );
  } catch (error) {
    uploadFailure.value = errorText(
      error,
      '技能包上传失败，请检查 ZIP 内容后重试',
    );
  } finally {
    uploading.value = false;
  }
}

function displayDate(value: string) {
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : '—';
}
onMounted(loadCatalog);
</script>

<template>
  <Page title="技能广场" description="在公司内部分享、发现和下载可复用的技能。">
    <div class="space-y-4">
      <Alert
        type="info"
        show-icon
        message="这里共享包含 SKILL.md 的技能 ZIP 包；npm / Git 插件请在「插件市场」维护。"
        description="上传后先保存为草稿。上传者可设置可见范围、发布、下架或删除。"
      />
      <Alert
        v-if="loadError"
        type="error"
        show-icon
        :message="loadError"
        description="已有列表已保留。可点击刷新重试。"
      />
      <Alert
        v-if="operationError"
        type="error"
        show-icon
        :message="operationError"
      />
      <Card :bordered="false">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span class="text-lg font-semibold">公司技能库</span><span class="ml-3 text-sm text-gray-500">已发布 {{ publishedCount }} 个 · 我的技能 {{ ownCount }} 个</span>
          </div>
          <Space>
            <Button :loading="loading" :disabled="busy" @click="loadCatalog">
              刷新
</Button><Button type="primary" :disabled="busy" @click="openUpload">
              上传技能
            </Button>
          </Space>
        </div>
        <Tabs v-model:active-key="tab">
          <TabPane key="square" tab="技能广场" /><TabPane
            key="mine"
            tab="我的技能"
          />
        </Tabs>
        <Space wrap class="mb-5">
          <Input
            v-model:value="query"
            allow-clear
            class="!w-72"
            placeholder="搜索技能名称、说明或发布者"
            aria-label="搜索技能"
          />
          <Select
            v-model:value="category"
            :options="categories"
            allow-clear
            class="!w-40"
            placeholder="全部分类"
            aria-label="技能分类"
          />
          <span class="text-sm text-gray-500">{{ visible.length }} 个结果</span>
        </Space>
        <Spin :spinning="loading">
          <Empty
            v-if="!visible.length"
            class="py-12"
            :description="
              tab === 'mine'
                ? '你还没有符合条件的技能，可以先上传一个技能包'
                : '还没有符合条件的已发布技能'
            "
          />
          <div
            v-else
            class="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
          >
            <Card
              v-for="entry in visible"
              :key="entry.id"
              size="small"
              class="flex h-full flex-col"
              :data-skill-id="entry.id"
            >
              <div
                class="mb-2 flex flex-wrap items-start justify-between gap-2"
              >
                <Button
                  type="link"
                  class="!h-auto !whitespace-normal !p-0 !text-left !text-base !font-semibold"
                  @click="openDetail(entry)"
                >
                  {{ entry.title || entry.name }}
                </Button>
                <Tag :color="entry.published ? 'green' : 'orange'">
                  {{ entry.published ? '已发布' : '草稿' }}
                </Tag>
              </div>
              <div class="mb-2 break-all text-xs text-gray-500">
                {{ entry.name }} · v{{ entry.version }}
              </div>
              <p class="mb-3 whitespace-pre-wrap break-words text-sm">
                {{ entry.description }}
              </p>
              <Space wrap class="mb-3">
                <Tag>{{ entry.category }}</Tag>
                <Tag>{{ visibilityLabels[skillVisibility(entry).scope] }}</Tag>
                <span class="text-xs text-gray-500">{{ entry.publisher }} ·
                  {{ formatBytes(entry.archiveBytes) }}</span>
              </Space>
              <div class="mb-3 text-xs text-gray-500">
                更新于 {{ displayDate(entry.updatedAt) }}
              </div>
              <div class="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button size="small" @click="openDetail(entry)">
                  查看说明
                </Button>
                <Button
                  size="small"
                  :loading="downloading === entry.id"
                  :disabled="busy && downloading !== entry.id"
                  @click="download(entry)"
                >
                  下载技能包
                </Button>
                <template v-if="manageable(entry)">
                  <Button
                    size="small"
                    type="link"
                    :disabled="busy"
                    @click="openVisibility(entry)"
                  >
                    设置可见范围
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    :disabled="busy"
                    @click="changePublished(entry)"
                  >
                    {{ entry.published ? '下架' : '发布' }}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    danger
                    :disabled="busy"
                    @click="remove(entry)"
                  >
                    删除
                  </Button>
                </template>
              </div>
            </Card>
          </div>
        </Spin>
      </Card>
    </div>

    <Modal
      v-model:open="uploadOpen"
      title="上传技能包"
      :width="640"
      :mask-closable="!uploading"
      :closable="!uploading"
      :confirm-loading="uploading"
      :cancel-button-props="{ disabled: uploading }"
      ok-text="上传为草稿"
      @ok="upload"
    >
      <Alert
        class="mb-4"
        type="info"
        show-icon
        message="ZIP 中应包含 SKILL.md，可位于根目录或单层外部文件夹内。"
        description="技能名称和说明会从 SKILL.md 的 YAML frontmatter 读取。请一并打包技能所需的脚本、模板和资源。"
      />
      <Alert
        v-if="uploadFailure"
        type="error"
        show-icon
        :message="uploadFailure"
        class="mb-4"
      />
      <Form layout="vertical">
        <FormItem label="技能 ZIP 文件" required>
          <input
            ref="fileInput"
            type="file"
            accept=".zip,application/zip"
            :disabled="uploading"
            aria-label="选择技能 ZIP 文件"
            class="w-full"
            @change="chooseFile"
          />
          <div v-if="selectedFile" class="mt-2 text-xs text-gray-500">
            {{ selectedFile.name }} · {{ formatBytes(selectedFile.size) }}
          </div>
        </FormItem>
        <FormItem label="显示标题（可选）">
          <Input
            v-model:value="form.title"
            :disabled="uploading"
            placeholder="留空使用 SKILL.md 中的技能名称"
            :maxlength="200"
          />
        </FormItem>
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormItem label="版本号" required>
            <Input
              v-model:value="form.version"
              :disabled="uploading"
              placeholder="1.0.0"
              aria-label="技能版本号"
            />
</FormItem><FormItem label="分类">
            <Input
              v-model:value="form.category"
              :disabled="uploading"
              placeholder="通用"
              :maxlength="100"
            />
          </FormItem>
        </div>
        <FormItem label="许可证">
          <Input
            v-model:value="form.license"
            :disabled="uploading"
            placeholder="未声明，例如 MIT 或公司内部使用"
            :maxlength="200"
          />
        </FormItem>
        <VisibilityFields
          v-model="uploadVisibility"
          :departments="departmentChoices"
          :loading="departmentsLoading"
          :error="departmentsError"
          :disabled="uploading"
          @retry="loadDepartments"
        />
        <div class="text-xs text-gray-500">
          同一个技能的新版本沿用原有范围。可在「我的技能」统一修改所有版本的范围。
        </div>
      </Form>
    </Modal>

    <Modal
      v-model:open="visibilityOpen"
      title="设置可见范围"
      :mask-closable="!busy"
      :closable="!busy"
      :keyboard="!busy"
      :confirm-loading="busy"
      :cancel-button-props="{ disabled: busy }"
      ok-text="保存可见范围"
      @ok="saveVisibility"
    >
      <p class="mb-4 text-sm">
        此设置适用于「{{
          visibilityTarget?.title
        }}」的所有版本，已发布的版本会按新范围共享。
      </p>
      <Alert
        v-if="visibilityError"
        type="error"
        show-icon
        class="mb-4"
        :message="visibilityError"
      />
      <Form layout="vertical">
        <VisibilityFields
          v-model="editingVisibility"
          :departments="departmentChoices"
          :loading="departmentsLoading"
          :error="departmentsError"
          :disabled="busy"
          @retry="loadDepartments"
        />
      </Form>
    </Modal>

    <Modal
      v-model:open="detailOpen"
      :title="detail?.entry.title || '技能说明'"
      :width="900"
      :footer="null"
    >
      <Spin :spinning="detailLoading">
        <Alert
          v-if="detailError"
          type="error"
          show-icon
          :message="detailError"
        />
        <template v-if="detail">
          <Space wrap class="mb-4">
            <Tag>{{ detail.entry.category }}</Tag>
            <Tag>{{ detail.entry.version }}</Tag>
            <Tag>
              {{ visibilityLabels[skillVisibility(detail.entry).scope] }}
            </Tag>
            <Tag :color="detail.entry.published ? 'green' : 'orange'">
              {{ detail.entry.published ? '已发布' : '草稿' }}
            </Tag>
          </Space>
          <Descriptions size="small" :column="2" bordered class="mb-4">
            <DescriptionsItem label="技能名称">
              {{ detail.entry.name }}
</DescriptionsItem><DescriptionsItem label="发布者">
              {{ detail.entry.publisher }}
</DescriptionsItem><DescriptionsItem label="许可证">
              {{ detail.entry.license }}
</DescriptionsItem><DescriptionsItem label="包大小">
              {{ formatBytes(detail.entry.archiveBytes) }}
</DescriptionsItem><DescriptionsItem label="内容">
              {{ detail.entry.fileCount }} 个文件 · 解压后
              {{ formatBytes(detail.entry.totalBytes) }}
</DescriptionsItem><DescriptionsItem label="更新时间">
              {{ displayDate(detail.entry.updatedAt) }}
</DescriptionsItem><DescriptionsItem label="SHA-256" :span="2">
              <span class="break-all font-mono text-xs">{{
                detail.entry.sha256
              }}</span>
            </DescriptionsItem>
          </Descriptions>
          <Space wrap class="mb-4">
            <Button
              type="primary"
              :loading="downloading === detail.entry.id"
              :disabled="busy && downloading !== detail.entry.id"
              @click="download(detail.entry)"
            >
              下载技能包
            </Button>
            <template v-if="manageable(detail.entry)">
              <Button :disabled="busy" @click="openVisibility(detail.entry)">
                设置可见范围
              </Button>
              <Button :disabled="busy" @click="changePublished(detail.entry)">
                {{ detail.entry.published ? '下架' : '发布' }}
</Button><Button danger :disabled="busy" @click="remove(detail.entry)">
                删除
              </Button>
            </template>
          </Space>
          <div class="mb-2 font-medium">SKILL.md 说明</div>
          <pre
            class="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border p-4 font-mono text-sm"
            data-testid="skill-readme"
            >{{ detail.readme }}</pre>
        </template>
      </Spin>
    </Modal>
  </Page>
</template>
