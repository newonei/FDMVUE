<script lang="ts" setup>
import type {
  DemandPlanFormAllocation,
  DemandPlanFormLine,
} from '../form-model';

import type { AiFieldStateMap } from '#/views/fdm-trade-shared/ai-document-generation';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Input, Select, Tag, Tooltip } from 'ant-design-vue';

import { AiFieldMetaBadge } from '#/views/fdm-trade-shared/ai-document-generation';

import {
  allocationTypeLabel,
  demandPlanAllocatedQuantity,
  demandPlanAllocationFieldKey,
  demandPlanLineFieldKey,
  displayKnownQuantity,
  isDemandPlanLineBalanced,
} from '../form-model';

defineOptions({ name: 'FdmWaimaoDemandPlanLineEditor' });

const props = withDefaults(
  defineProps<{
    fields?: AiFieldStateMap;
    line: DemandPlanFormLine;
    readonly?: boolean;
  }>(),
  {
    fields: () => ({}),
    readonly: false,
  },
);

const emit = defineEmits<{
  edit: [fieldKey: string, value: string];
}>();

const allocated = computed(() => demandPlanAllocatedQuantity(props.line));
const unknownCount = computed(
  () => props.line.allocations.filter((item) => !item.quantity.trim()).length,
);
const balanced = computed(() => isDemandPlanLineBalanced(props.line));
const humanEvidenceSourceOptions = [
  { label: '人工核查', value: 'MANUAL_CHECK' },
  { label: 'WAREHOUSE 截图', value: 'WAREHOUSE_SCREENSHOT' },
  { label: 'ERP 截图', value: 'ERP_SCREENSHOT' },
  { label: '供应商确认', value: 'SUPPLIER_CONFIRMATION' },
  { label: '工厂确认', value: 'FACTORY_CONFIRMATION' },
  { label: '仓库确认', value: 'WAREHOUSE_CONFIRMATION' },
];

type AllocationEditableField =
  | 'changeReason'
  | 'evidenceNote'
  | 'evidenceSourceRefId'
  | 'evidenceSourceSystem'
  | 'evidenceSourceVersion'
  | 'evidenceValidUntil'
  | 'quantity'
  | 'recommendationReason';

function safeId(fieldKey: string) {
  return `demand-field-${fieldKey.replaceAll(/[^A-Za-z0-9_-]/g, '-')}`;
}

function lineKey(field: 'decisionNote' | 'requiredDate') {
  return demandPlanLineFieldKey(props.line.sourceContractOrderItemId, field);
}

function allocationKey(
  allocation: DemandPlanFormAllocation,
  field: AllocationEditableField,
) {
  return demandPlanAllocationFieldKey(
    props.line.sourceContractOrderItemId,
    allocation.type,
    field,
  );
}

function editLine(field: 'decisionNote' | 'requiredDate', value: unknown) {
  const normalized = String(value ?? '');
  emit('edit', lineKey(field), normalized);
}

function editAllocation(
  allocation: DemandPlanFormAllocation,
  field: AllocationEditableField,
  value: unknown,
) {
  const normalized = String(value ?? '');
  emit('edit', allocationKey(allocation, field), normalized);
}

function requiresHumanEvidence(allocation: DemandPlanFormAllocation) {
  if (!allocation.quantity.trim()) return false;
  const quantityField = props.fields[allocationKey(allocation, 'quantity')];
  return (
    quantityField?.origin === 'HUMAN_EDIT' ||
    allocation.fieldOrigin === 'HUMAN_EDIT'
  );
}

function dateTimeLocalValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }
  return String(value).trim().replace(' ', 'T').slice(0, 16);
}
</script>

<template>
  <article class="demand-plan-line">
    <header>
      <div class="demand-plan-line__index">{{ line.lineNo || '—' }}</div>
      <div class="demand-plan-line__product">
        <strong>{{ line.productName }}</strong>
        <span>
          {{ line.productCode || '无产品编码' }}
          <i>·</i>
          {{ line.unit || '未配置单位' }}
        </span>
      </div>
      <div class="demand-plan-line__contract">
        <small>合同数量（权威值）</small>
        <strong>{{ displayKnownQuantity(line.contractQuantity) }}</strong>
      </div>
      <Tag :color="line.mappingStatus === 'MAPPED' ? 'green' : 'orange'">
        {{ line.mappingStatus === 'MAPPED' ? '已映射产品' : '产品映射未知' }}
      </Tag>
    </header>

    <div class="demand-plan-line__fields">
      <label :id="safeId(lineKey('requiredDate'))">
        <span>
          要求完成日期
          <AiFieldMetaBadge :field="fields[lineKey('requiredDate')]" />
        </span>
        <input
          :disabled="readonly"
          type="date"
          :value="line.requiredDate"
          @input="
            editLine('requiredDate', ($event.target as HTMLInputElement).value)
          "
        />
      </label>
      <label :id="safeId(lineKey('decisionNote'))">
        <span>
          拆分说明
          <AiFieldMetaBadge :field="fields[lineKey('decisionNote')]" />
        </span>
        <Input
          :disabled="readonly"
          :maxlength="1000"
          placeholder="说明为什么采用当前分配"
          :value="line.decisionNote"
          @update:value="editLine('decisionNote', $event)"
        />
      </label>
    </div>

    <div class="demand-plan-line__allocations">
      <section
        v-for="allocation in line.allocations"
        :key="allocation.type"
        :data-unknown="!allocation.quantity.trim()"
      >
        <header>
          <div>
            <IconifyIcon
              :icon="
                allocation.type === 'STOCK'
                  ? 'lucide:boxes'
                  : allocation.type === 'INTERNAL_FACTORY'
                    ? 'lucide:factory'
                    : 'lucide:shopping-cart'
              "
              aria-hidden="true"
            />
            <strong>{{ allocationTypeLabel(allocation.type) }}</strong>
          </div>
          <Tag :color="allocation.quantity.trim() ? 'blue' : 'orange'">
            {{ allocation.quantity.trim() ? '已填写' : 'UNKNOWN' }}
          </Tag>
        </header>

        <label :id="safeId(allocationKey(allocation, 'quantity'))">
          <span>
            数量
            <Tooltip title="留空代表后端 UNKNOWN，不会按 0 保存">
              <IconifyIcon icon="lucide:circle-help" aria-hidden="true" />
            </Tooltip>
            <AiFieldMetaBadge
              :field="fields[allocationKey(allocation, 'quantity')]"
            />
          </span>
          <Input
            :disabled="readonly"
            inputmode="decimal"
            :maxlength="26"
            placeholder="未知（请人工核实）"
            :value="allocation.quantity"
            @update:value="editAllocation(allocation, 'quantity', $event)"
          />
        </label>

        <label :id="safeId(allocationKey(allocation, 'recommendationReason'))">
          <span>
            AI 建议依据
            <AiFieldMetaBadge
              :field="fields[allocationKey(allocation, 'recommendationReason')]"
            />
          </span>
          <Input.TextArea
            :auto-size="{ minRows: 2, maxRows: 4 }"
            :disabled="readonly"
            :maxlength="1000"
            placeholder="尚无建议依据"
            :value="allocation.recommendationReason"
            @update:value="
              editAllocation(allocation, 'recommendationReason', $event)
            "
          />
        </label>

        <label :id="safeId(allocationKey(allocation, 'evidenceNote'))">
          <span>
            人工核实说明
            <AiFieldMetaBadge
              :field="fields[allocationKey(allocation, 'evidenceNote')]"
            />
          </span>
          <Input.TextArea
            :auto-size="{ minRows: 2, maxRows: 4 }"
            :disabled="readonly"
            :maxlength="1000"
            placeholder="记录核实来源、时间或限制条件"
            :value="allocation.evidenceNote"
            @update:value="editAllocation(allocation, 'evidenceNote', $event)"
          />
        </label>

        <div
          v-if="!readonly && requiresHumanEvidence(allocation)"
          class="demand-plan-line__manual-evidence"
        >
          <Alert
            message="人工数量需要可追溯证据"
            description="请记录证据来源、版本、有效期与修改原因。保存草稿可以继续补充，但确认计划前必须完整且仍在有效期内。"
            show-icon
            type="info"
          />

          <div class="demand-plan-line__evidence-grid">
            <label
              :id="safeId(allocationKey(allocation, 'evidenceSourceSystem'))"
            >
              <span>
                证据来源
                <AiFieldMetaBadge
                  :field="
                    fields[allocationKey(allocation, 'evidenceSourceSystem')]
                  "
                />
              </span>
              <Select
                :options="humanEvidenceSourceOptions"
                placeholder="选择核实渠道"
                :value="allocation.evidenceSourceSystem || undefined"
                @update:value="
                  editAllocation(allocation, 'evidenceSourceSystem', $event)
                "
              />
            </label>

            <label
              :id="safeId(allocationKey(allocation, 'evidenceSourceRefId'))"
            >
              <span>
                证据引用（可选）
                <AiFieldMetaBadge
                  :field="
                    fields[allocationKey(allocation, 'evidenceSourceRefId')]
                  "
                />
              </span>
              <Input
                :maxlength="128"
                placeholder="截图编号、确认单号或记录链接编号"
                :value="allocation.evidenceSourceRefId"
                @update:value="
                  editAllocation(allocation, 'evidenceSourceRefId', $event)
                "
              />
            </label>

            <label
              :id="safeId(allocationKey(allocation, 'evidenceSourceVersion'))"
            >
              <span>
                证据版本
                <AiFieldMetaBadge
                  :field="
                    fields[allocationKey(allocation, 'evidenceSourceVersion')]
                  "
                />
              </span>
              <Input
                :maxlength="128"
                placeholder="例如 2026-08-29T14:30:00"
                :value="allocation.evidenceSourceVersion"
                @update:value="
                  editAllocation(allocation, 'evidenceSourceVersion', $event)
                "
              />
            </label>

            <label
              :id="safeId(allocationKey(allocation, 'evidenceValidUntil'))"
            >
              <span>
                证据有效至
                <AiFieldMetaBadge
                  :field="
                    fields[allocationKey(allocation, 'evidenceValidUntil')]
                  "
                />
              </span>
              <input
                class="demand-plan-line__datetime"
                type="datetime-local"
                :value="dateTimeLocalValue(allocation.evidenceValidUntil)"
                @input="
                  editAllocation(
                    allocation,
                    'evidenceValidUntil',
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>

          <label :id="safeId(allocationKey(allocation, 'changeReason'))">
            <span>
              人工修改原因
              <AiFieldMetaBadge
                :field="fields[allocationKey(allocation, 'changeReason')]"
              />
            </span>
            <Input.TextArea
              :auto-size="{ minRows: 2, maxRows: 4 }"
              :maxlength="500"
              placeholder="说明为何采用该人工数量，以及与 AI 建议的差异"
              :value="allocation.changeReason"
              @update:value="editAllocation(allocation, 'changeReason', $event)"
            />
          </label>
        </div>

        <footer v-if="allocation.sourceName || allocation.evidenceStatus">
          <div>
            <span>证据：{{ allocation.sourceName || '未提供来源名称' }}</span>
            <small v-if="allocation.sourceSystem">
              {{ allocation.sourceSystem }}
              <template v-if="allocation.sourceRefId">
                · {{ allocation.sourceRefId }}
              </template>
            </small>
            <small v-if="allocation.evidenceSourceVersion">
              版本 {{ allocation.evidenceSourceVersion }}
            </small>
            <small v-if="allocation.evidenceValidUntil">
              有效至 {{ allocation.evidenceValidUntil }}
            </small>
          </div>
          <Tag>{{ allocation.evidenceStatus || '状态未知' }}</Tag>
        </footer>
      </section>
    </div>

    <Alert
      v-if="unknownCount"
      :message="`${unknownCount} 项分配数量仍为 UNKNOWN；保存时保持未知，不会转换为 0。`"
      show-icon
      type="warning"
    />
    <Alert
      v-else-if="!balanced"
      :message="`当前分配合计 ${allocated}，与合同数量 ${line.contractQuantity} 不一致。`"
      show-icon
      type="warning"
    />
    <div v-else class="demand-plan-line__balanced">
      <IconifyIcon icon="lucide:circle-check" aria-hidden="true" />
      分配合计 {{ allocated }}，与合同数量一致
    </div>
  </article>
</template>

<style scoped>
.demand-plan-line {
  display: grid;
  gap: 16px;
  padding: 16px;
  background: #fff;
  border: 1px solid #dfe7f0;
  border-radius: 10px;
}

.demand-plan-line > header,
.demand-plan-line__allocations section > header,
.demand-plan-line__allocations section > header > div,
.demand-plan-line__allocations section > footer,
.demand-plan-line__balanced {
  display: flex;
  gap: 8px;
  align-items: center;
}

.demand-plan-line > header {
  justify-content: space-between;
}

.demand-plan-line__index {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 30px;
  height: 30px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 8px;
}

.demand-plan-line__product {
  display: grid;
  gap: 3px;
  min-width: 0;
  margin-right: auto;
}

.demand-plan-line__product span,
.demand-plan-line__contract small,
.demand-plan-line__allocations section > footer {
  font-size: 12px;
  color: #64748b;
}

.demand-plan-line__product i {
  margin: 0 4px;
  font-style: normal;
}

.demand-plan-line__contract {
  display: grid;
  gap: 2px;
  text-align: right;
}

.demand-plan-line__contract strong {
  font-size: 18px;
  color: #172033;
}

.demand-plan-line__fields {
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) minmax(260px, 1.3fr);
  gap: 12px;
}

.demand-plan-line label {
  display: grid;
  gap: 6px;
}

.demand-plan-line label > span {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.demand-plan-line input[type='date'] {
  height: 32px;
  padding: 4px 11px;
  color: rgb(0 0 0 / 88%);
  outline: none;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
}

.demand-plan-line__datetime {
  width: 100%;
  height: 32px;
  padding: 4px 11px;
  color: rgb(0 0 0 / 88%);
  outline: none;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
}

.demand-plan-line__manual-evidence {
  display: grid;
  gap: 10px;
  padding: 10px;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
}

.demand-plan-line__evidence-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.demand-plan-line__allocations {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.demand-plan-line__allocations section {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.demand-plan-line__allocations section[data-unknown='true'] {
  background: #fffbeb;
  border-color: #fde68a;
}

.demand-plan-line__allocations section > header,
.demand-plan-line__allocations section > footer {
  justify-content: space-between;
}

.demand-plan-line__allocations section > footer > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.demand-plan-line__balanced {
  justify-content: flex-end;
  font-size: 12px;
  color: #15803d;
}

@media (max-width: 1500px) {
  .demand-plan-line__allocations {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .demand-plan-line > header {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .demand-plan-line__contract {
    text-align: left;
  }

  .demand-plan-line__fields {
    grid-template-columns: 1fr;
  }

  .demand-plan-line__evidence-grid {
    grid-template-columns: 1fr;
  }
}
</style>
