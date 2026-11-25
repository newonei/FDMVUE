<script setup lang="ts">
import type {
  Customer,
  CustomerFollowUp,
  CustomerFollowUpDetails,
  CustomerFollowUpMethod,
  CustomerFollowUpOutcome,
  CustomerFollowUpTopic,
} from '#/api/fdmplatform/customers';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import { useDebounceFn } from '@vueuse/core';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  message,
  Pagination,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  addCustomerFollowUp,
  getCustomerActivity,
  getCustomerFollowUps,
} from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import { documentLabel } from '../../document-label';
import { activityLabel, activityName } from '../../products/activity-model';

const props = defineProps<{ active: boolean; customer: Customer }>();
const emit = defineEmits<{ count: [total: number] }>();
const user = useUserStore();

const methodLabels: Record<CustomerFollowUpMethod, string> = {
  ALIBABA: '阿里国际站',
  EMAIL: '邮件',
  EXHIBITION: '展会',
  OTHER: '其他',
  PHONE: '电话',
  VIDEO: '视频会议',
  VISIT: '拜访',
  WANGWANG: '旺旺',
  WECHAT: '微信',
  WHATSAPP: 'WhatsApp',
};
const domesticMethods: CustomerFollowUpMethod[] = [
  'WECHAT',
  'PHONE',
  'WANGWANG',
  'EMAIL',
  'VISIT',
  'OTHER',
];
const foreignMethods: CustomerFollowUpMethod[] = [
  'EMAIL',
  'WHATSAPP',
  'ALIBABA',
  'PHONE',
  'VIDEO',
  'EXHIBITION',
  'VISIT',
  'OTHER',
];
const outcomeLabels: Record<CustomerFollowUpOutcome, string> = {
  NO_CONTACT: '未联系上',
  WAITING_US: '待我方处理',
  WAITING_CUSTOMER: '待客户回复',
  AGREED: '已达成共识',
  PAUSED: '暂不推进',
};
const topicLabels: Record<CustomerFollowUpTopic, string> = {
  REQUIREMENTS: '需求确认',
  QUOTATION: '报价商谈',
  SAMPLE: '打样 / 寄样',
  ORDER: '合同 / 订单',
  DELIVERY: '交付 / 售后',
  PAYMENT: '回款',
  OTHER: '其他',
};

const foreign = computed(() => props.customer.salesChannel !== 'DOMESTIC');
const author = computed(
  () => user.userInfo?.nickname || user.userInfo?.realName || '当前登录人',
);
const methodOptions = computed(() =>
  (foreign.value ? foreignMethods : domesticMethods).map((value) => ({
    label: methodLabels[value],
    value,
  })),
);
const outcomeOptions = Object.entries(outcomeLabels).map(([value, label]) => ({
  label,
  value,
}));
const topicOptions = Object.entries(topicLabels).map(([value, label]) => ({
  label,
  value,
}));

type Draft = Partial<CustomerFollowUpDetails>;
type DocumentOption = { label: string; value: string };

const pageSize = 20;
const records = ref<CustomerFollowUp[]>([]);
const latest = ref<CustomerFollowUp>();
const page = ref(1);
const total = ref(0);
const loaded = ref(false);
const loading = ref(false);
const listError = ref('');
const formOpen = ref(false);
const draft = ref<Draft>({});
const saving = ref(false);
const saveError = ref('');
const documents = ref<DocumentOption[]>([]);
const selectedDocument = ref<DocumentOption>();
const documentsLoading = ref(false);
const documentsError = ref('');
const lastDocumentQuery = ref<string>();
const documentOptions = computed(() => {
  const selected = selectedDocument.value;
  return selected &&
    !documents.value.some(({ value }) => value === selected.value)
    ? [selected, ...documents.value]
    : documents.value;
});
let destroyed = false;
let listSequence = 0;
let documentsSequence = 0;
let requestedPage = 1;
let lastSubmission: undefined | { key: string; payload: string };

watch(
  () => props.active,
  (active) => {
    if (active && !loaded.value && !loading.value) void loadPage(1);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  destroyed = true;
});

async function loadPage(target: number) {
  requestedPage = target;
  const run = ++listSequence;
  loading.value = true;
  listError.value = '';
  try {
    const result = await getCustomerFollowUps(props.customer.id, {
      pageNo: target,
      pageSize,
    });
    if (destroyed || run !== listSequence) return;
    records.value = result.list;
    if (target === 1) latest.value = result.list[0];
    total.value = result.total;
    page.value = target;
    loaded.value = true;
    emit('count', result.total);
  } catch (error) {
    if (!destroyed && run === listSequence) listError.value = errorText(error);
  } finally {
    if (!destroyed && run === listSequence) loading.value = false;
  }
}

function refresh() {
  void loadPage(1);
}
defineExpose({ refresh });

function chinaDateTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function openForm() {
  draft.value = {
    contactName: props.customer.contactName || '',
    occurredAt: chinaDateTime().slice(0, 16).replace(' ', 'T'),
  };
  saveError.value = '';
  lastSubmission = undefined;
  documents.value = [];
  selectedDocument.value = undefined;
  lastDocumentQuery.value = undefined;
  documentsError.value = '';
  formOpen.value = true;
}

function closeForm() {
  if (saving.value) return;
  documentsSequence++;
  documentsLoading.value = false;
  formOpen.value = false;
}

const searchDocuments = useDebounceFn(async (keyword: string, run: number) => {
  if (destroyed || run !== documentsSequence) return;
  try {
    const result = await getCustomerActivity(props.customer.id, {
      keyword: keyword || undefined,
      pageNo: 1,
      pageSize: 20,
      type: 'ALL',
    });
    if (destroyed || run !== documentsSequence) return;
    documents.value = result.list.map((row) => ({
      label: `${activityLabel(row.type)} · ${activityName(row)}`,
      value: row.id,
    }));
  } catch (error) {
    if (!destroyed && run === documentsSequence) {
      documentsError.value = errorText(error);
      lastDocumentQuery.value = undefined;
    }
  } finally {
    if (!destroyed && run === documentsSequence) documentsLoading.value = false;
  }
}, 250);

function queueDocumentSearch(search: string) {
  const keyword = search.trim();
  if (keyword === lastDocumentQuery.value) return;
  lastDocumentQuery.value = keyword;
  documents.value = [];
  documentsError.value = '';
  documentsLoading.value = true;
  void searchDocuments(keyword, ++documentsSequence);
}

function openDocumentPicker(open: boolean) {
  if (open) queueDocumentSearch('');
}

function documentChanged(value: unknown) {
  selectedDocument.value = documentOptions.value.find(
    (option) => option.value === value,
  );
}

async function save() {
  if (saving.value) return;
  const { communicationMethod, occurredAt, outcome } = draft.value;
  const summary = draft.value.summary?.trim();
  const nextAction = draft.value.nextAction?.trim();
  const nextDate = draft.value.nextDate || undefined;
  saveError.value = '';
  if (!communicationMethod || !occurredAt || !outcome || !summary) {
    saveError.value = '请填写跟进时间、沟通方式、本次结果和沟通摘要。';
    return;
  }
  const wallTime = occurredAt.replace('T', ' ');
  const normalizedTime = wallTime.length === 16 ? `${wallTime}:00` : wallTime;
  if (normalizedTime > chinaDateTime()) {
    saveError.value = '跟进时间不能晚于现在。';
    return;
  }
  if (nextDate && (!nextAction || nextDate < occurredAt.slice(0, 10))) {
    saveError.value = nextAction
      ? '计划日期不能早于跟进日期。'
      : '选择计划日期后，请填写跟进动作。';
    return;
  }

  const payload: CustomerFollowUpDetails = {
    communicationMethod,
    contactName: draft.value.contactName?.trim() || undefined,
    expectedQuantity: draft.value.expectedQuantity?.trim() || undefined,
    nextAction: nextAction || undefined,
    nextDate,
    occurredAt: normalizedTime,
    outcome,
    productSpec: draft.value.productSpec?.trim() || undefined,
    relatedDocumentId: draft.value.relatedDocumentId,
    summary,
    targetPrice: foreign.value
      ? draft.value.targetPrice?.trim() || undefined
      : undefined,
    topic: draft.value.topic,
    tradeTerms: foreign.value
      ? draft.value.tradeTerms?.trim() || undefined
      : undefined,
  };
  const fingerprint = JSON.stringify(payload);
  if (lastSubmission?.payload !== fingerprint) {
    lastSubmission = { key: newIdempotencyKey(), payload: fingerprint };
  }
  saving.value = true;
  try {
    await addCustomerFollowUp(props.customer.id, {
      ...payload,
      idempotencyKey: lastSubmission.key,
    });
    if (destroyed) return;
    saving.value = false;
    closeForm();
    message.success('跟进记录已保存');
    refresh();
  } catch (error) {
    if (!destroyed) saveError.value = errorText(error);
  } finally {
    if (!destroyed) saving.value = false;
  }
}

function displayTime(value: string) {
  return value.slice(0, 16).replace('T', ' ');
}

function businessDetails(record: CustomerFollowUp) {
  return [
    record.topic && topicLabels[record.topic],
    record.relatedDocumentId &&
      documentLabel({ name: record.relatedDocumentNo }, '已关联单据'),
    record.productSpec,
    record.expectedQuantity,
    record.tradeTerms,
    record.targetPrice,
  ]
    .filter(Boolean)
    .join(' · ');
}
</script>

<template>
  <section class="follow-up-panel" aria-label="跟进记录">
    <div class="follow-up-toolbar">
      <span class="muted">
        {{ latest ? `最近跟进 ${displayTime(latest.occurredAt)}` : '' }}
      </span>
      <Button v-if="!formOpen" type="primary" @click="openForm">
        新增跟进
      </Button>
    </div>

    <Form
      v-if="formOpen"
      :model="draft"
      :disabled="saving"
      layout="vertical"
      class="follow-up-form"
      @finish="save"
    >
      <div class="form-title">
        <h3>新增跟进</h3>
        <span class="muted">记录人 {{ author }}</span>
      </div>
      <div class="form-grid">
        <Form.Item
          label="跟进时间（北京时间）"
          name="occurredAt"
          :rules="[{ required: true, message: '请选择跟进时间' }]"
        >
          <Input v-model:value="draft.occurredAt" type="datetime-local" />
        </Form.Item>
        <Form.Item label="联系人" name="contactName">
          <Input
            v-model:value="draft.contactName"
            :maxlength="100"
            placeholder="填写本次沟通对象"
          />
        </Form.Item>
        <Form.Item
          label="沟通方式"
          name="communicationMethod"
          :rules="[{ required: true, message: '请选择沟通方式' }]"
        >
          <Select
            v-model:value="draft.communicationMethod"
            :options="methodOptions"
            placeholder="请选择"
          />
        </Form.Item>
        <Form.Item
          label="本次结果"
          name="outcome"
          :rules="[{ required: true, message: '请选择本次结果' }]"
        >
          <Select
            v-model:value="draft.outcome"
            :options="outcomeOptions"
            placeholder="请选择"
          />
        </Form.Item>
      </div>
      <Form.Item
        label="沟通摘要"
        name="summary"
        :rules="[
          { required: true, whitespace: true, message: '请填写沟通摘要' },
        ]"
        extra="写清客户需求、顾虑或已确认的事实。"
      >
        <Input.TextArea
          v-model:value="draft.summary"
          :maxlength="1000"
          :rows="3"
        />
      </Form.Item>
      <div class="optional-heading">下一步 <span class="muted">选填</span></div>
      <div class="form-grid plan-fields">
        <Form.Item label="跟进动作" name="nextAction">
          <Input v-model:value="draft.nextAction" :maxlength="200" />
        </Form.Item>
        <Form.Item label="计划日期" name="nextDate">
          <Input
            v-model:value="draft.nextDate"
            :min="draft.occurredAt?.slice(0, 10)"
            type="date"
          />
        </Form.Item>
      </div>
      <details class="extra-fields">
        <summary>补充业务信息 <span class="muted">选填</span></summary>
        <div class="form-grid extra-grid">
          <Form.Item label="沟通主题" name="topic">
            <Select
              v-model:value="draft.topic"
              :options="topicOptions"
              placeholder="请选择"
              allow-clear
            />
          </Form.Item>
          <Form.Item label="关联单据" name="relatedDocumentId">
            <Select
              v-model:value="draft.relatedDocumentId"
              :filter-option="false"
              :loading="documentsLoading"
              :options="documentOptions"
              option-label-prop="label"
              placeholder="搜索单据主题或内部单号"
              allow-clear
              show-search
              @change="documentChanged"
              @dropdown-visible-change="openDocumentPicker"
              @search="queueDocumentSearch"
            >
              <template #notFoundContent>
                {{
                  documentsLoading
                    ? '查询中…'
                    : documentsError || '没有匹配的单据'
                }}
              </template>
            </Select>
          </Form.Item>
          <Form.Item label="产品 / 规格" name="productSpec">
            <Input
              v-model:value="draft.productSpec"
              :maxlength="100"
              placeholder="如 6 mm 防滑瑜伽垫"
            />
          </Form.Item>
          <Form.Item label="预计数量" name="expectedQuantity">
            <Input
              v-model:value="draft.expectedQuantity"
              :maxlength="60"
              placeholder="如 300 张"
            />
          </Form.Item>
          <template v-if="foreign">
            <Form.Item label="贸易条款 / 目的地" name="tradeTerms">
              <Input
                v-model:value="draft.tradeTerms"
                :maxlength="100"
                placeholder="如 FOB Ningbo"
              />
            </Form.Item>
            <Form.Item label="目标价 / 币种" name="targetPrice">
              <Input
                v-model:value="draft.targetPrice"
                :maxlength="100"
                placeholder="如 USD 8 / 件"
              />
            </Form.Item>
          </template>
        </div>
      </details>
      <Alert
        v-if="saveError"
        :message="saveError"
        type="error"
        show-icon
        class="form-alert"
      />
      <div class="form-actions">
        <Button @click="closeForm">取消</Button>
        <Button :loading="saving" type="primary" html-type="submit">
          保存跟进
        </Button>
      </div>
    </Form>

    <div v-if="latest" class="next-plan">
      <span>最近记录的下一步</span>
      <strong>{{ latest.nextAction || '未安排' }}</strong>
      <time v-if="latest.nextDate" :datetime="latest.nextDate">{{
        latest.nextDate
      }}</time>
    </div>
    <Alert
      v-if="listError"
      :message="listError"
      type="error"
      show-icon
      class="history-alert"
    >
      <template #action>
        <Button size="small" type="text" @click="loadPage(requestedPage)">
          重试
        </Button>
      </template>
    </Alert>
    <Spin :spinning="loading">
      <Empty
        v-if="loaded && !records.length"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="暂无跟进记录"
      />
      <ol v-else class="follow-up-history" aria-label="跟进历史">
        <li v-for="record in records" :key="record.id" class="history-record">
          <div class="record-heading">
            <strong>{{ methodLabels[record.communicationMethod] }}</strong>
            <Tag :color="record.outcome === 'AGREED' ? 'green' : 'blue'">
              {{ outcomeLabels[record.outcome] }}
            </Tag>
            <time class="muted" :datetime="record.occurredAt.replace(' ', 'T')">
              {{ displayTime(record.occurredAt) }}
            </time>
          </div>
          <div class="muted">
            记录人 {{ record.authorName || '—' }}
            <template v-if="record.contactName">
              · 联系人 {{ record.contactName }}
            </template>
          </div>
          <p class="record-summary">{{ record.summary }}</p>
          <p v-if="businessDetails(record)" class="muted">
            {{ businessDetails(record) }}
          </p>
          <p v-if="record.nextAction" class="record-plan">
            下一步 · {{ record.nextAction }}
            <template v-if="record.nextDate">
              · {{ record.nextDate }}
            </template>
          </p>
        </li>
      </ol>
    </Spin>
    <Pagination
      v-if="total > pageSize"
      :current="page"
      :page-size="pageSize"
      :show-size-changer="false"
      :total="total"
      size="small"
      class="follow-up-pagination"
      @change="loadPage"
    />
  </section>
</template>

<style scoped>
.follow-up-panel {
  min-width: 0;
  container-type: inline-size;
}

.follow-up-toolbar,
.form-title,
.form-actions,
.record-heading,
.next-plan {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
}

.follow-up-toolbar,
.form-title {
  justify-content: space-between;
}

.form-title h3,
.optional-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.follow-up-form {
  padding: 12px;
  margin-top: 12px;
  background: hsl(var(--muted) / 55%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.form-title {
  margin-bottom: 12px;
}

.follow-up-form :deep(.ant-form-item) {
  min-width: 0;
  margin-bottom: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 12px;
}

.plan-fields {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

.extra-fields {
  padding: 7px 0;
  border-block: 1px solid hsl(var(--border));
}

.extra-fields summary {
  cursor: pointer;
}

.extra-grid {
  margin-top: 10px;
}

.form-actions,
.follow-up-pagination {
  justify-content: flex-end;
  margin-top: 12px;
}

.next-plan,
.form-alert,
.history-alert {
  margin-top: 12px;
}

.next-plan {
  padding: 10px 12px;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
  background: hsl(var(--primary) / 9%);
  border-radius: 6px;
}

.next-plan span,
.next-plan time,
.record-plan {
  font-size: 12px;
}

.next-plan time,
.record-heading time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.follow-up-history {
  min-height: 24px;
  padding: 6px 0 0 4px;
  margin: 6px 0 0;
  list-style: none;
}

.history-record {
  position: relative;
  padding: 10px 0 10px 14px;
  overflow-wrap: anywhere;
  border-left: 1px solid hsl(var(--border));
}

.history-record::before {
  position: absolute;
  top: 19px;
  left: -4px;
  width: 7px;
  height: 7px;
  content: '';
  background: hsl(var(--primary));
  border-radius: 50%;
}

.history-record p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}

.record-heading {
  margin-bottom: 4px;
}

.follow-up-pagination {
  display: flex;
  flex-wrap: wrap;
}

@container (max-width: 520px) {
  .form-grid,
  .plan-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
