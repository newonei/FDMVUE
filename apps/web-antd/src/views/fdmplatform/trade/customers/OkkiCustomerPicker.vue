<script setup lang="ts">
import type {
  CountryOption,
  Customer,
  OkkiCustomerPreview,
  OkkiCustomerSearch,
  OkkiCustomerSource,
} from '#/api/fdmplatform/customers';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  getCustomer,
  getCustomerOptions,
  getOkkiCustomerStatus,
  previewOkkiCustomer,
  refreshOkkiCustomer,
  searchOkkiCustomers,
  syncOkkiCustomer,
} from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import {
  countryMatches,
  countrySelectOptions,
  customerFields,
  mergeOkkiCustomers,
} from './model';

const props = defineProps<{ open: boolean; refreshCustomer?: Customer }>();
const emit = defineEmits<{ close: []; saved: [customer: Customer] }>();
const status = ref<Awaited<ReturnType<typeof getOkkiCustomerStatus>>>();
const keyword = ref('');
const activeKeyword = ref('');
const items = ref<OkkiCustomerSource[]>([]);
const result = ref<OkkiCustomerSearch>();
const preview = ref<OkkiCustomerPreview>();
const existing = ref<Customer>();
const loading = ref(false);
const previewLoading = ref(false);
const saving = ref(false);
const panelError = ref('');
const previewError = ref('');
const key = ref('');
const countries = ref<CountryOption[]>([]);
const selectedCountry = ref<string>();
const countryOptions = computed(() => countrySelectOptions(countries.value));
const previewSection = ref<HTMLElement>();
watch(
  keyword,
  () => {
    searchSequence++;
    previewSequence++;
    items.value = [];
    result.value = undefined;
    preview.value = undefined;
    selectedCountry.value = undefined;
    existing.value = undefined;
    loading.value = false;
    previewLoading.value = false;
  },
  { flush: 'sync' },
);
let searchSequence = 0;
let previewSequence = 0;
const canSearch = computed(
  () => status.value?.configured && status.value.enabled,
);
const columns = [
  { key: 'name', title: 'OKKI 客户', width: 300 },
  { key: 'code', dataIndex: 'code', title: '编号' },
  { key: 'state', title: '本地档案' },
  { key: 'action', title: '操作', width: 100 },
];
watch(
  () => props.open,
  async (open) => {
    searchSequence++;
    previewSequence++;
    if (!open) return;
    status.value = undefined;
    result.value = undefined;
    items.value = [];
    preview.value = undefined;
    selectedCountry.value = undefined;
    existing.value = undefined;
    keyword.value = '';
    activeKeyword.value = '';
    panelError.value = '';
    previewError.value = '';
    previewLoading.value = false;
    const sequence = searchSequence;
    loading.value = true;
    try {
      const [connection, options] = await Promise.all([
        getOkkiCustomerStatus(),
        getCustomerOptions(),
      ]);
      if (!props.open || sequence !== searchSequence) return;
      status.value = connection;
      countries.value = options.countries;
      if (props.refreshCustomer?.externalId && canSearch.value)
        await select(props.refreshCustomer.externalId);
    } catch (error) {
      if (sequence === searchSequence) panelError.value = errorText(error);
    } finally {
      if (sequence === searchSequence) loading.value = false;
    }
  },
);
async function search(continuing = false) {
  if (!canSearch.value || loading.value) return;
  const cursor = continuing ? result.value?.nextCursor : 1;
  if (cursor === null || cursor === undefined) return;
  const query = continuing ? activeKeyword.value : keyword.value.trim();
  const sequence = ++searchSequence;
  loading.value = true;
  panelError.value = '';
  if (!continuing) {
    items.value = [];
    result.value = undefined;
    activeKeyword.value = query;
  }
  try {
    const response = await searchOkkiCustomers({ keyword: query, cursor });
    if (!props.open || sequence !== searchSequence) return;
    items.value = mergeOkkiCustomers(items.value, response.items);
    result.value = response;
  } catch (error) {
    if (sequence === searchSequence) panelError.value = errorText(error);
  } finally {
    if (sequence === searchSequence) loading.value = false;
  }
}
async function select(externalId: string) {
  const sequence = ++previewSequence;
  previewLoading.value = true;
  preview.value = undefined;
  selectedCountry.value = undefined;
  existing.value = undefined;
  previewError.value = '';
  await nextTick();
  previewSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const response = await previewOkkiCustomer(externalId);
    const current = response.existingId
      ? await getCustomer(response.existingId)
      : undefined;
    if (!props.open || sequence !== previewSequence) return;
    preview.value = response;
    selectedCountry.value = countries.value.some(
      (item) => item.code === response.customer.country,
    )
      ? response.customer.country
      : undefined;
    existing.value = current;
    key.value = newIdempotencyKey();
  } catch (error) {
    if (sequence === previewSequence) previewError.value = errorText(error);
  } finally {
    if (sequence === previewSequence) previewLoading.value = false;
  }
}
async function confirm() {
  const value = preview.value;
  if (!value || saving.value) return;
  if (!countries.value.some((item) => item.code === selectedCountry.value)) {
    previewError.value = '请从固定国家 / 地区列表选择客户国家后再确认同步';
    return;
  }
  saving.value = true;
  previewError.value = '';
  try {
    const data = {
      previewHash: value.previewHash,
      country: selectedCountry.value,
      expectedVersion: value.existingVersion,
      idempotencyKey: key.value,
    };
    const customer = props.refreshCustomer
      ? await refreshOkkiCustomer(props.refreshCustomer.id, {
          ...data,
          expectedVersion:
            value.existingVersion ?? props.refreshCustomer.version!,
        })
      : await syncOkkiCustomer({
          ...data,
          externalId: value.customer.externalId,
        });
    emit('saved', customer);
    emit('close');
    message.success('OKKI 客户资料已同步到本地客户档案');
  } catch (error) {
    previewError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
onBeforeUnmount(() => {
  searchSequence++;
  previewSequence++;
});
</script>

<template>
  <Drawer
    :open="open"
    :title="refreshCustomer ? '预览并刷新 OKKI 客户' : '从 OKKI 选择客户'"
    width="min(1080px, 96vw)"
    :mask-closable="false"
    :closable="!saving"
    @close="emit('close')"
  >
    <div class="okki-stack">
      <Alert
        type="info"
        show-icon
        message="从 OKKI 只读获取客户资料，确认后保存到本业务客户档案。不会修改 OKKI 数据。"
      />
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        v-if="status && !canSearch"
        type="warning"
        show-icon
        :message="
          status.message || 'OKKI 客户查询暂未启用，请检查现有连接配置。'
        "
      />
      <template v-if="!refreshCustomer">
        <Space wrap>
          <Input
            v-model:value="keyword"
            placeholder="客户名称、简称或编号"
            allow-clear
            class="search-input"
            @press-enter="search(false)"
          /><Button
            type="primary"
            :disabled="!canSearch"
            :loading="loading"
            @click="search(false)"
          >
            搜索 OKKI
          </Button>
        </Space>
        <Alert
          v-if="result"
          type="info"
          show-icon
          :message="
            result.notice ||
            (result.hasMore
              ? '本次只扫描了部分远程客户，可继续查找剩余数据。'
              : '本次搜索已扫描结束。')
          "
          :description="`当前累计匹配 ${items.length} 个客户，本次扫描 ${result.scannedCount} 条${result.remoteTotal === null ? '' : `，来源总数参考 ${result.remoteTotal}`}。`"
        />
        <Table
          :columns="columns"
          :data-source="items"
          row-key="externalId"
          :loading="loading"
          :pagination="items.length > 20 ? { pageSize: 20 } : false"
          :scroll="{ x: 720 }"
        >
          <template #emptyText>
            <Empty
              :description="
                result?.hasMore
                  ? '已扫描部分暂无匹配，可继续查找'
                  : result
                    ? '没有匹配客户'
                    : '输入关键词后搜索，或留空查询客户'
              "
            />
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'name'">
              <strong>{{ record.name }}</strong>
              <div class="muted">
                {{ record.shortName || record.externalId }}
              </div>
            </div>
            <Tag
              v-else-if="column.key === 'state'"
              :color="record.localId ? 'green' : 'default'"
            >
              {{ record.localId ? '已同步' : '未同步' }}
            </Tag>
            <Button
              v-else-if="column.key === 'action'"
              type="link"
              :disabled="saving"
              @click="select(record.externalId)"
            >
              预览资料
            </Button>
          </template>
        </Table>
        <Button v-if="result?.hasMore" :loading="loading" @click="search(true)">
          继续查找剩余 OKKI 客户
        </Button>
      </template>
      <Alert
        v-if="previewError"
        type="error"
        show-icon
        :message="previewError"
      />
      <section v-if="preview || previewLoading" ref="previewSection">
        <Card title="同步预览" :loading="previewLoading" size="small">
          <template v-if="preview">
            <Alert
              :type="preview.existingId ? 'warning' : 'info'"
              show-icon
              :message="
                preview.existingId
                  ? '将刷新现有客户名称、公司名称与联系资料；系统客户编号、客户来源、本地备注和启用状态保留。请核对国家 / 地区后确认。'
                  : '确认后创建本地客户档案，系统自动生成客户编号，可直接在合同中选择。'
              "
            />
            <Alert
              v-if="preview.customer.contactSelection"
              type="info"
              :message="`联系人取值：${preview.customer.contactSelection}`"
            />
            <div class="country-choice">
              <label for="okki-country">国家 / 地区（必选）</label>
              <Select
                id="okki-country"
                v-model:value="selectedCountry"
                :options="countryOptions"
                :filter-option="countryMatches"
                show-search
                :disabled="saving"
                placeholder="搜索中文、英文或国家代码"
                style="width: 100%"
              />
              <p class="muted">
                来源国家原文：{{
                  preview.customer.sourceCountry ||
                  preview.customer.country ||
                  '未提供'
                }}。仅保存上方选定的国家 / 地区。
              </p>
            </div>
            <div class="preview-grid">
              <Descriptions
                :title="existing ? 'OKKI 最新资料（将写入）' : 'OKKI 客户资料'"
                :column="1"
                size="small"
                bordered
              >
                <Descriptions.Item
                  v-for="[field, label] in customerFields"
                  :key="field"
                  :label="label"
                >
                  {{
                    field === 'code'
                      ? existing?.code || '首次保存后自动生成'
                      : field === 'customerSource'
                        ? existing?.customerSource ||
                          preview.customer.customerSource ||
                          '—'
                        : preview.customer[field] || '—'
                  }}
                </Descriptions.Item>
              </Descriptions>
              <Descriptions
                v-if="existing"
                title="当前本地资料"
                :column="1"
                size="small"
                bordered
              >
                <Descriptions.Item
                  v-for="[field, label] in customerFields"
                  :key="field"
                  :label="label"
                >
                  {{ existing[field] || '—' }}
                </Descriptions.Item>
              </Descriptions>
            </div>
            <p class="muted">
              预览获取时间：{{ preview.fetchedAt }}；来源更新时间：{{
                preview.customer.sourceUpdatedAt || '来源未提供'
              }}
            </p>
            <Space wrap>
              <Button type="primary" :loading="saving" @click="confirm">
                {{
                  preview.existingId
                    ? '确认覆盖并刷新客户'
                    : '确认同步到客户档案'
                }}
</Button><Button
                :disabled="saving"
                @click="select(preview.customer.externalId)"
              >
                重新获取预览
              </Button>
            </Space>
          </template>
        </Card>
      </section>
    </div>
  </Drawer>
</template>

<style scoped>
.okki-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-input {
  width: 320px;
  max-width: 70vw;
}

.muted {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin: 16px 0;
}
</style>
