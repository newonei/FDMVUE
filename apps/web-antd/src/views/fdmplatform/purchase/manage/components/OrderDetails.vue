<script setup lang="ts">
import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementOrderView,
  ProcurementSetting,
  SupplierContact,
} from '#/api/fdmplatform/procurement';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  getProcurementSettings,
  getSupplierContacts,
} from '#/api/fdmplatform/procurement';

import { errorText, rows } from '../../../data';
import { procurementLineAmount } from '../../../finance/procurement/model';
import {
  clauseGroupTitle,
  compatibleClauses,
  detailsChecklist,
  onlyChoice,
  preferredContact,
  snapshotShape,
} from '../model';
import SupplierContacts from './SupplierContacts.vue';
const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  action: [name: string];
  busy: [value: boolean];
  confirm: [payload: Record<string, unknown>];
  save: [payload: Record<string, unknown>];
}>();
const router = useRouter();
const entities = ref<ProcurementSetting[]>([]);
const templates = ref<ProcurementSetting[]>([]);
const clauses = ref<ProcurementSetting[]>([]);
const settingsLoaded = ref(false);
const contacts = ref<SupplierContact[]>([]);
const pageError = ref('');
const contactsOpen = ref(false);
watch(contactsOpen, (value) => emit('busy', value));
onBeforeUnmount(() => emit('busy', false));
const form = reactive({
  contactId: undefined as string | undefined,
  deliveryDate: '',
  deliveryAddress: '',
  remark: '',
  signingEntityId: undefined as string | undefined,
  templateId: undefined as string | undefined,
  clauseIds: [] as string[],
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
const entity = computed(() =>
  canEdit.value
    ? entities.value.find((item) => item.id === form.signingEntityId)
    : props.view.details.signingEntitySnapshot,
);
const template = computed(() =>
  canEdit.value
    ? templates.value.find((item) => item.id === form.templateId)
    : props.view.details.templateSnapshot,
);
const clauseOptions = computed(() =>
  canEdit.value ? clauses.value : (props.view.details.clauseSnapshots ?? []),
);
/** Required groups first so the buyer sees what blocks confirmation. */
const groups = computed(() => {
  const required = template.value?.requiredClauseGroups ?? [];
  const all = clauseOptions.value
    .map((item) => item.groupCode)
    .filter((group): group is string => !!group);
  return [...new Set([...required, ...all])];
});
const checklist = computed(() =>
  detailsChecklist({
    clauseIds: canEdit.value
      ? form.clauseIds
      : (props.view.details.clauseSnapshots ?? []).map((item) => item.id),
    clauses: clauseOptions.value,
    contact: contact.value,
    entity: entity.value,
    template: template.value,
  }),
);
const missing = computed(() => checklist.value.filter((item) => !item.ok));
const settingsMissing = computed(() => {
  if (!settingsLoaded.value || !canEdit.value) return [];
  return [
    entities.value.some((item) => item.active) ? '' : '签约公司',
    templates.value.some((item) => item.active) ? '' : '采购单模板',
    clauses.value.some((item) => item.active) ? '' : '合同条款',
  ].filter(Boolean);
});
async function loadSettings() {
  try {
    [entities.value, templates.value, clauses.value] = await Promise.all([
      getProcurementSettings('entities', { usage: 'SIGN' }),
      getProcurementSettings('templates'),
      getProcurementSettings('clauses'),
    ]);
    settingsLoaded.value = true;
    form.signingEntityId ??= onlyChoice(entities.value);
    form.templateId ??= onlyChoice(templates.value);
    pickOnlyClauses();
  } catch (error) {
    pageError.value = errorText(error);
  }
}
/** Fill each required group that has exactly one active clause. */
function pickOnlyClauses() {
  for (const group of template.value?.requiredClauseGroups ?? []) {
    const picked = clauses.value.some(
      (item) => item.groupCode === group && form.clauseIds.includes(item.id),
    );
    const only = onlyChoice(
      clauses.value.filter((item) => item.groupCode === group),
    );
    if (!picked && only) form.clauseIds = [...form.clauseIds, only];
  }
}
function pickedClause(group: string) {
  return canEdit.value
    ? clauses.value.find(
        (item) => item.groupCode === group && form.clauseIds.includes(item.id),
      )?.id
    : props.view.details.clauseSnapshots?.find(
        (item) => item.groupCode === group,
      )?.id;
}
function chooseClause(group: string, value: unknown) {
  const other = form.clauseIds.filter(
    (id) => clauses.value.find((item) => item.id === id)?.groupCode !== group,
  );
  form.clauseIds = typeof value === 'string' ? [...other, value] : other;
}
function chooseTemplate(value: unknown) {
  form.templateId = typeof value === 'string' ? value : undefined;
  pickOnlyClauses();
}
function openSettings() {
  void router.push({ path: '/fdmprocurement/platform-templates' });
}
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
      signingEntityId: props.view.details.signingEntityId,
      templateId: props.view.details.templateId,
      clauseIds: [...(props.view.details.clauseIds ?? [])],
    });
    void loadContacts();
    void loadSettings();
  },
  { immediate: true },
);
function changed(entry: SupplierContact) {
  contactsOpen.value = false;
  void loadContacts();
  form.contactId = entry.id;
}
function payload() {
  return { ...props.view.details, ...form };
}
function save() {
  emit('save', payload());
}
function confirm() {
  pageError.value = compatibleClauses(
    clauses.value,
    form.clauseIds,
    template.value?.requiredClauseGroups ?? [],
  );
  if (!pageError.value) emit('confirm', payload());
}
</script>
<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Alert v-if="pageError" type="error" :message="pageError" />
    <Alert
      v-if="settingsMissing.length"
      type="warning"
      show-icon
      :message="`采购设置里还没有可用的${settingsMissing.join('、')}，下单资料确认不了`"
      description="签约公司、采购单模板和条款是所有采购单共用的，维护一次即可。"
    >
      <template #action>
        <Button size="small" type="primary" @click="openSettings">
          去采购设置
        </Button>
      </template>
    </Alert>
    <Card size="small">
      <template #title>
        下单资料
        <Tag
          :color="view.details.status === 'CONFIRMED' ? 'success' : 'default'"
        >
          {{ view.details.status === 'CONFIRMED' ? '已确认' : '草稿' }}
        </Tag>
      </template>
      <h4 class="section-title">工厂与交货</h4>
      <Form layout="vertical" class="order-fields">
        <Form.Item label="工厂联系人" required>
          <div class="contact-row">
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
                    label: `${entry.name} · ${entry.phone ?? '未填电话'}${entry.role ? ` · ${entry.role}` : ''}`,
                  }))
              "
              show-search
              option-filter-prop="label"
              placeholder="选择工厂联系人"
              style="width: 100%"
            /><Button v-if="canEdit" @click="contactsOpen = true">
              新增 / 维护
            </Button>
          </div>
        </Form.Item>
        <Form.Item label="联系电话">
          <Input
            :value="contact?.phone ?? ''"
            readonly
            placeholder="选联系人后自动带出"
          />
        </Form.Item>
        <Form.Item label="交货日期">
          <Input
            v-model:value="form.deliveryDate"
            type="date"
            :disabled="!canEdit || saving"
          />
        </Form.Item>
        <Form.Item label="交货地址">
          <Input
            v-model:value="form.deliveryAddress"
            :disabled="!canEdit || saving"
            placeholder="不填则按合同约定"
          />
        </Form.Item>
        <Form.Item label="下单备注" class="wide">
          <Textarea
            v-model:value="form.remark"
            :disabled="!canEdit || saving"
            :auto-size="{ minRows: 1, maxRows: 4 }"
          />
        </Form.Item>
      </Form>
      <h4 class="section-title">签约与条款</h4>
      <Form layout="vertical" class="order-fields">
        <Form.Item label="采购签约公司" required>
          <Select
            v-model:value="form.signingEntityId"
            :disabled="!canEdit || saving"
            :options="
              (canEdit ? entities : entity ? [entity] : [])
                .filter(
                  (item) => item.active || item.id === form.signingEntityId,
                )
                .map((item) => ({
                  value: item.id,
                  label: item.legalName ?? item.name,
                }))
            "
            show-search
            option-filter-prop="label"
            placeholder="选择签约公司"
          />
        </Form.Item>
        <Form.Item label="采购单模板" required>
          <Select
            :value="canEdit ? form.templateId : view.details.templateId"
            :disabled="!canEdit || saving"
            :options="
              (canEdit ? templates : template ? [template] : [])
                .filter((item) => item.active || item.id === form.templateId)
                .map((item) => ({ value: item.id, label: item.name }))
            "
            placeholder="选择模板"
            @update:value="chooseTemplate"
          />
        </Form.Item>
        <Form.Item
          v-for="group in groups"
          :key="group"
          :label="clauseGroupTitle(group)"
          :required="template?.requiredClauseGroups?.includes(group)"
        >
          <Select
            :value="pickedClause(group)"
            :disabled="!canEdit || saving"
            :options="
              clauseOptions
                .filter(
                  (item) =>
                    item.groupCode === group &&
                    (item.active || form.clauseIds.includes(item.id)),
                )
                .map((item) => ({ value: item.id, label: item.name }))
            "
            allow-clear
            placeholder="不选则合同不含此项"
            @update:value="(value) => chooseClause(group, value)"
          />
        </Form.Item>
      </Form>
      <div v-if="canEdit" class="checklist" aria-label="确认前检查">
        <span
          v-for="item in checklist"
          :key="item.key"
          :class="item.ok ? 'ok' : 'todo'"
          :title="item.hint"
        >
          {{ item.ok ? '✓' : '○' }} {{ item.label }}
          <small v-if="!item.ok && item.hint">（{{ item.hint }}）</small>
        </span>
      </div>
      <Space wrap>
        <Button
          v-if="view.allowedActions.includes('CONFIRM_DETAILS')"
          type="primary"
          :loading="saving"
          :disabled="missing.length > 0"
          :title="
            missing.length
              ? `还缺：${missing.map((item) => item.label).join('、')}`
              : undefined
          "
          @click="confirm"
        >
          确认下单资料
        </Button>
        <Button v-if="canEdit" :loading="saving" @click="save">
          先存草稿
        </Button>
        <Button
          v-if="view.allowedActions.includes('WITHDRAW_DETAILS')"
          :loading="saving"
          @click="emit('action', 'WITHDRAW_DETAILS')"
        >
          撤回并编辑
        </Button>
        <span
          v-if="view.details.status === 'CONFIRMED' && view.blockReasons.length"
          class="muted"
        >
          不能直接撤回：{{ view.blockReasons.join('；') }}
        </span>
        <span v-else-if="canEdit" class="muted">
          确认后可在「采购单模板」页签生成采购单 Word 发给供应商
        </span>
      </Space>
    </Card>
    <Table
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
      message="产品、数量和单价以下单时为准，不直接覆盖已下单的资料；剩余不再采购的数量可在「更多操作」里结束余额。"
    /><Drawer
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

.contact-row {
  display: flex;
  gap: 8px;
}

.contact-row > :first-child {
  flex: 1;
  min-width: 0;
}

.section-title {
  margin: 4px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

.checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  background: hsl(var(--accent));
  border-radius: 6px;
}

.checklist .ok {
  color: hsl(var(--success));
}

.checklist .todo {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 700px) {
  .order-fields {
    grid-template-columns: 1fr;
  }
}
</style>
