<script lang="ts" setup>
import type {
  MarketPlugin,
  PluginMarketIndex,
  PluginMarketState,
  PluginVersion,
} from '#/api/fdmskill/plugins';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAppConfig } from '@vben/hooks';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getPluginMarket, updatePluginMarket } from '#/api/fdmskill/plugins';

import {
  clone,
  displayText,
  editText,
  newPlugin,
  newVersion,
  resolveIndexUrl,
  validateIndex,
  withPlugin,
} from './model';

defineOptions({ name: 'FdmPluginMarket' });

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const server = ref<PluginMarketState>();
const draft = ref<PluginMarketIndex>();
const baseline = ref('');
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const conflict = ref(false);
const search = ref('');
const categoryFilter = ref<string>();
const statusFilter = ref<string>();
const dirty = computed(() =>
  Boolean(draft.value && JSON.stringify(draft.value) !== baseline.value),
);
const canEdit = computed(() =>
  Boolean(
    draft.value &&
    server.value?.enabled &&
    !loadError.value &&
    !loading.value &&
    !saving.value &&
    !conflict.value,
  ),
);
const indexUrl = computed(() =>
  server.value
    ? resolveIndexUrl({
        apiURL,
        backendURL: import.meta.env.DEV
          ? import.meta.env.VITE_BASE_URL
          : undefined,
        indexPath: server.value.indexPath,
        indexUrl: server.value.indexUrl,
        origin: window.location.origin,
      })
    : '',
);
const categories = computed(() =>
  Object.entries(draft.value?.metadata?.categories ?? {}).map(
    ([value, entry]) => ({ value, label: displayText(entry.title) || value }),
  ),
);
const plugins = computed(() =>
  (draft.value?.plugins ?? []).filter((plugin) => {
    const term = search.value.trim().toLocaleLowerCase();
    const text = [
      plugin.name,
      displayText(plugin.title),
      displayText(plugin.description),
      ...(plugin.metadata?.keywords ?? []),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return (
      (!term || text.includes(term)) &&
      (!categoryFilter.value ||
        plugin.metadata?.category === categoryFilter.value) &&
      (!statusFilter.value ||
        (plugin.published === false ? 'unpublished' : 'published') ===
          statusFilter.value)
    );
  }),
);
const publishedCount = computed(
  () =>
    (draft.value?.plugins ?? []).filter((plugin) => plugin.published !== false)
      .length,
);
const columns = [
  { title: '插件', key: 'plugin', width: 330 },
  { title: '分类', key: 'category', width: 140 },
  { title: '版本 / 来源', key: 'versions', width: 220 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'actions', width: 220 },
];

function acceptState(state: PluginMarketState) {
  const error = validateIndex(state.index);
  if (error) throw new Error(`服务端索引无法编辑：${error}`);
  server.value = state;
  draft.value = clone(state.index);
  baseline.value = JSON.stringify(state.index);
  loadError.value = '';
  conflict.value = false;
}

async function load() {
  loading.value = true;
  try {
    acceptState(await getPluginMarket());
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : '索引加载失败，请刷新重试';
  } finally {
    loading.value = false;
  }
}

function reload() {
  if (!dirty.value) return void load();
  Modal.confirm({
    title: '重新加载将丢弃尚未发布的修改',
    content: '确认后从服务器读取最新索引。',
    okText: '丢弃修改并加载',
    cancelText: '继续编辑',
    onOk: load,
  });
}

async function publish() {
  if (!canEdit.value || !dirty.value || !server.value || !draft.value) return;
  const error = validateIndex(draft.value);
  if (error) return void message.warning(error);
  saving.value = true;
  try {
    acceptState(
      await updatePluginMarket({
        index: clone(draft.value),
        revision: server.value.revision,
      }),
    );
    message.success('索引已发布，桌面端刷新市场后生效');
  } catch (error) {
    const detail = error as {
      data?: { code?: number; msg?: string };
      message?: string;
      msg?: string;
      response?: { data?: { code?: number; msg?: string }; status?: number };
    };
    const text =
      detail.response?.data?.msg ||
      detail.data?.msg ||
      detail.msg ||
      detail.message ||
      '';
    if (
      detail.response?.status === 409 ||
      detail.data?.code === 409 ||
      detail.response?.data?.code === 409 ||
      /revision|conflict|冲突|已被|重新加载/i.test(text)
    ) {
      conflict.value = true;
      message.warning(
        '索引已被其他管理员更新。请先复制高级 JSON 保留修改，再重新加载最新索引。',
      );
    } else {
      message.error(text || '发布失败，修改已保留，请检查后重试');
    }
  } finally {
    saving.value = false;
  }
}

async function copyIndexUrl() {
  try {
    await navigator.clipboard.writeText(indexUrl.value);
    message.success('索引地址已复制，可添加到桌面端的「索引源」');
  } catch {
    message.warning('复制失败，请从地址框手动复制');
  }
}

const editOpen = ref(false);
const editing = ref<MarketPlugin>(newPlugin());
const originalName = ref<string>();
const editTitle = ref('');
const editDescription = ref('');
const editCategory = ref<string>();
const editError = ref('');

function openEditor(plugin?: MarketPlugin) {
  editing.value = clone(plugin ?? newPlugin());
  originalName.value = plugin?.name;
  editTitle.value = displayText(plugin?.title);
  editDescription.value = displayText(plugin?.description);
  editCategory.value = plugin?.metadata?.category;
  editError.value = '';
  editOpen.value = true;
}

function changeSource(version: PluginVersion) {
  version.source = { type: version.source.type };
}

function setEngine(version: PluginVersion, value: string) {
  const engines = { ...version.engines };
  if (value.trim()) engines.dsh = value.trim();
  else delete engines.dsh;
  version.engines = engines;
}

function setPublishTime(version: PluginVersion, value: unknown) {
  if (dayjs.isDayjs(value) && value.isValid())
    version.publishTimestamp = value.unix();
}

function applyPlugin() {
  if (!canEdit.value || !draft.value) return;
  const plugin = clone(editing.value);
  plugin.name = plugin.name.trim();
  const title = editText(plugin.title, editTitle.value);
  const description = editText(plugin.description, editDescription.value);
  if (title === undefined) delete plugin.title;
  else plugin.title = title;
  if (description === undefined) delete plugin.description;
  else plugin.description = description;
  plugin.metadata = { ...plugin.metadata };
  if (editCategory.value) plugin.metadata.category = editCategory.value;
  else delete plugin.metadata.category;
  for (const version of plugin.versions) {
    if (version.source.registry === '') delete version.source.registry;
    if (version.source.path === '') delete version.source.path;
  }
  const next = withPlugin(draft.value, plugin, originalName.value);
  const error = validateIndex(next);
  if (error) {
    editError.value = error;
    return;
  }
  draft.value = next;
  editOpen.value = false;
  message.success('已保存到草稿，点击「发布修改」后生效');
}

function togglePublished(plugin: MarketPlugin) {
  if (!canEdit.value) return;
  plugin.published = plugin.published === false;
}

function removePlugin(plugin: MarketPlugin) {
  Modal.confirm({
    title: `删除插件 ${plugin.name}？`,
    content:
      '删除会从索引移除全部版本，发布后对市场生效。已安装的插件不受影响。',
    okText: '删除',
    okButtonProps: { danger: true },
    onOk: () => {
      if (canEdit.value && draft.value)
        draft.value.plugins = draft.value.plugins.filter(
          (entry) => entry.name !== plugin.name,
        );
    },
  });
}

const jsonOpen = ref(false);
const jsonText = ref('');
const jsonError = ref('');
function openJson() {
  jsonText.value = JSON.stringify(draft.value, null, 2);
  jsonError.value = '';
  jsonOpen.value = true;
}
function applyJson() {
  if (!canEdit.value) return;
  try {
    const parsed: unknown = JSON.parse(jsonText.value);
    const error = validateIndex(parsed);
    if (error) {
      jsonError.value = error;
      return;
    }
    draft.value = clone(parsed as PluginMarketIndex);
    jsonOpen.value = false;
    message.success('已更新索引草稿，点击「发布修改」后生效');
  } catch {
    jsonError.value = 'JSON 语法错误，请检查引号、逗号和括号';
  }
}

onMounted(load);
</script>

<template>
  <Page
    title="插件市场"
    description="维护桌面端的插件索引、版本和上架状态，发布后供桌面端发现和安装。"
  >
    <div class="space-y-4">
      <Alert
        v-if="loadError"
        type="error"
        show-icon
        :message="loadError"
        description="当前草稿已保留，重新加载成功前不能发布。"
      />
      <Alert
        v-if="conflict"
        type="warning"
        show-icon
        message="索引已被其他管理员修改"
        description="请打开高级 JSON 复制当前草稿，再重新加载并合并最新内容后发布。"
      />
      <Alert
        v-if="server && !server.enabled"
        type="warning"
        show-icon
        message="插件市场尚未启用"
        description="请在后端配置 fdm.plugin-market.enabled=true 并重启服务。"
      />
      <Card :bordered="false">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="text-lg font-semibold">{{
                displayText(draft?.title) || '插件索引'
              }}</span>
              <Tag v-if="server" :color="server.enabled ? 'green' : 'default'">
                {{ server.enabled ? '市场已启用' : '市场未启用' }}
              </Tag>
              <Tag v-if="dirty" color="orange">有未发布修改</Tag>
            </div>
            <p v-if="draft?.description" class="mb-3 text-sm text-gray-500">
              {{ displayText(draft.description) }}
            </p>
            <Space.Compact class="w-full max-w-[780px]">
              <Input
                :value="indexUrl"
                readonly
                aria-label="公开插件索引地址"
                placeholder="加载后显示索引地址"
              />
              <Button :disabled="!indexUrl" @click="copyIndexUrl">
                复制索引地址
              </Button>
            </Space.Compact>
            <p class="mb-0 mt-2 text-xs text-gray-500">
              将此地址添加到桌面端「插件 → 发现 →
              索引源」。添加后即可浏览已上架插件。
            </p>
          </div>
          <Space wrap>
            <Button
              :disabled="loading || saving"
              :loading="loading"
              @click="reload"
            >
              重新加载
            </Button>
            <Button :disabled="!draft || loading || saving" @click="openJson">
              高级 JSON
            </Button>
            <Button
              type="primary"
              :loading="saving"
              :disabled="!canEdit || !dirty"
              @click="publish"
            >
              发布修改
            </Button>
          </Space>
        </div>
      </Card>

      <Card :bordered="false">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Space wrap>
            <Input
              v-model:value="search"
              allow-clear
              placeholder="搜索包名、标题或关键词"
              aria-label="搜索插件"
              class="!w-64"
            />
            <Select
              v-model:value="categoryFilter"
              :options="categories"
              allow-clear
              placeholder="全部分类"
              aria-label="按分类筛选"
              class="!w-40"
            />
            <Select
              v-model:value="statusFilter"
              :options="[
                { label: '已上架', value: 'published' },
                { label: '已下架', value: 'unpublished' },
              ]"
              allow-clear
              placeholder="全部状态"
              aria-label="按状态筛选"
              class="!w-32"
            />
            <span class="text-sm text-gray-500">共 {{ draft?.plugins.length ?? 0 }} 个插件 · 上架
              {{ publishedCount }} 个</span>
          </Space>
          <Button type="primary" :disabled="!canEdit" @click="openEditor()">
            新增插件
          </Button>
        </div>
        <Table
          :columns="columns"
          :data-source="plugins"
          row-key="name"
          :loading="loading"
          :scroll="{ x: 1010 }"
          :pagination="{ pageSize: 10, showSizeChanger: true }"
        >
          <template #emptyText>
            <Empty
              :description="
                search || categoryFilter || statusFilter
                  ? '没有符合筛选条件的插件'
                  : '还没有插件，点击「新增插件」开始配置'
              "
            />
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'plugin'">
              <div class="font-medium">
                {{ displayText(record.title) || record.name }}
              </div>
              <div class="break-all text-xs text-gray-500">
                {{ record.name }}
              </div>
              <div v-if="record.description" class="mt-1 text-sm text-gray-500">
                {{ displayText(record.description) }}
              </div>
            </template>
            <template v-else-if="column.key === 'category'">
              {{
                categories.find(
                  (entry) => entry.value === record.metadata?.category,
                )?.label || '未分类'
              }}
            </template>
            <template v-else-if="column.key === 'versions'">
              <Space wrap>
                <Tag v-for="version in record.versions" :key="version.version">
                  {{ version.version }} · {{ version.source.type }}
                </Tag>
              </Space>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="record.published === false ? 'default' : 'green'">
                {{ record.published === false ? '已下架' : '已上架' }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space>
                <Button
                  type="link"
                  size="small"
                  :disabled="!canEdit"
                  @click="openEditor(record as MarketPlugin)"
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  size="small"
                  :disabled="!canEdit"
                  @click="togglePublished(record as MarketPlugin)"
                >
                  {{ record.published === false ? '上架' : '下架' }}
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  :disabled="!canEdit"
                  @click="removePlugin(record as MarketPlugin)"
                >
                  删除
                </Button>
              </Space>
            </template>
          </template>
        </Table>
      </Card>
    </div>

    <Modal
      v-model:open="editOpen"
      :title="originalName ? '编辑插件' : '新增插件'"
      :width="900"
      :mask-closable="false"
      ok-text="保存到草稿"
      :ok-button-props="{ disabled: !canEdit }"
      @ok="applyPlugin"
    >
      <Alert
        v-if="editError"
        type="error"
        :message="editError"
        show-icon
        class="mb-4"
      />
      <Form layout="vertical">
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormItem label="npm 包名" required>
            <Input
              v-model:value="editing.name"
              placeholder="@your-org/dsh-plugin-example"
            />
          </FormItem>
          <FormItem label="显示标题（中文）">
            <Input v-model:value="editTitle" placeholder="插件名称" />
          </FormItem>
        </div>
        <FormItem label="插件描述（中文）">
          <Textarea
            v-model:value="editDescription"
            :rows="2"
            placeholder="说明插件的用途"
          />
        </FormItem>
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormItem label="分类">
            <Select
              v-model:value="editCategory"
              :options="categories"
              allow-clear
              placeholder="可在高级 JSON 中维护分类"
            />
          </FormItem>
          <FormItem label="发布后状态">
            <Switch
              :checked="editing.published !== false"
              checked-children="上架"
              un-checked-children="下架"
              @change="editing.published = Boolean($event)"
            />
          </FormItem>
        </div>
        <div class="mb-3 flex items-center justify-between">
          <span class="font-medium">插件版本</span><Button size="small" @click="editing.versions.push(newVersion())">
            添加版本
          </Button>
        </div>
        <Card
          v-for="(version, position) in editing.versions"
          :key="position"
          size="small"
          class="mb-3"
          :title="`版本 ${position + 1}`"
        >
          <template #extra>
            <Button
              size="small"
              type="link"
              danger
              :disabled="editing.versions.length === 1"
              @click="editing.versions.splice(position, 1)"
            >
              移除版本
            </Button>
          </template>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-3">
            <FormItem label="版本号" required>
              <Input v-model:value="version.version" placeholder="1.0.0" />
            </FormItem>
            <FormItem label="发布时间" required>
              <DatePicker
                :value="dayjs.unix(version.publishTimestamp)"
                show-time
                :allow-clear="false"
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="选择发布时间"
                class="!w-full"
                @update:value="setPublishTime(version, $event)"
              />
            </FormItem>
            <FormItem label="DSH 版本范围">
              <Input
                :value="version.engines?.dsh"
                placeholder="例如 0.2.1-rc.5（可选）"
                @update:value="setEngine(version, $event)"
              />
            </FormItem>
          </div>
          <FormItem label="安装来源" required>
            <Select
              v-model:value="version.source.type"
              :options="[
                { label: 'npm 包', value: 'npm' },
                { label: 'Git 仓库', value: 'git' },
              ]"
              @change="changeSource(version)"
            />
          </FormItem>
          <FormItem
            v-if="version.source.type === 'npm'"
            label="npm Registry（可选）"
          >
            <Input
              v-model:value="version.source.registry"
              placeholder="留空使用默认 Registry，例如 https://registry.npmjs.org"
            />
          </FormItem>
          <template v-else>
            <FormItem label="HTTPS Git 仓库地址" required>
              <Input
                v-model:value="version.source.url"
                placeholder="https://github.com/your-org/repository"
              />
            </FormItem>
            <FormItem label="固定 Commit（40 位小写 SHA）" required>
              <Input
                v-model:value="version.source.commit"
                :maxlength="40"
                placeholder="完整提交 SHA，不能使用分支名或 tag"
              />
            </FormItem>
            <FormItem label="仓库内包路径（可选）">
              <Input
                v-model:value="version.source.path"
                placeholder="例如 packages/plugin-example"
              />
            </FormItem>
          </template>
        </Card>
        <Alert
          type="info"
          show-icon
          message="保存到草稿后还需发布修改。安装来源应为你信任的 npm 包或 Git 仓库。多语言、图标、作者、关键词等字段可在高级 JSON 中维护。"
        />
      </Form>
    </Modal>

    <Modal
      v-model:open="jsonOpen"
      title="高级索引 JSON"
      :width="1000"
      :mask-closable="false"
      ok-text="应用到草稿"
      :ok-button-props="{ disabled: !canEdit }"
      @ok="applyJson"
    >
      <Alert
        class="mb-3"
        type="info"
        show-icon
        message="可维护索引标题、描述、分类、标签及插件完整字段。format 必须为 1；多语言对象必须保留 en。应用后还需发布修改。"
      />
      <Alert
        v-if="jsonError"
        class="mb-3"
        type="error"
        :message="jsonError"
        show-icon
      />
      <Textarea
        v-model:value="jsonText"
        :rows="23"
        :readonly="!canEdit"
        spellcheck="false"
        aria-label="插件索引 JSON"
        class="font-mono text-xs"
      />
    </Modal>
  </Page>
</template>
