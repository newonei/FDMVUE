<script setup lang="ts">
import type { DetailsCheck } from '../model';

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
  Form,
  Input,
  Select,
  Space,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  getProcurementSettings,
  getSupplierContacts,
} from '#/api/fdmplatform/procurement';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { errorText } from '../../../data';
import {
  clauseGroupTitle,
  compatibleClauses,
  detailsChecklist,
  onlyChoice,
  orderDateError,
  preferredContact,
  validOrderDate,
} from '../model';
import OrderPrintExtras from './OrderPrintExtras.vue';
import SupplierContacts from './SupplierContacts.vue';
const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  action: [name: string];
  busy: [value: boolean];
  confirm: [payload: Record<string, unknown>];
  dirty: [value: boolean];
  save: [payload: Record<string, unknown>];
  saveExtras: [payload: Record<string, unknown>];
}>();
const router = useRouter();
const entities = ref<ProcurementSetting[]>([]);
const templates = ref<ProcurementSetting[]>([]);
const clauses = ref<ProcurementSetting[]>([]);
const settingsLoaded = ref(false);
const contacts = ref<SupplierContact[]>([]);
const pageError = ref('');
const contactsOpen = ref(false);
const printExtras = ref<InstanceType<typeof OrderPrintExtras>>();
const extrasBusy = ref(false);
const extrasDirty = ref(false);
watch([contactsOpen, extrasBusy], ([contacts, extras]) =>
  emit('busy', contacts || extras),
);
onBeforeUnmount(() => emit('busy', false));
const form = reactive({
  contactId: undefined as string | undefined,
  deliveryDate: '',
  deliveryAddress: '',
  purchaseDate: '',
  remark: '',
  accessoryNote: '',
  signingEntityId: undefined as string | undefined,
  templateId: undefined as string | undefined,
  clauseIds: [] as string[],
});
const canEdit = computed(() =>
  props.view.allowedActions.includes('SAVE_DETAILS'),
);
const canEditExtras = computed(() =>
  props.view.allowedActions.includes('SAVE_EXTRAS'),
);
const formBaseline = ref('');
// Automatic defaults belong to the initial form, while edits made during loading
// must still compare against their original values.
function applyDefaults(update: () => void) {
  const before = JSON.parse(JSON.stringify(form));
  const baseline = JSON.parse(formBaseline.value);
  update();
  for (const key of Object.keys(form)) {
    if (JSON.stringify(before[key]) === JSON.stringify(baseline[key])) {
      baseline[key] = form[key as keyof typeof form];
    }
  }
  formBaseline.value = JSON.stringify(
    Object.fromEntries(Object.keys(form).map((key) => [key, baseline[key]])),
  );
}
const formDirty = computed(
  () => canEdit.value && JSON.stringify(form) !== formBaseline.value,
);
watch([formDirty, extrasDirty], ([details, extras]) =>
  emit('dirty', details || extras),
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
const checklist = computed<DetailsCheck[]>(() => [
  ...detailsChecklist({
    clauseIds: canEdit.value
      ? form.clauseIds
      : (props.view.details.clauseSnapshots ?? []).map((item) => item.id),
    clauses: clauseOptions.value,
    contact: contact.value,
    entity: entity.value,
    template: template.value,
  }),
  {
    key: 'purchaseDate',
    label: '采购日期',
    ok: validOrderDate(form.purchaseDate),
  },
]);
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
    applyDefaults(() => {
      form.signingEntityId ??= onlyChoice(entities.value);
      form.templateId ??= onlyChoice(templates.value);
      pickOnlyClauses();
    });
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
    applyDefaults(() => {
      if (!form.contactId)
        form.contactId = preferredContact(contacts.value)?.id;
    });
  } catch (error) {
    pageError.value = errorText(error);
  }
}
watch(
  () => [props.view.id, props.view.details.version],
  (_value, previous) => {
    // Saving only print extras must preserve any unfinished contact/terms edits.
    if (previous?.[0] !== props.view.id || !formDirty.value) {
      Object.assign(form, {
        contactId: props.view.details.contactId,
        deliveryDate: props.view.details.deliveryDate ?? '',
        deliveryAddress: props.view.details.deliveryAddress ?? '',
        purchaseDate: props.view.details.purchaseDate ?? '',
        remark: props.view.details.remark ?? '',
        accessoryNote: props.view.details.accessoryNote ?? '',
        signingEntityId: props.view.details.signingEntityId,
        templateId: props.view.details.templateId,
        clauseIds: [...(props.view.details.clauseIds ?? [])],
      });
      formBaseline.value = JSON.stringify(form);
    }
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
  const { documentDate: _documentDate, ...details } = props.view.details;
  return {
    ...details,
    ...form,
    ...(canEditExtras.value ? printExtras.value?.payload() : {}),
  };
}
function save() {
  pageError.value = orderDateError(form);
  if (!pageError.value) emit('save', payload());
}
function saveExtras() {
  if (!canEditExtras.value || props.saving || extrasBusy.value) return;
  emit('saveExtras', printExtras.value?.payload() ?? {});
}
function isDirty() {
  return formDirty.value || extrasDirty.value;
}
function pendingSave() {
  return formDirty.value && canEdit.value
    ? { action: 'SAVE_DETAILS', payload: payload() }
    : { action: 'SAVE_EXTRAS', payload: printExtras.value?.payload() ?? {} };
}
function markSaved(action: string) {
  if (action !== 'SAVE_EXTRAS') formBaseline.value = JSON.stringify(form);
  printExtras.value?.markSaved();
  extrasDirty.value = false;
}
defineExpose({ isDirty, markSaved, pendingSave });
function confirm() {
  pageError.value =
    orderDateError(form) ||
    compatibleClauses(
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
        <Form.Item
          label="采购日期"
          html-for="order-details-purchase-date"
          required
        >
          <Input
            id="order-details-purchase-date"
            v-model:value="form.purchaseDate"
            aria-required="true"
            type="date"
            :disabled="!canEdit || saving"
          />
        </Form.Item>
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
        <Form.Item
          label="交付日期（选填）"
          html-for="order-details-delivery-date"
        >
          <Input
            id="order-details-delivery-date"
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
        <Form.Item
          label="辅料情况说明（印在采购单上）"
          class="wide"
          extra="写明彩盒、标签、包装袋等辅料由谁提供、怎么配，导出时印在「辅料情况说明」一栏；需要逐项勾选的用下方「辅料明细表」"
        >
          <Textarea
            v-model:value="form.accessoryNote"
            :disabled="!canEdit || saving"
            :auto-size="{ minRows: 1, maxRows: 4 }"
            :maxlength="2000"
          />
        </Form.Item>
        <Form.Item label="下单备注（内部，不导出）" class="wide">
          <Textarea
            v-model:value="form.remark"
            :disabled="!canEdit || saving"
            :auto-size="{ minRows: 1, maxRows: 4 }"
          />
        </Form.Item>
      </Form>
      <OrderPrintExtras
        ref="printExtras"
        :view="view"
        :disabled="!canEditExtras"
        :saving="saving"
        @busy="extrasBusy = $event"
        @dirty="extrasDirty = $event"
        @save="saveExtras"
      />
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
          确认后可在右上角「导出」生成采购单 PDF / Excel 发给供应商
        </span>
      </Space>
    </Card>
    <FdmResizableDrawer
      resize-key="supplier-contacts"
      :open="contactsOpen"
      title="工厂联系人"
      width="900px"
      @close="contactsOpen = false"
    >
      <SupplierContacts
        :supplier-id="String(view.order.supplierId)"
        @saved="changed"
      />
    </FdmResizableDrawer>
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
