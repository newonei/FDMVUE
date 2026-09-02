<script lang="ts" setup>
import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';

import { computed } from 'vue';

import { Alert, Descriptions, Tag } from 'ant-design-vue';

defineOptions({ name: 'FdmProcurementRequisitionSourcePlan' });

const props = defineProps<{
  snapshotHash?: string;
  source?: FdmProcurementRequisitionApi.GenerationSource;
}>();

const shortHash = computed(() => {
  const value = props.snapshotHash || props.source?.sourceSnapshotHash || '';
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
});
</script>

<template>
  <div v-if="source" class="requisition-source">
    <Descriptions :column="1" size="small">
      <Descriptions.Item label="计划编号">
        {{ source.fulfillmentPlanNo || source.fulfillmentPlanId }}
      </Descriptions.Item>
      <Descriptions.Item label="状态 / 版本">
        <Tag color="green">{{ source.status }}</Tag>
        v{{ source.version }}
      </Descriptions.Item>
      <Descriptions.Item label="数据公司">
        {{ source.companyName || source.companyId || '未提供' }}
      </Descriptions.Item>
      <Descriptions.Item label="来源合同">
        {{ source.orderNo || source.orderId || '未提供' }}
      </Descriptions.Item>
      <Descriptions.Item label="要求日期">
        {{ source.requiredDate || '未提供' }}
      </Descriptions.Item>
      <Descriptions.Item label="快照 Hash">
        <code>{{ shortHash || '未提供' }}</code>
      </Descriptions.Item>
    </Descriptions>

    <Alert
      description="产品身份、来源行、已确认外采数量和定制要求为权威快照，前端不允许修改。"
      message="权威来源锁定"
      show-icon
      type="info"
    />

    <section class="requisition-source__lines">
      <article v-for="line in source.lines" :key="line.sourcePlanLineId">
        <header>
          <span>{{ line.lineNo || '—' }}</span>
          <div>
            <strong>{{ line.productName }}</strong>
            <small>
              {{ line.productCode || '无编码' }} ·
              {{ line.specification || '无规格' }}
            </small>
          </div>
        </header>
        <dl>
          <div>
            <dt>已确认外采</dt>
            <dd>{{ line.externalPurchaseQuantity }} {{ line.unit }}</dd>
          </div>
          <div>
            <dt>要求日期</dt>
            <dd>{{ line.requiredDate || source.requiredDate || '未提供' }}</dd>
          </div>
          <div>
            <dt>产品映射</dt>
            <dd>
              <Tag
                :color="
                  line.productMappingStatus === 'MAPPED' ? 'green' : 'orange'
                "
              >
                {{ line.productMappingStatus || 'UNKNOWN' }}
              </Tag>
            </dd>
          </div>
        </dl>
        <p v-if="line.customizationSnapshot">
          <b>定制要求：</b>{{ line.customizationSnapshot }}
        </p>
        <small class="requisition-source__identity">
          计划行 {{ line.sourcePlanLineId }}
          <template v-if="line.sourceContractLineId">
            · 合同行 {{ line.sourceContractLineId }}
          </template>
        </small>
      </article>
    </section>
  </div>
</template>

<style scoped>
.requisition-source {
  display: grid;
  gap: 14px;
}

.requisition-source code {
  font-size: 11px;
  word-break: break-all;
}

.requisition-source__lines {
  display: grid;
  gap: 10px;
}

.requisition-source__lines article {
  display: grid;
  gap: 9px;
  padding: 11px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
}

.requisition-source__lines header {
  display: flex;
  gap: 9px;
  align-items: flex-start;
}

.requisition-source__lines header > span {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 7px;
}

.requisition-source__lines header > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.requisition-source__lines small,
.requisition-source__lines dt,
.requisition-source__identity {
  font-size: 11px;
  color: #64748b;
}

.requisition-source__lines dl {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin: 0;
}

.requisition-source__lines dl > div {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.requisition-source__lines dd {
  margin: 0;
  text-align: right;
}

.requisition-source__lines p {
  padding: 7px 8px;
  margin: 0;
  font-size: 11px;
  color: #475569;
  background: #f8fafc;
  border-radius: 6px;
}
</style>
