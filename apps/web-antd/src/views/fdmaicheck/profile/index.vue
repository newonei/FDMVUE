<script lang="ts" setup>
import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import {
  Alert,
  Button,
  Empty,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  discardAiCheckDraft,
  getAiCheckDryRun,
  getAiCheckModels,
  getAiCheckProfile,
  getAiCheckProfiles,
  publishAiCheckDraft,
  rollbackAiCheckPrompt,
  saveAiCheckDraft,
  searchAiCheckDocs,
  startAiCheckDryRun,
  updateAiCheckSettings,
} from '#/api/fdmaicheck';

import AiCenterShell from '../../fdmai/shared/AiCenterShell.vue';
import {
  aiStatusText,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  sortFindings,
} from '../components/risk';
import {
  draftFrom,
  draftProblem,
  newItem,
  normalizeDraft,
  SEVERITY_OPTIONS,
  versionLabel,
} from './model';

defineOptions({ name: 'FdmAiCheckProfile' });

const { hasAccessByCodes } = useAccess();
const canEdit = computed(() => hasAccessByCodes(['fdmaicheck:profile:update']));

const profiles = ref<FdmAiCheckApi.Profile[]>([]);
const models = ref<FdmAiCheckApi.ModelOption[]>([]);
const current = ref<string>();
const detail = ref<FdmAiCheckApi.ProfileDetail>();
const loading = ref(false);
const saving = ref(false);
const editing = ref(false);
const draft = ref<FdmAiCheckApi.Draft>({ items: [], departmentNotes: {} });
/** 模型下拉用 0 表示「默认路由」，保存时再转成 null。 */
const settings = reactive<
  Omit<FdmAiCheckApi.Settings, 'modelId'> & { modelId?: number }
>({});

const dryDocs = ref<FdmAiCheckApi.DocOption[]>([]);
const dryDocId = ref<string>();
const dryLoading = ref(false);
const dryResult = ref<FdmAiCheckApi.DryRun>();
let dryTimer: ReturnType<typeof setTimeout> | undefined;

const shown = computed(() =>
  editing.value ? undefined : (detail.value?.draft ?? detail.value?.published),
);
const modelOptions = computed(() => [
  { label: '默认（路由 fdm.aicheck.v1）', value: 0 },
  ...models.value.map((m) => ({
    label: `${m.name || m.code}${m.structured ? '' : '（无结构化输出）'}`,
    value: m.id,
  })),
]);
const versionColumns = [
  { title: '版本', key: 'version', width: 90 },
  { title: '状态', key: 'status', width: 90 },
  { title: '发布时间', key: 'time', width: 170 },
  { title: '', key: 'action', width: 120 },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function loadList() {
  profiles.value = await getAiCheckProfiles();
  if (!current.value && profiles.value.length > 0)
    current.value = profiles.value[0]!.docType;
}

async function loadDetail() {
  if (!current.value) return;
  loading.value = true;
  try {
    detail.value = await getAiCheckProfile(current.value);
    const p = detail.value.profile;
    Object.assign(settings, {
      enabled: p.enabled,
      modelId: p.modelId ?? 0,
      triggerOnCreate: p.triggerOnCreate,
      triggerOnUpdate: p.triggerOnUpdate,
      includeBatch: p.includeBatch,
      notifyLevel: p.notifyLevel,
    });
    editing.value = false;
  } catch (error) {
    message.error(errorMessage(error, '配置读取失败'));
  } finally {
    loading.value = false;
  }
}

async function select(docType: string) {
  if (editing.value && docType !== current.value) {
    message.warning('请先保存或取消正在编辑的草稿');
    return;
  }
  current.value = docType;
  dryResult.value = undefined;
  dryDocId.value = undefined;
  dryDocs.value = [];
  await loadDetail();
}

async function saveSettings() {
  if (!current.value) return;
  saving.value = true;
  try {
    await updateAiCheckSettings(current.value, {
      ...settings,
      modelId: settings.modelId || null,
    });
    message.success('设置已保存');
    await Promise.all([loadList(), loadDetail()]);
  } catch (error) {
    message.error(errorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

function startEdit(source?: FdmAiCheckApi.Prompt | null) {
  draft.value = draftFrom(
    source ?? detail.value?.draft ?? detail.value?.published,
  );
  editing.value = true;
}

async function saveDraft() {
  if (!current.value) return false;
  const problem = draftProblem(draft.value);
  if (problem) {
    message.warning(problem);
    return false;
  }
  saving.value = true;
  try {
    await saveAiCheckDraft(current.value, normalizeDraft(draft.value));
    message.success('草稿已保存，试跑确认后再发布');
    await Promise.all([loadList(), loadDetail()]);
    return true;
  } catch (error) {
    message.error(errorMessage(error, '保存失败'));
    return false;
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!current.value) return;
  if (editing.value && !(await saveDraft())) return;
  saving.value = true;
  try {
    await publishAiCheckDraft(current.value);
    message.success('已发布，之后的检查按新版本执行');
    await Promise.all([loadList(), loadDetail()]);
  } catch (error) {
    message.error(errorMessage(error, '发布失败'));
  } finally {
    saving.value = false;
  }
}

async function discard() {
  if (!current.value) return;
  await discardAiCheckDraft(current.value);
  message.success('草稿已放弃');
  await Promise.all([loadList(), loadDetail()]);
}

async function rollback(promptId: number) {
  if (!current.value) return;
  try {
    await rollbackAiCheckPrompt(current.value, promptId);
    message.success(
      promptId === 0 ? '已恢复出厂默认检查项' : '已恢复为当前版本',
    );
    await Promise.all([loadList(), loadDetail()]);
  } catch (error) {
    message.error(errorMessage(error, '恢复失败'));
  }
}

async function searchDocs(keyword?: string) {
  if (!current.value) return;
  try {
    dryDocs.value = await searchAiCheckDocs(current.value, keyword);
  } catch {
    dryDocs.value = [];
  }
}

function stopDry() {
  if (dryTimer) clearTimeout(dryTimer);
  dryTimer = undefined;
}

async function pollDry(id: number, count = 0) {
  stopDry();
  try {
    const value = await getAiCheckDryRun(id);
    dryResult.value = value;
    if (
      ['PREPARING', 'QUEUED', 'WAITING_AI'].includes(value.task.status) &&
      count < 60
    ) {
      dryTimer = setTimeout(() => pollDry(id, count + 1), 4000);
      return;
    }
  } catch (error) {
    message.error(errorMessage(error, '试跑结果读取失败'));
  }
  dryLoading.value = false;
}

async function dryRun() {
  if (!current.value || !dryDocId.value) {
    message.warning('请先选择一张单据');
    return;
  }
  if (editing.value && !(await saveDraft())) return;
  dryLoading.value = true;
  dryResult.value = undefined;
  try {
    const id = await startAiCheckDryRun(current.value, dryDocId.value);
    await pollDry(id);
  } catch (error) {
    dryLoading.value = false;
    message.error(errorMessage(error, '试跑失败'));
  }
}

onMounted(async () => {
  try {
    await loadList();
    models.value = await getAiCheckModels().catch(() => []);
    await loadDetail();
  } catch (error) {
    message.error(errorMessage(error, '配置读取失败'));
  }
});
onBeforeUnmount(stopDry);
</script>

<template>
  <AiCenterShell
    title="AI 单据检查"
    description="单据保存后后台自动检查风险，只提醒不拦截；在这里配置每类单据的检查项和注意事项"
  >
    <div class="aicheck-layout">
      <nav class="aicheck-types">
        <button
          v-for="p in profiles"
          :key="p.docType"
          type="button"
          class="aicheck-type"
          :class="[{ active: p.docType === current }]"
          @click="select(p.docType)"
        >
          <span class="name">{{ p.docTypeName }}</span>
          <span class="meta">
            <Tag :color="p.enabled ? 'green' : 'default'">{{
              p.enabled ? '检查中' : '已停用'
            }}</Tag>
            <span>{{
              p.publishedVersionNo
                ? `第 ${p.publishedVersionNo} 版`
                : '出厂默认'
            }}</span>
            <Tag v-if="p.hasDraft" color="orange">有草稿</Tag>
          </span>
        </button>
        <Empty
          v-if="profiles.length === 0"
          description="没有可配置的单据类型"
        />
      </nav>

      <Spin :spinning="loading" class="aicheck-main-wrap">
        <div v-if="detail" class="aicheck-main">
          <section class="aicheck-card">
            <h3>检查设置</h3>
            <div class="aicheck-settings">
              <label>启用检查
                <Switch v-model:checked="settings.enabled" :disabled="!canEdit" /></label>
              <label>新建后检查
                <Switch
                  v-model:checked="settings.triggerOnCreate"
                  :disabled="!canEdit"
              /></label>
              <label>修改后检查
                <Switch
                  v-model:checked="settings.triggerOnUpdate"
                  :disabled="!canEdit"
              /></label>
              <label>导入、迁移也检查（夜间）
                <Switch
                  v-model:checked="settings.includeBatch"
                  :disabled="!canEdit"
              /></label>
              <label class="wide">
                模型
                <Select
                  v-model:value="settings.modelId"
                  :options="modelOptions"
                  :disabled="!canEdit"
                  class="aicheck-select"
                />
              </label>
              <label>
                通知负责人
                <Select
                  v-model:value="settings.notifyLevel"
                  :options="
                    SEVERITY_OPTIONS.map((o) => ({
                      ...o,
                      label: `${o.label}及以上`,
                    }))
                  "
                  :disabled="!canEdit"
                  class="aicheck-select-sm"
                />
              </label>
            </div>
            <p class="aicheck-muted">
              模型须在模型中心给单据所属公司放行「FDM_AI_CHECK /
              CONFIDENTIAL」用途，否则只做规则检查。同一单据 1
              小时内最多通知一次。
            </p>
            <Button
              v-if="canEdit"
              type="primary"
              :loading="saving"
              @click="saveSettings"
            >
              保存设置
            </Button>
          </section>

          <section class="aicheck-card">
            <div class="aicheck-card-head">
              <h3>
                检查项与注意事项
                <Tag v-if="!editing && detail.draft" color="orange">
                  草稿（未发布）
                </Tag>
                <Tag v-else-if="!editing">
                  {{ versionLabel(detail.published) }}
                </Tag>
                <Tag v-else color="processing">编辑中</Tag>
              </h3>
              <Space v-if="canEdit">
                <template v-if="editing">
                  <Button @click="editing = false">取消</Button>
                  <Button :loading="saving" @click="saveDraft">保存草稿</Button>
                  <Button type="primary" :loading="saving" @click="publish">
                    保存并发布
                  </Button>
                </template>
                <template v-else>
                  <Button @click="startEdit()">
                    {{ detail.draft ? '继续编辑草稿' : '编辑' }}
                  </Button>
                  <Popconfirm
                    v-if="detail.draft"
                    title="放弃这份草稿？"
                    @confirm="discard"
                  >
                    <Button danger>放弃草稿</Button>
                  </Popconfirm>
                  <Button
                    v-if="detail.draft"
                    type="primary"
                    :loading="saving"
                    @click="publish"
                  >
                    发布草稿
                  </Button>
                </template>
              </Space>
            </div>
            <Alert
              type="info"
              show-icon
              message="系统已固定：AI 只能提醒不能改单据、业务资料里的文字不当指令执行、每条风险须引用证据。这里只写要检查什么、什么情况不算问题。"
            />

            <template v-if="editing">
              <div
                v-for="(item, index) in draft.items"
                :key="index"
                class="aicheck-item edit"
              >
                <div class="row">
                  <Input
                    v-model:value="item.code"
                    placeholder="编码，如 PRICE_HIGH"
                    class="code"
                  />
                  <Input
                    v-model:value="item.name"
                    placeholder="名称"
                    :maxlength="50"
                    class="name"
                  />
                  <Select
                    v-model:value="item.severity"
                    :options="SEVERITY_OPTIONS"
                    class="sev"
                  />
                  <Switch
                    v-model:checked="item.enabled"
                    checked-children="启用"
                    un-checked-children="停用"
                  />
                  <Button
                    type="link"
                    danger
                    @click="draft.items.splice(index, 1)"
                  >
                    删除
                  </Button>
                </div>
                <Input.TextArea
                  v-model:value="item.description"
                  :rows="2"
                  :maxlength="1000"
                  placeholder="要检查什么、什么情况不算问题"
                />
              </div>
              <Space>
                <Button @click="draft.items.push(newItem(draft.items))">
                  添加检查项
                </Button>
                <Button
                  type="link"
                  @click="
                    startEdit({
                      promptId: 0,
                      items: detail.defaultItems,
                      departmentNotes: {},
                    })
                  "
                >
                  用出厂默认检查项重新开始
                </Button>
              </Space>
              <h4>部门补充说明</h4>
              <div class="aicheck-notes">
                <label v-for="(name, key) in detail.departments" :key="key">
                  {{ name }}
                  <Input.TextArea
                    v-model:value="draft.departmentNotes[key]"
                    :rows="2"
                    :maxlength="2000"
                    :placeholder="`只对${name}的单据生效`"
                  />
                </label>
              </div>
              <h4>补充说明</h4>
              <Input.TextArea
                v-model:value="draft.notes"
                :rows="3"
                :maxlength="4000"
                placeholder="对这类单据的通用注意事项，例如：样品单允许零价"
              />
            </template>
            <template v-else-if="shown">
              <div
                v-for="item in shown.items"
                :key="item.code"
                class="aicheck-item"
                :class="[{ off: !item.enabled }]"
              >
                <div class="row">
                  <Tag :color="SEVERITY_COLORS[item.severity]">
                    {{ SEVERITY_LABELS[item.severity] }}
                  </Tag>
                  <strong>{{ item.name }}</strong>
                  <code>{{ item.code }}</code>
                  <Tag v-if="!item.enabled">已停用</Tag>
                </div>
                <p v-if="item.description">{{ item.description }}</p>
              </div>
              <Empty
                v-if="shown.items.length === 0"
                description="没有检查项，AI 只按通用要求检查"
              />
              <template v-for="(name, key) in detail.departments" :key="key">
                <p v-if="shown.departmentNotes[key]" class="aicheck-note">
                  <b>{{ name }}：</b>{{ shown.departmentNotes[key] }}
                </p>
              </template>
              <p v-if="shown.notes" class="aicheck-note">
                <b>补充说明：</b>{{ shown.notes }}
              </p>
            </template>
          </section>

          <section v-if="canEdit" class="aicheck-card">
            <h3>试跑</h3>
            <p class="aicheck-muted">
              用{{
                detail.draft || editing ? '草稿' : '当前版本'
              }}检查一张历史单据，结果只在这里显示，不写到单据上、不通知负责人。
            </p>
            <Space wrap>
              <Select
                v-model:value="dryDocId"
                show-search
                :filter-option="false"
                placeholder="输入单号、客户或供应商搜索"
                class="aicheck-doc-select"
                :options="
                  dryDocs.map((d) => ({
                    value: d.docId,
                    label:
                      [d.code, d.title].filter(Boolean).join(' · ') || d.docId,
                  }))
                "
                @search="searchDocs"
                @focus="dryDocs.length || searchDocs()"
              />
              <Button type="primary" :loading="dryLoading" @click="dryRun">
                试跑
              </Button>
            </Space>
            <div v-if="dryResult" class="aicheck-dry">
              <div class="row">
                <Tag
                  v-if="dryResult.task.riskLevel"
                  :color="SEVERITY_COLORS[dryResult.task.riskLevel]"
                >
                  {{ SEVERITY_LABELS[dryResult.task.riskLevel] }}
                </Tag>
                <Tag v-else color="processing">
                  {{
                    dryResult.task.status === 'FAILED' ? '未完成' : '检查中…'
                  }}
                </Tag>
                <span>{{ dryResult.task.summary }}</span>
              </div>
              <p
                v-if="aiStatusText(dryResult.task.aiStatus)"
                class="aicheck-muted"
              >
                {{ aiStatusText(dryResult.task.aiStatus) }}
              </p>
              <p v-if="dryResult.task.errorMessage" class="aicheck-muted">
                {{ dryResult.task.errorMessage }}
              </p>
              <ul>
                <li v-for="f in sortFindings(dryResult.findings)" :key="f.id">
                  <Tag :color="SEVERITY_COLORS[f.severity]">
                    {{ SEVERITY_LABELS[f.severity] }}
                  </Tag>
                  <span class="aicheck-muted">{{ f.source === 'RULE' ? '规则' : 'AI'
                    }}{{ f.checkCode ? ` · ${f.checkCode}` : '' }}</span>
                  {{ f.message }}
                  <div v-if="f.suggestion" class="aicheck-muted">
                    建议：{{ f.suggestion }}
                  </div>
                </li>
              </ul>
            </div>
          </section>

          <section class="aicheck-card">
            <div class="aicheck-card-head">
              <h3>历史版本</h3>
              <Popconfirm
                v-if="canEdit"
                title="恢复出厂默认检查项？会生成一个新版本。"
                @confirm="rollback(0)"
              >
                <Button size="small">恢复出厂默认</Button>
              </Popconfirm>
            </div>
            <Table
              :columns="versionColumns"
              :data-source="detail.versions"
              row-key="id"
              size="small"
              :pagination="false"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'version'">
                  第 {{ record.versionNo }} 版
                </template>
                <template v-else-if="column.key === 'status'">
                  <Tag
                    :color="record.status === 'PUBLISHED' ? 'green' : 'default'"
                  >
                    {{ record.status === 'PUBLISHED' ? '当前' : '已归档' }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'time'">
                  {{
                    record.publishedTime
                      ? formatDateTime(record.publishedTime)
                      : '—'
                  }}
                </template>
                <template v-else-if="column.key === 'action'">
                  <Popconfirm
                    v-if="canEdit && record.status !== 'PUBLISHED'"
                    title="把这个版本恢复为当前版本？"
                    @confirm="rollback(record.id)"
                  >
                    <Button size="small" type="link">恢复为当前</Button>
                  </Popconfirm>
                </template>
              </template>
            </Table>
          </section>
        </div>
      </Spin>
    </div>
  </AiCenterShell>
</template>

<style scoped>
.aicheck-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
}

.aicheck-types {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aicheck-type {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.aicheck-type.active {
  border-color: var(--ant-color-primary, #1677ff);
  box-shadow: 0 0 0 2px rgb(22 119 255 / 10%);
}

.aicheck-type .name {
  font-weight: 600;
}

.aicheck-type .meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.aicheck-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aicheck-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.aicheck-card h3 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  font-size: 15px;
}

.aicheck-card h4 {
  margin: 6px 0 0;
}

.aicheck-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.aicheck-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 22px;
}

.aicheck-settings label {
  display: flex;
  gap: 8px;
  align-items: center;
}

.aicheck-select {
  width: 280px;
}

.aicheck-select-sm {
  width: 140px;
}

.aicheck-doc-select {
  width: 360px;
}

.aicheck-muted {
  margin: 0;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.aicheck-item {
  padding: 8px 0;
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.aicheck-item.off {
  opacity: 0.55;
}

.aicheck-item .row,
.aicheck-dry .row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.aicheck-item p {
  margin: 4px 0 0;
  color: var(--ant-color-text-secondary, #595959);
}

.aicheck-item.edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aicheck-item.edit .code {
  width: 200px;
}

.aicheck-item.edit .name {
  width: 220px;
}

.aicheck-item.edit .sev {
  width: 110px;
}

.aicheck-notes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.aicheck-note {
  margin: 0;
}

.aicheck-dry ul {
  padding: 0;
  margin: 6px 0 0;
  list-style: none;
}

.aicheck-dry li {
  padding: 4px 0;
}

@media (max-width: 900px) {
  .aicheck-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .aicheck-notes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
