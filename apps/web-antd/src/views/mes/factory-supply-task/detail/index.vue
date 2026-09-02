<script lang="ts" setup>
import type { MesFactorySupplyTaskApi } from '#/api/mes/factory-supply-task';

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
  Skeleton,
  Table,
  Tag,
} from 'ant-design-vue';

import { getFactorySupplyTask } from '#/api/mes/factory-supply-task';
import {
  atpStatusMeta,
  factoryTaskStatusMeta,
} from '#/views/mes/factory-supply-task/generation-policy';

defineOptions({ name: 'MesFactorySupplyTaskDetail' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const detail = ref<MesFactorySupplyTaskApi.BatchDetail>();
const loading = ref(false);
let loadVersion = 0;

const id = computed(() => String(route.params.id || route.query.id || ''));
const canQuery = computed(() =>
  hasAccessByCodes(['mes:factory-supply-task:query']),
);
const lineColumns = [
  { key: 'product', title: '冻结产品与数量', width: 260 },
  { key: 'mes', title: 'MES 映射', width: 190 },
  { key: 'capability', title: '冻结工厂能力证据', width: 360 },
  { key: 'atp', title: 'ATP 证据', width: 300 },
  { key: 'decision', title: '选择说明', width: 300 },
  { key: 'lineage', title: '来源行', width: 220 },
];

function capabilityStatusMeta(value?: null | string) {
  if (value === 'ELIGIBLE') return { color: 'green', label: '可生产' };
  if (value === 'INELIGIBLE') return { color: 'red', label: '不可生产' };
  return { color: 'default', label: value || '未冻结' };
}

function capabilitySnapshotText(
  value?: MesFactorySupplyTaskApi.FactoryCapabilitySnapshot | null,
) {
  return value ? JSON.stringify(value, null, 2) : '';
}

async function load() {
  if (!id.value || !canQuery.value) return;
  const version = ++loadVersion;
  loading.value = true;
  try {
    const result = await getFactorySupplyTask(id.value);
    if (version === loadVersion) detail.value = result;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

function back() {
  void router.push('/mes/factory-supply-task');
}

function openPlan() {
  if (detail.value) {
    void router.push(
      `/fdmwaimao/demand-analysis/detail/${detail.value.sourcePlanId}`,
    );
  }
}

function openContract() {
  if (detail.value) {
    void router.push(
      `/fdmwaimao/contract-order/detail/${detail.value.contractOrderId}`,
    );
  }
}

function constraints() {
  const value = detail.value?.fulfillmentConstraints;
  if (!value) return [];
  return [
    ...(value.packagingRequirements || []).map((text) => ({
      group: '包装',
      text,
    })),
    ...(value.certificationRequirements || []).map((text) => ({
      group: '认证',
      text,
    })),
    ...(value.countryComplianceRequirements || []).map((text) => ({
      group: '国家合规',
      text,
    })),
    ...(value.customerComplianceRequirements || []).map((text) => ({
      group: '客户要求',
      text,
    })),
  ];
}

watch(id, load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      detail
        ? `${detail.sourcePlanNo || detail.sourcePlanId} · ${detail.contractOrderNo || detail.contractOrderId}`
        : '内部工厂供货任务详情'
    "
    :title="detail?.batchNo || '内部工厂供货任务详情'"
  >
    <template #extra>
      <Button @click="back">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Tag v-if="detail" :color="factoryTaskStatusMeta(detail.status).color">
        {{ factoryTaskStatusMeta(detail.status).label }}
      </Tag>
    </template>

    <Alert
      v-if="!canQuery"
      description="缺少 mes:factory-supply-task:query 权限，页面不会请求任务详情。"
      message="无权查看该工厂供货任务"
      show-icon
      type="error"
    />
    <Skeleton v-else-if="loading" active :paragraph="{ rows: 14 }" />
    <Empty v-else-if="!detail" description="任务不存在或已超出当前数据范围" />
    <div v-else class="factory-task-detail">
      <Alert
        description="这里保存的是经人工确认的内部工厂供货任务草稿，不是 MES 正式生产工单。本页面只展示冻结事实和审计证据，不提供直接下达、开工或完工操作。"
        message="DRAFT 边界：尚未下达正式生产工单"
        show-icon
        type="warning"
      />

      <Card size="small" title="来源链路与生成审计">
        <div class="factory-task-detail__lineage">
          <button type="button" @click="openContract">
            <small>合同订单 v{{ detail.contractOrderVersion }}</small>
            <strong>{{
              detail.contractOrderNo || detail.contractOrderId
            }}</strong>
          </button>
          <IconifyIcon icon="lucide:arrow-right" aria-hidden="true" />
          <button type="button" @click="openPlan">
            <small>已确认履约计划 v{{ detail.sourcePlanVersion }}</small>
            <strong>{{ detail.sourcePlanNo || detail.sourcePlanId }}</strong>
          </button>
          <IconifyIcon icon="lucide:arrow-right" aria-hidden="true" />
          <div>
            <small>AI 生成任务 / Proposal</small>
            <strong>
              {{ detail.generationRunId }} /
              {{ detail.generationProposalId }} v{{
                detail.generationProposalVersion
              }}
            </strong>
          </div>
          <IconifyIcon icon="lucide:arrow-right" aria-hidden="true" />
          <div>
            <small>内部工厂任务草稿批次</small>
            <strong>{{ detail.batchNo }}</strong>
          </div>
        </div>
        <Descriptions :column="2" size="small">
          <Descriptions.Item label="来源确认 Hash">
            <span class="factory-task-detail__hash">
              {{ detail.sourceConfirmedHash || '未提供' }}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="当前权威 Hash">
            <span class="factory-task-detail__hash">
              {{ detail.sourceAuthorityHash || '未提供' }}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="原始 Proposal Hash">
            <span class="factory-task-detail__hash">
              {{ detail.generationProposalHash || '未提供' }}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="人工编辑后 Hash">
            <span class="factory-task-detail__hash">
              {{ detail.editedProposalHash || '未提供' }}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="采用模型">
            {{ detail.generationModelId }}
          </Descriptions.Item>
          <Descriptions.Item label="建立人 / 版本">
            {{ detail.createdByUserId }} / v{{ detail.version }}
          </Descriptions.Item>
          <Descriptions.Item label="方案摘要" :span="2">
            {{ detail.proposalSummary || '未填写' }}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="冻结履约约束">
        <Descriptions :column="4" size="small">
          <Descriptions.Item label="贸易术语">
            {{ detail.fulfillmentConstraints.incoterm || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="交付地点">
            {{ detail.fulfillmentConstraints.deliveryLocation || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="履约模式">
            {{ detail.fulfillmentConstraints.fulfillmentMode || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="必须直发">
            {{
              detail.fulfillmentConstraints.directShipRequired === true
                ? '是'
                : detail.fulfillmentConstraints.directShipRequired === false
                  ? '否'
                  : '未提供'
            }}
          </Descriptions.Item>
        </Descriptions>
        <div
          v-if="constraints().length"
          class="factory-task-detail__constraints"
        >
          <Tag
            v-for="(constraint, index) in constraints()"
            :key="`${constraint.group}-${index}`"
            color="blue"
          >
            {{ constraint.group }} · {{ constraint.text }}
          </Tag>
        </div>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="来源合同未提供额外履约约束"
        />
      </Card>

      <Card
        v-for="task in detail.tasks"
        :key="task.id"
        class="factory-task-detail__task"
        size="small"
      >
        <template #title>
          <div class="factory-task-detail__task-title">
            <div>
              <Tag :color="factoryTaskStatusMeta(task.status).color">
                {{ factoryTaskStatusMeta(task.status).label }}
              </Tag>
              <strong>{{ task.taskNo }}</strong>
              <span>
                {{ task.factoryName || task.factoryCode || task.factoryId }} ·
                要求日期 {{ task.requiredDate }}
              </span>
              <span>
                工厂 ID {{ task.factoryId }} · 编码
                {{ task.factoryCode || '未提供' }}
              </span>
            </div>
            <small>
              工厂 v{{ task.factoryVersion }} ·
              {{ task.factoryTimezone || '时区未提供' }}
            </small>
          </div>
        </template>

        <Table
          :columns="lineColumns"
          :data-source="task.lines"
          :pagination="false"
          row-key="id"
          size="small"
          :scroll="{ x: 1530 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'product'">
              <div class="factory-task-detail__stack">
                <strong>
                  第 {{ record.lineNo }} 行 ·
                  {{
                    record.productName || record.productCode || record.productId
                  }}
                </strong>
                <span>
                  产品 {{ record.productId }} · SKU {{ record.skuId }} ·
                  {{ record.productVersionToken || '版本未提供' }}
                </span>
                <strong>{{ record.quantity }} {{ record.unit || '' }}</strong>
                <span>
                  ATP 对比数量
                  {{ record.capacityQuantity ?? '未提供' }}
                  {{ record.capacityUnit || '' }}
                </span>
                <span>
                  单位换算 {{ record.unitConversionFactor ?? '未提供' }} ·
                  {{ record.unitConversionVersion || '版本未提供' }}
                </span>
                <span>
                  换算有效期
                  {{ record.unitConversionEffectiveFrom || '未提供' }} 至
                  {{ record.unitConversionEffectiveUntil || '长期有效' }}
                </span>
                <span>要求日期 {{ record.requiredDate }}</span>
                <span v-if="record.customization">
                  定制：{{ record.customization }}
                </span>
              </div>
            </template>
            <template v-else-if="column.key === 'mes'">
              <div class="factory-task-detail__stack">
                <strong>{{ record.mesItemCode || record.mesItemId }}</strong>
                <span>MES 物料 ID {{ record.mesItemId }}</span>
                <span>映射版本 {{ record.mesMappingVersion || '未提供' }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'capability'">
              <div class="factory-task-detail__stack">
                <Tag
                  :color="
                    capabilityStatusMeta(record.factoryCapabilityStatus).color
                  "
                >
                  {{
                    capabilityStatusMeta(record.factoryCapabilityStatus).label
                  }}
                </Tag>
                <strong>
                  能力 ID {{ record.factoryCapabilityId || '未冻结' }} · v{{
                    record.factoryCapabilityVersion ?? '—'
                  }}
                </strong>
                <span>
                  决策
                  {{ record.factoryCapabilityDecisionCode || '未提供' }}
                </span>
                <span class="factory-task-detail__hash">
                  权威 Hash
                  {{ record.factoryCapabilityAuthorityHash || '未提供' }}
                </span>
                <template v-if="record.factoryCapabilitySnapshot">
                  <span>
                    快照证据模式
                    {{
                      record.factoryCapabilitySnapshot.authority.evidenceMode
                    }}
                    · 覆盖判定
                    {{
                      record.factoryCapabilitySnapshot.coverage.passed
                        ? '通过'
                        : '未通过'
                    }}
                  </span>
                  <details class="factory-task-detail__snapshot">
                    <summary>查看完整冻结快照</summary>
                    <pre>{{
                      capabilitySnapshotText(record.factoryCapabilitySnapshot)
                    }}</pre>
                  </details>
                </template>
                <Alert
                  v-else
                  message="该历史行未保存能力快照"
                  show-icon
                  type="warning"
                />
              </div>
            </template>
            <template v-else-if="column.key === 'atp'">
              <div class="factory-task-detail__stack">
                <Tag :color="atpStatusMeta(record.atpStatus).color">
                  {{ atpStatusMeta(record.atpStatus).label }}
                </Tag>
                <span>
                  可承诺 {{ record.atpAvailableQuantity ?? '未提供' }}
                  {{ record.atpUnitCode || '' }} · 已预留
                  {{ record.atpReservedQuantity ?? '未提供' }}
                  {{ record.atpUnitCode || '' }}
                </span>
                <span>
                  有效入库 {{ record.atpEligibleInboundQuantity ?? '未提供' }}
                  {{ record.atpUnitCode || '' }} · 承诺截止
                  {{ record.atpPromiseThroughDate || '未提供' }}
                </span>
                <span>
                  {{ record.atpSourceSystem || '来源未提供' }} /
                  {{ record.atpSourceVersion || '版本未提供' }}
                </span>
                <span>
                  产品版本 {{ record.atpProductVersionToken || '未提供' }} ·
                  发布序列
                  {{ record.atpSourceSequence || '未提供' }}
                </span>
                <span class="factory-task-detail__hash">
                  载荷 {{ record.atpSourcePayloadHash || '未提供' }}
                </span>
                <span>证据有效期 {{ record.atpValidUntil || '未提供' }}</span>
                <span>证据数据时间 {{ record.atpDataTime || '未提供' }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'decision'">
              <div class="factory-task-detail__stack">
                <Tag
                  :color="
                    record.confidence === 'HIGH'
                      ? 'green'
                      : record.confidence === 'MEDIUM'
                        ? 'orange'
                        : 'red'
                  "
                >
                  信心 {{ record.confidence }}
                </Tag>
                <span>{{ record.selectionReason || '未填写选择理由' }}</span>
                <div>
                  <Tag
                    v-for="risk in record.riskCodes"
                    :key="risk"
                    color="orange"
                  >
                    {{ risk }}
                  </Tag>
                  <span v-if="!record.riskCodes.length">无风险代码</span>
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'lineage'">
              <div class="factory-task-detail__stack">
                <span>履约计划行 {{ record.sourcePlanLineId }}</span>
                <span>内部工厂分配 {{ record.sourceAllocationId }}</span>
                <span>合同产品行 {{ record.sourceOrderLineId }}</span>
                <span>任务明细 {{ record.id }}</span>
                <span>
                  分配证据 {{ record.allocationEvidenceStatus || '未提供' }} ·
                  {{ record.allocationEvidenceSourceSystem || '来源未提供' }} /
                  {{ record.allocationEvidenceSourceVersion || '版本未提供' }}
                </span>
                <span>
                  证据引用
                  {{ record.allocationEvidenceSourceRefId || '未提供' }} ·
                  有效期 {{ record.allocationEvidenceValidUntil || '未提供' }}
                </span>
                <span>
                  {{ record.allocationEvidenceSourceName || '来源名称未提供' }}
                  · 取证时间 {{ record.allocationEvidenceTime || '未提供' }}
                </span>
                <span>
                  数量上限
                  {{ record.allocationEvidenceQuantityUpperBound ?? '未提供' }}
                  {{ record.unit || '' }} · 核实人
                  {{ record.allocationEvidenceByUserId || '系统证据' }}
                </span>
                <span v-if="record.allocationEvidenceNote">
                  核实说明：{{ record.allocationEvidenceNote }}
                </span>
              </div>
            </template>
          </template>
          <template #emptyText>
            <Empty description="该工厂任务没有明细" />
          </template>
        </Table>
      </Card>

      <Empty
        v-if="!detail.tasks.length"
        description="该批次没有工厂任务，数据不完整"
      />
    </div>
  </Page>
</template>

<style scoped>
.factory-task-detail {
  display: grid;
  gap: 14px;
}

.factory-task-detail__lineage {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)
    auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.factory-task-detail__lineage button,
.factory-task-detail__lineage > div {
  display: grid;
  gap: 4px;
  min-height: 72px;
  padding: 12px;
  text-align: left;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.factory-task-detail__lineage button {
  cursor: pointer;
}

.factory-task-detail__lineage small,
.factory-task-detail__task-title span,
.factory-task-detail__task-title small,
.factory-task-detail__stack span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.factory-task-detail__hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.factory-task-detail__constraints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.factory-task-detail__task-title,
.factory-task-detail__task-title > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.factory-task-detail__task-title {
  justify-content: space-between;
}

.factory-task-detail__stack {
  display: grid;
  gap: 4px;
}

.factory-task-detail__snapshot summary {
  font-size: 12px;
  color: #1677ff;
  cursor: pointer;
}

.factory-task-detail__snapshot pre {
  max-height: 280px;
  padding: 8px;
  margin: 6px 0 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--muted) / 45%);
  border-radius: 6px;
}

@media (max-width: 900px) {
  .factory-task-detail__lineage {
    grid-template-columns: 1fr;
  }

  .factory-task-detail__lineage > svg {
    margin: 0 auto;
    transform: rotate(90deg);
  }
}
</style>
