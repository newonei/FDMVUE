<script lang="ts" setup>
import type { FdmWaimaoBankReceiptApi } from '#/api/fdmwaimao/bank-receipt';
import type { FdmWaimaoReceiptAllocationApi } from '#/api/fdmwaimao/receipt-allocation';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Form,
  Input,
  List,
  message,
  Modal,
  Progress,
  Select,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  getBankReceipt,
  getBankReceiptPage,
} from '#/api/fdmwaimao/bank-receipt';
import {
  getReceiptAllocationGenerationJob,
  getReceiptAllocationGenerationModels,
  materializeReceiptAllocationGeneration,
  startReceiptAllocationGeneration,
} from '#/api/fdmwaimao/receipt-allocation';

import {
  clearActiveAllocationGeneration,
  clearAllocationCommand,
  getOrCreateAllocationCommand,
  loadActiveAllocationGeneration,
  saveActiveAllocationGeneration,
} from '../allocation-command-store';

defineOptions({ name: 'FdmWaimaoReceiptAllocationGenerationModal' });

const props = defineProps<{
  bankReceiptId?: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  created: [id: string];
}>();

const selectedBankReceiptId = ref<string>();
const bankReceiptOptions = ref<Array<{ label: string; value: string }>>([]);
const bank = ref<FdmWaimaoBankReceiptApi.BankReceipt>();
const models = ref<FdmWaimaoReceiptAllocationApi.ModelOption[]>([]);
const selectedModelId = ref<string>();
const form = reactive({ instruction: '', remark: '' });
const job = ref<FdmWaimaoReceiptAllocationApi.GenerationJob>();
const loadingBanks = ref(false);
const loadingContext = ref(false);
const starting = ref(false);
const polling = ref(false);
const materializing = ref(false);
const error = ref('');
let bankRequestId = 0;
let contextRequestId = 0;
let jobRequestId = 0;
let bankSearchTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const runningStatuses = new Set([
  'CONTEXT_BUILDING',
  'CREATED',
  'GENERATING',
  'PARSING',
  'QUEUED',
  'VALIDATING',
]);

const modelOptions = computed(() =>
  models.value.map((model) => ({
    label: `${model.name} · ${model.code}`,
    value: model.id,
  })),
);
const proposal = computed(
  (): FdmWaimaoReceiptAllocationApi.GenerationProposal | undefined => {
    const raw = job.value?.proposalJson;
    if (!raw) return undefined;
    try {
      const value = JSON.parse(
        raw,
      ) as Partial<FdmWaimaoReceiptAllocationApi.GenerationProposal>;
      if (!value.customerRef || !Array.isArray(value.lines)) return undefined;
      return value as FdmWaimaoReceiptAllocationApi.GenerationProposal;
    } catch {
      return undefined;
    }
  },
);
const progressPercent = computed(() => {
  const status = job.value?.status;
  const map: Record<string, number> = {
    CONTEXT_BUILDING: 15,
    CREATED: 5,
    GENERATING: 45,
    MATERIALIZED: 100,
    PARSING: 68,
    QUEUED: 10,
    READY: 100,
    VALIDATING: 82,
  };
  return map[status ?? ''] ?? (status ? 100 : 0);
});
const ready = computed(
  () => job.value?.status === 'READY' && Boolean(proposal.value),
);

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency ? `${currency} ` : ''}${new BigNumber(value).toFormat(2)}`;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    CANCELLED: '已取消',
    CONTEXT_BUILDING: '构建受控上下文',
    CREATED: '任务已建立',
    EXPIRED: '任务已过期',
    FAILED: '生成失败',
    GENERATING: '大模型生成中',
    MATERIALIZED: '已物化',
    PARSING: '解析结构化结果',
    QUEUED: '排队中',
    READY: '提案已就绪',
    RULE_BLOCKED: '规则阻断',
    STALE: '来源版本已变化',
    VALIDATING: '服务端规则校验',
  };
  return status ? (labels[status] ?? status) : '尚未开始';
}

function statusColor(status?: string) {
  if (status === 'READY' || status === 'MATERIALIZED') return 'green';
  if (runningStatuses.has(status ?? '')) return 'blue';
  if (status) return 'red';
  return 'default';
}

async function searchBanksNow(keyword = '') {
  const requestId = ++bankRequestId;
  loadingBanks.value = true;
  try {
    const result = await getBankReceiptPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 50,
      status: 'ACTIVE',
    });
    if (requestId !== bankRequestId) return;
    const available = (result.list ?? []).filter(
      (receipt) =>
        receipt.customerId && new BigNumber(receipt.remainingAmount).gt(0),
    );
    const options = available.map((receipt) => ({
      label: `${receipt.receiptNo} · ${receipt.customerName} · ${money(receipt.remainingAmount, receipt.currency)} 可用`,
      value: receipt.id,
    }));
    if (
      bank.value &&
      !options.some((option) => option.value === bank.value?.id)
    ) {
      options.unshift({
        label: `${bank.value.receiptNo} · ${bank.value.customerName || '未关联客户'}`,
        value: bank.value.id,
      });
    }
    bankReceiptOptions.value = options;
  } finally {
    if (requestId === bankRequestId) loadingBanks.value = false;
  }
}

function searchBanks(keyword: string) {
  if (bankSearchTimer) clearTimeout(bankSearchTimer);
  bankSearchTimer = setTimeout(() => void searchBanksNow(keyword), 300);
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
  jobRequestId += 1;
  polling.value = false;
}

function resetGeneration(clearRecovery = true) {
  stopPolling();
  if (clearRecovery) clearActiveAllocationGeneration();
  job.value = undefined;
  selectedModelId.value = undefined;
  form.instruction = '';
  form.remark = '';
  error.value = '';
}

async function loadContext(id?: string) {
  const requestId = ++contextRequestId;
  bank.value = undefined;
  models.value = [];
  resetGeneration(false);
  if (!id) {
    loadingContext.value = false;
    return;
  }
  loadingContext.value = true;
  try {
    const [receipt, availableModels] = await Promise.all([
      getBankReceipt(id),
      getReceiptAllocationGenerationModels(id),
    ]);
    if (requestId !== contextRequestId) return;
    bank.value = receipt;
    models.value = availableModels ?? [];
    if (!receipt.customerId) {
      error.value = '该银行到账未关联交易客户，AI 无法匹配客户合同';
    } else if (models.value.length === 0) {
      error.value = '当前公司没有可用于结构化到账分配的大模型';
    } else {
      const active = loadActiveAllocationGeneration();
      if (active?.sourceId === receipt.id) {
        job.value = {
          proposalJson: undefined,
          runId: active.runId,
          sourceId: active.sourceId,
          sourceVersion: String(active.sourceVersion),
          status: 'QUEUED',
          version: active.runVersion,
          warnings: [],
        };
        await refreshJob(active.runId);
      }
    }
  } finally {
    if (requestId === contextRequestId) loadingContext.value = false;
  }
}

async function refreshJob(runId: string, scheduleNext = true) {
  const requestId = ++jobRequestId;
  const expectedSourceId = selectedBankReceiptId.value;
  polling.value = true;
  try {
    const result = await getReceiptAllocationGenerationJob(runId);
    if (
      requestId !== jobRequestId ||
      !props.open ||
      !expectedSourceId ||
      selectedBankReceiptId.value !== expectedSourceId
    )
      return;
    if (
      String(result.runId) !== runId ||
      String(result.sourceId) !== expectedSourceId
    ) {
      polling.value = false;
      error.value = 'AI 任务身份与当前银行到账不一致，已停止恢复';
      return;
    }
    const sourceVersion = Number(result.sourceVersion);
    if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
      polling.value = false;
      error.value = 'AI 任务返回的来源版本无效，已停止恢复';
      return;
    }
    job.value = {
      ...result,
      runId: String(result.runId),
      sourceId: String(result.sourceId),
      sourceVersion: String(result.sourceVersion),
      version: String(result.version),
    };
    if (result.status === 'MATERIALIZED') {
      clearActiveAllocationGeneration();
    } else {
      saveActiveAllocationGeneration({
        runId,
        runVersion: String(result.version),
        sourceId: expectedSourceId,
        sourceVersion,
      });
    }
    if (scheduleNext && runningStatuses.has(result.status)) {
      pollTimer = setTimeout(() => void refreshJob(runId), 1600);
    } else {
      polling.value = false;
    }
  } catch (caughtError) {
    if (
      requestId !== jobRequestId ||
      !props.open ||
      selectedBankReceiptId.value !== expectedSourceId
    )
      return;
    polling.value = false;
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : 'AI 任务状态读取失败';
  }
}

async function start() {
  const receipt = bank.value;
  const modelId = selectedModelId.value;
  if (starting.value || job.value) return;
  if (
    !receipt ||
    receipt.id !== selectedBankReceiptId.value ||
    !receipt.customerId
  ) {
    error.value = '请选择已关联交易客户的银行到账';
    return;
  }
  if (!modelId) {
    error.value = '请明确选择一个大模型';
    return;
  }
  const facts = {
    bankReceiptId: receipt.id,
    expectedSourceVersion: receipt.version,
    instruction: form.instruction.trim() || undefined,
    modelId,
  };
  const identity = `generation-start:${receipt.id}:${receipt.version}:${modelId}`;
  starting.value = true;
  error.value = '';
  stopPolling();
  try {
    const ticket = await startReceiptAllocationGeneration({
      ...facts,
      idempotencyKey: await getOrCreateAllocationCommand(
        identity,
        JSON.stringify(facts),
        'allocation-generate',
      ),
    });
    job.value = {
      proposalJson: undefined,
      runId: String(ticket.runId),
      sourceId: receipt.id,
      sourceVersion: String(receipt.version),
      status: ticket.status,
      version: String(ticket.version),
      warnings: [],
    };
    saveActiveAllocationGeneration({
      runId: String(ticket.runId),
      runVersion: String(ticket.version),
      sourceId: receipt.id,
      sourceVersion: receipt.version,
    });
    clearAllocationCommand(identity);
    await refreshJob(String(ticket.runId));
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : 'AI 分配任务启动失败';
  } finally {
    starting.value = false;
  }
}

async function materialize() {
  const current = job.value;
  if (!current || !ready.value || materializing.value) return;
  if (
    !bank.value ||
    bank.value.id !== selectedBankReceiptId.value ||
    String(current.sourceId) !== bank.value.id
  ) {
    error.value = '当前 AI 任务与所选银行到账不一致，不能物化';
    return;
  }
  const facts = {
    expectedRunVersion: String(current.version),
    remark: form.remark.trim() || undefined,
    runId: String(current.runId),
  };
  const identity = `materialize:${current.runId}:${current.version}`;
  materializing.value = true;
  error.value = '';
  try {
    const result = await materializeReceiptAllocationGeneration({
      ...facts,
      idempotencyKey: await getOrCreateAllocationCommand(
        identity,
        JSON.stringify(facts),
        'allocation-materialize',
      ),
    });
    clearAllocationCommand(identity);
    clearActiveAllocationGeneration();
    message.success(
      result.newlyCreated
        ? 'AI 提案已由服务端重新校验并物化为分配草稿'
        : '该 AI 提案已经物化，已打开原分配草稿',
    );
    emit('created', result.id);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error ? caughtError.message : 'AI 提案物化失败';
  } finally {
    materializing.value = false;
  }
}

function close() {
  stopPolling();
  emit('close');
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      stopPolling();
      return;
    }
    const nextId =
      props.bankReceiptId ?? loadActiveAllocationGeneration()?.sourceId;
    const changed = selectedBankReceiptId.value !== nextId;
    selectedBankReceiptId.value = nextId;
    void searchBanksNow();
    if (!changed) void loadContext(nextId);
  },
);

watch(selectedBankReceiptId, (id) => {
  if (!props.open) return;
  void loadContext(id);
});

onBeforeUnmount(() => {
  stopPolling();
  if (bankSearchTimer) clearTimeout(bankSearchTimer);
  bankRequestId += 1;
  contextRequestId += 1;
  jobRequestId += 1;
});
</script>

<template>
  <Modal
    :footer="null"
    :mask-closable="false"
    :open="open"
    title="AI 生成到账分配草稿"
    width="min(1120px, calc(100vw - 32px))"
    @cancel="close"
  >
    <Alert
      description="大模型只看到服务端生成的 customerRef / orderRef、应收上限和到账可用余额；不能看到或提交数据库 ID、汇率、人民币金额、合同币金额或哈希。READY 提案还会在物化时重新校验。"
      message="AI 提建议，服务端掌握身份、金额换算与最终物化"
      show-icon
      type="info"
    />
    <Alert
      v-if="error"
      class="allocation-ai__alert"
      :message="error"
      closable
      show-icon
      type="error"
      @close="error = ''"
    />

    <div class="allocation-ai__layout">
      <section class="allocation-ai__setup">
        <header>
          <span>1</span>
          <div>
            <strong>选择到账与模型</strong>
            <small>模型必须由当前用户明确选择</small>
          </div>
        </header>
        <Form layout="vertical">
          <Form.Item label="银行到账" required>
            <Select
              v-model:value="selectedBankReceiptId"
              :disabled="Boolean(job)"
              :filter-option="false"
              :loading="loadingBanks"
              :options="bankReceiptOptions"
              placeholder="搜索到账编号、银行流水或客户"
              show-search
              @dropdown-visible-change="
                (open: boolean) => open && searchBanksNow()
              "
              @search="searchBanks"
            />
          </Form.Item>

          <Spin :spinning="loadingContext">
            <div v-if="bank" class="allocation-ai__bank">
              <IconifyIcon icon="lucide:landmark" />
              <div>
                <strong>{{ bank.receiptNo }} ·
                  {{ bank.customerName || '未关联客户' }}</strong>
                <small>
                  {{ money(bank.remainingAmount, bank.currency) }} 可分配 ·
                  来源版本 V{{ bank.version }}
                </small>
              </div>
            </div>
          </Spin>

          <Form.Item label="结构化分配模型" required>
            <Select
              v-model:value="selectedModelId"
              :disabled="Boolean(job)"
              :loading="loadingContext"
              :options="modelOptions"
              placeholder="请选择大模型"
            />
          </Form.Item>
          <Form.Item label="补充偏好（不能覆盖金额上限和权威事实）">
            <Input.TextArea
              v-model:value="form.instruction"
              :disabled="Boolean(job)"
              :maxlength="500"
              placeholder="例如：优先匹配最早到期且应收余额较大的合同"
              :rows="4"
              show-count
            />
          </Form.Item>
          <Button
            block
            :disabled="!bank || !selectedModelId || Boolean(job)"
            :loading="starting"
            type="primary"
            @click="start"
          >
            <template #icon>
              <IconifyIcon icon="lucide:wand-sparkles" />
            </template>
            开始生成分配建议
          </Button>
          <Button
            v-if="job"
            block
            class="allocation-ai__restart"
            @click="() => resetGeneration()"
          >
            放弃当前任务，重新选择
          </Button>
        </Form>
      </section>

      <section class="allocation-ai__result">
        <header>
          <span>2</span>
          <div>
            <strong>校验与物化</strong>
            <small>只有 READY 提案可以建立本地草稿</small>
          </div>
          <Tag :color="statusColor(job?.status)">
            {{ statusLabel(job?.status) }}
          </Tag>
        </header>

        <div v-if="!job" class="allocation-ai__empty">
          <IconifyIcon icon="lucide:scan-search" />
          <strong>等待开始</strong>
          <p>模型只负责选择不透明合同引用与原币分配建议。</p>
        </div>
        <template v-else>
          <div class="allocation-ai__progress">
            <Progress
              :percent="progressPercent"
              :status="ready ? 'success' : 'active'"
            />
            <small>任务 {{ job.runId }} · 版本 {{ job.version }}</small>
          </div>

          <Alert
            v-if="job.status === 'STALE'"
            description="银行到账版本已经变化。请关闭本任务，从最新到账重新生成。"
            message="来源已过期"
            show-icon
            type="warning"
          />
          <Alert
            v-else-if="
              ['FAILED', 'RULE_BLOCKED', 'EXPIRED', 'CANCELLED'].includes(
                job.status,
              )
            "
            :description="
              job.warnings.join('；') ||
              '任务未形成可物化的 READY 提案，请核对合同应收或重新生成。'
            "
            :message="statusLabel(job.status)"
            show-icon
            type="error"
          />

          <template v-if="proposal">
            <div class="allocation-ai__proposal-heading">
              <div>
                <span>客户引用</span>
                <strong>{{ proposal.customerRef }}</strong>
              </div>
              <Tag color="purple">不透明引用，不是数据库 ID</Tag>
            </div>
            <Table
              :columns="[
                {
                  dataIndex: 'orderRef',
                  key: 'orderRef',
                  title: '合同引用',
                  width: 110,
                },
                {
                  dataIndex: 'sourceCurrencyAmount',
                  key: 'amount',
                  title: `建议金额（${bank?.currency || '原币'}）`,
                  width: 170,
                },
                { key: 'confidence', title: '置信度', width: 100 },
                { dataIndex: 'reason', key: 'reason', title: '建议依据' },
              ]"
              :data-source="proposal.lines"
              :pagination="false"
              row-key="orderRef"
              :scroll="{ x: 700, y: 300 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'orderRef'">
                  <Tag color="blue">{{ record.orderRef }}</Tag>
                </template>
                <template v-else-if="column.key === 'amount'">
                  <strong>{{
                    money(record.sourceCurrencyAmount, bank?.currency)
                  }}</strong>
                </template>
                <template v-else-if="column.key === 'confidence'">
                  {{ record.confidence ?? '—' }}
                </template>
              </template>
            </Table>
          </template>

          <List
            v-if="job.warnings.length > 0"
            class="allocation-ai__warnings"
            bordered
            :data-source="job.warnings"
            size="small"
          >
            <template #renderItem="{ item }">
              <List.Item>{{ item }}</List.Item>
            </template>
          </List>

          <Form
            v-if="ready"
            class="allocation-ai__materialize"
            layout="vertical"
          >
            <Form.Item label="草稿备注">
              <Input.TextArea
                v-model:value="form.remark"
                :maxlength="2000"
                placeholder="可记录人工复核意见"
                :rows="3"
                show-count
              />
            </Form.Item>
            <Alert
              description="点击后服务端会根据冻结来源重新映射真实合同、重新计算汇率/CNY/合同币金额并写入 lineage；浏览器不会回传提案 JSON。"
              message="物化前最后一次服务端校验"
              show-icon
              type="warning"
            />
            <Button
              block
              class="allocation-ai__materialize-button"
              :loading="materializing"
              type="primary"
              @click="materialize"
            >
              确认采用并建立草稿
            </Button>
          </Form>
        </template>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.allocation-ai__alert {
  margin-top: 12px;
}

.allocation-ai__layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.78fr) minmax(480px, 1.35fr);
  gap: 22px;
  margin-top: 20px;
}

.allocation-ai__setup,
.allocation-ai__result {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e5eaf1;
  border-radius: 12px;
}

.allocation-ai__setup > header,
.allocation-ai__result > header {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
}

.allocation-ai__setup > header > span,
.allocation-ai__result > header > span {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  font-weight: 700;
  color: #1677ff;
  background: #e6f4ff;
  border-radius: 9px;
}

.allocation-ai__setup > header > div,
.allocation-ai__result > header > div {
  display: grid;
  flex: 1;
  gap: 2px;
}

.allocation-ai__setup small,
.allocation-ai__result small {
  color: #64748b;
}

.allocation-ai__bank {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  margin: 0 0 18px;
  background: #f6f8fb;
  border-radius: 9px;
}

.allocation-ai__bank > svg {
  flex: 0 0 auto;
  font-size: 23px;
  color: #1677ff;
}

.allocation-ai__bank > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.allocation-ai__restart,
.allocation-ai__materialize-button {
  margin-top: 10px;
}

.allocation-ai__empty {
  display: grid;
  place-items: center;
  min-height: 410px;
  color: #94a3b8;
  text-align: center;
}

.allocation-ai__empty > svg {
  font-size: 44px;
  color: #91caff;
}

.allocation-ai__empty strong {
  font-size: 16px;
  color: #334155;
}

.allocation-ai__empty p {
  margin: 0;
}

.allocation-ai__progress {
  margin-bottom: 16px;
}

.allocation-ai__proposal-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin: 14px 0 10px;
  background: #f6f8fb;
  border-radius: 9px;
}

.allocation-ai__proposal-heading > div {
  display: flex;
  gap: 9px;
}

.allocation-ai__warnings,
.allocation-ai__materialize {
  margin-top: 14px;
}

@media (max-width: 900px) {
  .allocation-ai__layout {
    grid-template-columns: 1fr;
  }

  .allocation-ai__empty {
    min-height: 240px;
  }
}
</style>
