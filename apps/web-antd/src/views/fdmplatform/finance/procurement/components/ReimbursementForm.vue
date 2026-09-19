<script setup lang="ts">
import type { ReimbursementLine } from './reimbursement-form';

import type { Contract, Directory, DocumentRow } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type {
  ProcurementFinanceFile,
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  getAccess,
  getContract,
  getDirectory,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import {
  getProcurementOrder,
  getProcurementSettings,
} from '#/api/fdmplatform/procurement';
import { downloadProcurementFinanceFile } from '#/api/fdmplatform/procurement-finance';
import {
  ATTACHMENT_ACCEPT,
  attachmentSize,
  submissionFilesError,
} from '#/api/fdmplatform/submission-files';

import { costCategories, errorText, rows } from '../../../data';
import { personLabel } from '../../../directory';
import ContractPicker from '../../../documents/ContractPicker.vue';
import { currencyOptions } from '../../../products/model';
import OrderPicker from '../../../purchase/manage/components/OrderPicker.vue';
import { downloadBlob } from '../../../purchase/manage/model';
import {
  copyReimbursementLine,
  localDate,
  reimbursementDraft,
  reimbursementFiles,
  reimbursementLine,
  reimbursementPayload,
  reimbursementTotal,
  validateReimbursement,
} from './reimbursement-form';

const props = defineProps<{
  context?: Record<string, unknown>;
  files: ProcurementFinanceFile[];
  pendingFilesCount?: number;
  record?: ProcurementFinanceRecord;
  saving: boolean;
  type?: ProcurementFinanceType;
}>();
const emit = defineEmits<{
  pendingFiles: [files: File[]];
  save: [payload: Record<string, unknown>];
  submit: [payload: Record<string, unknown>];
}>();
const root = ref<HTMLElement>();
const form = reactive(reimbursementDraft({}, newIdempotencyKey));
const directory = ref<Directory>();
const currentUserId = ref<number>();
const entities = ref<ProcurementSetting[]>([]);
const pageError = ref('');
const lookupError = ref('');
const loadingOptions = ref(false);
const errorField = ref('');
const baseline = ref('');
const pickerKey = ref('');
const contractPickerOpen = ref(false);
const orderPickerOpen = ref(false);
const sourceLabels = reactive<Record<string, string>>({});
const productChoices = reactive<
  Record<string, { label: string; value: string }[]>
>({});
const total = computed(() => reimbursementTotal(form));
const pending = computed(() => reimbursementFiles(form));
const attachmentCount = computed(
  () =>
    form.expenses.filter((line) => line.evidenceRef || line.pendingFile).length,
);
const applicant = computed(() =>
  personLabel(directory.value, props.record?.createdBy ?? currentUserId.value),
);
const applicationDate = computed(() =>
  String(props.record?.createdAt ?? localDate()).slice(0, 10),
);
const payerOptions = computed(() =>
  entityOptions('PAY', form.payerEntityId, props.record?.payerSnapshot?.name),
);
const expenseOptions = computed(() =>
  entityOptions(
    'COST',
    form.expenseEntityId,
    (props.record?.expenseEntitySnapshot as undefined | { name?: string })
      ?.name,
  ),
);

function entityOptions(usage: string, selected: string, snapshot?: string) {
  const result = entities.value
    .filter((entry) => entry.active && entry.usages?.includes(usage))
    .map((entry) => ({ value: entry.id, label: entry.name, disabled: false }));
  if (selected && !result.some((entry) => entry.value === selected))
    result.push({
      value: selected,
      label: `${snapshot ?? '历史公司'}（请重新选择启用公司）`,
      disabled: true,
    });
  return result;
}
function fingerprint() {
  return JSON.stringify({
    payload: payload(),
    files: pending.value.map((file) => [
      file.name,
      file.size,
      file.lastModified,
    ]),
  });
}
function payload() {
  return reimbursementPayload(form);
}
function pendingAttachments() {
  return [...pending.value];
}
function isDirty() {
  return fingerprint() !== baseline.value;
}
function markSaved() {
  baseline.value = fingerprint();
}
function sourceKey(line: ReimbursementLine) {
  return line.orderId
    ? `order:${line.contractId}:${line.orderId}`
    : `contract:${line.contractId}`;
}
function productOptions(line: ReimbursementLine) {
  return productChoices[sourceKey(line)] ?? [];
}
async function loadSource(line: ReimbursementLine) {
  if (!line.contractId) return;
  const key = sourceKey(line);
  if (productChoices[key]) return;
  try {
    if (line.orderId) {
      const result = await getProcurementOrder(line.contractId, line.orderId);
      sourceLabels[key] =
        `${result.contractCode} · ${String(result.order.supplierName ?? '采购单')}`;
      productChoices[key] = rows(result.order.lines).map((entry) => ({
        value: String(entry.contractItemId),
        label: String(
          entry.skuName ??
            (entry.specificationSnapshot as Record<string, unknown> | undefined)
              ?.skuName ??
            '采购产品',
        ),
      }));
    } else {
      const contract = await getContract(line.contractId);
      sourceLabels[key] =
        `${contract.code} · ${contract.name || contract.customerName}`;
      productChoices[key] = contract.items.map((entry) => ({
        value: entry.id,
        label: `${entry.skuName}${entry.specification ? ` · ${entry.specification}` : ''}`,
      }));
    }
  } catch (error) {
    pageError.value = errorText(error);
  }
}
async function loadOptions() {
  loadingOptions.value = true;
  lookupError.value = '';
  const results = await Promise.allSettled([
    getProcurementSettings('entities'),
    getDirectory(0),
    getAccess(),
  ]);
  if (results[0].status === 'fulfilled') entities.value = results[0].value;
  if (results[1].status === 'fulfilled') directory.value = results[1].value;
  if (results[2].status === 'fulfilled')
    currentUserId.value = results[2].value.userId;
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected')
    lookupError.value = `基础资料加载失败：${errorText(failure.reason)}`;
  loadingOptions.value = false;
}
watch(
  () => [props.record?.id, props.record?.version, props.context],
  () => {
    Object.assign(
      form,
      reimbursementDraft(
        props.record ?? props.context ?? {},
        newIdempotencyKey,
      ),
    );
    pageError.value = '';
    errorField.value = '';
    markSaved();
    for (const line of form.expenses) void loadSource(line);
  },
  { immediate: true },
);
watch(pending, (files) => emit('pendingFiles', files), { immediate: true });
onMounted(loadOptions);
function addLine() {
  form.expenses.push(
    reimbursementLine(newIdempotencyKey(), {
      contractId: form.contractId,
      orderId: form.orderId,
    }),
  );
  void loadSource(form.expenses.at(-1)!);
}
function duplicate(index: number) {
  const line = form.expenses[index];
  if (line)
    form.expenses.splice(
      index + 1,
      0,
      copyReimbursementLine(line, newIdempotencyKey()),
    );
}
function openPicker(line: ReimbursementLine, type: 'contract' | 'order') {
  pickerKey.value = line.localKey;
  if (type === 'contract') contractPickerOpen.value = true;
  else orderPickerOpen.value = true;
}
async function selectedContract(contract: Contract) {
  contractPickerOpen.value = false;
  const line = form.expenses.find(
    (entry) => entry.localKey === pickerKey.value,
  );
  if (!line) return;
  line.contractId = contract.id;
  line.orderId = '';
  line.contractItemId =
    contract.items.length === 1 ? contract.items[0]!.id : '';
  sourceLabels[sourceKey(line)] =
    `${contract.code} · ${contract.name || contract.customerName}`;
  productChoices[sourceKey(line)] = contract.items.map((entry) => ({
    value: entry.id,
    label: `${entry.skuName}${entry.specification ? ` · ${entry.specification}` : ''}`,
  }));
}
async function selectedOrder(order: DocumentRow) {
  orderPickerOpen.value = false;
  const line = form.expenses.find(
    (entry) => entry.localKey === pickerKey.value,
  );
  if (!line) return;
  line.contractId = order.contractId;
  line.orderId = order.id;
  line.contractItemId = '';
  await loadSource(line);
  if (productOptions(line).length === 1)
    line.contractItemId = productOptions(line)[0]!.value;
}
function clearSource(line: ReimbursementLine) {
  line.contractId = '';
  line.orderId = '';
  line.contractItemId = '';
}
function chooseFile(event: Event, line: ReimbursementLine) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || props.saving) return;
  const files = form.expenses.flatMap((entry) => {
    if (entry === line) return [file];
    return entry.pendingFile ? [entry.pendingFile] : [];
  });
  pageError.value = submissionFilesError(files);
  if (!pageError.value) line.pendingFile = file;
}
function existingFile(line: ReimbursementLine, value: unknown) {
  line.evidenceRef = value ? String(value) : '';
  line.pendingFile = undefined;
}
async function download(line: ReimbursementLine) {
  if (!props.record || !line.evidenceRef) return;
  const file = props.files.find((entry) => entry.id === line.evidenceRef);
  if (!file) return;
  try {
    downloadBlob(
      await downloadProcurementFinanceFile(props.record.id, file.id),
      file.name,
    );
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function scrollTo(section: string) {
  root.value
    ?.querySelector<HTMLElement>(`[data-section="${section}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function validation(field: string) {
  return errorField.value === field
    ? { help: pageError.value, validateStatus: 'error' as const }
    : {};
}
async function save(submit = false) {
  if (props.saving) return;
  const error = validateReimbursement(form, submit);
  pageError.value = error?.message ?? submissionFilesError(pending.value);
  errorField.value = error?.field ?? '';
  if (pageError.value) {
    await nextTick();
    const field = root.value?.querySelector<HTMLElement>(
      `[data-field="${errorField.value}"]`,
    );
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    return;
  }
  if (submit) emit('submit', payload());
  else emit('save', payload());
}
defineExpose({ payload, pendingAttachments, isDirty, markSaved });
</script>

<template>
  <div ref="root" class="reimbursement-editor">
    <header class="editor-bar">
      <div>
        <span class="editor-kicker">费用报销</span>
        <h2>{{ record ? '编辑报销单' : '新建费用报销' }}</h2>
        <p>{{ record?.code || '单号在首次保存后自动生成' }}</p>
      </div>
      <div class="editor-actions">
        <Button :disabled="saving" :loading="saving" @click="save()">
          保存草稿
</Button><Button
          type="primary"
          :disabled="saving"
          :loading="saving"
          @click="save(true)"
        >
          提交生效
        </Button>
      </div>
    </header>
    <Alert
      v-if="pageError"
      :message="pageError"
      type="error"
      show-icon
      class="editor-alert"
    />
    <Alert
      v-if="lookupError"
      :message="lookupError"
      type="warning"
      show-icon
      class="editor-alert"
    >
      <template #action>
        <Button size="small" :loading="loadingOptions" @click="loadOptions">
          重新加载
        </Button>
      </template>
    </Alert>
    <nav class="section-nav" aria-label="报销单章节">
      <Button type="text" @click="scrollTo('basic')">基本信息</Button><Button type="text" @click="scrollTo('expenses')">
        费用明细 <span>{{ form.expenses.length }}</span>
</Button><Button type="text" @click="scrollTo('payment')">收款信息</Button>
    </nav>
    <div class="editor-layout">
      <Form layout="vertical" class="editor-main">
        <section class="editor-section" data-section="basic">
          <div class="section-title">
            <span>01</span>
            <h3>基本信息</h3>
            <small>费用归属与付款公司分别选择</small>
          </div>
          <div class="field-grid">
            <Form.Item
              label="报销主题"
              required
              data-field="name"
              v-bind="validation('name')"
              :validate-status="errorField === 'name' ? 'error' : undefined"
              class="span-two"
            >
              <Input
                v-model:value="form.name"
                :disabled="saving"
                :maxlength="200"
                placeholder="例如：9 月样品寄送及包装费用"
              />
            </Form.Item>
            <Form.Item label="报销单号">
              <div class="readonly-value">
                {{ record?.code || '保存后自动生成' }}
              </div>
            </Form.Item>
            <Form.Item label="申请人 / 申请日期">
              <div class="readonly-value">
                {{ applicant }}<span>{{ applicationDate }}</span>
              </div>
            </Form.Item>
            <Form.Item
              label="费用所属公司"
              required
              data-field="expenseEntityId"
              v-bind="validation('expenseEntityId')"
              :validate-status="
                errorField === 'expenseEntityId' ? 'error' : undefined
              "
            >
              <Select
                v-model:value="form.expenseEntityId"
                :disabled="saving"
                :loading="loadingOptions"
                :options="expenseOptions"
                show-search
                option-filter-prop="label"
                placeholder="选择承担本次费用的公司"
              />
            </Form.Item>
            <Form.Item
              label="报销币种"
              required
              data-field="currency"
              v-bind="validation('currency')"
            >
              <Select
                v-model:value="form.currency"
                :disabled="saving"
                :options="currencyOptions"
                show-search
                option-filter-prop="label"
              />
            </Form.Item>
          </div>
        </section>
        <section
          class="editor-section"
          data-section="expenses"
          data-field="expenses"
        >
          <div class="section-title">
            <span>02</span>
            <h3>费用明细</h3>
            <Button :disabled="saving" class="add-expense" @click="addLine">
              ＋ 添加费用
            </Button>
          </div>
          <p class="section-hint">
            每项费用对应一份凭证，可在此直接上传。与订单有关的费用，可就近关联采购单或合同产品。
          </p>
          <div v-if="!form.expenses.length" class="empty-expenses">
            尚未添加费用，点击上方“添加费用”开始填写。
          </div>
          <article
            v-for="(line, index) in form.expenses"
            :key="line.localKey"
            class="expense-line"
            :class="{
              'line-error': errorField.startsWith(`line-${line.localKey}-`),
            }"
          >
            <div class="expense-heading">
              <strong>费用 {{ String(index + 1).padStart(2, '0') }}</strong>
              <div>
                <Button
                  type="text"
                  size="small"
                  :disabled="saving"
                  @click="duplicate(index)"
                >
                  复制
</Button><Button
                  type="text"
                  size="small"
                  danger
                  :disabled="saving"
                  @click="form.expenses.splice(index, 1)"
                >
                  删除
                </Button>
              </div>
            </div>
            <div class="expense-primary">
              <Form.Item
                label="费用日期"
                required
                :data-field="`line-${line.localKey}-date`"
                v-bind="validation(`line-${line.localKey}-date`)"
              >
                <Input
                  v-model:value="line.expenseDate"
                  type="date"
                  :max="localDate()"
                  :disabled="saving"
                />
              </Form.Item>
              <Form.Item
                label="费用类别"
                required
                :data-field="`line-${line.localKey}-category`"
                v-bind="validation(`line-${line.localKey}-category`)"
              >
                <Select
                  v-model:value="line.category"
                  :disabled="saving"
                  :options="
                    costCategories.filter((entry) => entry.value !== 'PURCHASE')
                  "
                />
              </Form.Item>
              <Form.Item
                :label="`金额（${form.currency}）`"
                required
                :data-field="`line-${line.localKey}-amount`"
                v-bind="validation(`line-${line.localKey}-amount`)"
              >
                <InputNumber
                  v-model:value="line.amount"
                  :disabled="saving"
                  string-mode
                  :min="0"
                  placeholder="0.00"
                  style="width: 100%"
                />
              </Form.Item>
            </div>
            <Form.Item label="用途说明">
              <Input
                v-model:value="line.remark"
                :disabled="saving"
                :maxlength="1000"
                placeholder="说明这笔费用用于什么事项"
              />
            </Form.Item>
            <div class="expense-source">
              <span class="source-caption">关联业务</span><span class="source-label">{{
                line.contractId
                  ? sourceLabels[sourceKey(line)] || '正在读取关联单据…'
                  : '独立费用，未关联订单'
              }}</span>
              <div class="source-actions">
                <Button
                  size="small"
                  :disabled="saving"
                  @click="openPicker(line, 'order')"
                >
                  选择采购单
</Button><Button
                  size="small"
                  :disabled="saving"
                  @click="openPicker(line, 'contract')"
                >
                  选择合同
</Button><Button
                  v-if="line.contractId"
                  type="text"
                  size="small"
                  :disabled="saving"
                  @click="clearSource(line)"
                >
                  清除
                </Button>
              </div>
            </div>
            <Form.Item
              v-if="line.contractId"
              label="归属产品"
              required
              :data-field="`line-${line.localKey}-product`"
              v-bind="validation(`line-${line.localKey}-product`)"
              class="source-product"
            >
              <Select
                v-model:value="line.contractItemId"
                :disabled="saving"
                :options="productOptions(line)"
                show-search
                option-filter-prop="label"
                placeholder="选择这笔费用对应的产品"
              />
            </Form.Item>
            <div
              class="expense-voucher"
              :data-field="`line-${line.localKey}-file`"
            >
              <div>
                <strong>报销凭证 <span class="required-mark">*</span></strong>
                <p>
                  {{
                    line.pendingFile
                      ? `${line.pendingFile.name} · ${attachmentSize(line.pendingFile.size)}`
                      : files.find((file) => file.id === line.evidenceRef)
                          ?.name ||
                        (line.evidenceRef
                          ? '已有凭证（保留原引用）'
                          : '支持 PDF、图片及文档，单份不超过 20 MB')
                  }}
                </p>
              </div>
              <div class="voucher-actions">
                <Tag v-if="line.pendingFile" color="processing">待保存上传</Tag><Button
                  v-if="line.evidenceRef && !line.pendingFile"
                  size="small"
                  :disabled="
                    saving ||
                    !files.some((file) => file.id === line.evidenceRef)
                  "
                  @click="download(line)"
                >
                  下载凭证
</Button><label class="upload-control" :class="{ disabled: saving }"><span>{{
                    line.pendingFile || line.evidenceRef
                      ? '替换凭证'
                      : '上传凭证'
                  }}</span><input
                    type="file"
                    :accept="ATTACHMENT_ACCEPT"
                    :disabled="saving"
                    :aria-label="`上传第 ${index + 1} 项费用凭证`"
                    @change="chooseFile($event, line)"
/></label><Button
                  v-if="line.pendingFile"
                  size="small"
                  type="text"
                  :disabled="saving"
                  @click="line.pendingFile = undefined"
                >
                  撤销选择
                </Button>
              </div>
              <Select
                v-if="files.length"
                :value="
                  line.pendingFile ? undefined : line.evidenceRef || undefined
                "
                :disabled="saving"
                :options="
                  files.map((file) => ({ value: file.id, label: file.name }))
                "
                show-search
                allow-clear
                option-filter-prop="label"
                placeholder="或选择本单已有附件"
                class="existing-voucher"
                @change="existingFile(line, $event)"
              />
              <p
                v-if="errorField === `line-${line.localKey}-file`"
                role="alert"
                class="voucher-error"
              >
                {{ pageError }}
              </p>
            </div>
          </article>
          <div class="expense-footer">
            <Button :disabled="saving" @click="addLine">＋ 添加一项费用</Button><span>共 {{ form.expenses.length }} 项
              <strong>{{ form.currency }} {{ total }}</strong></span>
          </div>
          <Form.Item label="补充说明" class="remark-field">
            <Textarea
              v-model:value="form.remark"
              :disabled="saving"
              :maxlength="2000"
              :rows="3"
              placeholder="需要说明的其他事项（选填）"
            />
          </Form.Item>
        </section>
        <section class="editor-section" data-section="payment">
          <div class="section-title">
            <span>03</span>
            <h3>收款信息</h3>
          </div>
          <div class="field-grid">
            <Form.Item
              label="付款公司"
              required
              data-field="payerEntityId"
              v-bind="validation('payerEntityId')"
            >
              <Select
                v-model:value="form.payerEntityId"
                :disabled="saving"
                :loading="loadingOptions"
                :options="payerOptions"
                show-search
                option-filter-prop="label"
                placeholder="选择实际付款公司"
              />
            </Form.Item>
            <Form.Item
              label="垫付人"
              required
              data-field="advanceUserName"
              v-bind="validation('advanceUserName')"
            >
              <Input
                v-model:value="form.advanceUserName"
                :disabled="saving"
                placeholder="实际垫付本次费用的人"
              />
            </Form.Item>
            <Form.Item
              label="收款人 / 收款单位"
              required
              data-field="payeeName"
              v-bind="validation('payeeName')"
            >
              <Input
                v-model:value="form.payeeName"
                :disabled="saving"
                placeholder="填写收款账户户名"
              />
            </Form.Item>
            <Form.Item
              label="收款账户"
              required
              data-field="payeeAccount"
              v-bind="validation('payeeAccount')"
            >
              <Input
                v-model:value="form.payeeAccount"
                :disabled="saving"
                autocomplete="off"
                placeholder="银行名称及账号，或其他准确收款信息"
              />
            </Form.Item>
          </div>
        </section>
      </Form>
      <aside class="editor-summary">
        <span class="summary-caption">本次报销</span>
        <div class="summary-amount">
          <small>{{ form.currency }}</small>{{ total }}
        </div>
        <p>{{ form.expenses.length }} 项费用 · {{ attachmentCount }} 份凭证</p>
        <dl>
          <div>
            <dt>费用所属公司</dt>
            <dd>
              {{
                expenseOptions.find(
                  (entry) => entry.value === form.expenseEntityId,
                )?.label || '尚未选择'
              }}
            </dd>
          </div>
          <div>
            <dt>付款公司</dt>
            <dd>
              {{
                payerOptions.find((entry) => entry.value === form.payerEntityId)
                  ?.label || '尚未选择'
              }}
            </dd>
          </div>
          <div>
            <dt>收款人</dt>
            <dd>{{ form.payeeName || '尚未填写' }}</dd>
          </div>
        </dl>
        <ol class="summary-steps">
          <li class="active">
            <strong>填写并生效</strong><span>可先保存草稿，稍后补齐</span>
          </li>
          <li><strong>登记实际付款</strong><span>生效后可分次付款</span></li>
        </ol>
        <p class="summary-note">
          费用所属公司用于说明费用归属，成本入账仍以已确认的成本归集为准。
        </p>
      </aside>
    </div>
    <footer class="editor-bottom">
      <span>合计 <strong>{{ form.currency }} {{ total }}</strong></span>
      <div class="editor-actions">
        <Button :disabled="saving" :loading="saving" @click="save()">
          保存草稿
</Button><Button
          type="primary"
          :disabled="saving"
          :loading="saving"
          @click="save(true)"
        >
          提交生效
        </Button>
      </div>
    </footer>
    <ContractPicker
      :open="contractPickerOpen"
      @close="contractPickerOpen = false"
      @select="selectedContract"
    />
    <OrderPicker
      :open="orderPickerOpen"
      @close="orderPickerOpen = false"
      @selected="selectedOrder"
    />
  </div>
</template>

<style scoped>
.reimbursement-editor {
  --expense-muted: hsl(var(--muted-foreground));
  --expense-line: hsl(var(--border));
  --expense-soft: hsl(var(--muted) / 45%);

  color: hsl(var(--foreground));
}

.editor-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 18px 0;
  background: hsl(var(--background));
  border-bottom: 1px solid var(--expense-line);
}

.editor-kicker {
  font-size: 11px;
  font-weight: 600;
  color: #1677ff;
  letter-spacing: 1px;
}

.editor-bar h2 {
  margin: 3px 0;
  font-size: 23px;
  font-weight: 650;
}

.editor-bar p,
.section-hint,
.expense-voucher p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--expense-muted);
}

.editor-actions,
.source-actions,
.voucher-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.editor-alert {
  margin-top: 12px;
}

.section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px 0;
}

.section-nav span {
  margin-left: 5px;
  color: var(--expense-muted);
}

.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 248px;
  gap: 20px;
  align-items: start;
}

.editor-main {
  min-width: 0;
}

.editor-section {
  padding: 22px;
  margin-bottom: 16px;
  scroll-margin-top: 110px;
  border: 1px solid var(--expense-line);
  border-radius: 12px;
}

.section-title {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 20px;
}

.section-title > span {
  font-size: 11px;
  font-weight: 700;
  color: #1677ff;
}

.section-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.section-title small {
  color: var(--expense-muted);
}

.section-title .add-expense {
  margin-left: auto;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.span-two {
  grid-column: 1 / -1;
}

.readonly-value {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  min-height: 32px;
  font-size: 13px;
}

.readonly-value span {
  color: var(--expense-muted);
}

.section-hint {
  margin: -8px 0 18px;
  line-height: 1.7;
}

.expense-line {
  padding: 16px;
  margin-top: 12px;
  border: 1px solid var(--expense-line);
  border-radius: 10px;
}

.expense-line.line-error {
  border-color: #ff4d4f;
}

.expense-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.expense-heading strong {
  font-size: 12px;
  color: var(--expense-muted);
}

.expense-primary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.expense-line :deep(.ant-form-item) {
  margin-bottom: 14px;
}

.expense-source {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px dashed var(--expense-line);
}

.source-caption {
  font-size: 12px;
  color: var(--expense-muted);
}

.source-label {
  flex: 1;
  min-width: 180px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.source-product {
  margin-top: 8px;
}

.expense-voucher {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  margin-top: 8px;
  background: var(--expense-soft);
  border-radius: 8px;
}

.expense-voucher > div:first-child {
  flex: 1;
  min-width: 160px;
  overflow-wrap: anywhere;
}

.expense-voucher strong {
  font-size: 12px;
  font-weight: 500;
}

.expense-voucher .voucher-error {
  width: 100%;
  margin: 0;
  color: #ff4d4f;
}

.required-mark {
  color: #ff4d4f;
}

.existing-voucher {
  width: 100%;
}

.upload-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 2px 10px;
  overflow: hidden;
  color: #1677ff;
  cursor: pointer;
  background: hsl(var(--background));
  border: 1px solid #91caff;
  border-radius: 6px;
}

.upload-control:focus-within {
  outline: 2px solid #1677ff;
  outline-offset: 2px;
}

.upload-control.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.upload-control input {
  position: absolute;
  inset: 0;
  width: 100%;
  cursor: pointer;
  opacity: 0;
}

.expense-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}

.expense-footer > span {
  font-size: 12px;
  color: var(--expense-muted);
}

.expense-footer strong {
  margin-left: 12px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}

.remark-field {
  margin: 22px 0 0;
}

.empty-expenses {
  padding: 28px 12px;
  color: var(--expense-muted);
  text-align: center;
  background: var(--expense-soft);
  border-radius: 8px;
}

.editor-summary {
  position: sticky;
  top: 95px;
  padding: 22px 18px;
  background: var(--expense-soft);
  border: 1px solid var(--expense-line);
  border-radius: 12px;
}

.summary-caption {
  font-size: 12px;
  font-weight: 500;
}

.summary-amount {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  margin: 12px 0 4px;
  font-size: 28px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.summary-amount small {
  font-size: 12px;
  font-weight: 500;
  color: var(--expense-muted);
}

.editor-summary > p {
  font-size: 12px;
  color: var(--expense-muted);
}

.editor-summary dl {
  padding: 16px 0 8px;
  margin: 20px 0 0;
  border-top: 1px solid var(--expense-line);
}

.editor-summary dl div {
  margin-bottom: 14px;
}

.editor-summary dt {
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--expense-muted);
}

.editor-summary dd {
  margin: 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.summary-steps {
  padding: 16px 0 0;
  margin: 0;
  list-style: none;
  border-top: 1px solid var(--expense-line);
}

.summary-steps li {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 0 0 22px 20px;
  font-size: 12px;
}

.summary-steps li::before {
  position: absolute;
  top: 4px;
  left: 0;
  width: 7px;
  height: 7px;
  content: '';
  background: var(--expense-line);
  border-radius: 50%;
}

.summary-steps .active::before {
  background: #1677ff;
}

.summary-steps strong {
  font-weight: 500;
}

.summary-steps span {
  font-size: 11px;
  color: var(--expense-muted);
}

.summary-note {
  margin-bottom: 0;
  line-height: 1.8;
}

.editor-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 4px;
}

.editor-bottom strong {
  margin-left: 10px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1050px) {
  .editor-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-summary {
    position: static;
  }

  .editor-summary dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 18px;
  }

  .summary-steps {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
}

@media (max-width: 600px) {
  .editor-bar {
    top: 0;
    flex-wrap: wrap;
    padding: 12px 0;
  }

  .editor-section {
    padding: 16px 12px;
  }

  .field-grid,
  .expense-primary {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-title small {
    width: 100%;
  }

  .expense-line {
    padding: 12px;
  }

  .editor-actions {
    margin-left: auto;
  }

  .source-actions {
    width: 100%;
  }
}
</style>
