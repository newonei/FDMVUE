<script setup lang="ts">
import type {
  DocumentApprovalTarget,
  DocumentApprovalView,
} from '#/api/fdmplatform/document-approval';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Input, message, Tag } from 'ant-design-vue';

import {
  approveDocument,
  getDocumentApproval,
  rejectDocument,
} from '#/api/fdmplatform/document-approval';

import { errorText } from '../data';
import {
  NODE_STATE_COLORS,
  NODE_STATE_LABELS,
  nodeModeLabel,
  overallLabel,
  progressText,
  recordLabel,
  remarkProblem,
  timeText,
  USER_STATE_LABELS,
  waitedText,
} from './document-approval';

const props = defineProps<{ target?: DocumentApprovalTarget }>();
const emit = defineEmits<{ changed: [] }>();

const view = ref<DocumentApprovalView | null>(null);
const loading = ref(false);
const acting = ref<'' | 'agree' | 'refuse'>('');
const error = ref('');
const remark = ref('');
const showRecords = ref(false);
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 60_000);
onBeforeUnmount(() => clearInterval(timer));
let sequence = 0;

const targetKey = computed(() =>
  props.target
    ? `${props.target.docType}|${props.target.contractId ?? ''}|${props.target.id}`
    : '',
);

async function load() {
  const run = ++sequence;
  error.value = '';
  if (!props.target) {
    view.value = null;
    return;
  }
  loading.value = true;
  try {
    const value = await getDocumentApproval(props.target);
    if (run === sequence) view.value = value ?? null;
  } catch (error_) {
    if (run === sequence) error.value = errorText(error_);
  } finally {
    if (run === sequence) loading.value = false;
  }
}

watch(
  targetKey,
  () => {
    view.value = null;
    remark.value = '';
    showRecords.value = false;
    void load();
  },
  { immediate: true },
);

async function act(agree: boolean) {
  if (!props.target || acting.value) return;
  const problem = remarkProblem(agree, remark.value);
  if (problem) {
    error.value = problem;
    return;
  }
  acting.value = agree ? 'agree' : 'refuse';
  error.value = '';
  try {
    const body = { ...props.target, remark: remark.value.trim() };
    view.value = await (agree ? approveDocument(body) : rejectDocument(body));
    remark.value = '';
    message.success(agree ? '已同意' : '已拒绝');
    emit('changed');
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    acting.value = '';
  }
}

defineExpose({ reload: load });
</script>

<template>
  <section
    v-if="view || (loading && target) || error"
    class="approval-panel"
    aria-label="审批流程"
  >
    <header class="approval-head">
      <strong>审批流程</strong>
      <span v-if="view" class="approval-overall">
        {{ overallLabel(view) }} · {{ progressText(view) }}
      </span>
      <Button size="small" type="link" :loading="loading" @click="load">
        刷新
      </Button>
    </header>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <template v-if="view">
      <Alert
        v-if="view.lastError"
        type="warning"
        show-icon
        :message="`钉钉返回：${view.lastError}`"
      />
      <Alert
        v-if="view.progressError"
        type="warning"
        show-icon
        :message="view.progressError"
      />
      <ol class="approval-steps">
        <li class="approval-step done">
          <div class="approval-step-title">
            <span>发起审批</span>
            <span class="approval-muted">{{ timeText(view.createTime) }}</span>
          </div>
          <div class="approval-user">{{ view.originator.name }}</div>
        </li>
        <li
          v-for="node in view.nodes"
          :key="node.index"
          class="approval-step"
          :class="node.state.toLowerCase()"
        >
          <div class="approval-step-title">
            <span>
              节点{{ node.index }}
              <Tag v-if="nodeModeLabel(node)" class="approval-mode">
                {{ nodeModeLabel(node) }}
              </Tag>
            </span>
            <Tag :color="NODE_STATE_COLORS[node.state]">
              {{ NODE_STATE_LABELS[node.state] }}
            </Tag>
          </div>
          <div
            v-for="user in node.users"
            :key="user.userId"
            class="approval-user"
          >
            <div class="approval-user-line">
              <span>{{ user.name }}</span>
              <span class="approval-muted">
                {{
                  user.state === 'RUNNING'
                    ? waitedText(user.createTime, now)
                    : user.finishTime
                      ? `${USER_STATE_LABELS[user.state]} ${timeText(user.finishTime)}`
                      : USER_STATE_LABELS[user.state]
                }}
              </span>
            </div>
            <div v-if="user.remark" class="approval-remark">
              {{ user.remark }}
            </div>
          </div>
        </li>
      </ol>
      <div v-if="view.canAction" class="approval-actions">
        <Input.TextArea
          v-model:value="remark"
          :rows="2"
          :maxlength="1024"
          placeholder="审批意见（拒绝时必填）"
          :disabled="!!acting"
        />
        <div class="approval-buttons">
          <Button
            type="primary"
            :loading="acting === 'agree'"
            :disabled="!!acting"
            @click="act(true)"
          >
            同意
          </Button>
          <Button
            danger
            :loading="acting === 'refuse'"
            :disabled="!!acting"
            @click="act(false)"
          >
            拒绝
          </Button>
        </div>
        <span class="approval-muted">审批结果同步到钉钉，钉钉里也会显示已处理。</span>
      </div>
      <div v-if="view.records.length" class="approval-records">
        <Button size="small" type="link" @click="showRecords = !showRecords">
          {{
            showRecords ? '收起审批记录' : `审批记录（${view.records.length}）`
          }}
        </Button>
        <ul v-if="showRecords">
          <li v-for="(record, index) in view.records" :key="index">
            <span class="approval-muted">{{ timeText(record.date) }}</span>
            {{ record.name || '未知用户' }}
            {{ recordLabel(record.type, record.result) }}
            <span v-if="record.remark">：{{ record.remark }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.approval-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.approval-head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.approval-head strong {
  flex: 1;
}

.approval-overall,
.approval-muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.approval-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.approval-step {
  position: relative;
  padding-left: 16px;
  border-left: 2px solid hsl(var(--border));
}

.approval-step.agree,
.approval-step.done {
  border-left-color: hsl(var(--success, 142 71% 45%));
}

.approval-step.running {
  border-left-color: hsl(var(--warning, 38 92% 50%));
}

.approval-step.refuse {
  border-left-color: hsl(var(--destructive));
}

.approval-step-title,
.approval-user-line {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.approval-step-title {
  margin-bottom: 4px;
  font-weight: 500;
}

.approval-mode {
  margin-left: 4px;
}

.approval-user {
  font-size: 13px;
}

.approval-remark {
  padding: 4px 8px;
  margin-top: 2px;
  font-size: 12px;
  overflow-wrap: anywhere;
  background: hsl(var(--muted));
  border-radius: 4px;
}

.approval-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.approval-buttons {
  display: flex;
  gap: 8px;
}

.approval-records ul {
  padding-left: 16px;
  margin: 4px 0 0;
  font-size: 12px;
}
</style>
