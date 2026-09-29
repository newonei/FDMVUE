<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';
import type { JixiaoApi } from '#/api/fdmperformance';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  message,
  Select,
  Spin,
  Steps,
  Table,
  Tag,
} from 'ant-design-vue';
import { batchLaunchAssessments, getLaunchPreview } from '#/api/fdmperformance';
import { usePerformanceAccess } from '../shared/access';
import { PERIOD_OPTIONS } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import TemplatePickerModal from './components/TemplatePickerModal.vue';
import {
  buildPeriodOptions,
  createLaunchAttempt,
  defaultPeriodKey,
  personIssue,
  validateLaunchFields,
  validateSelection,
} from './model';

defineOptions({ name: 'FdmPerformanceLaunchWizard' });
interface LaunchItem {
  name: string;
  periodKey: string;
  preview?: JixiaoApi.LaunchPreview;
  selectedUserIds: number[];
  template: JixiaoApi.TemplateSelectItem;
}
const router = useRouter();
const { access, accessLoading, loadAccess } = usePerformanceAccess();
const accessFailed = ref(false);
const step = ref(0);
const submitting = ref(false);
const previewLoading = ref(false);
const templatePickerOpen = ref(false);
const items = ref<LaunchItem[]>([]);
const launchAttempt = createLaunchAttempt();
const form = reactive({
  startDate: '',
  remark: '',
});
let previewRequestId = 0;
const selectedTemplates = computed(() =>
  items.value.map((item) => item.template),
);
const totalSelected = computed(() =>
  items.value.reduce((sum, item) => sum + item.selectedUserIds.length, 0),
);
function personsOf(item: LaunchItem) {
  return item.preview?.persons || [];
}
function selectedPersonsOf(item: LaunchItem) {
  return personsOf(item).filter(
    (person) =>
      person.userId !== undefined &&
      item.selectedUserIds.includes(person.userId),
  );
}
const reviewerSignature = computed(() =>
  JSON.stringify(
    items.value.map((item) => [
      item.template.id,
      selectedPersonsOf(item)
        .map((person) => [
          person.userId,
          person.supervisorUserId,
          person.superiorSupervisorUserId,
        ])
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    ]),
  ),
);
function indicatorsOf(item: LaunchItem) {
  return (item.preview?.dimensions || []).flatMap((dimension) =>
    (dimension.indicators || []).map((indicator) => ({
      ...indicator,
      dimensionName: dimension.name,
    })),
  );
}
const personColumns: TableColumnsType = [
  { dataIndex: 'userName', title: '被考核人', width: 150 },
  {
    dataIndex: 'supervisorUserName',
    title: '主管评分人（考评表配置）',
    width: 180,
  },
  {
    dataIndex: 'superiorSupervisorUserName',
    title: '上级评分人（选配）',
    width: 180,
  },
  { dataIndex: 'validation', title: '关系核验', width: 180 },
];
const indicatorColumns: TableColumnsType = [
  { dataIndex: 'dimensionName', title: '维度', width: 130 },
  { dataIndex: 'name', title: '指标', width: 180 },
  { dataIndex: 'standard', title: '考核标准', width: 260 },
  { dataIndex: 'weight', title: '权重', width: 80 },
];
function rowSelectionOf(item: LaunchItem) {
  return {
    selectedRowKeys: item.selectedUserIds,
    onChange: (keys: (number | string)[]) => {
      item.selectedUserIds = keys.map(Number);
    },
    getCheckboxProps: (person: JixiaoApi.TemplatePerson) => ({
      disabled: !!personIssue(person),
    }),
  };
}
const launchableUserIds = (item: LaunchItem) =>
  personsOf(item)
    .filter((person) => !personIssue(person))
    .map((person) => person.userId!);
const allLaunchableSelected = computed(() =>
  items.value.every((item) =>
    launchableUserIds(item).every((id) => item.selectedUserIds.includes(id)),
  ),
);
function selectAllLaunchable() {
  for (const item of items.value) item.selectedUserIds = launchableUserIds(item);
}
function periodLabel(periodType?: string) {
  return (
    PERIOD_OPTIONS.find((option) => option.value === periodType)?.label ||
    periodType ||
    '-'
  );
}
function confirmTemplates(templates: JixiaoApi.TemplateSelectItem[]) {
  const existing = new Map(items.value.map((item) => [item.template.id, item]));
  items.value = templates.map((template) => {
    const kept = existing.get(template.id);
    if (kept) return kept;
    const periodKey = defaultPeriodKey(template.periodType);
    return {
      name: `${template.name}-${periodKey}`,
      periodKey,
      selectedUserIds: [],
      template,
    };
  });
  previewRequestId += 1;
}
function removeItem(templateId: number) {
  items.value = items.value.filter((item) => item.template.id !== templateId);
}
function changePeriod(item: LaunchItem) {
  item.name = `${item.template.name}-${item.periodKey}`;
}
function itemError(item: LaunchItem, error: string) {
  return items.value.length > 1 ? `「${item.template.name}」${error}` : error;
}
function validateBasics() {
  const errors = validateLaunchFields({
    startDate: form.startDate,
    items: items.value.map((item) => ({
      name: item.name,
      periodKey: item.periodKey,
      templateId: item.template.id,
      templateName: item.template.name,
    })),
  });
  if (errors.length) message.warning(errors[0]);
  return errors.length === 0;
}
function validatePeople() {
  for (const item of items.value) {
    const errors = validateSelection(personsOf(item), item.selectedUserIds);
    if (errors.length) {
      message.warning(itemError(item, errors[0]!));
      return false;
    }
  }
  return true;
}
async function loadPreviews() {
  if (!items.value.length || !access.value?.canLaunch) return false;
  const requestId = ++previewRequestId;
  const targets = [...items.value];
  previewLoading.value = true;
  try {
    const previews = await Promise.all(
      targets.map((item) => getLaunchPreview(item.template.id)),
    );
    if (requestId !== previewRequestId) return false;
    targets.forEach((item, index) => {
      item.preview = previews[index];
    });
    return true;
  } finally {
    if (requestId === previewRequestId) previewLoading.value = false;
  }
}
async function nextStep() {
  if (!access.value?.canLaunch || submitting.value || previewLoading.value)
    return;
  if (step.value === 0) {
    if (validateBasics() && (await loadPreviews())) step.value = 1;
  } else if (validatePeople()) step.value = 2;
}
async function submit() {
  if (
    !access.value?.canLaunch ||
    submitting.value ||
    !validateBasics() ||
    !validatePeople()
  )
    return;
  submitting.value = true;
  try {
    const reviewedRelations = reviewerSignature.value;
    // Refresh the authorized population and reviewer mapping before launch.
    if (!(await loadPreviews()) || !validatePeople()) {
      step.value = 1;
      return;
    }
    if (reviewedRelations !== reviewerSignature.value) {
      step.value = 1;
      message.warning('评分人关系已变化，请重新核对后再发起');
      return;
    }
    const launchedCount = totalSelected.value;
    // The backend launches every template in one transaction: all or none.
    const batchIds = await batchLaunchAssessments(
      launchAttempt.request({
        remark: form.remark.trim(),
        startDate: form.startDate,
        items: items.value.map((item) => ({
          name: item.name.trim(),
          periodKey: item.periodKey.trim(),
          templateId: item.template.id,
          userIds: [...item.selectedUserIds],
        })),
      }),
    );
    message.success(
      batchIds.length > 1
        ? `已发起 ${batchIds.length} 张考评表，共 ${launchedCount} 人考核`
        : `已为 ${launchedCount} 人发起考核`,
    );
    await router.push({
      name: 'FdmPerformanceBatches',
      query:
        batchIds.length === 1
          ? { batchId: String(batchIds[0]), scope: 'INITIATED' }
          : { scope: 'INITIATED' },
    });
  } finally {
    submitting.value = false;
  }
}
async function initialize() {
  accessFailed.value = false;
  try {
    await loadAccess();
  } catch {
    accessFailed.value = true;
  }
}
onMounted(initialize);
</script>

<template>
  <PerformanceShell title="发起考核">
    <Spin :spinning="accessLoading">
      <Alert
        v-if="accessFailed"
        message="发起权限加载失败，请重试"
        type="error"
        show-icon
        ><template #action
          ><Button size="small" @click="initialize">重试</Button></template
        ></Alert
      >
      <Alert
        v-else-if="access && !access.canLaunch"
        message="当前账号没有发起考核权限，请在“我的绩效”处理本人的考核。"
        type="info"
        show-icon
      />
      <div v-else-if="access?.canLaunch" class="launch-workspace">
        <Steps
          :current="step"
          :items="[
            { title: '考评表与周期' },
            { title: '人员与评分人' },
            { title: '预览并发起' },
          ]"
          size="small"
        />
        <section v-if="step === 0" class="launch-panel">
          <h2>选择考评表与考核周期</h2>
          <Form layout="vertical">
            <Form.Item label="考评表" required>
              <Button
                block
                :disabled="previewLoading"
                class="template-trigger"
                @click="templatePickerOpen = true"
                >{{
                  items.length
                    ? `已选择 ${items.length} 张考评表，点击调整`
                    : '选择考评表（可多选）'
                }}</Button
              >
              <p v-if="items.length" class="secondary-text">
                为每张考评表设置考核周期和名称，下一步选择本次考核人员
              </p>
            </Form.Item>
            <div v-if="items.length" class="launch-items">
              <div class="launch-items-head">
                <span>考评表</span><span>考核周期</span><span>考核名称</span
                ><span></span>
              </div>
              <div
                v-for="item in items"
                :key="item.template.id"
                class="launch-item-row"
              >
                <div class="launch-item-template">
                  <strong :title="item.template.name">{{
                    item.template.name
                  }}</strong>
                  <span
                    >{{ periodLabel(item.template.periodType) }} ·
                    {{ item.template.indicatorCount }} 项指标</span
                  >
                </div>
                <Select
                  v-if="buildPeriodOptions(item.template.periodType).length"
                  v-model:value="item.periodKey"
                  :aria-label="`${item.template.name}考核周期`"
                  :options="buildPeriodOptions(item.template.periodType)"
                  @change="changePeriod(item)"
                />
                <Input
                  v-else
                  v-model:value="item.periodKey"
                  :aria-label="`${item.template.name}考核周期`"
                  placeholder="如：2026-09"
                  @change="changePeriod(item)"
                />
                <Input
                  v-model:value="item.name"
                  :aria-label="`${item.template.name}考核名称`"
                  :maxlength="100"
                />
                <Button
                  danger
                  size="small"
                  type="text"
                  @click="removeItem(item.template.id)"
                  >移除</Button
                >
              </div>
            </div>
            <div class="form-grid">
              <Form.Item label="开始日期" required
                ><DatePicker
                  v-model:value="form.startDate"
                  value-format="YYYY-MM-DD"
                  class="full-width"
              /></Form.Item>
            </div>
            <Form.Item label="备注"
              ><Input.TextArea
                v-model:value="form.remark"
                :maxlength="500"
                :rows="2"
            /></Form.Item>
          </Form>
        </section>
        <section v-if="step === 1" class="launch-panel">
          <div class="section-heading">
            <h2>选择本次考核人员</h2>
            <div class="launch-item-actions">
              <Button
                :disabled="allLaunchableSelected"
                size="small"
                @click="selectAllLaunchable"
                >全选可发起人员</Button
              >
              <Tag color="blue">已选 {{ totalSelected }} 人</Tag>
            </div>
          </div>
          <Alert
            class="section-alert"
            message="候选仅包含当前账号可发起的人员。主管评分人和上级评分人均按考评表逐人配置，当前账号仅作为考核发起人；关系异常的人员不能选择。"
            show-icon
            type="info"
          />
          <div
            v-for="item in items"
            :key="item.template.id"
            class="launch-item"
          >
            <div class="launch-item-heading">
              <div>
                <h3>{{ item.name }}</h3>
                <span class="secondary-text"
                  >{{ item.template.name }} · 考核周期 {{ item.periodKey }}</span
                >
              </div>
              <div class="launch-item-actions">
                <Tag
                  >已选 {{ item.selectedUserIds.length }} /
                  {{ personsOf(item).length }} 人</Tag
                >
                <Button
                  v-if="items.length > 1"
                  danger
                  size="small"
                  type="text"
                  @click="removeItem(item.template.id)"
                  >移除此表</Button
                >
              </div>
            </div>
            <Table
              :columns="personColumns"
              :data-source="personsOf(item)"
              :row-selection="rowSelectionOf(item)"
              :pagination="false"
              :scroll="{ x: 740 }"
              row-key="userId"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template
                  v-if="column.dataIndex === 'superiorSupervisorUserName'"
                  >{{
                    record.superiorSupervisorUserName || '不启用上级评分'
                  }}</template
                >
                <template v-else-if="column.dataIndex === 'validation'"
                  ><Tag :color="personIssue(record) ? 'error' : 'success'">{{
                    personIssue(record) || '可发起'
                  }}</Tag></template
                >
              </template>
              <template #emptyText
                >此考评表暂无你有权发起的人员，请联系管理员维护人员范围。</template
              >
            </Table>
          </div>
        </section>
        <section v-if="step === 2" class="launch-panel">
          <h2>核对后发起</h2>
          <Descriptions bordered size="small" :column="{ xs: 1, sm: 2, lg: 3 }">
            <Descriptions.Item label="考评表"
              >{{ items.length }} 张</Descriptions.Item
            ><Descriptions.Item label="开始日期">{{
              form.startDate
            }}</Descriptions.Item
            ><Descriptions.Item label="本次人数"
              >{{ totalSelected }} 人</Descriptions.Item
            >
          </Descriptions>
          <div
            v-for="item in items"
            :key="item.template.id"
            class="launch-item"
          >
            <div class="launch-item-heading">
              <div>
                <h3>{{ item.name }}</h3>
                <span class="secondary-text"
                  >{{ item.template.name }} · 考核周期 {{ item.periodKey }} ·
                  {{ item.selectedUserIds.length }} 人</span
                >
              </div>
            </div>
            <h4>被考核人与评分人</h4>
            <Table
              :columns="personColumns.slice(0, 3)"
              :data-source="selectedPersonsOf(item)"
              :pagination="false"
              :scroll="{ x: 520 }"
              row-key="userId"
              size="small"
              ><template #bodyCell="{ column, record }"
                ><template
                  v-if="column.dataIndex === 'superiorSupervisorUserName'"
                  >{{
                    record.superiorSupervisorUserName || '不启用上级评分'
                  }}</template
                ></template
              ></Table
            >
            <h4>指标快照</h4>
            <Table
              :columns="indicatorColumns"
              :data-source="indicatorsOf(item)"
              :pagination="false"
              :scroll="{ x: 650 }"
              row-key="id"
              size="small"
              ><template #bodyCell="{ column, record }"
                ><template v-if="column.dataIndex === 'weight'"
                  >{{ record.weight || 0 }}%</template
                ></template
              ></Table
            >
          </div>
          <p class="secondary-text">
            发起后每人生成独立考核，从指标确认开始。提交时将重新核验人员权限、评分关系和重复考核；多张考评表一并提交，任一张未通过校验则全部不发起。
          </p>
        </section>
        <div class="wizard-actions">
          <Button
            v-if="step > 0"
            :disabled="submitting || previewLoading"
            @click="step -= 1"
            >上一步</Button
          ><Button
            v-if="step < 2"
            :loading="previewLoading"
            type="primary"
            @click="nextStep"
            >下一步</Button
          ><Button v-else :loading="submitting" type="primary" @click="submit"
            >确认发起 {{ totalSelected }} 人考核</Button
          >
        </div>
        <TemplatePickerModal
          v-model:open="templatePickerOpen"
          :selected="selectedTemplates"
          @confirm="confirmTemplates"
        />
      </div>
    </Spin>
  </PerformanceShell>
</template>

<style scoped>
.launch-workspace {
  display: grid;
  gap: 20px;
}
.launch-panel {
  min-width: 0;
  padding: 20px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}
.launch-panel h2 {
  margin: 0 0 18px;
  font-size: 16px;
  font-weight: 600;
}
.launch-panel h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.launch-panel h4 {
  margin: 16px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}
.launch-items {
  margin-bottom: 20px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.launch-items-head,
.launch-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.4fr) 56px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
}
.launch-items-head {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
}
.launch-item-row {
  border-top: 1px solid hsl(var(--border));
}
.launch-item-template {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.launch-item-template strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  white-space: nowrap;
}
.launch-item-template span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.launch-item {
  padding-top: 16px;
  margin-top: 20px;
  border-top: 1px solid hsl(var(--border));
}
.section-alert + .launch-item {
  margin-top: 0;
}
.launch-item-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}
.launch-item-heading .secondary-text {
  display: block;
  margin-top: 4px;
}
.launch-item-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.section-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
  justify-content: space-between;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.full-width {
  width: 100%;
}
.template-trigger {
  height: auto;
  min-height: 38px;
  text-align: left;
  white-space: normal;
}
.secondary-text {
  margin: 10px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.section-alert {
  margin-bottom: 16px;
}
.wizard-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
@media (max-width: 640px) {
  .form-grid,
  .launch-item-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .launch-items-head {
    display: none;
  }
  .launch-items-head + .launch-item-row {
    border-top: 0;
  }
  .launch-item-row :deep(.ant-btn) {
    justify-self: start;
  }
  .launch-panel {
    padding: 14px;
  }
}
</style>
