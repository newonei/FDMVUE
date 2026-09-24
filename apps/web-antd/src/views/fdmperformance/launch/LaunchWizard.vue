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
import { getLaunchPreview, launchAssessment } from '#/api/fdmperformance';
import { usePerformanceAccess } from '../shared/access';
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
const router = useRouter();
const { access, accessLoading, loadAccess } = usePerformanceAccess();
const accessFailed = ref(false);
const step = ref(0);
const submitting = ref(false);
const previewLoading = ref(false);
const templatePickerOpen = ref(false);
const selectedTemplate = ref<JixiaoApi.TemplateSelectItem>();
const preview = ref<JixiaoApi.LaunchPreview>();
const selectedUserIds = ref<number[]>([]);
const launchAttempt = createLaunchAttempt();
const form = reactive({
  name: '',
  periodKey: '',
  startDate: '',
  endDate: '',
  remark: '',
});
let previewRequestId = 0;
const selectedTemplates = computed(() =>
  selectedTemplate.value ? [selectedTemplate.value] : [],
);
const persons = computed(() => preview.value?.persons || []);
const selectedPersons = computed(() =>
  persons.value.filter(
    (person) =>
      person.userId !== undefined &&
      selectedUserIds.value.includes(person.userId),
  ),
);
const reviewerSignature = computed(() =>
  JSON.stringify(
    selectedPersons.value
      .map((person) => [
        person.userId,
        person.supervisorUserId,
        person.superiorSupervisorUserId,
      ])
      .sort((a, b) => Number(a[0]) - Number(b[0])),
  ),
);
const flatIndicators = computed(() =>
  (preview.value?.dimensions || []).flatMap((dimension) =>
    (dimension.indicators || []).map((indicator) => ({
      ...indicator,
      dimensionName: dimension.name,
    })),
  ),
);
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
const rowSelection = computed(() => ({
  selectedRowKeys: selectedUserIds.value,
  onChange: (keys: (number | string)[]) => {
    selectedUserIds.value = keys.map(Number);
  },
  getCheckboxProps: (person: JixiaoApi.TemplatePerson) => ({
    disabled: !!personIssue(person),
  }),
}));
function confirmTemplates(templates: JixiaoApi.TemplateSelectItem[]) {
  const template = templates[0];
  if (!template || template.id === selectedTemplate.value?.id) return;
  selectedTemplate.value = template;
  form.periodKey = defaultPeriodKey(template.periodType);
  form.name = `${template.name}-${form.periodKey}`;
  preview.value = undefined;
  selectedUserIds.value = [];
  previewRequestId += 1;
  step.value = 0;
}
function changePeriod() {
  if (selectedTemplate.value)
    form.name = `${selectedTemplate.value.name}-${form.periodKey}`;
}
function validateBasics() {
  const errors = validateLaunchFields({
    ...form,
    templateId: selectedTemplate.value?.id,
  });
  if (errors.length) message.warning(errors[0]);
  return errors.length === 0;
}
function validatePeople() {
  const errors = validateSelection(persons.value, selectedUserIds.value);
  if (errors.length) message.warning(errors[0]);
  return errors.length === 0;
}
async function loadPreview() {
  if (!selectedTemplate.value || !access.value?.canLaunch) return false;
  const requestId = ++previewRequestId;
  previewLoading.value = true;
  try {
    const data = await getLaunchPreview(selectedTemplate.value.id);
    if (requestId !== previewRequestId) return false;
    preview.value = data;
    return true;
  } finally {
    if (requestId === previewRequestId) previewLoading.value = false;
  }
}
async function nextStep() {
  if (!access.value?.canLaunch || submitting.value || previewLoading.value)
    return;
  if (step.value === 0) {
    if (validateBasics() && (await loadPreview())) step.value = 1;
  } else if (validatePeople()) step.value = 2;
}
async function submit() {
  if (
    !access.value?.canLaunch ||
    submitting.value ||
    !validateBasics() ||
    !validatePeople() ||
    !selectedTemplate.value
  )
    return;
  submitting.value = true;
  try {
    const reviewedRelations = reviewerSignature.value;
    // Refresh the authorized population and reviewer mapping before launch.
    if (!(await loadPreview()) || !validatePeople()) {
      step.value = 1;
      return;
    }
    if (reviewedRelations !== reviewerSignature.value) {
      step.value = 1;
      message.warning('评分人关系已变化，请重新核对后再发起');
      return;
    }
    const batchId = await launchAssessment(
      launchAttempt.request({
        ...form,
        name: form.name.trim(),
        periodKey: form.periodKey.trim(),
        remark: form.remark.trim(),
        templateId: selectedTemplate.value.id,
        userIds: [...selectedUserIds.value],
      }),
    );
    message.success(`已为 ${selectedUserIds.value.length} 人发起考核`);
    await router.push({
      name: 'FdmPerformanceBatches',
      query: { batchId: String(batchId), scope: 'INITIATED' },
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
                >{{ selectedTemplate?.name || '选择一张可用考评表' }}</Button
              >
              <p v-if="selectedTemplate" class="secondary-text">
                {{ selectedTemplate.indicatorCount }} 项指标 ·
                下一步选择本次考核人员
              </p>
            </Form.Item>
            <div class="form-grid">
              <Form.Item label="考核周期" required>
                <Select
                  v-if="buildPeriodOptions(selectedTemplate?.periodType).length"
                  v-model:value="form.periodKey"
                  :options="buildPeriodOptions(selectedTemplate?.periodType)"
                  @change="changePeriod"
                />
                <Input
                  v-else
                  v-model:value="form.periodKey"
                  placeholder="如：2026-09"
                  @change="changePeriod"
                />
              </Form.Item>
              <Form.Item label="考核名称" required
                ><Input v-model:value="form.name" :maxlength="100"
              /></Form.Item>
              <Form.Item label="开始日期" required
                ><DatePicker
                  v-model:value="form.startDate"
                  value-format="YYYY-MM-DD"
                  class="full-width"
              /></Form.Item>
              <Form.Item label="截止日期" required
                ><DatePicker
                  v-model:value="form.endDate"
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
            <Tag color="blue">已选 {{ selectedUserIds.length }} 人</Tag>
          </div>
          <Alert
            class="section-alert"
            message="候选仅包含当前账号可发起的人员。主管评分人和上级评分人均按考评表逐人配置，当前账号仅作为考核发起人；关系异常的人员不能选择。"
            show-icon
            type="info"
          />
          <Table
            :columns="personColumns"
            :data-source="persons"
            :row-selection="rowSelection"
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
        </section>
        <section v-if="step === 2" class="launch-panel">
          <h2>核对后发起</h2>
          <Descriptions bordered size="small" :column="{ xs: 1, sm: 2, lg: 3 }">
            <Descriptions.Item label="考核名称">{{
              form.name
            }}</Descriptions.Item
            ><Descriptions.Item label="考评表">{{
              selectedTemplate?.name
            }}</Descriptions.Item
            ><Descriptions.Item label="考核周期">{{
              form.periodKey
            }}</Descriptions.Item
            ><Descriptions.Item label="开始日期">{{
              form.startDate
            }}</Descriptions.Item
            ><Descriptions.Item label="截止日期">{{
              form.endDate
            }}</Descriptions.Item
            ><Descriptions.Item label="本次人数"
              >{{ selectedUserIds.length }} 人</Descriptions.Item
            >
          </Descriptions>
          <h3>被考核人与评分人</h3>
          <Table
            :columns="personColumns.slice(0, 3)"
            :data-source="selectedPersons"
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
          <h3>指标快照</h3>
          <Table
            :columns="indicatorColumns"
            :data-source="flatIndicators"
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
          <p class="secondary-text">
            发起后每人生成独立考核，从指标确认开始。提交时将重新核验人员权限、评分关系和重复考核。
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
            >确认发起 {{ selectedUserIds.length }} 人考核</Button
          >
        </div>
        <TemplatePickerModal
          v-model:open="templatePickerOpen"
          :selected="selectedTemplates"
          :selection-limit="1"
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
  margin: 22px 0 12px;
  font-size: 14px;
  font-weight: 600;
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
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .launch-panel {
    padding: 14px;
  }
}
</style>
