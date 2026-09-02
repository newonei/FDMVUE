<script lang="ts" setup>
import type { FdmWaimaoAttachmentApi } from '#/api/fdmwaimao/attachment';
import type { FdmWaimaoOrderExpenseApi } from '#/api/fdmwaimao/order-expense';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  List,
  ListItem,
  ListItemMeta,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  getContractOrder,
  getContractOrderPage,
} from '#/api/fdmwaimao/contract-order';
import {
  cancelOrderExpenseGeneration,
  getOrderExpenseGenerationJob,
  getOrderExpenseGenerationOptions,
  materializeOrderExpenseGeneration,
  regenerateOrderExpenseGeneration,
  retryOrderExpenseGeneration,
  startOrderExpenseGeneration,
} from '#/api/fdmwaimao/order-expense';
import { getShipment, getShipmentPage } from '#/api/fdmwaimao/shipment';
import FdmWaimaoAttachmentEditor from '#/views/fdmwaimao/components/FdmWaimaoAttachmentEditor.vue';

import {
  clearActiveExpenseGeneration,
  clearExpenseCommand,
  getOrCreateExpenseCommand,
  loadActiveExpenseGeneration,
  saveActiveExpenseGeneration,
} from '../command-store';

defineOptions({ name: 'FdmWaimaoOrderExpenseGenerationModal' });

const props = defineProps<{
  allowContractSource: boolean;
  allowShipmentSource: boolean;
  open: boolean;
}>();
const emit = defineEmits<{
  close: [];
  created: [id: string];
}>();

interface SourceOption {
  companyName?: string;
  id: string;
  label: string;
  version: number;
}

const sourceTypeOptions = computed(() => [
  ...(props.allowContractSource
    ? [{ label: '合同订单', value: 'FDM_WAIMAO_CONTRACT_ORDER' as const }]
    : []),
  ...(props.allowShipmentSource
    ? [{ label: '发货计划', value: 'FDM_WAIMAO_SHIPMENT' as const }]
    : []),
]);
function defaultSourceType(): FdmWaimaoOrderExpenseApi.SourceType {
  return sourceTypeOptions.value[0]?.value ?? 'FDM_WAIMAO_CONTRACT_ORDER';
}
const sourceType =
  ref<FdmWaimaoOrderExpenseApi.SourceType>(defaultSourceType());
const sourceId = ref<string>();
const sourceOptions = ref<SourceOption[]>([]);
const sourceLoading = ref(false);
const optionLoading = ref(false);
const generationOptions = ref<FdmWaimaoOrderExpenseApi.GenerationOptions>();
const selectedModelId = ref<string>();
const instruction = ref('');
const job = ref<FdmWaimaoOrderExpenseApi.GenerationJob>();
const generating = ref(false);
const materializing = ref(false);
const attachments = ref<FdmWaimaoAttachmentApi.Attachment[]>([]);
const attachmentUploading = ref(false);
const attachmentUploadError = ref(false);
const generationError = ref('');
const pollWarning = ref('');
const restoringActive = ref(false);
let sourceRequestVersion = 0;
let optionRequestVersion = 0;
let pollVersion = 0;
let synchronizingRestoredRun = false;

const selectedSource = computed(() =>
  sourceOptions.value.find((item) => item.id === sourceId.value),
);
const modelOptions = computed(() =>
  (generationOptions.value?.models ?? []).map((item) => ({
    label: `${item.name} · ${item.code}`,
    value: item.id,
  })),
);
const proposalLines = computed(() => job.value?.proposal?.lines ?? []);
const blockers = computed(() => generationOptions.value?.blockers ?? []);
const optionWarnings = computed(() => generationOptions.value?.warnings ?? []);
const failedRules = computed(() =>
  (job.value?.rules ?? []).filter(
    (item) => !item.passed && item.severity === 'BLOCKER',
  ),
);
const ready = computed(
  () =>
    job.value?.status === 'READY' &&
    typeof job.value.proposalVersion === 'number' &&
    Boolean(job.value.sourceSnapshotHash),
);
function isRunningStatus(status?: string) {
  return [
    'CONTEXT_BUILDING',
    'CREATED',
    'GENERATING',
    'PARSING',
    'QUEUED',
    'VALIDATING',
  ].includes(status ?? '');
}
const running = computed(() => isRunningStatus(job.value?.status));
const sourceLocked = computed(() => running.value || ready.value);
const startBlockedByJob = computed(
  () =>
    Boolean(job.value) &&
    !['CANCELLED', 'MATERIALIZED'].includes(job.value?.status ?? ''),
);
const progress = computed(() => {
  const status = job.value?.status;
  if (!status) return 0;
  if (status === 'CREATED' || status === 'QUEUED') return 15;
  if (status === 'CONTEXT_BUILDING') return 30;
  if (status === 'GENERATING') return 55;
  if (status === 'PARSING') return 72;
  if (status === 'VALIDATING') return 88;
  return ['MATERIALIZED', 'READY'].includes(status) ? 100 : 100;
});

function sourceTypeLabel(value: FdmWaimaoOrderExpenseApi.SourceType) {
  return value === 'FDM_WAIMAO_SHIPMENT' ? '发货计划' : '合同订单';
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    CANCELLED: '已取消',
    CONTEXT_BUILDING: '读取来源事实',
    CREATED: '已创建',
    EXPIRED: '已过期',
    FAILED: '生成失败',
    GENERATING: '模型识别中',
    MATERIALIZED: '已生成费用草稿',
    PARSING: '解析结果',
    QUEUED: '排队中',
    READY: '建议已就绪',
    RULE_BLOCKED: '规则阻断',
    STALE: '来源已变化',
    VALIDATING: '规则校验中',
  };
  return status ? (labels[status] ?? status) : '未开始';
}

function reset() {
  pollVersion += 1;
  sourceRequestVersion += 1;
  optionRequestVersion += 1;
  sourceType.value = defaultSourceType();
  sourceId.value = undefined;
  sourceOptions.value = [];
  generationOptions.value = undefined;
  selectedModelId.value = undefined;
  instruction.value = '';
  job.value = undefined;
  generationError.value = '';
  pollWarning.value = '';
  generating.value = false;
  materializing.value = false;
  attachments.value = [];
  attachmentUploading.value = false;
  attachmentUploadError.value = false;
}

function applyJob(current: FdmWaimaoOrderExpenseApi.GenerationJob) {
  job.value = current;
  if (['CANCELLED', 'MATERIALIZED'].includes(current.status)) {
    clearActiveExpenseGeneration();
    return;
  }
  const sourceVersion = Number(current.sourceVersion);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 0) return;
  saveActiveExpenseGeneration({
    runId: current.id,
    runVersion: current.version,
    sourceId: current.sourceId,
    sourceType: current.sourceType,
    sourceVersion,
  });
}

async function loadSources(keyword = '') {
  const version = ++sourceRequestVersion;
  sourceLoading.value = true;
  try {
    if (sourceType.value === 'FDM_WAIMAO_SHIPMENT') {
      const result = await getShipmentPage({
        keyword: keyword.trim() || undefined,
        pageNo: 1,
        pageSize: 30,
        status: 'CONFIRMED',
      });
      if (version !== sourceRequestVersion) return;
      sourceOptions.value = (result.list ?? []).map((item) => ({
        companyName: item.companyName ?? undefined,
        id: item.id,
        label: `${item.shipmentNo} · ${item.customerName ?? '未命名客户'}`,
        version: item.version,
      }));
      return;
    }
    const result = await getContractOrderPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 30,
      status: 'CONFIRMED',
    });
    if (version !== sourceRequestVersion) return;
    sourceOptions.value = (result.list ?? []).map((item) => ({
      companyName: item.companyName,
      id: item.id,
      label: `${item.orderNo} · ${item.customerName}`,
      version: item.version,
    }));
  } catch (error) {
    if (version !== sourceRequestVersion) return;
    generationError.value =
      error instanceof Error ? error.message : '无法读取可用来源单据';
  } finally {
    if (version === sourceRequestVersion) sourceLoading.value = false;
  }
}

async function loadGenerationOptions(preserveJob = false) {
  const source = selectedSource.value;
  if (!source) return;
  const version = ++optionRequestVersion;
  const requestedType = sourceType.value;
  const requestedId = source.id;
  optionLoading.value = true;
  generationError.value = '';
  generationOptions.value = undefined;
  if (!preserveJob) {
    selectedModelId.value = undefined;
    job.value = undefined;
    clearActiveExpenseGeneration();
    pollVersion += 1;
  }
  try {
    const result = await getOrderExpenseGenerationOptions({
      expectedSourceVersion: source.version,
      sourceId: source.id,
      sourceType: sourceType.value,
    });
    if (
      version !== optionRequestVersion ||
      sourceType.value !== requestedType ||
      sourceId.value !== requestedId
    ) {
      return;
    }
    generationOptions.value = result;
    return result;
  } catch (error) {
    if (version !== optionRequestVersion) return;
    generationError.value =
      error instanceof Error ? error.message : '无法读取 AI 生成选项';
  } finally {
    if (version === optionRequestVersion) optionLoading.value = false;
  }
}

async function pollJob(id: string, token: number) {
  let consecutiveFailures = 0;
  for (;;) {
    if (token !== pollVersion) return;
    const delay = Math.min(5000, 1200 * 2 ** consecutiveFailures);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (token !== pollVersion || !props.open) return;
    try {
      const current = await getOrderExpenseGenerationJob(id);
      if (token !== pollVersion) return;
      consecutiveFailures = 0;
      pollWarning.value = '';
      restoringActive.value = false;
      applyJob(current);
      if (!isRunningStatus(current.status)) return;
    } catch {
      if (token !== pollVersion || !props.open) return;
      consecutiveFailures = Math.min(consecutiveFailures + 1, 3);
      pollWarning.value = '网络暂时不可用，正在自动恢复任务状态轮询…';
    }
  }
}

async function startGeneration() {
  const source = selectedSource.value;
  if (
    !source ||
    !selectedModelId.value ||
    blockers.value.length > 0 ||
    startBlockedByJob.value ||
    generating.value ||
    restoringActive.value
  ) {
    return;
  }
  generationError.value = '';
  generating.value = true;
  const fingerprint = JSON.stringify({
    instruction: instruction.value.trim(),
    modelId: selectedModelId.value,
    sourceType: sourceType.value,
    sourceId: source.id,
    sourceVersion: source.version,
  });
  const commandIdentity = `generate:${sourceType.value}:${source.id}:${source.version}`;
  try {
    const result = await startOrderExpenseGeneration({
      expectedSourceVersion: source.version,
      idempotencyKey: await getOrCreateExpenseCommand(
        commandIdentity,
        fingerprint,
        'expense-generate',
      ),
      instruction: instruction.value.trim() || undefined,
      modelId: selectedModelId.value,
      sourceId: source.id,
      sourceType: sourceType.value,
    });
    applyJob(result);
    clearExpenseCommand(commandIdentity);
    const token = ++pollVersion;
    if (isRunningStatus(result.status)) void pollJob(result.id, token);
  } catch (error) {
    generationError.value =
      error instanceof Error ? error.message : '费用识别启动失败';
  } finally {
    generating.value = false;
  }
}

async function retryGeneration(regenerate = false) {
  const current = job.value;
  if (!current || generating.value) return;
  generationError.value = '';
  generating.value = true;
  const regenerateIdentity = `regenerate:${current.id}:${current.version}`;
  try {
    const result = regenerate
      ? await regenerateOrderExpenseGeneration({
          expectedVersion: current.version,
          id: current.id,
          idempotencyKey: await getOrCreateExpenseCommand(
            regenerateIdentity,
            `${selectedModelId.value}:${instruction.value.trim()}`,
            'expense-regenerate',
          ),
          instruction: instruction.value.trim() || undefined,
          modelId: selectedModelId.value || current.modelId,
        })
      : await retryOrderExpenseGeneration({
          expectedVersion: current.version,
          id: current.id,
        });
    applyJob(result);
    if (regenerate) clearExpenseCommand(regenerateIdentity);
    const token = ++pollVersion;
    if (isRunningStatus(result.status)) void pollJob(result.id, token);
  } catch (error) {
    generationError.value =
      error instanceof Error ? error.message : '重新生成失败';
  } finally {
    generating.value = false;
  }
}

async function cancelGeneration() {
  const current = job.value;
  if (!current || !running.value) return;
  generating.value = true;
  try {
    pollVersion += 1;
    const result = await cancelOrderExpenseGeneration({
      expectedVersion: current.version,
      id: current.id,
    });
    applyJob(result);
  } finally {
    generating.value = false;
  }
}

async function materialize() {
  const current = job.value;
  if (!current || !ready.value || typeof current.proposalVersion !== 'number') {
    return;
  }
  if (attachmentUploading.value) {
    message.warning('附件仍在上传，请等待上传完成后再生成费用草稿');
    return;
  }
  if (attachmentUploadError.value) {
    message.warning('存在上传失败的附件，请重试或移除后再生成');
    return;
  }
  materializing.value = true;
  generationError.value = '';
  const identity = `materialize:${current.id}:${current.proposalVersion}`;
  try {
    const result = await materializeOrderExpenseGeneration({
      attachmentIds: attachments.value.map((attachment) => attachment.id),
      expectedRunVersion: current.version,
      expectedSourceSnapshotHash: current.sourceSnapshotHash,
      generationRunId: current.id,
      idempotencyKey: await getOrCreateExpenseCommand(
        identity,
        `${current.version}:${current.proposalVersion}:${current.sourceSnapshotHash}:${attachments.value
          .map((attachment) => attachment.id)
          .toSorted()
          .join(',')}`,
        'expense-materialize',
      ),
      proposalVersion: current.proposalVersion,
    });
    clearExpenseCommand(identity);
    clearActiveExpenseGeneration();
    attachments.value = [];
    await nextTick();
    message.success(
      result.executedNow ? '已生成订单费用草稿' : '已打开此前生成的费用草稿',
    );
    emit('created', result.id);
  } catch (error) {
    generationError.value =
      error instanceof Error ? error.message : '费用草稿物化失败';
  } finally {
    materializing.value = false;
  }
}

async function currentSourceOption(
  type: FdmWaimaoOrderExpenseApi.SourceType,
  id: string,
): Promise<SourceOption> {
  if (type === 'FDM_WAIMAO_SHIPMENT') {
    const value = await getShipment(id);
    if (value.status !== 'CONFIRMED') {
      throw new Error('发货计划已不是已确认状态，无法重新生成费用建议');
    }
    return {
      companyName: value.companyName ?? undefined,
      id: value.id,
      label: `${value.shipmentNo} · ${value.customerName ?? '未命名客户'}`,
      version: value.version,
    };
  }
  const value = await getContractOrder(id);
  if (value.status !== 'CONFIRMED') {
    throw new Error('合同订单已不是已确认状态，无法重新生成费用建议');
  }
  return {
    companyName: value.companyName,
    id: value.id,
    label: `${value.orderNo} · ${value.customerName}`,
    version: value.version,
  };
}

async function synchronizeSource(
  type: FdmWaimaoOrderExpenseApi.SourceType,
  source: SourceOption,
) {
  synchronizingRestoredRun = true;
  sourceType.value = type;
  sourceOptions.value = [source];
  sourceId.value = source.id;
  await nextTick();
  synchronizingRestoredRun = false;
}

async function restoreActiveGeneration() {
  const active = loadActiveExpenseGeneration();
  if (!active) return false;
  const sourceAllowed =
    (active.sourceType === 'FDM_WAIMAO_CONTRACT_ORDER' &&
      props.allowContractSource) ||
    (active.sourceType === 'FDM_WAIMAO_SHIPMENT' && props.allowShipmentSource);
  if (!sourceAllowed) {
    clearActiveExpenseGeneration();
    return false;
  }
  restoringActive.value = true;
  await synchronizeSource(active.sourceType, {
    id: active.sourceId,
    label: `${sourceTypeLabel(active.sourceType)} ${active.sourceId}`,
    version: active.sourceVersion,
  });
  try {
    const current = await getOrderExpenseGenerationJob(active.runId);
    if (
      current.sourceType !== active.sourceType ||
      current.sourceId !== active.sourceId
    ) {
      clearActiveExpenseGeneration();
      restoringActive.value = false;
      generationError.value =
        '本地恢复的运行身份与服务端不一致，请重新选择来源';
      return false;
    }
    applyJob(current);
    selectedModelId.value = current.modelId;
    restoringActive.value = false;
    const token = ++pollVersion;
    if (isRunningStatus(current.status)) void pollJob(current.id, token);
  } catch (error) {
    pollWarning.value =
      error instanceof Error
        ? `暂时无法恢复生成任务：${error.message}；系统将自动重试。`
        : '暂时无法恢复生成任务，系统将自动重试。';
    const token = ++pollVersion;
    void pollJob(active.runId, token);
  }
  return true;
}

async function restartStaleGeneration() {
  const current = job.value;
  if (!current || current.status !== 'STALE' || generating.value) return;
  generating.value = true;
  generationError.value = '';
  const preferredModelId = current.modelId;
  try {
    const source = await currentSourceOption(
      current.sourceType,
      current.sourceId,
    );
    clearActiveExpenseGeneration();
    job.value = undefined;
    generationOptions.value = undefined;
    selectedModelId.value = undefined;
    await synchronizeSource(current.sourceType, source);
    const latestOptions = await loadGenerationOptions();
    if (latestOptions?.models.some((item) => item.id === preferredModelId)) {
      selectedModelId.value = preferredModelId;
    }
  } catch (error) {
    generationError.value =
      error instanceof Error ? error.message : '无法读取来源单据的最新版本';
  } finally {
    generating.value = false;
  }
  if (selectedModelId.value && blockers.value.length === 0) {
    await startGeneration();
  }
}

function handleClose() {
  pollVersion += 1;
  emit('close');
}

async function initializeOpen() {
  reset();
  if (await restoreActiveGeneration()) return;
  await loadSources();
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      pollVersion += 1;
      return;
    }
    void initializeOpen();
  },
);

watch(sourceType, () => {
  if (synchronizingRestoredRun) return;
  clearActiveExpenseGeneration();
  sourceId.value = undefined;
  generationOptions.value = undefined;
  selectedModelId.value = undefined;
  job.value = undefined;
  optionRequestVersion += 1;
  pollVersion += 1;
  if (props.open) void loadSources();
});

watch(sourceId, () => {
  if (synchronizingRestoredRun) return;
  clearActiveExpenseGeneration();
  job.value = undefined;
  pollVersion += 1;
  if (sourceId.value) void loadGenerationOptions();
});
</script>

<template>
  <Modal
    :confirm-loading="materializing"
    :mask-closable="false"
    destroy-on-close
    :open="open"
    :ok-button-props="{
      disabled: !ready || attachmentUploading || attachmentUploadError,
    }"
    :cancel-text="running ? '暂时关闭（后台继续）' : '关闭'"
    ok-text="生成费用草稿"
    title="AI 从前置单据识别订单费用"
    width="min(1120px, calc(100vw - 32px))"
    @cancel="handleClose"
    @ok="materialize"
  >
    <Alert
      class="expense-ai-notice"
      description="模型只能从服务端允许的费用分类和证据中提出建议，不能生成金额、币种、汇率或业务 ID。物化后必须由人工补录金额，汇率由服务端按费用日期冻结。"
      message="AI 负责识别，金额由人确认"
      show-icon
      type="info"
    />

    <Row :gutter="24">
      <Col :lg="10" :xs="24">
        <section class="expense-ai-step">
          <header><span>1</span><strong>选择前置单据</strong></header>
          <Form layout="vertical">
            <Form.Item label="来源类型" required>
              <Select
                v-model:value="sourceType"
                :disabled="sourceLocked || restoringActive"
                :options="sourceTypeOptions"
              />
            </Form.Item>
            <Form.Item :label="sourceTypeLabel(sourceType)" required>
              <Select
                v-model:value="sourceId"
                :filter-option="false"
                :disabled="sourceLocked || restoringActive"
                :loading="sourceLoading"
                :options="
                  sourceOptions.map((item) => ({
                    label: item.label,
                    value: item.id,
                  }))
                "
                allow-clear
                show-search
                placeholder="输入编号、主题或客户名称搜索"
                @search="loadSources"
              />
            </Form.Item>
          </Form>
          <div v-if="selectedSource" class="source-summary">
            <IconifyIcon icon="lucide:file-check-2" />
            <div>
              <strong>{{ selectedSource.label }}</strong>
              <small>
                {{ selectedSource.companyName || '公司信息由服务端校验' }} ·
                版本
                {{ selectedSource.version }}
              </small>
            </div>
          </div>
        </section>

        <section class="expense-ai-step">
          <header><span>2</span><strong>明确选择大模型</strong></header>
          <Spin :spinning="optionLoading">
            <Form layout="vertical">
              <Form.Item label="结构化识别模型" required>
                <Select
                  v-model:value="selectedModelId"
                  :disabled="!generationOptions || blockers.length > 0"
                  :options="modelOptions"
                  placeholder="请选择当前公司策略允许的模型"
                />
              </Form.Item>
              <Form.Item label="补充说明（可选）">
                <Input.TextArea
                  v-model:value="instruction"
                  :maxlength="1000"
                  :rows="3"
                  placeholder="例如：重点检查国际物流、保险和报关费用"
                  show-count
                />
              </Form.Item>
            </Form>
          </Spin>
          <Alert
            v-if="generationOptions && modelOptions.length === 0"
            message="当前公司没有为该流程授权可用模型"
            show-icon
            type="warning"
          />
          <Alert
            v-if="blockers.length"
            :description="blockers.join('；')"
            message="来源单据暂不满足生成条件"
            show-icon
            type="error"
          />
          <Alert
            v-if="optionWarnings.length"
            :description="optionWarnings.join('；')"
            message="部分实际数据尚未形成权威证据，AI 将仅使用当前可验证资料"
            show-icon
            type="warning"
          />
          <Button
            block
            :disabled="
              !selectedSource ||
              !selectedModelId ||
              blockers.length > 0 ||
              startBlockedByJob ||
              restoringActive
            "
            :loading="generating"
            type="primary"
            @click="startGeneration"
          >
            <template #icon><IconifyIcon icon="lucide:sparkles" /></template>
            开始识别费用类型
          </Button>
        </section>
      </Col>

      <Col :lg="14" :xs="24">
        <section class="expense-ai-result">
          <header>
            <div>
              <small>第 3 步</small>
              <strong>核对模型建议</strong>
            </div>
            <Tag
              v-if="job"
              :color="ready ? 'green' : running ? 'blue' : 'orange'"
            >
              {{ statusLabel(job.status) }}
            </Tag>
          </header>

          <Alert
            v-if="generationError"
            :message="generationError"
            closable
            show-icon
            type="error"
            @close="generationError = ''"
          />
          <Alert
            v-if="pollWarning"
            :message="pollWarning"
            show-icon
            type="warning"
          />
          <Alert
            v-if="job?.errorMessage || job?.errorCode"
            :description="job.errorMessage || undefined"
            :message="job.errorCode || '生成任务失败'"
            show-icon
            type="error"
          />
          <Alert
            v-for="rule in failedRules"
            :key="`${rule.code}:${rule.fieldPath || ''}`"
            :description="rule.fieldPath || undefined"
            :message="`${rule.code} · ${rule.message}`"
            show-icon
            type="error"
          />

          <div v-if="job" class="generation-progress">
            <Progress
              :percent="progress"
              :status="running ? 'active' : ready ? 'success' : 'normal'"
            />
            <small>{{ job.modelName || `模型 ${job.modelId}` }} · 运行
              {{ job.id }}</small>
          </div>

          <div v-if="ready && job?.proposal" class="proposal-summary">
            <IconifyIcon icon="lucide:wand-sparkles" />
            <p>{{ job.proposal.summary || '模型已返回受控费用分类建议。' }}</p>
          </div>

          <List
            v-if="proposalLines.length"
            class="proposal-list"
            :data-source="proposalLines"
          >
            <template #renderItem="{ item, index }">
              <ListItem>
                <ListItemMeta>
                  <template #avatar>
                    <span class="line-number">{{ index + 1 }}</span>
                  </template>
                  <template #title>
                    <Space>
                      <strong>{{ item.categoryName }}</strong>
                      <Tag>金额待人工填写</Tag>
                    </Space>
                  </template>
                  <template #description>
                    <p>{{ item.description }}</p>
                    <TypographyText type="secondary">
                      证据：{{ item.evidenceType }} · {{ item.evidenceRef }}
                    </TypographyText>
                  </template>
                </ListItemMeta>
              </ListItem>
            </template>
          </List>

          <Empty
            v-else-if="!running"
            description="选择前置单据与大模型后开始识别"
          />
          <div v-else class="running-state">
            <Spin />
            <p>服务端正在重读前置单据、构造受控证据并校验模型输出…</p>
          </div>

          <section v-if="ready" class="expense-ai-attachments">
            <header>
              <strong>费用单附件</strong>
              <small>附件将在费用草稿生成成功时一并保存</small>
            </header>
            <FdmWaimaoAttachmentEditor
              v-model="attachments"
              business-type="ORDER_EXPENSE"
              :disabled="materializing"
              @error-change="attachmentUploadError = $event"
              @uploading-change="attachmentUploading = $event"
            />
          </section>

          <template v-if="job">
            <Divider />
            <div
              v-if="job.missingData.length || job.warnings.length"
              class="generation-notes"
            >
              <Tag v-for="item in job.missingData" :key="item" color="gold">
                {{ item }}
              </Tag>
              <Tag v-for="item in job.warnings" :key="item" color="orange">
                {{ item }}
              </Tag>
            </div>
            <Space v-if="!ready">
              <Button
                v-if="running"
                :loading="generating"
                @click="cancelGeneration"
              >
                取消本次生成
              </Button>
              <Button
                v-if="['FAILED', 'RULE_BLOCKED'].includes(job.status)"
                :loading="generating"
                @click="retryGeneration(false)"
              >
                按原模型重试
              </Button>
              <Button
                v-if="
                  ['EXPIRED', 'FAILED', 'RULE_BLOCKED'].includes(job.status)
                "
                :disabled="!selectedModelId"
                :loading="generating"
                @click="retryGeneration(true)"
              >
                重新生成
              </Button>
              <Button
                v-if="job.status === 'STALE'"
                :loading="generating"
                @click="restartStaleGeneration"
              >
                读取最新来源并重新生成
              </Button>
            </Space>
          </template>
        </section>
      </Col>
    </Row>
  </Modal>
</template>

<style scoped>
.expense-ai-notice {
  margin-bottom: 20px;
}

.expense-ai-step,
.expense-ai-result {
  padding: 18px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 14px;
}

.expense-ai-step + .expense-ai-step {
  margin-top: 16px;
}

.expense-ai-step > header,
.expense-ai-result > header {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.expense-ai-step > header span,
.line-number {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  font-weight: 700;
  color: #1677ff;
  background: #e6f4ff;
  border-radius: 9px;
}

.source-summary,
.proposal-summary {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  margin-bottom: 14px;
  background: #f6f8fb;
  border-radius: 10px;
}

.source-summary svg,
.proposal-summary svg {
  flex: 0 0 auto;
  margin-top: 2px;
  font-size: 20px;
  color: #1677ff;
}

.source-summary div {
  display: grid;
  gap: 4px;
}

.source-summary small,
.generation-progress small {
  color: #8c8c8c;
}

.expense-ai-result {
  min-height: 560px;
}

.expense-ai-result > header {
  justify-content: space-between;
}

.expense-ai-result > header div {
  display: grid;
  gap: 2px;
}

.expense-ai-result > header small {
  color: #8c8c8c;
}

.generation-progress {
  margin: 18px 0;
}

.proposal-summary p,
.proposal-list p {
  margin: 0;
}

.proposal-list {
  max-height: 360px;
  overflow: auto;
}

.expense-ai-attachments {
  display: grid;
  gap: 10px;
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.expense-ai-attachments > header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.expense-ai-attachments > header small {
  color: #8c8c8c;
}

.running-state {
  display: grid;
  place-items: center;
  min-height: 260px;
  color: #8c8c8c;
  text-align: center;
}

.generation-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

@media (max-width: 991px) {
  .expense-ai-result {
    min-height: 420px;
    margin-top: 16px;
  }
}
</style>
