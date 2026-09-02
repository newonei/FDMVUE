<script lang="ts" setup>
import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { FdmProcurementSourcingApi } from '#/api/fdmprocurement/sourcing';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  message,
  Progress,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getProcurementRequisition } from '#/api/fdmprocurement/requisition';
import {
  getProcurementSourcingAssessment,
  selectProcurementSourcing,
} from '#/api/fdmprocurement/sourcing';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import {
  eligibilityPresentation,
  isCandidateSelectable,
  scoreDimensions,
  scorePercent,
  usesNeedsConfirmation,
} from './candidate-presentation';
import SourcingCandidateEvidence from './components/SourcingCandidateEvidence.vue';
import {
  buildSourcingSelection,
  initialSelectionQuantities,
  sourcingLineQuantitySummary,
} from './selection-model';

defineOptions({ name: 'FdmProcurementSourcingWorkbench' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const assessment = ref<FdmProcurementSourcingApi.Assessment>();
const requisition =
  ref<Awaited<ReturnType<typeof getProcurementRequisition>>>();
const quantities = ref<Record<string, string | undefined>>({});
const overrideReason = ref('');
const loading = ref(false);
const selecting = ref(false);

const assessmentId = computed(() =>
  String(route.params.id || route.query.id || ''),
);
const canQuery = computed(
  () =>
    hasAccessByCodes(['fdmprocurement:sourcing:query']) &&
    hasAccessByCodes(['fdmprocurement:sourcing:view-sensitive']),
);
const canSelect = computed(
  () =>
    hasAccessByCodes(['fdmprocurement:sourcing:select']) &&
    hasAccessByCodes(['fdmprocurement:sourcing:view-sensitive']),
);
const isEditable = computed(
  () =>
    canSelect.value &&
    ['READY', 'REVIEW_REQUIRED'].includes(assessment.value?.status || ''),
);
const selectionResult = computed(() => {
  if (!assessment.value || !requisition.value) return { issues: [] };
  return buildSourcingSelection(
    assessment.value,
    requisition.value,
    quantities.value,
    overrideReason.value,
  );
});
const requiresOverrideReason = computed(() =>
  (assessment.value?.candidates || []).some((candidate) => {
    const quantity = new BigNumber(quantities.value[candidate.id] || 0);
    return (
      quantity.isFinite() &&
      quantity.isGreaterThan(0) &&
      usesNeedsConfirmation(candidate.eligibilityStatus)
    );
  }),
);
const itemGroups = computed(() =>
  (requisition.value?.items || []).map((item) => ({
    candidates: (assessment.value?.candidates || []).filter(
      (candidate) => candidate.requisitionItemId === item.id,
    ),
    item,
  })),
);

useFdmWaimaoAiContext(() => ({
  businessId: assessmentId.value || undefined,
  companyId: assessment.value?.companyId,
  context: {
    assessment: assessment.value
      ? {
          candidateCount: assessment.value.candidates.length,
          comparableCostComplete: assessment.value.comparableCostComplete,
          eligibleCandidateCount: assessment.value.eligibleCandidateCount,
          id: assessment.value.id,
          needsConfirmationCandidateCount:
            assessment.value.needsConfirmationCandidateCount,
          requisitionId: assessment.value.requisitionId,
          requisitionVersion: assessment.value.requisitionVersion,
          selectedAllocationCount: assessment.value.allocations.filter(
            (allocation) => allocation.selected,
          ).length,
          status: assessment.value.status,
        }
      : undefined,
    loading: loading.value,
  },
  contextMode: 'detail',
  entityLabel: requisition.value?.requisitionNo,
  surfaceKey: 'procurement-sourcing',
}));

const candidateColumns = [
  { key: 'candidate', title: '候选供应来源', width: 210 },
  { key: 'eligibility', title: '资格结论', width: 170 },
  { key: 'constraints', title: '数量约束', width: 220 },
  { key: 'quote', title: '报价 / 可比成本', width: 180 },
  { key: 'delivery', title: '交期 / 容量', width: 180 },
  { key: 'score', title: '确定性评分', width: 170 },
  { key: 'evidence', title: '冻结证据', width: 270 },
  { key: 'recommendation', title: '服务器建议', width: 130 },
  {
    fixed: 'right' as const,
    key: 'allocation',
    title: '人工分配数量',
    width: 180,
  },
];

function allocationFor(candidateId: string) {
  const matching = (assessment.value?.allocations || []).filter(
    (allocation) => String(allocation.candidateId) === String(candidateId),
  );
  return (
    matching.find((allocation) => allocation.selected === true) || matching[0]
  );
}

function asCandidate(record: Record<string, unknown>) {
  return record as unknown as FdmProcurementSourcingApi.Candidate;
}

function canAllocateCandidate(status?: null | string) {
  if (!isCandidateSelectable(status)) return false;
  return !(
    usesNeedsConfirmation(status) &&
    assessment.value?.needsConfirmationSelectionAllowed === false
  );
}

function lineQuantitySummary(
  item: FdmProcurementRequisitionApi.Requisition['items'][number],
) {
  if (!assessment.value) {
    return { balanced: false, complete: false };
  }
  return sourcingLineQuantitySummary(assessment.value, item, quantities.value);
}

function confidenceColor(confidence?: null | string) {
  if (confidence === 'HIGH') return 'green';
  if (confidence === 'MEDIUM') return 'blue';
  return 'orange';
}

function concentrationPercent(value?: null | number | string) {
  const concentration = new BigNumber(value ?? Number.NaN);
  return concentration.isFinite()
    ? `${concentration.multipliedBy(100).toFixed(2)}%`
    : '当前响应未提供';
}

async function load() {
  if (!assessmentId.value || !canQuery.value) return;
  loading.value = true;
  try {
    const loadedAssessment = await getProcurementSourcingAssessment(
      assessmentId.value,
    );
    const loadedRequisition = await getProcurementRequisition(
      loadedAssessment.requisitionId,
    );
    assessment.value = loadedAssessment;
    requisition.value = loadedRequisition;
    quantities.value = initialSelectionQuantities(loadedAssessment);
    overrideReason.value =
      loadedAssessment.allocations.find((item) => item.overrideReason)
        ?.overrideReason || '';
  } finally {
    loading.value = false;
  }
}

async function confirmSelection() {
  if (!assessment.value || !isEditable.value) return;
  const result = selectionResult.value;
  if (!result.request) {
    message.warning(result.issues[0] || '供应分配未通过校验');
    return;
  }
  selecting.value = true;
  try {
    assessment.value = await selectProcurementSourcing(result.request);
    quantities.value = initialSelectionQuantities(assessment.value);
    message.success('供应方案已由人工确认并保存');
  } finally {
    selecting.value = false;
  }
}

function openRequisition() {
  const id = assessment.value?.requisitionId || route.query.requisitionId;
  if (!id) return;
  const selected = assessment.value?.status === 'SELECTED';
  void router.push({
    path: `/fdmprocurement/requisition/detail/${id}`,
    query: selected
      ? {
          selectedAssessmentId: assessment.value?.id,
          selectedAssessmentInputHash: assessment.value?.inputHash,
        }
      : undefined,
  });
}

watch(assessmentId, load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      assessment
        ? `规则 ${assessment.ruleVersion} · 策略 v${assessment.policyVersion ?? '未提供'} · 申请 v${assessment.requisitionVersion}`
        : '供应方案评估'
    "
    title="寻源结果确认"
  >
    <template #extra>
      <Button @click="openRequisition">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
        返回采购申请
      </Button>
      <Tag
        :color="
          assessment?.status === 'SELECTED'
            ? 'green'
            : assessment?.status === 'READY'
              ? 'blue'
              : assessment?.status === 'REVIEW_REQUIRED'
                ? 'gold'
                : 'red'
        "
      >
        {{ assessment?.status || '未加载' }}
      </Tag>
      <Button :disabled="!canQuery" :loading="loading" @click="load">
        刷新评估
      </Button>
    </template>

    <Alert
      v-if="!canQuery"
      message="需要同时具备寻源查询和敏感报价查看权限"
      show-icon
      type="warning"
    />
    <Skeleton v-else-if="loading" active :paragraph="{ rows: 14 }" />
    <Empty
      v-else-if="!assessment || !requisition"
      description="寻源评估不存在或无权查看"
    />
    <div v-else class="sourcing-workbench">
      <Alert
        v-if="!assessment.comparableCostComplete"
        description="当前仅展示报价、冻结汇率和后端明确维护的成本项。税费、关税、保险及完整物流等缺失项没有被假设为 0；“可比成本”不能当作完整到岸成本。"
        message="可比成本信息不完整"
        show-icon
        type="warning"
      />
      <Alert
        v-if="assessment.status === 'BLOCKED'"
        message="硬规则阻断：没有可形成数量守恒方案的合格候选，请先完善供应商产品、有效报价或容量数据。"
        show-icon
        type="error"
      />
      <Alert
        v-if="assessment.status === 'REVIEW_REQUIRED'"
        description="系统没有生成可直接确认的全量方案。只有标记为“需人工确认”的候选可在填写例外确认理由后参与分配；证据未知和不合格候选仍然禁止选择。"
        message="该评估需要人工例外确认"
        show-icon
        type="warning"
      />
      <Alert
        message="排序和推荐由确定性规则生成；AI 只能解释证据。最终供应商与数量必须由有权限的人员确认，且服务端会重新校验资格、MOQ、包装倍数、容量和数量守恒。"
        show-icon
        type="info"
      />

      <Card title="评估摘要" size="small">
        <Descriptions :column="4" size="small">
          <Descriptions.Item label="评估 ID">
            {{ assessment.id }}
          </Descriptions.Item>
          <Descriptions.Item label="采购申请">
            {{ requisition.requisitionNo }}
          </Descriptions.Item>
          <Descriptions.Item label="合格候选">
            {{ assessment.eligibleCandidateCount }}
          </Descriptions.Item>
          <Descriptions.Item label="待人工确认">
            {{ assessment.needsConfirmationCandidateCount ?? '后端未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="人工例外策略">
            <template
              v-if="assessment.needsConfirmationSelectionAllowed === false"
            >
              禁止例外选择
            </template>
            <template
              v-else-if="assessment.needsConfirmationSelectionAllowed === true"
            >
              允许；理由至少
              {{ assessment.overrideReasonMinLength ?? '由服务端校验' }} 字
            </template>
            <template v-else>旧响应未提供；提交时由服务端校验</template>
          </Descriptions.Item>
          <Descriptions.Item label="供应商组合上限">
            <template v-if="assessment.maximumSupplierCount != null">
              每行最多 {{ assessment.maximumSupplierCount }} 家；单家不超过
              {{
                concentrationPercent(assessment.maximumSupplierConcentration)
              }}
            </template>
            <template v-else>当前响应未提供；提交时由服务端校验</template>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {{ assessment.status }}
          </Descriptions.Item>
          <Descriptions.Item label="规则版本">
            {{ assessment.ruleVersion }}
          </Descriptions.Item>
          <Descriptions.Item label="策略版本">
            <span v-if="assessment.policyId">
              #{{ assessment.policyId }} / v{{
                assessment.policyVersion ?? '—'
              }}
            </span>
            <span v-else>当前响应未提供</span>
          </Descriptions.Item>
          <Descriptions.Item label="证据日期">
            {{ assessment.evidenceDate || '当前响应未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="策略 Hash" :span="2">
            <span class="sourcing-workbench__hash">
              {{ assessment.policyHash || '当前响应未提供' }}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="输入 Hash" :span="2">
            <span class="sourcing-workbench__hash">{{
              assessment.inputHash
            }}</span>
          </Descriptions.Item>
          <Descriptions.Item label="评估时间">
            {{ assessment.evaluatedAt || '未记录' }}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <section
        v-for="group in itemGroups"
        :key="group.item.id"
        class="sourcing-line"
      >
        <header>
          <div>
            <span>第 {{ group.item.lineNo }} 行</span>
            <h2>{{ group.item.productName }}</h2>
            <p>
              {{ group.item.productCode || '无产品编码' }} ·
              {{ group.item.specification || '无规格' }}
            </p>
          </div>
          <div class="sourcing-line__quantity">
            <span>人工分配 / 申请（基础数量）</span>
            <strong
              :class="{
                'sourcing-line__quantity--balanced': lineQuantitySummary(
                  group.item,
                ).balanced,
                'sourcing-line__quantity--imbalanced':
                  lineQuantitySummary(group.item).complete &&
                  !lineQuantitySummary(group.item).balanced,
                'sourcing-line__quantity--invalid': !lineQuantitySummary(
                  group.item,
                ).complete,
              }"
            >
              {{ lineQuantitySummary(group.item).allocatedBase ?? 'UNKNOWN' }} /
              {{ lineQuantitySummary(group.item).requiredBase ?? 'UNKNOWN' }}
            </strong>
            <span>
              {{
                lineQuantitySummary(group.item).balanced
                  ? '基础数量已守恒'
                  : lineQuantitySummary(group.item).complete
                    ? '基础数量尚未守恒'
                    : '缺少单位换算，无法校验守恒'
              }}
            </span>
            <span>
              申请 {{ group.item.requestedQty ?? 'UNKNOWN' }}
              {{ group.item.purchaseUnit || '单位未知' }} ×
              {{ group.item.unitConversionFactor ?? '换算未知' }} 基础单位
            </span>
            <span v-if="assessment.maximumSupplierCount != null">
              最多 {{ assessment.maximumSupplierCount }} 家供应商 · 单家 ≤
              {{
                concentrationPercent(assessment.maximumSupplierConcentration)
              }}
            </span>
          </div>
        </header>
        <Table
          :columns="candidateColumns"
          :data-source="group.candidates"
          :pagination="false"
          row-key="id"
          :scroll="{ x: 1730 }"
          size="small"
        >
          <template #emptyText>
            <Empty
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              description="该产品行没有供应候选"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'candidate'">
              <div class="sourcing-workbench__stack">
                <strong>供应商 {{ record.supplierId }}</strong>
                <span>供应商产品 {{ record.supplierProductId }}</span>
                <span>{{ record.purchaseUnit || '单位 UNKNOWN' }} ×
                  {{ record.unitConversionFactor || '换算 UNKNOWN' }}
                  基础单位</span>
                <span>候选 {{ record.id }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'eligibility'">
              <Space direction="vertical" :size="3">
                <Tag
                  :color="
                    eligibilityPresentation(record.eligibilityStatus).color
                  "
                >
                  {{ eligibilityPresentation(record.eligibilityStatus).label }}
                </Tag>
                <Tooltip
                  :title="
                    eligibilityPresentation(record.eligibilityStatus)
                      .description
                  "
                >
                  <span class="sourcing-workbench__risk">{{
                    record.eligibilityStatus
                  }}</span>
                </Tooltip>
              </Space>
            </template>
            <template v-else-if="column.key === 'constraints'">
              <div class="sourcing-workbench__stack">
                <strong>
                  {{ record.purchaseUnit || '单位 UNKNOWN' }} ×
                  {{ record.unitConversionFactor ?? '换算 UNKNOWN' }} 基础单位
                </strong>
                <span>
                  MOQ {{ record.minOrderQty ?? 'UNKNOWN' }} · 包装倍数
                  {{ record.packageMultiple ?? 'UNKNOWN' }}
                </span>
                <span>
                  报价阶梯 {{ record.quoteTierMinQty ?? '不限' }} ～
                  {{ record.quoteTierMaxQty ?? '不限' }}
                </span>
                <span>
                  最大可分配 {{ record.maxAllocatableQty ?? 'UNKNOWN' }}
                  {{ record.purchaseUnit || '' }}
                </span>
              </div>
            </template>
            <template v-else-if="column.key === 'quote'">
              <div class="sourcing-workbench__stack">
                <strong>{{ record.currency || '—' }}
                  {{ record.quotedUnitPrice ?? 'UNKNOWN' }}</strong>
                <span>折算人民币成本
                  {{ record.comparableUnitCost ?? 'UNKNOWN' }}</span>
                <span
                  v-if="!assessment.comparableCostComplete"
                  class="sourcing-workbench__risk"
                >
                  非完整到岸成本
                </span>
                <span>报价版本 {{ record.quoteVersionId || '未提供' }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'delivery'">
              <div class="sourcing-workbench__stack">
                <strong>{{ record.promisedDate || '交期 UNKNOWN' }}</strong>
                <span>容量证据与数量约束见右侧冻结证据</span>
              </div>
            </template>
            <template v-else-if="column.key === 'score'">
              <div
                v-if="scorePercent(record.totalScore) !== undefined"
                class="sourcing-workbench__score"
              >
                <Progress
                  :percent="scorePercent(record.totalScore)"
                  size="small"
                />
                <Tooltip
                  :title="
                    scoreDimensions(asCandidate(record))
                      .map((item) => `${item.label}: ${item.value ?? '未评分'}`)
                      .join('；')
                  "
                >
                  <span class="sourcing-workbench__risk">查看六项评分证据</span>
                </Tooltip>
                <Tag :color="confidenceColor(record.confidence)">
                  置信度 {{ record.confidence || 'UNKNOWN' }}
                </Tag>
              </div>
              <div v-else class="sourcing-workbench__score-unavailable">
                <strong>不可评分</strong>
                <span>证据缺失不是 0 分</span>
              </div>
            </template>
            <template v-else-if="column.key === 'evidence'">
              <SourcingCandidateEvidence :candidate="asCandidate(record)" />
            </template>
            <template v-else-if="column.key === 'recommendation'">
              <Tag v-if="allocationFor(record.id)" color="blue">
                {{ allocationFor(record.id)?.allocationRole }}
              </Tag>
              <span v-else>未推荐</span>
            </template>
            <template v-else-if="column.key === 'allocation'">
              <InputNumber
                v-model:value="quantities[record.id]"
                :disabled="
                  !isEditable || !canAllocateCandidate(record.eligibilityStatus)
                "
                :max="record.maxAllocatableQty || undefined"
                :min="0"
                placeholder="0"
                :addon-after="record.purchaseUnit || ''"
                string-mode
                style="width: 150px"
              />
              <div
                v-if="
                  usesNeedsConfirmation(record.eligibilityStatus) &&
                  assessment.needsConfirmationSelectionAllowed !== false
                "
                class="sourcing-workbench__override-hint"
              >
                填写数量即需例外理由
              </div>
              <div
                v-else-if="!canAllocateCandidate(record.eligibilityStatus)"
                class="sourcing-workbench__disabled-hint"
              >
                当前资格禁止分配
              </div>
            </template>
          </template>
        </Table>
      </section>

      <Card title="人工确认" size="small">
        <div class="sourcing-workbench__reason-heading">
          <strong>
            人工选择说明 / 例外确认理由
            <span
              v-if="requiresOverrideReason"
              class="sourcing-workbench__required"
              >*</span>
          </strong>
          <span v-if="requiresOverrideReason">
            当前分配含“需人工确认”候选；理由
            <template v-if="assessment.overrideReasonMinLength">
              至少 {{ assessment.overrideReasonMinLength }} 字，
            </template>
            <template v-else>必须非空，具体长度由服务端</template>
            按冻结策略校验。
          </span>
          <span v-else>仅选择合格候选时可选填。</span>
        </div>
        <Input.TextArea
          v-model:value="overrideReason"
          :disabled="!isEditable"
          :maxlength="2000"
          :placeholder="
            requiresOverrideReason
              ? '请说明待确认的证据、线下核验情况和承担例外的原因（必填）'
              : '可说明为什么采用该供应商组合及数量拆分（选填）'
          "
          show-count
          :rows="3"
        />
        <div
          v-if="selectionResult.issues.length"
          class="sourcing-workbench__issues"
        >
          <Alert
            v-for="issue in selectionResult.issues"
            :key="issue"
            :message="issue"
            show-icon
            type="warning"
          />
        </div>
        <footer>
          <span v-if="assessment.status === 'SELECTED'">该评估结果已完成一次人工确认。</span>
          <span v-else-if="!canSelect">当前账号没有人工选定供应方案权限。</span>
          <Button
            :disabled="!isEditable || !selectionResult.request"
            :loading="selecting"
            type="primary"
            @click="confirmSelection"
          >
            确认供应方案
          </Button>
          <Button
            v-if="assessment.status === 'SELECTED'"
            @click="openRequisition"
          >
            返回申请并准备提交
          </Button>
        </footer>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.sourcing-workbench {
  display: grid;
  gap: 14px;
}

.sourcing-line {
  overflow: hidden;
  background: #fff;
  border: 1px solid #eef2f6;
  border-radius: 10px;
}

.sourcing-line > header {
  display: flex;
  gap: 18px;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f8fafc, #eff6ff);
}

.sourcing-line h2,
.sourcing-line p {
  margin: 2px 0;
}

.sourcing-line h2 {
  font-size: 17px;
}

.sourcing-line p,
.sourcing-line header span,
.sourcing-workbench__stack span,
.sourcing-workbench__risk,
.sourcing-workbench footer span {
  font-size: 12px;
  color: #64748b;
}

.sourcing-line__quantity {
  display: grid;
  gap: 4px;
  min-width: 190px;
  text-align: right;
}

.sourcing-line__quantity strong {
  font-size: 16px;
  color: #1677ff;
}

.sourcing-line__quantity strong.sourcing-line__quantity--balanced {
  color: #15803d;
}

.sourcing-line__quantity strong.sourcing-line__quantity--invalid {
  color: #b45309;
}

.sourcing-line__quantity strong.sourcing-line__quantity--imbalanced {
  color: #dc2626;
}

.sourcing-workbench__stack {
  display: grid;
  gap: 3px;
}

.sourcing-workbench__risk {
  text-decoration: underline dotted;
  cursor: help;
}

.sourcing-workbench__score {
  display: grid;
  gap: 5px;
}

.sourcing-workbench__score-unavailable {
  display: grid;
  gap: 2px;
  padding: 8px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}

.sourcing-workbench__score-unavailable span,
.sourcing-workbench__override-hint,
.sourcing-workbench__disabled-hint,
.sourcing-workbench__reason-heading span {
  font-size: 12px;
  color: #64748b;
}

.sourcing-workbench__override-hint {
  margin-top: 4px;
  color: #b45309;
}

.sourcing-workbench__disabled-hint {
  margin-top: 4px;
}

.sourcing-workbench__reason-heading {
  display: grid;
  gap: 3px;
  margin-bottom: 8px;
}

.sourcing-workbench__required {
  color: #dc2626 !important;
}

.sourcing-workbench__hash {
  overflow-wrap: anywhere;
}

.sourcing-workbench__issues {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.sourcing-workbench footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

@media (max-width: 700px) {
  .sourcing-line > header,
  .sourcing-workbench footer {
    flex-direction: column;
    align-items: stretch;
  }

  .sourcing-line__quantity {
    text-align: left;
  }
}
</style>
