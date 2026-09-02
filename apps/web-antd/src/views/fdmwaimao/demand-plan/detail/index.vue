<script lang="ts" setup>
import type { DemandPlanFormModel } from '../form-model';

import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';

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
  message,
  Modal,
  Skeleton,
  Statistic,
  Tag,
  Timeline,
} from 'ant-design-vue';

import { createRequisitionFromSource } from '#/api/fdmprocurement/requisition';
import { getDemandPlan } from '#/api/fdmwaimao/demand-plan';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import { createAiFieldStateMap } from '#/views/fdm-trade-shared/ai-document-generation';
import { TradeBusinessLink } from '#/views/fdm-trade-shared/components';
import {
  fdmTradeDocumentRoute,
  fdmTradeShipmentListRoute,
} from '#/views/fdm-trade-shared/document-links';
import { requisitionGenerationRouteQuery } from '#/views/fdmprocurement/requisition/generation-route';
import FdmWaimaoAttachmentList from '#/views/fdmwaimao/components/FdmWaimaoAttachmentList.vue';
import SupplyTaskGenerationDrawer from '#/views/fdmfactory/supply-task/components/SupplyTaskGenerationDrawer.vue';
import { canGenerateSupplyTask } from '#/views/fdmfactory/supply-task/generation-policy';

import DemandPlanLineEditor from '../components/DemandPlanLineEditor.vue';
import { detailToForm } from '../form-model';
import { demandPlanDetailFieldMetas } from '../generation-adapter';

defineOptions({ name: 'FdmWaimaoDemandPlanDetail' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const detail = ref<FdmWaimaoDemandPlanApi.Detail>();
const form = ref<DemandPlanFormModel>();
const loading = ref(false);
const creatingSourceRequisition = ref(false);
const supplyTaskGenerationOpen = ref(false);
let requestVersion = 0;

const planId = computed(() => String(route.params.id || ''));
const fields = computed(() =>
  createAiFieldStateMap(
    detail.value ? demandPlanDetailFieldMetas(detail.value) : [],
  ),
);
const canUpdate = computed(
  () =>
    detail.value?.status === 'DRAFT' &&
    hasAccessByCodes(['fdmwaimao:demand-plan:update']),
);
const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);
const canQueryContract = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:query']),
);
const canQueryShipment = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:query']),
);
const canGenerateRequisition = computed(
  () =>
    detail.value?.status === 'CONFIRMED' &&
    [
      'fdmprocurement:requisition:query',
      'fdmprocurement:requisition:create',
      'fdmprocurement:requisition:ai-generate',
      'fdmdocflow:generation:query',
      'fdmdocflow:generation:create',
      'fdmdocflow:generation:retry',
    ].every((code) => hasAccessByCodes([code])),
);
const canCreateSourceRequisition = computed(
  () =>
    detail.value?.status === 'CONFIRMED' &&
    [
      'fdmprocurement:requisition:query',
      'fdmprocurement:requisition:create',
    ].every((code) => hasAccessByCodes([code])),
);
const canGenerateSupply = computed(() =>
  canGenerateSupplyTask(detail.value, (code) =>
    hasAccessByCodes([code]),
  ),
);

useFdmWaimaoAiContext(() => ({
  businessId: planId.value,
  context: {
    loading: loading.value,
    record: detail.value,
  },
  contextMode: 'detail',
  entityLabel: detail.value?.planNo,
  surfaceKey: 'demand-plan',
}));

function statusLabel(status?: FdmWaimaoDemandPlanApi.DemandPlanStatus) {
  if (status === 'CONFIRMED') return '已确认';
  if (status === 'NEEDS_REPLAN') return '需要重排';
  if (status === 'VOIDED') return '已作废';
  if (status === 'AI_DRAFT') return 'AI 草稿';
  return '草稿';
}

function statusColor(status?: FdmWaimaoDemandPlanApi.DemandPlanStatus) {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'NEEDS_REPLAN') return 'orange';
  if (status === 'VOIDED') return 'default';
  return 'blue';
}

async function load() {
  const id = planId.value;
  if (!id) return;
  const version = ++requestVersion;
  loading.value = true;
  try {
    const result = await getDemandPlan(id);
    if (version !== requestVersion) return;
    detail.value = result;
    form.value = detailToForm(result);
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function edit() {
  if (detail.value) {
    void router.push(`/fdmwaimao/demand-analysis/edit/${detail.value.id}`);
  }
}

function openContract() {
  if (detail.value && canQueryContract.value) {
    void router.push(
      `/fdmwaimao/contract-order/detail/${detail.value.contractOrderId}`,
    );
  }
}

function openShipments() {
  if (!detail.value || !canQueryShipment.value) return;
  void router.push(
    fdmTradeShipmentListRoute({
      fulfillmentPlanId: detail.value.id,
      fulfillmentPlanNo: detail.value.planNo,
    }),
  );
}

function generateRequisition() {
  if (!detail.value || !canGenerateRequisition.value) return;
  void router.push({
    path: '/fdmprocurement/requisition/generate',
    query: requisitionGenerationRouteQuery(
      detail.value.id,
      detail.value.version,
    ),
  });
}

function createSourceRequisition() {
  if (!detail.value || !canCreateSourceRequisition.value) return;
  const source = detail.value;
  Modal.confirm({
    content:
      '系统会重新读取已确认履约计划，只把 EXTERNAL_PURCHASE（外部采购）数量带入采购申请草稿。库存和内部工厂数量不会进入采购申请，创建后仍需人工审阅与预检。',
    okText: '建立草稿',
    title: '按权威来源建立采购申请草稿？',
    async onOk() {
      creatingSourceRequisition.value = true;
      try {
        const result = await createRequisitionFromSource({
          expectedPlanVersion: source.version,
          fulfillmentPlanId: source.id,
          idempotencyKey: `source-plan-${source.id}-v${source.version}`,
          remark: `由履约计划 ${source.planNo} 的已确认外采分配建立`,
        });
        message.success(
          result.created === false
            ? '已打开该履约计划的现有采购申请'
            : '采购申请草稿已建立',
        );
        await router.push(`/fdmprocurement/requisition/detail/${result.id}`);
      } finally {
        creatingSourceRequisition.value = false;
      }
    },
  });
}

function generateSupplyTask() {
  if (!canGenerateSupply.value) return;
  supplyTaskGenerationOpen.value = true;
}

function back() {
  void router.push('/fdmwaimao/demand-analysis');
}

watch(planId, load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      detail
        ? `${detail.contractOrderNo} · ${detail.contractSubject}`
        : '履约需求计划详情'
    "
    :title="detail?.planNo || '履约需求计划详情'"
  >
    <template #extra>
      <Button @click="back">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Tag :color="statusColor(detail?.status)">
        {{ statusLabel(detail?.status) }}
      </Tag>
      <Button v-if="canQueryContract" @click="openContract">
        查看来源合同
      </Button>
      <Button v-if="canQueryShipment" @click="openShipments">查看发货单</Button>
      <Button
        v-if="canGenerateRequisition"
        type="primary"
        @click="generateRequisition"
      >
        <template #icon>
          <IconifyIcon icon="lucide:sparkles" aria-hidden="true" />
        </template>
        AI 生成采购申请
      </Button>
      <Button
        v-if="canCreateSourceRequisition"
        :loading="creatingSourceRequisition"
        @click="createSourceRequisition"
      >
        <template #icon>
          <IconifyIcon icon="lucide:file-plus-2" aria-hidden="true" />
        </template>
        按来源建立采购草稿
      </Button>
      <Button
        v-if="canGenerateSupply"
        type="primary"
        @click="generateSupplyTask"
      >
        <template #icon>
          <IconifyIcon icon="lucide:factory" aria-hidden="true" />
        </template>
        AI 生成工厂任务
      </Button>
      <Button v-if="canUpdate" type="primary" @click="edit">
        <template #icon>
          <IconifyIcon icon="lucide:pencil" aria-hidden="true" />
        </template>
        审阅并编辑
      </Button>
    </template>

    <Skeleton v-if="loading" active :paragraph="{ rows: 12 }" />
    <Empty
      v-else-if="!detail || !form"
      description="需求计划不存在或无权查看"
    />
    <div v-else class="demand-plan-detail">
      <Alert
        v-if="detail.status === 'NEEDS_REPLAN'"
        message="来源合同已变化，本计划需要重新生成或调整"
        show-icon
        type="warning"
      />
      <Alert
        v-if="detail.unknownAllocationCount"
        :message="`${detail.unknownAllocationCount} 个分配数量仍为 UNKNOWN；详情不会将未知值显示为 0。`"
        show-icon
        type="warning"
      />

      <section class="demand-plan-detail__metrics">
        <Card size="small">
          <Statistic title="产品行" :value="detail.lineCount" />
        </Card>
        <Card size="small">
          <Statistic title="未知分配" :value="detail.unknownAllocationCount" />
        </Card>
        <Card size="small">
          <Statistic title="数量不平" :value="detail.unbalancedLineCount" />
        </Card>
        <Card size="small">
          <Statistic title="产品未映射" :value="detail.unmappedLineCount" />
        </Card>
      </section>

      <Card title="计划与来源" size="small">
        <Descriptions :column="3" size="small">
          <Descriptions.Item label="计划编号">
            {{ detail.planNo }}
          </Descriptions.Item>
          <Descriptions.Item label="修订版本">
            R{{ detail.revisionNo }}
          </Descriptions.Item>
          <Descriptions.Item label="数据版本">
            {{ detail.version }}
          </Descriptions.Item>
          <Descriptions.Item label="创建方式">
            {{
              detail.creationMode === 'RULE'
                ? '确定性规则'
                : detail.creationMode === 'MANUAL'
                  ? '纯人工'
                  : 'AI 建议'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="来源合同">
            <TradeBusinessLink
              :disabled="!canQueryContract"
              :to="
                canQueryContract
                  ? fdmTradeDocumentRoute(
                      'contract-order',
                      detail.contractOrderId,
                    )
                  : undefined
              "
            >
              {{ detail.contractOrderNo }}
            </TradeBusinessLink>
          </Descriptions.Item>
          <Descriptions.Item label="客户">
            <TradeBusinessLink
              :disabled="!canQueryCustomer"
              :to="
                canQueryCustomer && detail.customerId
                  ? fdmTradeDocumentRoute('customer', detail.customerId)
                  : undefined
              "
            >
              {{ detail.customerName || '未提供' }}
            </TradeBusinessLink>
          </Descriptions.Item>
          <Descriptions.Item label="负责人">
            {{ detail.ownerUserName || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="客户要求交期">
            {{ detail.customerRequiredDeliveryDate || '未提供' }}
          </Descriptions.Item>
          <Descriptions.Item label="生成模型">
            {{
              detail.generationModelName ||
              detail.generationModelCode ||
              '未记录'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="下游就绪">
            <Tag :color="detail.downstreamReady ? 'green' : 'orange'">
              {{ detail.downstreamReady ? '已就绪' : '未就绪' }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="计划备注" :span="3">
            {{ detail.remark || '未填写' }}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <section class="demand-plan-detail__lines">
        <header>
          <div>
            <h2>履约需求拆分</h2>
            <p>库存、内部工厂、外部采购三类分配均来自已保存的真实计划。</p>
          </div>
          <Tag>{{ form.lines.length }} 行</Tag>
        </header>
        <DemandPlanLineEditor
          v-for="line in form.lines"
          :key="line.sourceContractOrderItemId"
          :fields="fields"
          :line="line"
          readonly
        />
      </section>

      <Card title="单据附件" size="small">
        <FdmWaimaoAttachmentList
          :business-id="detail.id"
          business-type="FULFILLMENT_PLAN"
        />
      </Card>

      <Card title="变更记录" size="small">
        <Timeline v-if="detail.events.length">
          <Timeline.Item v-for="event in detail.events" :key="event.id">
            <strong>{{ event.eventType }}</strong>
            <p>
              {{
                event.detailSummary ||
                `${event.fromStatus || '—'} → ${event.toStatus || '—'}`
              }}
            </p>
            <small>
              {{ event.actorUserName || '系统' }} ·
              {{ event.occurredTime || '时间未记录' }}
            </small>
          </Timeline.Item>
        </Timeline>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="暂无变更记录"
        />
      </Card>
    </div>

    <SupplyTaskGenerationDrawer
      v-model:open="supplyTaskGenerationOpen"
      :plan="detail"
    />
  </Page>
</template>

<style scoped>
.demand-plan-detail {
  display: grid;
  gap: 14px;
}

.demand-plan-detail__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.demand-plan-detail__lines {
  display: grid;
  gap: 12px;
}

.demand-plan-detail__lines > header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.demand-plan-detail__lines h2 {
  margin: 0 0 2px;
  font-size: 18px;
}

.demand-plan-detail__lines p,
.demand-plan-detail :deep(.ant-timeline-item-content p),
.demand-plan-detail :deep(.ant-timeline-item-content small) {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 800px) {
  .demand-plan-detail__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
