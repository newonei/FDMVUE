<script setup lang="ts">
import type {
  Experience,
  ExperienceFeedback,
  ExperienceInput,
  ExperienceOwner,
  ExperienceProfile,
  ExperienceUse,
  ExperienceView,
  FeedbackOutcome,
  MyExperienceUse,
  Scope,
} from '#/api/fdmmcp/experience';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { experienceApi } from '#/api/fdmmcp/experience';

import DesktopCapture from './DesktopCapture.vue';
import ExperienceEditor from './ExperienceEditor.vue';
import ExperienceFeedbackForm from './ExperienceFeedbackForm.vue';
import ExperienceOwnerPicker from './ExperienceOwnerPicker.vue';
import { useExperienceIdentity } from './identity';

defineOptions({ name: 'EmployeeExperienceLibrary' });
type View = 'feedback' | 'usage' | ExperienceView;
const labels = {
  mine: '我的经验',
  review: '待我审核',
  shared: '可查阅知识',
  usage: '使用记录',
  feedback: '收到的反馈',
} as const;
const statuses = {
  personal: '仅本人使用',
  pending: '共享待审核',
  returned: '共享已退回',
  published: '已发布',
};
const scopeLabels = {
  private: '仅本人',
  department: '本部门',
  company: '全公司',
};
const origins = {
  'private-trial': '本人试用',
  'shared-trial': '共享知识试用',
  chat: '聊天回答引用',
};
const access = useAccessStore();
const identity = useExperienceIdentity();
const outcomeLabels = {
  resolved: '已解决',
  'needs-detail': '未解决，需补充',
  outdated: '已过时',
};
const myUses = ref<MyExperienceUse[]>([]);
const feedback = ref<ExperienceFeedback[]>([]);
const myUseView = ref(false);
const editingUse = ref<MyExperienceUse>();
const authorFeedback = ref<ExperienceFeedback>();
const trialUse = ref<MyExperienceUse>();
const profile = ref<ExperienceProfile | null>(null);
const view = ref<View>('mine');
const rows = ref<Experience[]>([]);
const uses = ref<ExperienceUse[]>([]);
const selected = ref('');
const current = computed(() =>
  rows.value.find((item) => item.id === selected.value),
);
const views = computed<View[]>(() =>
  profile.value?.canReview
    ? ['mine', 'shared', 'review', 'usage', 'feedback']
    : ['mine', 'shared', 'usage', 'feedback'],
);
const applied = ref('');
const query = ref('');
const question = ref(false);
const owner = ref<ExperienceOwner>();
const directoryRefresh = ref(0);
const ownerSearch = computed(() => view.value === 'shared' && !!owner.value);
const emptyMessage = computed(() => {
  if (ownerSearch.value)
    return applied.value
      ? '该员工的已发布经验中没有匹配这次问题的内容。'
      : '输入问题，查找这位员工已发布的做法和来源。';
  if (question.value) return '没有匹配这次问题的经验。';
  if (applied.value) return '没有匹配的经验。';
  if (view.value === 'mine') return '还没有个人经验。';
  if (view.value === 'review') return '暂无待审核申请。';
  return '暂无可查阅的已发布知识。';
});
const busy = ref(false);
const errorMessage = ref('');
const loading = ref(false);
const notice = ref('');
type Editor = {
  item?: Experience;
  kind: 'edit' | 'manual' | 'report';
  question?: string;
};
const editor = ref<Editor | null>(null);
const canRecordAnswer = computed(
  () =>
    !!profile.value &&
    !loading.value &&
    !errorMessage.value &&
    rows.value.length === 0 &&
    !!applied.value &&
    query.value.trim() === applied.value &&
    ((view.value === 'mine' && question.value) || ownerSearch.value),
);
const confirmWithdraw = ref(false);
const note = ref('');
const scope = ref<Scope>('department');
const history = ref<Experience | null>(null);
const trial = ref<Experience | null>(null);
let attempt: undefined | { key: string; messageId: string };
let reader: AbortController | undefined, writer: AbortController | undefined;
const revision = (item: { id: string; version: number }) => ({
  id: item.id,
  version: item.version,
});
function explain(e: unknown) {
  const issue = e as {
    message?: string;
    response?: { data?: { message?: string; msg?: string } };
  };
  return (
    issue?.response?.data?.msg ||
    issue?.response?.data?.message ||
    issue?.message ||
    '本次请求未完成，请刷新后重试。'
  );
}
function resetDetail() {
  editingUse.value = undefined;
  authorFeedback.value = undefined;
  trialUse.value = undefined;
  trial.value = null;
  history.value = null;
  attempt = undefined;
  scope.value = 'department';
  note.value = '';
  confirmWithdraw.value = false;
}
async function load() {
  reader?.abort();
  const request = new AbortController();
  reader = request;
  const activeView = view.value;
  loading.value = true;
  errorMessage.value = '';
  rows.value = [];
  uses.value = [];
  myUses.value = [];
  feedback.value = [];
  try {
    if (!profile.value) {
      const person = await experienceApi('profile', {}, request.signal);
      if (request.signal.aborted) return;
      profile.value = person;
    }
    if (activeView === 'feedback') {
      const result = await experienceApi('feedbackList', {}, request.signal);
      if (!request.signal.aborted) feedback.value = result.items;
    } else if (activeView === 'usage' && myUseView.value) {
      const result = await experienceApi('myUses', {}, request.signal);
      if (!request.signal.aborted) myUses.value = result.items;
    } else if (activeView === 'usage') {
      const result = await experienceApi('usage', {}, request.signal);
      if (!request.signal.aborted) uses.value = result.items;
    } else if (activeView === 'shared' && owner.value && !applied.value) {
      selected.value = '';
    } else {
      const personal = activeView === 'mine' && question.value;
      const author = personal ? profile.value.id : owner.value?.id;
      const result = author
        ? await experienceApi(
            'search',
            {
              query: applied.value,
              ownerId: author,
              ...(personal ? { personal: true } : {}),
            },
            request.signal,
          )
        : await experienceApi(
            'list',
            { view: activeView, query: applied.value },
            request.signal,
          );
      if (request.signal.aborted) return;
      rows.value = result.items;
      if (!result.items.some((item) => item.id === selected.value))
        selected.value = result.items[0]?.id || '';
    }
  } catch (error) {
    if (!request.signal.aborted) errorMessage.value = explain(error);
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
function selectOwner(next: ExperienceOwner | undefined) {
  if (busy.value || view.value !== 'shared' || next?.id === owner.value?.id)
    return;
  owner.value = next;
  query.value = '';
  applied.value = '';
  selected.value = '';
  notice.value = '';
  resetDetail();
  void load();
}
function selectView(next: View) {
  if (busy.value) return;
  view.value = next;
  query.value = '';
  applied.value = '';
  question.value = false;
  owner.value = undefined;
  selected.value = '';
  notice.value = '';
  resetDetail();
  void load();
}
function changeUsage(outgoing: boolean) {
  if (busy.value) return;
  myUseView.value = outgoing;
  resetDetail();
  void load();
}
function find(asQuestion = false) {
  if (busy.value || (ownerSearch.value && !query.value.trim())) return;
  question.value = asQuestion;
  applied.value = query.value.trim();
  notice.value = '';
  resetDetail();
  void load();
}
watch(
  identity,
  () => {
    reader?.abort();
    writer?.abort();
    writer = undefined;
    busy.value = false;
    profile.value = null;
    editor.value = null;
    rows.value = [];
    uses.value = [];
    feedback.value = [];
    myUses.value = [];
    myUseView.value = false;
    view.value = 'mine';
    errorMessage.value = '';
    notice.value = '';
    query.value = '';
    applied.value = '';
    question.value = false;
    owner.value = undefined;
    selected.value = '';
    loading.value = false;
    resetDetail();
    if (access.accessToken) void load();
  },
  { immediate: true, flush: 'sync' },
);
onBeforeUnmount(() => {
  reader?.abort();
  writer?.abort();
});
async function perform(run: (signal: AbortSignal) => Promise<void>) {
  if (busy.value) return;
  const request = new AbortController();
  writer = request;
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  try {
    await run(request.signal);
  } catch (error) {
    if (!request.signal.aborted) errorMessage.value = explain(error);
  } finally {
    if (!request.signal.aborted) {
      busy.value = false;
      writer = undefined;
    }
  }
}
function openEditor(kind: 'edit' | 'manual' | 'report', item?: Experience) {
  errorMessage.value = '';
  editor.value = { kind, item };
}
function save(
  data: ExperienceInput &
    ({ id: string; version: number } | { sourceKey: string }),
) {
  void perform(async (signal) => {
    const result = await experienceApi('save', data, signal);
    if (signal.aborted) return;
    await onCaptured(result);
  });
}
async function onCaptured(result: Experience) {
  if (result.ownerId !== profile.value?.id) return;
  selected.value = result.id;
  view.value = 'mine';
  query.value = '';
  applied.value = '';
  question.value = false;
  owner.value = undefined;
  editor.value = null;
  resetDetail();
  notice.value = result.publishedVersion
    ? '已存为个人经验。再次提交共享审核后，同事才能使用修订版。'
    : '已存为个人经验。';
  await load();
}
function share(item: Experience) {
  void perform(async (signal) => {
    await experienceApi(
      'share',
      { ...revision(item), scope: scope.value },
      signal,
    );
    if (!signal.aborted) {
      resetDetail();
      notice.value = '共享申请已提交。';
      await load();
    }
  });
}
function review(item: Experience, approve: boolean) {
  if (!approve && !note.value.trim()) {
    errorMessage.value = '请填写退回原因。';
    return;
  }
  void perform(async (signal) => {
    await experienceApi(
      'review',
      { ...revision(item), approve, note: note.value.trim() },
      signal,
    );
    if (!signal.aborted) {
      resetDetail();
      notice.value = approve ? '审核通过，经验已发布。' : '已退回给作者修改。';
      await load();
    }
  });
}
function withdraw(item: Experience) {
  void perform(async (signal) => {
    await experienceApi('withdraw', revision(item), signal);
    if (!signal.aborted) {
      resetDetail();
      notice.value = '已撤回共享。';
      await load();
    }
  });
}
function useEntry(item: Experience) {
  const key = [view.value, item.id, item.version].join('/');
  if (attempt?.key !== key) attempt = { key, messageId: crypto.randomUUID() };
  const messageId = attempt.messageId;
  void perform(async (signal) => {
    await experienceApi(
      'cite',
      {
        ...revision(item),
        messageId,
        kind: view.value === 'mine' ? 'private-trial' : 'shared-trial',
      },
      signal,
    );
    if (!signal.aborted) {
      trial.value = item;
      if (view.value === 'shared' && item.ownerId !== profile.value?.id)
        trialUse.value = {
          ...revision(item),
          title: item.title,
          messageId,
          kind: 'shared-trial',
          at: '',
        };
    }
  });
}
function readHistory(item: ExperienceFeedback | ExperienceUse) {
  const release = !('kind' in item && item.kind === 'private-trial');
  void perform(async (signal) => {
    const record = await experienceApi(
      'read',
      {
        ...revision(item),
        ...(release ? { publishedOnly: true } : {}),
      },
      signal,
    );
    if (!signal.aborted) {
      authorFeedback.value = 'readerName' in item ? item : undefined;
      history.value = record;
    }
  });
}
function editLatest(id: string) {
  void perform(async (signal) => {
    const record = await experienceApi('own', { id }, signal);
    if (signal.aborted) return;
    if (record.status === 'pending') {
      errorMessage.value = '当前工作副本已提交审核，请等待审核结果。';
      return;
    }
    history.value = null;
    openEditor('edit', record);
  });
}
function sendFeedback(
  item: MyExperienceUse,
  outcome: FeedbackOutcome,
  note: string,
) {
  void perform(async (signal) => {
    await experienceApi(
      'feedback',
      { ...revision(item), messageId: item.messageId, outcome, note },
      signal,
    );
    if (signal.aborted) return;
    if (trialUse.value?.messageId === item.messageId)
      trialUse.value = { ...item, outcome, note };
    editingUse.value = undefined;
    notice.value = '使用反馈已保存。';
    if (view.value === 'usage') await load();
  });
}
</script>
<template>
  <Page
    title="数字分身经验库"
    :description="
      profile
        ? [profile.name, profile.department].filter(Boolean).join(' · ')
        : undefined
    "
  >
    <template #extra>
      <div class="actions">
        <Button :disabled="!profile || busy" @click="openEditor('report')">
          从日报提炼
        </Button>
        <Button
          type="primary"
          :disabled="!profile || busy"
          @click="openEditor('manual')"
        >
          记一条经验
        </Button>
      </div>
    </template>
    <div class="library">
      <DesktopCapture
        v-if="profile"
        :key="identity"
        :profile="profile"
        @saved="onCaptured"
      />
      <nav class="toolbar" aria-label="经验库视图">
        <div class="actions">
          <Button
            v-for="tab in views"
            :key="tab"
            :type="view === tab ? 'primary' : 'text'"
            :disabled="busy"
            :aria-pressed="view === tab"
            @click="selectView(tab)"
          >
            {{ labels[tab] }}
          </Button>
        </div>
        <Button
          :disabled="loading || busy"
          @click="
            resetDetail();
            directoryRefresh++;
            load();
          "
        >
          刷新
        </Button>
      </nav>
      <form
        v-if="view !== 'usage' && view !== 'feedback'"
        class="actions search"
        @submit.prevent="find()"
      >
        <ExperienceOwnerPicker
          v-if="view === 'shared' && profile"
          :key="identity"
          :disabled="busy"
          :owner="owner"
          :refresh-key="directoryRefresh"
          @choose="selectOwner"
        />
        <Input
          v-model:value="query"
          :aria-label="ownerSearch ? '向所选员工提问' : '查找经验'"
          :maxlength="240"
          allow-clear
          :placeholder="
            ownerSearch
              ? '输入工作中遇到的问题'
              : view === 'mine'
                ? '输入关键词或这次遇到的问题'
                : '搜索经验标题或正文'
          "
        />
        <Button
          html-type="submit"
          :disabled="busy || (ownerSearch && !query.trim())"
        >
          {{ ownerSearch ? '查这位员工的经验' : '搜索' }}
        </Button>
        <Button
          v-if="view === 'mine'"
          :disabled="busy || !query.trim()"
          @click="find(true)"
        >
          按问题查我的经验
        </Button>
      </form>
      <Alert
        v-if="errorMessage && !editor"
        type="error"
        :message="errorMessage"
        show-icon
      />
      <Alert v-if="notice" type="success" :message="notice" show-icon />
      <div v-if="loading" class="loading"><Spin /> 正在读取公司经验…</div>
      <Card v-else-if="view === 'feedback'" title="同事给我的使用反馈">
        <div v-for="(f, i) in feedback" :key="i" class="usage-row">
          <div>
            <strong>{{ f.title }}</strong>
            <p>
              {{ f.readerName }} · {{ outcomeLabels[f.outcome] }} · v{{
                f.version
              }}
              ·
              {{ f.at }}
            </p>
            <p v-if="f.note">{{ f.note }}</p>
          </div>
          <Button type="link" :disabled="busy" @click="readHistory(f)">
            查看被用版本
          </Button>
        </div>
        <Empty
          v-if="!feedback.length && !errorMessage"
          description="同事试用你的经验并提交反馈后，会显示在这里。"
        />
      </Card>
      <Card v-else-if="view === 'usage'" title="我的经验引用记录">
        <div class="actions">
          <Button
            :type="!myUseView ? 'primary' : 'text'"
            :disabled="busy"
            @click="changeUsage(false)"
          >
            我的经验被引用
          </Button>
          <Button
            :type="myUseView ? 'primary' : 'text'"
            :disabled="busy"
            @click="changeUsage(true)"
          >
            我用过的经验
          </Button>
        </div>
        <template v-if="myUseView">
          <div
            v-for="u in myUses"
            :key="`${u.id}:${u.version}:${u.messageId}`"
            class="usage-detail"
          >
            <div class="usage-row">
              <div>
                <strong>{{ u.title }}</strong>
                <p>{{ origins[u.kind] }} · v{{ u.version }} · {{ u.at }}</p>
                <p v-if="u.outcome">
                  {{ outcomeLabels[u.outcome]
                  }}<span v-if="u.note"> · {{ u.note }}</span>
                </p>
              </div>
              <div class="actions">
                <Button type="link" :disabled="busy" @click="readHistory(u)">
                  查看引用版本
                </Button>
                <Button
                  v-if="u.kind !== 'private-trial'"
                  :disabled="busy"
                  @click="editingUse = u"
                >
                  {{ u.outcome ? '修改使用反馈' : '填写使用反馈' }}
                </Button>
              </div>
            </div>
            <ExperienceFeedbackForm
              v-if="editingUse === u"
              :busy="busy"
              :outcome="u.outcome"
              :note="u.note"
              @submit="(outcome, note) => sendFeedback(u, outcome, note)"
            />
          </div>
          <Empty
            v-if="!myUses.length && !errorMessage"
            description="你试用或引用经验后，会显示在这里。"
          />
        </template>
        <template v-else>
          <div v-for="(u, index) in uses" :key="index" class="usage-row">
            <div>
              <strong>{{ u.title }}</strong>
              <p>{{ origins[u.kind] }} · v{{ u.version }} · {{ u.at }}</p>
            </div>
            <Button type="link" :disabled="busy" @click="readHistory(u)">
              查看引用版本
            </Button>
          </div>
          <Empty
            v-if="!uses.length && !errorMessage"
            description="你的经验被引用后，可在这里查看版本和时间。"
          />
        </template>
      </Card>
      <div v-else class="columns">
        <Card
          :title="
            ownerSearch
              ? `${owner?.name}的已发布经验`
              : question
                ? '按问题匹配的经验'
                : labels[view]
          "
        >
          <small v-if="rows.length === 200">显示前 200 条，可通过搜索缩小范围。</small>
          <button
            v-for="item in rows"
            :key="item.id"
            type="button"
            class="entry"
            :disabled="busy"
            :aria-pressed="selected === item.id"
            @click="
              resetDetail();
              selected = item.id;
            "
          >
            <small>{{ item.ownerName }} · {{ statuses[item.status] }} · v{{
                item.version
              }}</small><strong>{{ item.title }}</strong>
          </button>
          <Empty
            v-if="!rows.length && !errorMessage"
            :description="emptyMessage"
          >
            <Button
              v-if="canRecordAnswer"
              :disabled="busy"
              @click="editor = { kind: 'manual', question: applied }"
            >
              补充我处理这个问题的经验
            </Button>
          </Empty>
        </Card>
        <Card v-if="current" :title="current.title">
          <div class="actions">
            <Tag>{{ statuses[current.status] }}</Tag><Tag>{{ scopeLabels[current.scope] }}</Tag><small>{{ current.ownerName }} · v{{ current.version }}</small>
            <small
              v-if="
                view === 'mine' &&
                current.publishedVersion &&
                current.publishedVersion !== current.version
              "
              >同事当前可引用 v{{ current.publishedVersion }}</small>
          </div>
          <dl>
            <dt>适用场景</dt>
            <dd>{{ current.scenario }}</dd>
            <dt>具体做法</dt>
            <dd>{{ current.method }}</dd>
            <template v-if="current.exception">
              <dt>例外情况</dt>
              <dd>{{ current.exception }}</dd>
            </template>
            <dt>来源说明</dt>
            <dd>{{ current.source }}</dd>
            <template v-if="current.reviewNote">
              <dt>审核意见</dt>
              <dd>{{ current.reviewNote }}</dd>
            </template>
          </dl>
          <div
            v-if="view === 'mine' && profile?.id === current.ownerId"
            class="actions row"
          >
            <Button
              v-if="current.status !== 'pending'"
              :disabled="busy"
              @click="openEditor('edit', current)"
            >
              编辑经验
            </Button>
            <template
              v-if="
                current.status === 'personal' || current.status === 'returned'
              "
            >
              <Select
                v-model:value="scope"
                aria-label="共享范围"
                :options="[
                  { label: '本部门', value: 'department' },
                  { label: '全公司', value: 'company' },
                ]"
              />
              <Button type="primary" :disabled="busy" @click="share(current)">
                {{
                  current.publishedVersion ? '再次提交共享审核' : '提交共享审核'
                }}
              </Button>
            </template>
            <Button
              v-if="current.status === 'published' || current.publishedVersion"
              :disabled="busy"
              @click="confirmWithdraw = true"
            >
              撤回共享
            </Button>
          </div>
          <template v-if="view === 'review'">
            <label>审核意见（退回时必填）<Input.TextArea
                v-model:value="note"
                :maxlength="1000"
            /></label>
            <div class="actions row">
              <Button :disabled="busy" @click="review(current, false)">
                退回修改
</Button><Button
                type="primary"
                :disabled="busy"
                @click="review(current, true)"
              >
                通过并发布
              </Button>
            </div>
          </template>
          <Button v-else :disabled="busy || !!trial" @click="useEntry(current)">
            {{ view === 'mine' ? '本人试用' : '引用此经验试用' }}
          </Button>
          <div v-if="trial" class="trial">
            <strong>按此经验处理</strong>
            <p>{{ trial.method }}</p>
            <p v-if="trial.exception">例外情况 {{ trial.exception }}</p>
            <small>引用《{{ trial.title }}》 · v{{ trial.version }}</small>
            <ExperienceFeedbackForm
              v-if="trialUse"
              :busy="busy"
              :outcome="trialUse.outcome"
              :note="trialUse.note"
              @submit="
                (outcome, note) =>
                  trialUse && sendFeedback(trialUse, outcome, note)
              "
            />
          </div>
        </Card>
      </div>
    </div>
    <ExperienceEditor
      v-if="editor"
      :kind="editor.kind"
      :item="editor.item"
      :question="editor.question"
      :busy="busy"
      :error="errorMessage"
      @close="
        editor = null;
        errorMessage = '';
      "
      @save="save"
    />
    <Modal
      :open="!!history"
      :title="history ? `${history.title} · v${history.version}` : ''"
      :footer="null"
      @cancel="history = null"
    >
      <dl v-if="history">
        <dt>适用场景</dt>
        <dd>{{ history.scenario }}</dd>
        <dt>具体做法</dt>
        <dd>{{ history.method }}</dd>
        <dt v-if="history.exception">例外情况</dt>
        <dd v-if="history.exception">{{ history.exception }}</dd>
        <dt>来源</dt>
        <dd>{{ history.source }}</dd>
      </dl>
      <template v-if="authorFeedback && history">
        <p>
          {{ authorFeedback.readerName }} ·
          {{ outcomeLabels[authorFeedback.outcome] }}
          {{ authorFeedback.note }}
        </p>
        <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
        <Button type="primary" :disabled="busy" @click="editLatest(history.id)">
          编辑当前工作副本
        </Button>
      </template>
    </Modal>
    <Modal
      v-model:open="confirmWithdraw"
      title="撤回这条共享经验？"
      ok-text="确认撤回"
      cancel-text="取消"
      :confirm-loading="busy"
      @ok="current && withdraw(current)"
    >
      <p>撤回后同事将无法再查阅和引用已发布版本，个人经验会保留。</p>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    </Modal>
  </Page>
</template>
<style scoped>
.library {
  display: grid;
  gap: 14px;
}

.actions,
.toolbar,
.usage-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.toolbar,
.usage-row {
  justify-content: space-between;
}

.search .ant-input-affix-wrapper {
  max-width: 360px;
}

.columns {
  display: grid;
  grid-template-columns: minmax(200px, 0.8fr) minmax(0, 1.6fr);
  gap: 16px;
  align-items: start;
}

.columns > .ant-card {
  min-width: 0;
}

.entry {
  display: block;
  width: 100%;
  padding: 10px;
  margin: 0 0 6px;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
}

.entry[aria-pressed='true'] {
  background: hsl(var(--accent));
  border-color: hsl(var(--border));
}

.entry small,
.entry strong {
  display: block;
}

.entry strong {
  overflow-wrap: anywhere;
}

.library small,
.library dt,
.usage-row p {
  color: hsl(var(--muted-foreground));
}

dl {
  display: grid;
  grid-template-columns: 75px minmax(0, 1fr);
  gap: 12px;
  margin: 18px 0;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.row {
  margin: 10px 0;
}

.trial {
  padding: 12px;
  margin-top: 12px;
  background: hsl(var(--accent));
  border-radius: 7px;
}

.trial p {
  white-space: pre-wrap;
}

.usage-row {
  padding: 10px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.loading {
  padding: 20px;
}

.actions .ant-select {
  min-width: 100px;
}

@media (max-width: 760px) {
  .columns {
    grid-template-columns: 1fr;
  }

  .search .ant-input-affix-wrapper {
    max-width: 100%;
  }
}
</style>
