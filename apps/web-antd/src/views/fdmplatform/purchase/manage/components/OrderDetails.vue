<script setup lang="ts">
import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementOrderView,
  ProcurementSetting,
  SupplierContact,
} from '#/api/fdmplatform/procurement';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import { getSupplierContacts } from '#/api/fdmplatform/procurement';

import { errorText, rows } from '../../../data';
import { procurementLineAmount } from '../../../finance/procurement/model';
import { preferredContact, snapshotShape } from '../model';
import SupplierContacts from './SupplierContacts.vue';
const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  action: [name: string];
  save: [payload: Record<string, unknown>];
}>();
const contacts = ref<SupplierContact[]>([]);
const pageError = ref('');
const contactsOpen = ref(false);
const form = reactive({
  contactId: undefined as string | undefined,
  deliveryDate: '',
  deliveryAddress: '',
  remark: '',
});
const canEdit = computed(() =>
  props.view.allowedActions.includes('SAVE_DETAILS'),
);
const productLines = computed(() =>
  rows(props.view.order.lines).map((line) => ({
    ...line,
    unit:
      (line.specificationSnapshot as Record<string, unknown>)?.unit ??
      line.unit,
    amount: procurementLineAmount(line, String(props.view.order.currency)),
  })),
);
const contact = computed(
  () =>
    (canEdit.value
      ? contacts.value.find((entry) => entry.id === form.contactId)
      : props.view.details.contactSnapshot) ??
    props.view.details.contactSnapshot,
);
async function loadContacts() {
  try {
    contacts.value = await getSupplierContacts(
      String(props.view.order.supplierId),
    );
    if (!form.contactId) form.contactId = preferredContact(contacts.value)?.id;
  } catch (error) {
    pageError.value = errorText(error);
  }
}
watch(
  () => [props.view.id, props.view.details.version],
  () => {
    Object.assign(form, {
      contactId: props.view.details.contactId,
      deliveryDate: props.view.details.deliveryDate ?? '',
      deliveryAddress: props.view.details.deliveryAddress ?? '',
      remark: props.view.details.remark ?? '',
    });
    void loadContacts();
  },
  { immediate: true },
);
function changed(entry: SupplierContact) {
  contactsOpen.value = false;
  void loadContacts();
  form.contactId = entry.id;
}
function save() {
  emit('save', { ...props.view.details, ...form });
}
function supplierName(snapshot: ProcurementSetting | undefined) {
  return snapshot?.name ?? '未选择';
}
</script>
<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Alert v-if="pageError" type="error" :message="pageError" /><Alert
      v-if="view.blockReasons.length"
      type="info"
      :message="view.blockReasons.join('；')"
    /><Card title="工厂联系人与交货资料" size="small">
      <Form layout="vertical" class="order-fields">
        <Form.Item label="工厂联系人">
          <Space style="width: 100%">
            <Select
              v-model:value="form.contactId"
              :disabled="!canEdit || saving"
              :options="
                contacts
                  .filter(
                    (entry) =>
                      entry.active || entry.id === view.details.contactId,
                  )
                  .map((entry) => ({
                    value: entry.id,
                    label: `${entry.name} · ${entry.phone ?? '未填电话'} · ${entry.role ?? ''}`,
                  }))
              "
              show-search
              option-filter-prop="label"
              placeholder="选择工厂联系人"
              style="width: 100%"
            /><Button v-if="canEdit" @click="contactsOpen = true">
              新增 / 维护
            </Button>
          </Space>
</Form.Item><Form.Item label="联系电话">
          <Input :value="contact?.phone" readonly />
</Form.Item><Form.Item label="交货日期">
          <Input
            v-model:value="form.deliveryDate"
            type="date"
            :disabled="!canEdit || saving"
          />
</Form.Item><Form.Item label="交货地址">
          <Input
            v-model:value="form.deliveryAddress"
            :disabled="!canEdit || saving"
          />
</Form.Item><Form.Item label="下单备注" class="wide">
          <Textarea
            v-model:value="form.remark"
            :disabled="!canEdit || saving"
          />
        </Form.Item>
</Form><Space>
        <Button v-if="canEdit" type="primary" :loading="saving" @click="save">
          保存下单资料
</Button><Button
          v-if="view.allowedActions.includes('WITHDRAW_DETAILS')"
          :loading="saving"
          @click="emit('action', 'WITHDRAW_DETAILS')"
        >
          撤回并编辑
</Button><Tag>
          {{ view.details.status === 'CONFIRMED' ? '资料已确认' : '资料草稿' }}
        </Tag>
      </Space>
</Card><Table
      :data-source="productLines"
      row-key="id"
      :pagination="false"
      :scroll="{ x: 1000 }"
      :columns="[
        { key: 'product', title: '产品 / 规格', width: 270 },
        { key: 'shape', title: '形状' },
        { key: 'quantity', dataIndex: 'quantity', title: '订购数量' },
        { key: 'unit', dataIndex: 'unit', title: '单位' },
        { key: 'unitPrice', dataIndex: 'unitPrice', title: '单价' },
        { key: 'amount', dataIndex: 'amount', title: '有效金额' },
        {
          key: 'arrivedQuantity',
          dataIndex: 'arrivedQuantity',
          title: '已到货',
        },
        {
          key: 'returnedQuantity',
          dataIndex: 'returnedQuantity',
          title: '已退货',
        },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'product'">
          {{
            record.skuName ?? record.specificationSnapshot?.skuName ?? '产品'
          }}
          <div class="muted">
            {{
              record.specificationSnapshot?.specification ??
              record.specification ??
              '—'
            }}
          </div>
        </div>
        <span v-else-if="column.key === 'shape'">{{
          snapshotShape(record as BusinessRecord)
        }}</span>
      </template>
</Table><Alert
      type="info"
      message="产品、形状、数量及单价沿用批准方案快照。需要修改时请发起采购方案变更，不直接覆盖历史执行资料。"
    /><Descriptions size="small" :column="2">
      <Descriptions.Item label="采购签约主体">
        {{
          supplierName(view.details.signingEntitySnapshot)
        }}
</Descriptions.Item><Descriptions.Item label="资料版本">
        {{ view.details.version < 0 ? '尚未保存' : view.details.version }}
      </Descriptions.Item>
</Descriptions><Drawer
      :open="contactsOpen"
      title="工厂联系人"
      width="900px"
      @close="contactsOpen = false"
    >
      <SupplierContacts
        :supplier-id="String(view.order.supplierId)"
        @saved="changed"
      />
    </Drawer>
  </Space>
</template>
<style scoped>
.order-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.wide {
  grid-column: 1/-1;
}

.muted {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

@media (max-width: 700px) {
  .order-fields {
    grid-template-columns: 1fr;
  }
}
</style>
