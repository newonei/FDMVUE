<script setup lang="ts">
import type { Customer } from '#/api/fdmplatform/customers';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getCustomer,
  getCustomers,
  setCustomerStatus,
} from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import { useEntityDetail } from '../../documents/useEntityDetail';
import CustomerEditor from './CustomerEditor.vue';
import { customerMissingFields } from './model';
import OkkiCustomerPicker from './OkkiCustomerPicker.vue';

import '../../components/compact-tables.css';

defineOptions({ name: 'FdmPlatformTradeCustomers' });
const customers = ref<Customer[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const active = ref<string>();
const source = ref<string>();
const loading = ref(false);
const panelError = ref('');
const editorOpen = ref(false);
const selected = ref<Customer>();
const okkiOpen = ref(false);
const refreshCustomer = ref<Customer>();
const changing = ref<string>();
let sequence = 0;
const columns = [
  { title: '客户名称 / 编号', key: 'name', width: 255 },
  { title: '地区', key: 'region', width: 170 },
  { title: '公司名称 / 客户来源', key: 'businessSource', width: 230 },
  { title: '联系人', key: 'contact', width: 235 },
  { title: '资料来源', key: 'source', width: 155 },
  { title: '状态', key: 'state', width: 90 },
  { title: '操作', key: 'action', width: 245, fixed: 'right' as const },
];
async function load(reset = false) {
  if (reset) page.value = 1;
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getCustomers({
      pageNo: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      sourceSystem: source.value,
      active: active.value === undefined ? undefined : active.value === 'true',
    });
    if (run !== sequence) return;
    customers.value = result.list;
    total.value = result.total;
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
const entityDetail = useEntityDetail(
  'customerId',
  getCustomer,
  (value) => {
    selected.value = value;
    editorOpen.value = true;
  },
  () => {
    editorOpen.value = false;
  },
  (value) => {
    panelError.value = value;
  },
);
function edit(customer?: Customer) {
  entityDetail.open(customer?.id);
}
function chooseOkki(customer?: Customer) {
  refreshCustomer.value = customer;
  okkiOpen.value = true;
}
function toggle(customer: Customer) {
  const key = newIdempotencyKey();
  Modal.confirm({
    title: `${customer.active ? '停用' : '启用'}客户“${customer.name}”？`,
    content: customer.active
      ? '停用后不可在新合同中选取，历史合同与资料保留。'
      : '启用后可在新合同中选择。',
    okText: '确认',
    cancelText: '取消',
    async onOk() {
      changing.value = customer.id;
      try {
        await setCustomerStatus(customer.id, {
          active: !customer.active,
          expectedVersion: customer.version!,
          idempotencyKey: key,
        });
        message.success('客户状态已更新');
        await load();
      } catch (error) {
        panelError.value = errorText(error);
        message.error(panelError.value);
        throw error;
      } finally {
        changing.value = undefined;
      }
    },
  });
}
onMounted(() => {
  void load();
});
onBeforeUnmount(() => {
  sequence++;
});
</script>

<template>
  <Page
    title="外贸客户管理"
    description="维护本业务客户、金智导入客户与联系资料，也可从 OKKI 预览并同步，创建合同时直接选择。"
  >
    <div class="customer-stack">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Card>
        <div class="customer-stack">
          <Space wrap>
            <Input
              v-model:value="keyword"
              placeholder="名称、编号、联系人或邮箱"
              allow-clear
              class="search-input"
              @press-enter="load(true)"
            />
            <Select
              v-model:value="source"
              :options="[
                { label: '本地新增', value: 'LOCAL' },
                { label: 'OKKI 同步', value: 'OKKI' },
                { label: '金智导入', value: 'JINZHI' },
              ]"
              placeholder="全部资料来源"
              allow-clear
              style="width: 150px"
              @change="load(true)"
            />
            <Select
              v-model:value="active"
              :options="[
                { label: '启用', value: 'true' },
                { label: '停用', value: 'false' },
              ]"
              placeholder="全部状态"
              allow-clear
              style="width: 120px"
              @change="load(true)"
            />
            <Button :loading="loading" @click="load(true)">查询</Button><Button type="primary" @click="edit()">新建客户</Button><Button @click="chooseOkki()">从 OKKI 选择客户</Button>
          </Space>
          <Table
            class="fdm-business-table"
            size="small"
            table-layout="fixed"
            :columns="columns"
            :data-source="customers"
            row-key="id"
            :loading="loading"
            :scroll="{ x: 1420 }"
            :pagination="{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count: number) => `共 ${count} 个客户`,
            }"
            @change="
              (pagination) => {
                page = pagination.current ?? 1;
                pageSize = pagination.pageSize ?? 20;
                load();
              }
            "
          >
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'name'">
                <Button
                  type="link"
                  :title="record.name"
                  @click="edit(record as Customer)"
                >
                  {{ record.name }}
                </Button>
                <div
                  class="muted fdm-cell-line"
                  :title="
                    [record.code, record.shortName].filter(Boolean).join(' · ')
                  "
                >
                  {{ record.code }}
                  {{ record.shortName ? `· ${record.shortName}` : '' }}
                </div>
              </div>
              <span
                v-else-if="column.key === 'region'"
                class="fdm-cell-line"
                :title="
                  [
                    record.countryName || record.country,
                    record.province,
                    record.city,
                  ]
                    .filter(Boolean)
                    .join(' / ')
                "
                >{{
                  [
                    record.countryName || record.country,
                    record.province,
                    record.city,
                  ]
                    .filter(Boolean)
                    .join(' / ') || '—'
                }}</span>
              <div v-else-if="column.key === 'contact'">
                <span class="fdm-cell-line" :title="record.contactName">{{
                  record.contactName || '—'
                }}</span>
                <div
                  class="muted fdm-cell-line"
                  :title="
                    [record.email, record.phone].filter(Boolean).join(' / ')
                  "
                >
                  {{ record.email || record.phone || '未填写联系方式' }}
                </div>
              </div>
              <div v-else-if="column.key === 'businessSource'">
                <span class="fdm-cell-line" :title="record.companyName">{{
                  record.companyName || '公司未填写'
                }}</span>
                <span
                  class="muted fdm-cell-line"
                  :title="record.customerSource"
                  >{{ record.customerSource || '客户来源未填写' }}</span>
              </div>
              <div v-else-if="column.key === 'source'">
                <Tag
                  :color="record.sourceSystem === 'OKKI' ? 'blue' : 'default'"
                >
                  {{
                    record.sourceSystem === 'OKKI'
                      ? 'OKKI'
                      : record.sourceSystem === 'LOCAL'
                        ? '本地新增'
                        : record.sourceSystem === 'JINZHI'
                          ? '金智导入'
                          : record.sourceSystem
                  }}
                </Tag>
                <div v-if="record.lastSyncedAt" class="muted">
                  {{ formatDate(record.lastSyncedAt, 'YYYY-MM-DD HH:mm') }}
                </div>
              </div>
              <Tag
                v-else-if="column.key === 'state'"
                :color="record.active ? 'green' : 'default'"
              >
                {{ record.active ? '启用' : '停用' }}
                <span
                  v-if="customerMissingFields(record).length"
                  :title="`待补：${customerMissingFields(record).join('、')}`"
                >
                  · 待补资料</span>
              </Tag>
              <Space v-else-if="column.key === 'action'" :size="0">
                <Button type="link" @click="edit(record as Customer)">
                  维护
</Button><Button
                  v-if="record.sourceSystem === 'OKKI'"
                  type="link"
                  @click="chooseOkki(record as Customer)"
                >
                  预览刷新
</Button><Button
                  type="link"
                  :danger="record.active"
                  :loading="changing === record.id"
                  @click="toggle(record as Customer)"
                >
                  {{ record.active ? '停用' : '启用' }}
                </Button>
              </Space>
            </template>
          </Table>
        </div>
      </Card>
    </div>
    <CustomerEditor
      :open="editorOpen"
      :customer="selected"
      @close="entityDetail.close"
      @saved="load()"
    />
    <OkkiCustomerPicker
      :open="okkiOpen"
      :refresh-customer="refreshCustomer"
      @close="okkiOpen = false"
      @saved="load()"
    />
  </Page>
</template>

<style scoped>
.customer-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-input {
  width: 270px;
}

.muted {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}
</style>
