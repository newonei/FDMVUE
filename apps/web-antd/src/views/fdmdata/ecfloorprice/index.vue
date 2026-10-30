<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page, useVbenModal } from '@vben/common-ui';
import { DICT_TYPE } from '@vben/constants';
import { getDictOptions } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  Empty,
  message,
  Segmented,
  Spin,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcFloorPrice,
  exportEcFloorPriceExcel,
  getEcFloorPricePage,
  getEcFloorPriceSeriesCounts,
} from '#/api/fdmdata/ecfloorprice';

import {
  materialLabel,
  matKindLabel,
  seriesLabel,
  useGridColumns,
  useGridFormSchema,
} from './data';
import { buildSpecMatrix, formatPrice, thicknessLabel } from './model';
import Form from './modules/form.vue';
import ImportModal from './modules/import-modal.vue';
import LogModal from './modules/log-modal.vue';
import QuickAsk from './modules/quick-ask.vue';

defineOptions({ name: 'FdmdataEcFloorPrice' });

type FloorPrice = FdmdataEcFloorPriceApi.FloorPrice;

const UPDATE_AUTH = 'fdmdata:ec-floor-price:update';
const { hasAccessByCodes } = useAccess();
const canEdit = computed(() => hasAccessByCodes([UPDATE_AUTH]));

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });
const [ImportDialog, importModalApi] = useVbenModal({
  connectedComponent: ImportModal,
});
const [LogDialog, logModalApi] = useVbenModal({ connectedComponent: LogModal });

// ========== 左侧系列 ==========

const seriesCounts = ref<Record<string, number>>({});
const activeSeries = ref<string>();
const showEmptySeries = ref(false);
const totalCount = computed(() =>
  Object.values(seriesCounts.value).reduce((sum, n) => sum + n, 0),
);
const seriesList = computed(() => {
  const dict = getDictOptions(DICT_TYPE.FDM_EC_PRICE_SERIES, 'string');
  const known = new Set(dict.map((d) => d.value));
  const list = dict.map((d) => ({
    value: d.value,
    label: d.label,
    count: seriesCounts.value[d.value] ?? 0,
  }));
  // 字典里删掉了、但还有底价的系列也列出来
  for (const [code, count] of Object.entries(seriesCounts.value)) {
    if (!known.has(code)) list.push({ value: code, label: code, count });
  }
  return showEmptySeries.value ? list : list.filter((s) => s.count > 0);
});

async function loadSeriesCounts() {
  const list = await getEcFloorPriceSeriesCounts();
  seriesCounts.value = Object.fromEntries(
    list.map((s) => [s.seriesCode, s.count]),
  );
}

function selectSeries(code?: string) {
  activeSeries.value = code;
}

// ========== 列表 / 规格表 ==========

const viewMode = ref<'list' | 'matrix'>('list');
const matrixRows = ref<FloorPrice[]>([]);
const matrixLoading = ref(false);
const matrix = computed(() => buildSpecMatrix(matrixRows.value));
const matrixMaterials = computed(
  () => new Set(matrix.value.rows.map((r) => r.materialKey)).size > 1,
);

async function loadMatrix() {
  if (!activeSeries.value) {
    matrixRows.value = [];
    return;
  }
  matrixLoading.value = true;
  try {
    // 规格表看一个系列的全貌，不套用列表的筛选
    const res = await getEcFloorPricePage({
      seriesCode: activeSeries.value,
      pageNo: 1,
      pageSize: -1,
    });
    matrixRows.value = res.list;
  } finally {
    matrixLoading.value = false;
  }
}

function reload() {
  if (viewMode.value === 'matrix') {
    void loadMatrix();
  } else {
    void gridApi.query();
  }
}

async function refreshAll() {
  await loadSeriesCounts();
  reload();
}

watch(activeSeries, () => {
  if (!activeSeries.value && viewMode.value === 'matrix') {
    viewMode.value = 'list';
  }
  reload();
});
watch(viewMode, reload);

// ========== 操作 ==========

function handleCreate() {
  formModalApi.setData({ seriesCode: activeSeries.value }).open();
}

function handleEdit(row: FloorPrice) {
  formModalApi.setData(row).open();
}

function handleLogs(row: FloorPrice) {
  logModalApi.setData(row).open();
}

async function handleDelete(row: FloorPrice) {
  if (!row.id) return;
  await deleteEcFloorPrice(row.id);
  message.success('已删除');
  await refreshAll();
}

const exporting = ref(false);
async function handleExport() {
  exporting.value = true;
  try {
    const formValues = await gridApi.formApi.getValues();
    const data = await exportEcFloorPriceExcel({
      ...formValues,
      seriesCode: activeSeries.value,
    });
    const name = activeSeries.value ? seriesLabel(activeSeries.value) : '全部';
    downloadFileFromBlobPart({ fileName: `公司底价-${name}.xlsx`, source: data });
  } finally {
    exporting.value = false;
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
    submitOnChange: true,
    handleSubmit: async () => {
      reload();
    },
  },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: 'auto',
    keepSource: false,
    stripe: true,
    pagerConfig: { pageSize: 50 },
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getEcFloorPricePage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            seriesCode: activeSeries.value,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FloorPrice>,
});

onMounted(loadSeriesCounts);
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refreshAll" />
    <ImportDialog @success="refreshAll" />
    <LogDialog />

    <div class="flex h-full flex-col gap-3">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">公司底价</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            可以一句话问 AI 查底价，也可以按产品系列、规格筛选；参考价默认底价×1.2，可单条手改。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button :loading="exporting" @click="handleExport">
            <template #icon><IconifyIcon icon="lucide:download" /></template>
            导出
          </Button>
          <Button v-if="canEdit" @click="importModalApi.open()">
            <template #icon><IconifyIcon icon="lucide:upload" /></template>
            导入
          </Button>
          <Button v-if="canEdit" type="primary" @click="handleCreate">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            新增底价
          </Button>
        </div>
      </header>

      <QuickAsk />

      <div class="flex min-h-0 flex-1 gap-3">
        <aside
          class="flex w-48 flex-shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card"
        >
          <div class="border-b border-border px-3 py-2 text-sm font-medium">
            产品系列
          </div>
          <div class="flex-1 overflow-y-auto py-1">
            <div
              class="flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
              :class="{ 'bg-primary/10 text-primary': !activeSeries }"
              @click="selectSeries(undefined)"
            >
              <span>全部</span>
              <span class="text-xs text-muted-foreground">{{ totalCount }}</span>
            </div>
            <div
              v-for="s in seriesList"
              :key="s.value"
              class="flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
              :class="{ 'bg-primary/10 text-primary': activeSeries === s.value }"
              @click="selectSeries(s.value)"
            >
              <span class="truncate">{{ s.label }}</span>
              <span class="text-xs text-muted-foreground">{{ s.count }}</span>
            </div>
            <Empty
              v-if="seriesList.length === 0"
              class="my-6"
              description="还没有底价"
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
            />
          </div>
          <div class="border-t border-border px-3 py-2 text-xs">
            <a @click="showEmptySeries = !showEmptySeries">
              {{ showEmptySeries ? '只看有底价的系列' : '显示全部系列' }}
            </a>
          </div>
        </aside>

        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex items-center gap-2">
            <Tooltip :title="activeSeries ? '' : '先在左侧选一个系列'">
              <Segmented
                v-model:value="viewMode"
                :options="[
                  { label: '列表', value: 'list' },
                  { label: '尺寸×厚度', value: 'matrix', disabled: !activeSeries },
                ]"
              />
            </Tooltip>
            <span v-if="viewMode === 'matrix'" class="text-xs text-muted-foreground">
              {{ seriesLabel(activeSeries) }}：行是尺寸，列是厚度{{ canEdit ? '，点价格可以修改' : '' }}
            </span>
          </div>
          <Grid v-show="viewMode === 'list'" class="min-h-0 flex-1">
            <template #floorPrice="{ row }">
              <span :class="row.floorPrice ? 'font-medium' : 'text-muted-foreground'">
                {{ formatPrice(row.floorPrice) }}
              </span>
            </template>
            <template #refPrice="{ row }">
              <span :class="row.refPrice ? '' : 'text-muted-foreground'">
                {{ formatPrice(row.refPrice) }}
              </span>
              <Tag v-if="row.refPriceManual" class="ml-1 mr-0" color="orange">手填</Tag>
            </template>
            <template #actions="{ row }">
              <TableAction
                :actions="[
                  {
                    label: '修改',
                    type: 'link',
                    icon: ACTION_ICON.EDIT,
                    auth: [UPDATE_AUTH],
                    onClick: handleEdit.bind(null, row),
                  },
                  {
                    label: '记录',
                    type: 'link',
                    onClick: handleLogs.bind(null, row),
                  },
                  {
                    label: '删除',
                    type: 'link',
                    danger: true,
                    icon: ACTION_ICON.DELETE,
                    auth: [UPDATE_AUTH],
                    popConfirm: {
                      title: `删除 ${row.specText} 的底价？`,
                      confirm: handleDelete.bind(null, row),
                    },
                  },
                ]"
              />
            </template>
          </Grid>

          <div
            v-if="viewMode === 'matrix'"
            class="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card p-3"
          >
            <Spin :spinning="matrixLoading">
              <Empty
                v-if="!matrixLoading && matrix.rows.length === 0 && matrix.others.length === 0"
                description="这个系列还没有底价"
              />
              <table v-if="matrix.rows.length > 0" class="ec-floor-matrix w-full text-sm">
                <thead>
                  <tr>
                    <th class="text-left">尺寸</th>
                    <th v-for="t in matrix.thicknesses" :key="t">{{ thicknessLabel(t) }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in matrix.rows" :key="r.key">
                    <td class="text-left font-medium">
                      {{ r.size }}
                      <span v-if="matrixMaterials" class="text-xs text-muted-foreground">
                        {{ materialLabel(r.materialKey) || '不区分材质' }}
                      </span>
                    </td>
                    <td v-for="t in matrix.thicknesses" :key="t">
                      <template v-if="r.cells[t]">
                        <a
                          v-if="canEdit"
                          :class="r.cells[t]!.floorPrice ? 'font-medium' : 'text-muted-foreground'"
                          @click="handleEdit(r.cells[t]!)"
                        >
                          {{ formatPrice(r.cells[t]!.floorPrice) }}
                        </a>
                        <span v-else class="font-medium">
                          {{ formatPrice(r.cells[t]!.floorPrice) }}
                        </span>
                        <div class="text-xs text-muted-foreground">
                          参考 {{ formatPrice(r.cells[t]!.refPrice) }}
                        </div>
                      </template>
                      <span v-else class="text-muted-foreground">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="matrix.others.length > 0" class="mt-3">
                <div class="mb-1 text-xs text-muted-foreground">其他规格</div>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="o in matrix.others"
                    :key="o.id"
                    class="rounded border border-border px-2 py-1 text-sm"
                  >
                    {{ o.specText }}
                    <template v-if="o.matKind">（{{ matKindLabel(o.matKind) }}）</template>
                    ：<b>{{ formatPrice(o.floorPrice) }}</b>
                    <span class="text-xs text-muted-foreground">
                      / 参考 {{ formatPrice(o.refPrice) }}
                    </span>
                  </div>
                </div>
              </div>
            </Spin>
          </div>
        </div>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.ec-floor-matrix th,
.ec-floor-matrix td {
  padding: 6px 10px;
  text-align: center;
  border: 1px solid hsl(var(--border));
}

.ec-floor-matrix th {
  font-weight: 500;
  background: hsl(var(--accent));
}
</style>
