<script lang="ts" setup>
import type { DingTalkApprovalApi } from '#/api/fdmdingtalk/approval';

import { computed } from 'vue';

import {
  Alert,
  Collapse,
  Descriptions,
  Empty,
  Tag,
  Typography,
} from 'ant-design-vue';

defineOptions({ name: 'BusinessDocumentView' });

const props = withDefaults(
  defineProps<{
    depth?: number;
    document?: DingTalkApprovalApi.BusinessDocument;
    fieldNames?: Record<string, string>;
    root?: boolean;
    value?: DingTalkApprovalApi.JsonValue;
  }>(),
  {
    depth: 0,
    document: undefined,
    fieldNames: () => ({}),
    root: false,
    value: undefined,
  },
);

const MAX_DEPTH = 6;
const MAX_ITEMS_PER_LEVEL = 200;

type JsonObject = Record<string, DingTalkApprovalApi.JsonValue>;

const isDocumentRoot = computed(() => props.root);
const currentValue = computed(() => props.value);
const isArrayValue = computed(() => Array.isArray(currentValue.value));
const isObjectValue = computed(
  () =>
    currentValue.value !== null &&
    typeof currentValue.value === 'object' &&
    !Array.isArray(currentValue.value),
);
const isPrimitiveValue = computed(
  () => !isArrayValue.value && !isObjectValue.value,
);
const arrayItems = computed(() => {
  if (!Array.isArray(currentValue.value)) return [];
  return currentValue.value.slice(0, MAX_ITEMS_PER_LEVEL);
});
const objectEntries = computed(() => {
  if (!isObjectValue.value) return [];
  return Object.entries(currentValue.value as JsonObject).slice(
    0,
    MAX_ITEMS_PER_LEVEL,
  );
});
const collectionSize = computed(() => {
  if (Array.isArray(currentValue.value)) return currentValue.value.length;
  if (isObjectValue.value) {
    return Object.keys(currentValue.value as JsonObject).length;
  }
  return 0;
});
const collectionTruncated = computed(
  () => collectionSize.value > MAX_ITEMS_PER_LEVEL,
);
const depthLimited = computed(
  () => props.depth >= MAX_DEPTH && (isArrayValue.value || isObjectValue.value),
);
const documentRecordAvailable = computed(
  () =>
    props.document?.status === 'AVAILABLE' &&
    props.document.record !== undefined &&
    props.document.record !== null,
);

function fieldLabel(key: string) {
  const label = props.fieldNames[key]?.trim();
  return label && label !== key ? `${label}（${key}）` : key;
}

function primitiveText(value: DingTalkApprovalApi.JsonValue | undefined) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function safeJson(value: DingTalkApprovalApi.JsonValue | undefined) {
  if (value === undefined || value === null) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusMeta(status?: DingTalkApprovalApi.BusinessDocument['status']) {
  const metadata = {
    AVAILABLE: { color: 'success', label: '已读取' },
    NOT_FOUND: { color: 'warning', label: '未找到单据' },
    NO_MAPPING: { color: 'default', label: '未建立映射' },
    UNAVAILABLE: { color: 'error', label: '暂时不可用' },
  } as const;
  return status ? metadata[status] : undefined;
}

function unavailableTitle(
  status?: DingTalkApprovalApi.BusinessDocument['status'],
) {
  const titles = {
    NOT_FOUND: '未找到对应的金智业务单据',
    NO_MAPPING: '审批单中未定位到金智原单',
    UNAVAILABLE: '金智业务单据暂时无法读取',
  } as const;
  return status ? titles[status as keyof typeof titles] : undefined;
}
</script>

<template>
  <div v-if="isDocumentRoot" class="business-document">
    <template v-if="document">
      <Descriptions bordered :column="2" size="small">
        <Descriptions.Item label="数据来源"> 金智 CRM </Descriptions.Item>
        <Descriptions.Item label="读取状态">
          <Tag :color="statusMeta(document.status)?.color">
            {{ statusMeta(document.status)?.label || document.status }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item v-if="document.documentName" label="单据类型">
          {{ document.documentName }}
        </Descriptions.Item>
        <Descriptions.Item v-if="document.dataType != null" label="datatype">
          {{ document.dataType }}
        </Descriptions.Item>
        <Descriptions.Item v-if="document.msgId" label="msgid" :span="2">
          <Typography.Text copyable>
            {{ document.msgId }}
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>

      <Alert
        v-if="document.status !== 'AVAILABLE'"
        class="business-document__notice"
        :description="
          document.message ||
          '仍可查看下方钉钉流程快照和审批记录，并继续处理审批。'
        "
        :message="unavailableTitle(document.status) || '金智业务单据不可用'"
        show-icon
        type="warning"
      />

      <template v-else-if="documentRecordAvailable">
        <BusinessDocumentView
          :depth="0"
          :field-names="document.fieldNames"
          :value="document.record"
        />
      </template>
      <Empty
        v-else
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="金智返回的业务单据详情为空"
      />
    </template>

    <Alert
      v-else
      description="仍可查看下方钉钉流程快照和审批记录，并继续处理审批。"
      message="后端未返回金智业务单据详情"
      show-icon
      type="warning"
    />
  </div>

  <Typography.Text v-else-if="isPrimitiveValue" class="primitive-value">
    {{ primitiveText(currentValue) }}
  </Typography.Text>

  <pre v-else-if="depthLimited" class="json-fallback">{{
    safeJson(currentValue)
  }}</pre>

  <div v-else-if="isArrayValue" class="collection-value">
    <Empty
      v-if="arrayItems.length === 0"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      description="空数组"
    />
    <Collapse v-else size="small">
      <Collapse.Panel
        v-for="(item, index) in arrayItems"
        :key="index"
        :header="`第 ${index + 1} 项`"
      >
        <BusinessDocumentView
          :depth="depth + 1"
          :field-names="fieldNames"
          :value="item"
        />
      </Collapse.Panel>
    </Collapse>
    <Alert
      v-if="collectionTruncated"
      class="collection-notice"
      :message="`该层共有 ${collectionSize} 项，为保证页面性能仅展示前 ${MAX_ITEMS_PER_LEVEL} 项`"
      show-icon
      type="warning"
    />
  </div>

  <Descriptions v-else bordered :column="1" size="small">
    <Descriptions.Item
      v-for="([key, item], index) in objectEntries"
      :key="`${key}-${index}`"
      :label="fieldLabel(key)"
    >
      <BusinessDocumentView
        :depth="depth + 1"
        :field-names="fieldNames"
        :value="item"
      />
    </Descriptions.Item>
    <Descriptions.Item v-if="objectEntries.length === 0" label="内容">
      -
    </Descriptions.Item>
    <Descriptions.Item v-if="collectionTruncated" label="展示限制">
      该层共有 {{ collectionSize }} 个字段，为保证页面性能仅展示前
      {{ MAX_ITEMS_PER_LEVEL }} 个
    </Descriptions.Item>
  </Descriptions>
</template>

<style scoped>
.business-document,
.collection-value {
  display: grid;
  gap: 12px;
}

.business-document__notice,
.collection-notice {
  margin-top: 12px;
}

.primitive-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.json-fallback {
  max-height: 360px;
  padding: 10px 12px;
  margin: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: hsl(var(--muted) / 55%);
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}
</style>
