<script setup lang="ts">
import type { MasterSourceRecord } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  getMasterSources,
  getMasterSourceTypes,
  newIdempotencyKey,
  saveMasterData,
} from '#/api/fdmplatform';

import { errorText } from '../data';

const props = defineProps<{ companyId: number; type: string }>();
const emit = defineEmits<{ saved: [] }>();
const supported = ref<Awaited<ReturnType<typeof getMasterSourceTypes>>>([]);
const source = computed(() =>
  supported.value.find((entry) => entry.type === props.type),
);
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const panelError = ref('');
const keyword = ref('');
const kind = ref<string>();
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const data = ref<MasterSourceRecord[]>([]);
const selected = ref<MasterSourceRecord>();
const unit = ref('');
const saveKey = ref('');
let sequence = 0;
const kinds: Record<string, string> = {
  BLANK: '空白 SKU',
  FINISHED: '成品 SKU',
  COMPANY: '公司货权主体',
};
watch(
  () => props.companyId,
  async (companyId) => {
    open.value = false;
    sequence += 1;
    data.value = [];
    total.value = 0;
    selected.value = undefined;
    supported.value = [];
    try {
      const result = await getMasterSourceTypes(companyId);
      if (props.companyId === companyId) supported.value = result;
    } catch (error) {
      panelError.value = errorText(error);
    }
  },
  { immediate: true },
);
watch(
  () => props.type,
  () => {
    open.value = false;
    selected.value = undefined;
    sequence += 1;
    data.value = [];
    total.value = 0;
  },
);
async function load() {
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getMasterSources({
      companyId: props.companyId,
      type: props.type,
      sourceKind: kind.value,
      keyword: keyword.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
    });
    if (run === sequence) {
      data.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function show() {
  pageNo.value = 1;
  keyword.value = '';
  kind.value = undefined;
  selected.value = undefined;
  open.value = true;
  await load();
}
async function search() {
  pageNo.value = 1;
  await load();
}
async function changePage(page: { current?: number; pageSize?: number }) {
  pageNo.value = page.current ?? 1;
  pageSize.value = page.pageSize ?? 10;
  await load();
}
function select(record: MasterSourceRecord) {
  selected.value = record;
  unit.value = record.unit ?? '';
  saveKey.value = newIdempotencyKey();
}
async function save() {
  if (!selected.value) return;
  saving.value = true;
  panelError.value = '';
  try {
    await saveMasterData({
      ...selected.value,
      companyId: props.companyId,
      unit: unit.value || selected.value.unit,
      idempotencyKey: saveKey.value,
    });
    open.value = false;
    message.success('已从权威来源建立主数据映射');
    emit('saved');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Button v-if="source" @click="show">从现有主数据选择</Button>
  <span v-else class="source-note">当前类型通过本地维护或外部资料导入</span>
  <Modal
    v-model:open="open"
    title="从现有业务主数据建立映射"
    :width="1060"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !selected }"
    ok-text="确认建立映射"
    :mask-closable="false"
    @ok="save"
  >
    <Space direction="vertical" style="width: 100%" :size="16">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        type="info"
        show-icon
        :message="
          source?.description ?? '服务端重新核对来源，保留原始编号与规格。'
        "
      />
      <Space wrap>
        <Input
          v-model:value="keyword"
          placeholder="名称、SKU 编号"
          @press-enter="search"
        />
        <Select
          v-model:value="kind"
          :options="
            source?.sourceKinds.map((value) => ({
              value,
              label: kinds[value] ?? value,
            }))
          "
          placeholder="全部来源类别"
          allow-clear
          style="width: 180px"
          @change="search"
        />
        <Button @click="search">查询来源</Button>
      </Space>
      <Table
        :data-source="data"
        row-key="externalId"
        :loading="loading"
        :scroll="{ x: 950 }"
        :columns="[
          { title: '名称', dataIndex: 'name' },
          { title: '编码', dataIndex: 'code' },
          { title: '规格', dataIndex: 'specification' },
          { title: '来源', dataIndex: 'sourceLabel' },
          { title: '操作', key: 'action' },
        ]"
        :pagination="{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
        }"
        @change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <Button
            v-if="column.key === 'action'"
            type="link"
            @click="select(record as MasterSourceRecord)"
          >
            {{ selected?.externalId === record.externalId ? '已选择' : '选择' }}
          </Button>
        </template>
      </Table>
      <Space v-if="selected" wrap>
        <strong>已选：{{ selected.name }} · {{ selected.code }}</strong><Input v-model:value="unit" placeholder="计量单位（来源缺失时补充）" />
      </Space>
    </Space>
  </Modal>
</template>

<style scoped>
.source-note {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #64748b);
}
</style>
