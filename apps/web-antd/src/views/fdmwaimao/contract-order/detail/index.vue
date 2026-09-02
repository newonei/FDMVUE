<script lang="ts" setup>
import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type { RelationChainDocument } from '#/views/fdm-trade-shared/components';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Modal, Spin, Tag } from 'ant-design-vue';

import {
  cancelContractOrder,
  confirmContractOrder,
  getContractOrder,
} from '#/api/fdmwaimao/contract-order';
import { getDemandPlanSummaryByOrder } from '#/api/fdmwaimao/demand-plan';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import { RelationChainCard } from '#/views/fdm-trade-shared/components';

import ContractOrderDetail from '../components/ContractOrderDetail.vue';
import { buildContractFulfillmentContext } from '../form-model';

defineOptions({ name: 'FdmWaimaoContractOrderDetail' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const order = ref<FdmWaimaoContractOrderApi.ContractDetail>();
const demandPlanSummary = ref<FdmWaimaoDemandPlanApi.OrderSummary>();
const demandPlanSummaryError = ref(false);
const demandPlanSummaryLoading = ref(false);
const loading = ref(false);
const transitioning = ref(false);
const cancelOpen = ref(false);
const cancelReason = ref('');
let loadRequestId = 0;

const orderId = computed(() => String(route.params.id || ''));
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:update']),
);
const canConfirm = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:confirm']),
);
const canCancel = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:cancel']),
);
const canCreateReceipt = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-record:create']),
);
const canCreateConsumption = computed(() =>
  hasAccessByCodes(['fdmwaimao:consumption-record:create']),
);
const canQueryDemandPlan = computed(() =>
  hasAccessByCodes(['fdmwaimao:demand-plan:query']),
);
const canGenerateDemandPlan = computed(() =>
  [
    'fdmwaimao:ai:use',
    'fdmwaimao:contract-order:query',
    'fdmwaimao:demand-plan:create',
    'fdmwaimao:demand-plan:generate',
    'fdmwaimao:demand-plan:query',
    'fdmdocflow:generation:query',
    'fdmdocflow:generation:create',
    'fdmdocflow:generation:retry',
  ].every((code) => hasAccessByCodes([code])),
);
const canUpdateDemandPlan = computed(() =>
  hasAccessByCodes(['fdmwaimao:demand-plan:update']),
);
const canEditDemandPlan = computed(
  () => canQueryDemandPlan.value && canUpdateDemandPlan.value,
);
const fulfillmentContext = computed(() =>
  order.value ? buildContractFulfillmentContext(order.value) : undefined,
);
const confirmationReady = computed(
  () => fulfillmentContext.value?.confirmationReady === true,
);

function demandPlanDescription(editable: boolean, canEdit: boolean) {
  if (!editable) return '已关联真实需求计划，可打开查看履约拆分。';
  if (canEdit) return '已有草稿，继续审阅时会保留人工修改字段。';
  return '已有草稿；当前账号可查看，但不能修改。';
}

const demandPlanDocument = computed<RelationChainDocument[]>(() => {
  const summary = demandPlanSummary.value;
  if (!summary?.latestPlanId) return [];
  return [
    {
      key: summary.latestPlanId,
      status: demandPlanStatusLabel(summary.latestPlanStatus),
      statusTone: demandPlanStatusTone(summary.latestPlanStatus),
      subtitle: `修订 R${summary.latestRevisionNo || 1}`,
      title: summary.latestPlanNo || '履约需求计划',
    },
  ];
});
const demandPlanCard = computed(() => {
  if (order.value?.status !== 'CONFIRMED') {
    return {
      description: '合同确认并冻结产品快照后，才能生成履约需求计划。',
      disabled: true,
      primaryActionLabel: undefined,
      status: '等待合同确认',
      statusTone: 'default' as const,
    };
  }
  if (!canQueryDemandPlan.value) {
    return {
      description: '当前账号没有需求计划查看权限。',
      disabled: true,
      primaryActionLabel: undefined,
      status: '无查看权限',
      statusTone: 'default' as const,
    };
  }
  if (demandPlanSummaryLoading.value) {
    return {
      description: '正在读取真实需求计划关联状态。',
      disabled: true,
      primaryActionLabel: undefined,
      status: '读取中',
      statusTone: 'processing' as const,
    };
  }
  if (demandPlanSummaryError.value) {
    return {
      description: '需求计划摘要读取失败，合同详情本身不受影响；刷新后可重试。',
      disabled: true,
      primaryActionLabel: undefined,
      status: '关联状态暂不可用',
      statusTone: 'warning' as const,
    };
  }
  const summary = demandPlanSummary.value;
  if (!summary?.latestPlanId) {
    return {
      description: '尚无计划。AI 将基于此合同的权威快照生成可编辑建议。',
      disabled: !canGenerateDemandPlan.value,
      primaryActionLabel: canGenerateDemandPlan.value
        ? 'AI 生成需求计划'
        : undefined,
      status: '尚未生成',
      statusTone: 'info' as const,
    };
  }
  const editable = summary.latestPlanStatus === 'DRAFT';
  return {
    description: demandPlanDescription(editable, canEditDemandPlan.value),
    disabled: !canQueryDemandPlan.value,
    primaryActionLabel:
      editable && canEditDemandPlan.value ? '继续编辑需求计划' : '查看需求计划',
    status: demandPlanStatusLabel(summary.latestPlanStatus),
    statusTone: demandPlanStatusTone(summary.latestPlanStatus),
  };
});

useFdmWaimaoAiContext(() => ({
  businessId: orderId.value,
  context: {
    loading: loading.value,
    record: order.value,
    fulfillmentConstraints: fulfillmentContext.value,
  },
  contextMode: 'detail',
  entityLabel: order.value
    ? `${order.value.orderNo} · ${order.value.subject}`
    : undefined,
  surfaceKey: 'contract-order',
}));

async function load() {
  const id = orderId.value;
  if (!id) return;
  const requestId = ++loadRequestId;
  loading.value = true;
  order.value = undefined;
  demandPlanSummary.value = undefined;
  demandPlanSummaryError.value = false;
  try {
    const result = await getContractOrder(id);
    if (requestId === loadRequestId && orderId.value === id) {
      order.value = result;
      if (canQueryDemandPlan.value) {
        void loadDemandPlanSummary(id, requestId);
      }
    }
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

async function loadDemandPlanSummary(id: string, requestId: number) {
  demandPlanSummaryLoading.value = true;
  demandPlanSummaryError.value = false;
  try {
    const result = await getDemandPlanSummaryByOrder(id);
    if (requestId === loadRequestId && orderId.value === id) {
      demandPlanSummary.value = result;
    }
  } catch {
    if (requestId === loadRequestId && orderId.value === id) {
      demandPlanSummaryError.value = true;
    }
  } finally {
    if (requestId === loadRequestId) demandPlanSummaryLoading.value = false;
  }
}

function demandPlanStatusLabel(
  status?: FdmWaimaoDemandPlanApi.DemandPlanStatus | null,
) {
  if (status === 'CONFIRMED') return '已确认';
  if (status === 'NEEDS_REPLAN') return '需要重排';
  if (status === 'VOIDED') return '已作废';
  if (status === 'AI_DRAFT') return 'AI 草稿';
  return '草稿';
}

function demandPlanStatusTone(
  status?: FdmWaimaoDemandPlanApi.DemandPlanStatus | null,
) {
  if (status === 'CONFIRMED') return 'success' as const;
  if (status === 'NEEDS_REPLAN') return 'warning' as const;
  if (status === 'VOIDED') return 'default' as const;
  return 'processing' as const;
}

function openDemandPlan() {
  const current = order.value;
  const summary = demandPlanSummary.value;
  if (
    !current ||
    demandPlanSummaryError.value ||
    demandPlanSummaryLoading.value
  ) {
    return;
  }
  if (!summary?.latestPlanId) {
    if (current.status === 'CONFIRMED' && canGenerateDemandPlan.value) {
      void router.push({
        path: '/fdmwaimao/demand-analysis/create',
        query: { orderId: current.id },
      });
    }
    return;
  }
  const path =
    summary.latestPlanStatus === 'DRAFT' && canEditDemandPlan.value
      ? `/fdmwaimao/demand-analysis/edit/${summary.latestPlanId}`
      : `/fdmwaimao/demand-analysis/detail/${summary.latestPlanId}`;
  void router.push(path);
}

function backToList() {
  void router.push('/fdmwaimao/contract-order');
}

function editOrder() {
  if (!order.value) return;
  void router.push(`/fdmwaimao/contract-order/edit/${order.value.id}`);
}

function createReceipt() {
  if (!order.value) return;
  void router.push({
    path: '/fdmwaimao/receipt-record/create',
    query: { orderId: order.value.id, type: 'receipt' },
  });
}

function createConsumption() {
  if (!order.value) return;
  void router.push({
    path: '/fdmwaimao/receipt-record/consumption/create',
    query: { orderId: order.value.id, type: 'consumption' },
  });
}

function statusLabel(status?: FdmWaimaoContractOrderApi.OrderStatus) {
  if (status === 'CONFIRMED') return '已确认';
  if (status === 'CANCELLED') return '已取消';
  return '草稿';
}

function statusColor(status?: FdmWaimaoContractOrderApi.OrderStatus) {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELLED') return 'default';
  return 'processing';
}

function openCancel() {
  cancelReason.value = '';
  cancelOpen.value = true;
}

function confirmOrder() {
  const current = order.value;
  if (!current) return;
  const firstIssue = fulfillmentContext.value?.confirmationIssues[0];
  if (!confirmationReady.value) {
    message.warning(firstIssue?.message || '请先完善合同的履约与合规约束');
    return;
  }
  Modal.confirm({
    content:
      '确认后合同内容、产品成交快照及履约合规约束将冻结，之后才能登记回款或消费冲销。',
    okText: '确认合同',
    title: `确认合同 ${current.orderNo}？`,
    async onOk() {
      transitioning.value = true;
      try {
        await confirmContractOrder({
          expectedVersion: current.version,
          id: current.id,
        });
        await load();
        message.success('合同已确认，现可登记回款或消费记录');
      } finally {
        transitioning.value = false;
      }
    },
  });
}

async function cancelOrder() {
  const current = order.value;
  const reason = cancelReason.value.trim();
  if (!current) return;
  if (!reason) {
    message.warning('请填写取消原因');
    return;
  }
  transitioning.value = true;
  try {
    await cancelContractOrder({
      expectedVersion: current.version,
      id: current.id,
      reason,
    });
    cancelOpen.value = false;
    await load();
    message.success('合同草稿已取消');
  } finally {
    transitioning.value = false;
  }
}

watch(orderId, load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="order?.orderNo || '合同订单详情'"
    :title="order?.subject || '合同订单详情'"
  >
    <template #extra>
      <Button @click="backToList">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Tag :color="statusColor(order?.status)">
        {{ statusLabel(order?.status) }}
      </Tag>
      <Button
        v-if="canCreateReceipt && order?.status === 'CONFIRMED'"
        @click="createReceipt"
      >
        <template #icon>
          <IconifyIcon icon="lucide:landmark" aria-hidden="true" />
        </template>
        登记回款
      </Button>
      <Button
        v-if="canCreateConsumption && order?.status === 'CONFIRMED'"
        @click="createConsumption"
      >
        <template #icon>
          <IconifyIcon icon="lucide:receipt-text" aria-hidden="true" />
        </template>
        记消费
      </Button>
      <Button
        v-if="canConfirm && order?.status === 'DRAFT'"
        :disabled="transitioning || !confirmationReady"
        :loading="transitioning"
        :title="
          confirmationReady
            ? undefined
            : fulfillmentContext?.confirmationIssues[0]?.message ||
              '请先完善履约与合规约束'
        "
        type="primary"
        @click="confirmOrder"
      >
        确认合同
      </Button>
      <Button
        v-if="canCancel && order?.status === 'DRAFT'"
        :disabled="transitioning"
        @click="openCancel"
      >
        取消合同
      </Button>
      <Button v-if="canUpdate && order?.status === 'DRAFT'" @click="editOrder">
        <template #icon>
          <IconifyIcon icon="lucide:pencil" aria-hidden="true" />
        </template>
        编辑草稿
      </Button>
    </template>

    <Spin :spinning="loading">
      <ContractOrderDetail :order="order">
        <template #aside>
          <RelationChainCard
            v-if="order"
            :description="demandPlanCard.description"
            :disabled="demandPlanCard.disabled"
            :documents="demandPlanDocument"
            empty-document-text="尚未建立需求计划"
            icon="lucide:route"
            open-label="打开计划链路"
            :primary-action-label="demandPlanCard.primaryActionLabel"
            :status="demandPlanCard.status"
            :status-tone="demandPlanCard.statusTone"
            title="履约需求计划"
            @document="openDemandPlan"
            @open="openDemandPlan"
            @primary-action="openDemandPlan"
          />
        </template>
      </ContractOrderDetail>
    </Spin>

    <Modal
      v-model:open="cancelOpen"
      :confirm-loading="transitioning"
      ok-text="确认取消"
      title="取消合同草稿"
      @ok="cancelOrder"
    >
      <p>取消后不可恢复，也不能再登记回款或消费记录。</p>
      <Input.TextArea
        v-model:value="cancelReason"
        :auto-size="{ minRows: 3, maxRows: 6 }"
        :maxlength="500"
        placeholder="请填写取消原因（必填）"
        show-count
      />
    </Modal>
  </Page>
</template>
