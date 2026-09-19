<script setup lang="ts">
import type {
  CountryOption,
  Customer,
  OkkiCustomerPreview,
  OkkiCustomerSearch,
  OkkiCustomerSource,
  OkkiDirectoryStatus,
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
  getOkkiDirectoryStatus,
  pauseOkkiDirectory,
  previewOkkiCustomer,
  refreshOkkiCustomer,
  refreshOkkiDirectory,
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
const initializing = ref(false);
const previewLoading = ref(false);
const saving = ref(false);
const panelError = ref('');
const previewError = ref('');
const key = ref('');
const countries = ref<CountryOption[]>([]);
const selectedCountry = ref<string>();
const countryOptions = computed(() => countrySelectOptions(countries.value));
const previewSection = ref<HTMLElement>();
const directory = ref<OkkiDirectoryStatus>();
const directoryBusy = ref(false);
let directorySequence = 0;
let sessionSequence = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}
function schedulePoll() {
  stopPolling();
  if (props.open && directory.value?.status === 'RUNNING')
    pollTimer = setTimeout(() => {
      void loadDirectory();
    }, 3000);
}
async function loadDirectory() {
  const run = directorySequence;
  try {
    const value = await getOkkiDirectoryStatus();
    if (!props.open || run !== directorySequence) return;
    const completed =
      directory.value?.status === 'RUNNING' && value.status === 'COMPLETE';
    directory.value = value;
    if (completed && result.value) await search(false);
  } catch (error) {
    if (props.open && run === directorySequence)
      panelError.value = errorText(error);
  } finally {
    if (run === directorySequence) schedulePoll();
  }
}
async function updateDirectory(restart = false) {
  if (directoryBusy.value) return;
  const run = ++directorySequence;
  stopPolling();
  directoryBusy.value = true;
  panelError.value = '';
  try {
    const value = await refreshOkkiDirectory(restart);
    if (props.open && run === directorySequence) directory.value = value;
  } catch (error) {
    if (run === directorySequence) panelError.value = errorText(error);
  } finally {
    if (run === directorySequence) {
      directoryBusy.value = false;
      schedulePoll();
    }
  }
}
async function pauseDirectory() {
  if (directoryBusy.value) return;
  const run = ++directorySequence;
  stopPolling();
  directoryBusy.value = true;
  try {
    const value = await pauseOkkiDirectory();
    if (props.open && run === directorySequence) directory.value = value;
  } catch (error) {
    if (run === directorySequence) panelError.value = errorText(error);
  } finally {
    if (run === directorySequence) {
      directoryBusy.value = false;
      schedulePoll();
    }
  }
}
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
    const session = ++sessionSequence;
    directorySequence++;
    stopPolling();
    directoryBusy.value = false;
    searchSequence++;
    previewSequence++;
    if (!open) {
      initializing.value = false;
      return;
    }
    status.value = undefined;
    directory.value = undefined;
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
    initializing.value = true;
    loading.value = false;
    try {
      const [connection, options] = await Promise.all([
        getOkkiCustomerStatus(),
        getCustomerOptions(),
      ]);
      if (!props.open || session !== sessionSequence) return;
      status.value = connection;
      countries.value = options.countries;
      if (canSearch.value && !props.refreshCustomer) await loadDirectory();
      if (props.refreshCustomer?.externalId && canSearch.value)
        await select(props.refreshCustomer.externalId);
    } catch (error) {
      if (session === sessionSequence) panelError.value = errorText(error);
    } finally {
      if (session === sessionSequence) initializing.value = false;
    }
  },
  { immediate: true },
);
async function search(continuing = false) {
  if (!canSearch.value || loading.value || initializing.value) return;
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
    directory.value = response.directory;
    schedulePoll();
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
  sessionSequence++;
  directorySequence++;
  stopPolling();
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
        <Alert
          v-if="canSearch"
          :type="directory?.lastError ? 'warning' : 'info'"
          show-icon
          :message="
            directory?.status === 'RUNNING'
              ? '客户目录正在后台更新，关闭窗口后仍会继续'
              : directory?.complete
                ? '正在使用最近一次完整客户目录'
                : '请先建立 OKKI 客户目录，完成后可搜索全部客户'
          "
          :description="
            directory
              ? `可搜索 ${directory.indexedCount} 条；本轮已读取 ${directory.scannedCount} 条${directory.remoteTotal === null ? '' : `，来源总数参考 ${directory.remoteTotal}`}。${directory.completedAt ? `上次完整更新时间：${directory.completedAt}。` : '尚无完整目录。'}${directory.lastError || ''}`
              : '读取目录状态中…'
          "
        />
        <Space v-if="canSearch" wrap>
          <Button
            v-if="directory?.status !== 'RUNNING'"
            :loading="directoryBusy"
            @click="updateDirectory(false)"
          >
            {{
              directory?.status === 'FAILED' || directory?.status === 'PAUSED'
                ? '继续更新目录'
                : '更新客户目录'
            }}
          </Button>
          <Button v-else :loading="directoryBusy" @click="pauseDirectory">
            暂停更新
          </Button>
          <Button
            v-if="
              directory?.status === 'FAILED' || directory?.status === 'PAUSED'
            "
            :disabled="directoryBusy"
            @click="updateDirectory(true)"
          >
            从头重新建立
          </Button>
        </Space>
        <Space wrap>
          <Input
            v-model:value="keyword"
            placeholder="客户名称、简称或编号"
            allow-clear
            class="search-input"
            :disabled="initializing || saving"
            @press-enter="search(false)"
          /><Button
            type="primary"
            :disabled="!canSearch || initializing"
            :loading="loading || initializing"
            @click="search(false)"
          >
            搜索客户目录
          </Button>
        </Space>
        <Alert
          v-if="result"
          type="info"
          show-icon
          :message="
            result.notice ||
            (result.hasMore ? '还有更多匹配客户。' : '已显示全部匹配客户。')
          "
          :description="`目录内匹配 ${result.matchedTotal} 个客户，已显示 ${items.length} 个。`"
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
                !directory?.complete
                  ? '目录尚未完整，请更新目录后重新搜索'
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
          加载更多匹配客户
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
                        ? (existing
                            ? existing.customerSource
                            : preview.customer.customerSource ||
                              preview.customer.sourceCustomerSource) || '—'
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
