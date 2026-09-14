<script setup lang="ts">
import type { Contract, ContractItem, Directory } from '#/api/fdmplatform';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Table,
} from 'ant-design-vue';

import { contractAction, newIdempotencyKey } from '#/api/fdmplatform';

import RemoteMasterSelect from '../components/RemoteMasterSelect.vue';
import { productCategoryOptions } from '../contract-categories';
import { errorText } from '../data';
import { currencyOptions, taxOptions } from '../products/model';
import {
  importedCompletionPayload,
  importedContractGaps,
  importedItemGaps,
} from './import-completion';

const props = defineProps<{
  contract?: Contract;
  directory?: Directory;
  open: boolean;
}>();
const emit = defineEmits<{ close: []; saved: [Contract] }>();
const values = reactive<Record<string, number | string | undefined>>({});
const mappings = reactive<Record<string, Record<string, string | undefined>>>(
  {},
);
const saving = ref(false);
const verifyCarryover = ref(false);
const pageError = ref('');
const key = ref('');
const gaps = computed(() =>
  props.contract ? importedContractGaps(props.contract) : [],
);
const items = computed(
  () =>
    props.contract?.items.filter((item) => importedItemGaps(item).length > 0) ??
    [],
);
function itemNeeds(row: Record<string, unknown>, key: unknown) {
  return importedItemGaps(row as ContractItem).some((field) => field === key);
}
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    verifyCarryover.value = false;
    for (const field of Object.keys(values))
      Reflect.deleteProperty(values, field);
    for (const id of Object.keys(mappings))
      Reflect.deleteProperty(mappings, id);
    for (const item of items.value) mappings[item.id] = {};
    pageError.value = '';
    key.value = newIdempotencyKey();
  },
);
async function submit() {
  if (!props.contract) return;
  saving.value = true;
  pageError.value = '';
  try {
    const payload = importedCompletionPayload(
      props.contract,
      { ...values, verifyCarryover: verifyCarryover.value },
      mappings,
    );
    const value = await contractAction(
      props.contract.id,
      'COMPLETE_IMPORTED_CONTRACT',
      props.contract.version,
      key.value,
      payload,
    );
    emit('saved', value);
    emit('close');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <Modal
    :open="open"
    title="补齐合同办理资料"
    :width="1050"
    :confirm-loading="saving"
    :closable="!saving"
    :mask-closable="!saving"
    :keyboard="!saving"
    :cancel-button-props="{ disabled: saving }"
    ok-text="保存补齐资料"
    @ok="submit"
    @cancel="!saving && emit('close')"
  >
    <Alert
      type="info"
      message="仅填写原单缺少且已核实的资料，已明确的合同币种、数量、价格和执行事实保留。未知币种请先核实，系统不会默认为人民币。"
      show-icon
    />
    <Alert v-if="pageError" type="error" :message="pageError" show-icon />
    <Form layout="vertical" :disabled="saving" style="margin-top: 16px">
      <Form.Item v-if="gaps.includes('companyId')" label="合同所属公司">
        <Select
          v-model:value="values.companyId"
          :options="
            directory?.companies.map((row) => ({
              value: row.companyId,
              label: row.companyName,
            }))
          "
          allow-clear
          placeholder="选择实际合同公司"
        />
      </Form.Item>
      <Form.Item v-if="gaps.includes('currency')" label="合同币种">
        <Select
          v-model:value="values.currency"
          :options="currencyOptions"
          allow-clear
          placeholder="原币种待核实"
        />
      </Form.Item>
      <Form.Item v-if="gaps.includes('customerId')" label="客户">
        <RemoteMasterSelect
          :value="
            typeof values.customerId === 'string'
              ? values.customerId
              : undefined
          "
          type="CUSTOMER"
          :disabled="saving"
          @update:value="(value) => (values.customerId = value)"
        />
      </Form.Item>
      <Form.Item v-if="gaps.includes('businessType')" label="业务类型">
        <Select
          v-model:value="values.businessType"
          :options="[
            { value: 'FOREIGN', label: '外贸 B2B' },
            { value: 'DOMESTIC', label: '国内 B2B' },
            { value: 'GOVERNMENT', label: '政府客户' },
            { value: 'SAMPLE', label: '样品' },
          ]"
          allow-clear
        />
      </Form.Item>
      <Form.Item v-if="gaps.includes('productCategory')" label="产品分类">
        <Select
          v-model:value="values.productCategory"
          :options="productCategoryOptions"
          allow-clear
          placeholder="原合同未注明，请核实后选择"
        />
      </Form.Item>
      <Form.Item v-if="gaps.includes('ownerUserId')" label="负责人">
        <Select
          v-model:value="values.ownerUserId"
          :options="
            directory?.users.map((row) => ({
              value: row.id,
              label: row.nickname,
            }))
          "
          allow-clear
          show-search
          option-filter-prop="label"
        />
      </Form.Item>
      <Form.Item v-if="gaps.includes('departmentId')" label="部门（可选）">
        <Select
          v-model:value="values.departmentId"
          :options="
            directory?.departments.map((row) => ({
              value: row.id,
              label: row.name,
            }))
          "
          allow-clear
        />
      </Form.Item>
    </Form>
    <Table
      v-if="items.length"
      :data-source="items"
      row-key="id"
      size="small"
      :pagination="false"
      :scroll="{ x: 1000 }"
      :columns="[
        { title: '原产品 / 数量', key: 'source', width: 220 },
        { title: '对应产品', key: 'skuId', width: 250 },
        { title: '单位', key: 'unit', width: 110 },
        { title: '税费口径', key: 'taxBasis', width: 150 },
        { title: '规格', key: 'specification', width: 220 },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'source'">{{ record.skuName }} · {{ record.quantity }} {{ record.unit }}</span><template v-else-if="itemNeeds(record, column.key)">
          <RemoteMasterSelect
            v-if="column.key === 'skuId'"
            v-model:value="mappings[record.id]!.skuId"
            type="SKU"
            :disabled="saving"
          /><Select
            v-else-if="column.key === 'taxBasis'"
            v-model:value="mappings[record.id]!.taxBasis"
            :options="taxOptions"
            :disabled="saving"
            style="width: 100%"
          /><Input
            v-else
            v-model:value="mappings[record.id]![String(column.key)]"
            :disabled="saving"
          />
</template><span v-else>{{ record[String(column.key)] || '已维护' }}</span>
      </template>
    </Table>
    <Form.Item label="补齐依据说明" required style="margin-top: 16px">
      <Input.TextArea
        v-model:value="values.reason"
        :disabled="saving"
        :rows="2"
        placeholder="说明核实依据"
      />
    </Form.Item>
    <Checkbox v-model:checked="verifyCarryover" :disabled="saving">
      已核对原单数量、金额、附加费用与期初已履约余额
    </Checkbox>
  </Modal>
</template>
