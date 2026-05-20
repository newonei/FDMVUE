<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Button,
  Form,
  FormItem,
  Image,
  Input,
  message,
  Popconfirm,
  Spin,
  Table,
} from 'ant-design-vue';

import ImageUpload from '#/components/upload/image-upload.vue';

import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';
import {
  createDataJustPatternCost,
  deleteDataJustPatternCost,
  getDataJustPatternCostPage,
  suggestDataJustPatternCostItemCode,
  updateDataJustPatternCost,
} from '#/api/fdmdata/datajustpattern';

const emit = defineEmits(['success']);

const loading = ref(false);
const savingPattern = ref(false);

const createForm = reactive({
  styleCode: '',
  itemCode: '',
  productName: '',
  picUrl: '',
  remark: '',
});

const listLoading = ref(false);
const list = ref<FdmdataDataJustPatternApi.PatternCost[]>([]);

const editingId = ref<number | null>(null);
const editingForm = reactive({
  id: 0,
  itemCode: '',
  patternName: '',
  picUrl: '',
  remark: '',
});

/** 新增：用户键盘改过对照编码后，不再随图案名称自动覆盖 */
const createUserLockedItemCode = ref(false);
/** 编辑：同上 */
const editingUserLockedItemCode = ref(false);
/** 进入编辑时的图案名称；名称未相对此行变化时不自动建议，避免覆盖库里的自定义编码 */
const editBaselinePatternName = ref('');

let createSuggestTimer: ReturnType<typeof setTimeout> | null = null;
let editSuggestTimer: ReturnType<typeof setTimeout> | null = null;

function clearCreateSuggestTimer() {
  if (createSuggestTimer) {
    clearTimeout(createSuggestTimer);
    createSuggestTimer = null;
  }
}

function clearEditSuggestTimer() {
  if (editSuggestTimer) {
    clearTimeout(editSuggestTimer);
    editSuggestTimer = null;
  }
}

onBeforeUnmount(() => {
  clearCreateSuggestTimer();
  clearEditSuggestTimer();
});

const columns: ColumnsType = [
  { title: '预览图', key: 'pic', width: 120 },
  { title: '图案名称', dataIndex: 'patternName', key: 'patternName' },
  { title: '对照编码', dataIndex: 'itemCode', key: 'itemCode', width: 200 },
  { title: '操作', key: 'actions', width: 220 },
];

/** 列表缩略图防缓存（同 URL 替换上传时浏览器可能仍显示旧图） */
function picPreviewSrc(url?: string, id?: number) {
  const u = (url ?? '').trim();
  if (!u) return '';
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}v=${id ?? 0}`;
}

function normalizeItemCode(raw: string) {
  return (raw ?? '').trim().toUpperCase();
}

/** 与后端 PatternItemCodeAbbrUtil 一致：1～48 位大写字母或数字 */
function isValidItemCode(code: string) {
  return /^[A-Z0-9]{1,48}$/.test(code);
}

function scheduleCreatePatternSuggest() {
  clearCreateSuggestTimer();
  createSuggestTimer = setTimeout(async () => {
    createSuggestTimer = null;
    const name = (createForm.productName ?? '').trim();
    if (!name || createUserLockedItemCode.value) {
      return;
    }
    try {
      const raw = await suggestDataJustPatternCostItemCode(name);
      const s = normalizeItemCode(String(raw ?? ''));
      if (!createUserLockedItemCode.value) {
        createForm.itemCode = s;
      }
    } catch {
      /* 忽略网络错误，不打断录入 */
    }
  }, 400);
}

watch(
  () => createForm.productName,
  () => {
    scheduleCreatePatternSuggest();
  },
);

watch(
  () => editingForm.patternName,
  () => {
    if (editingId.value == null) {
      return;
    }
    clearEditSuggestTimer();
    editSuggestTimer = setTimeout(async () => {
      editSuggestTimer = null;
      const name = (editingForm.patternName ?? '').trim();
      if (!name || editingUserLockedItemCode.value) {
        return;
      }
      if (name === editBaselinePatternName.value) {
        return;
      }
      try {
        const raw = await suggestDataJustPatternCostItemCode(name);
        const s = normalizeItemCode(String(raw ?? ''));
        if (!editingUserLockedItemCode.value) {
          editingForm.itemCode = s;
        }
      } catch {
        /* ignore */
      }
    }, 400);
  },
);

async function reloadList() {
  listLoading.value = true;
  try {
    const res = await getDataJustPatternCostPage({ pageNo: 1, pageSize: 200 });
    list.value = res.list ?? [];
  } finally {
    listLoading.value = false;
  }
}

function beginEdit(row: FdmdataDataJustPatternApi.PatternCost) {
  if (!row?.id) return;
  clearEditSuggestTimer();
  editingId.value = row.id;
  editingForm.id = row.id;
  editingForm.itemCode = normalizeItemCode(row.itemCode ?? '');
  editingForm.patternName = (row.patternName ?? '').trim();
  editingForm.picUrl = (row.picUrl ?? '').trim();
  editingForm.remark = (row.remark ?? '').trim();
  editBaselinePatternName.value = editingForm.patternName;
  editingUserLockedItemCode.value = false;
}

function cancelEdit() {
  editingId.value = null;
  editingForm.id = 0;
  editingForm.itemCode = '';
  editingForm.patternName = '';
  editingForm.picUrl = '';
  editingForm.remark = '';
  editBaselinePatternName.value = '';
  editingUserLockedItemCode.value = false;
  clearEditSuggestTimer();
}

async function saveEdit() {
  const id = editingForm.id;
  const itemCode = normalizeItemCode(editingForm.itemCode ?? '');
  const patternName = (editingForm.patternName ?? '').trim();
  const picUrl = (editingForm.picUrl ?? '').trim();
  const remark = (editingForm.remark ?? '').trim();
  if (!id) return;
  if (!itemCode) return message.warning('请输入对照编码');
  if (!patternName) return message.warning('请输入图案名称');
  if (!isValidItemCode(itemCode)) {
    return message.warning(
      '对照编码须为 1～48 位大写字母或数字（如 LDKD、8ZLDKD）',
    );
  }
  savingPattern.value = true;
  try {
    await updateDataJustPatternCost({
      id,
      itemCode,
      patternName,
      picUrl,
      remark: remark || undefined,
    });
    message.success('保存成功');
    cancelEdit();
    await reloadList();
    emit('success');
  } finally {
    savingPattern.value = false;
  }
}

async function handleDelete(row: FdmdataDataJustPatternApi.PatternCost) {
  if (!row?.id) return;
  if (editingId.value === row.id) {
    cancelEdit();
  }
  try {
    await deleteDataJustPatternCost(row.id);
    message.success('删除成功');
    await reloadList();
    emit('success');
  } catch {
    /* 请求层已提示 */
  }
}

async function handleCreatePattern() {
  const patternName = createForm.productName?.trim();
  const itemCode = normalizeItemCode(createForm.itemCode ?? '');
  const picUrl = (createForm.picUrl ?? '').trim();
  const remark = (createForm.remark ?? '').trim();
  if (!itemCode) return message.warning('请输入对照编码');
  if (!patternName) return message.warning('请输入图案名称');
  if (!isValidItemCode(itemCode)) {
    return message.warning(
      '对照编码须为 1～48 位大写字母或数字（如 LDKD、8ZLDKD）',
    );
  }
  savingPattern.value = true;
  try {
    await createDataJustPatternCost({
      itemCode,
      patternName,
      picUrl: picUrl || undefined,
      remark: remark || undefined,
    });
    message.success('新增成功');
    createForm.styleCode = '';
    createForm.itemCode = '';
    createForm.productName = '';
    createForm.picUrl = '';
    createForm.remark = '';
    createUserLockedItemCode.value = false;
    clearCreateSuggestTimer();
    await reloadList();
    emit('success');
  } finally {
    savingPattern.value = false;
  }
}

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      cancelEdit();
      createForm.styleCode = '';
      createForm.itemCode = '';
      createForm.productName = '';
      createForm.picUrl = '';
      createForm.remark = '';
      createUserLockedItemCode.value = false;
      clearCreateSuggestTimer();
      list.value = [];
      return;
    }
    modalApi.lock();
    try {
      loading.value = true;
      createUserLockedItemCode.value = false;
      await reloadList();
    } finally {
      loading.value = false;
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <VbenModal
    title="维护图案编码（图案=商品）"
    class="w-[min(1280px,calc(100vw-2rem))]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Spin :spinning="loading">
      <div class="mb-4 rounded-md border border-border bg-muted/30 p-3">
        <div class="mb-2 text-sm font-medium text-foreground">新增图案商品</div>
        <p class="mb-3 text-xs text-muted-foreground">
          输入<strong>图案名称</strong>后，将按拼音首字母（及数字等）<strong>自动建议对照编码</strong>；在「对照编码」框内按键编辑后将固定为手工值，不再随名称变化。
        </p>
        <Form layout="vertical" class="mb-0">
          <div class="flex flex-wrap gap-4">
            <FormItem label="图案名称" class="mb-0 min-w-[260px] flex-1">
              <Input
                v-model:value="createForm.productName"
                placeholder="如 灵动凯蒂、8折灵动凯蒂"
                allow-clear
              />
            </FormItem>
            <FormItem label="对照编码" class="mb-0 min-w-[220px] flex-1">
              <Input
                v-model:value="createForm.itemCode"
                placeholder="如 LDKD、8ZLDKD（1～48 位字母或数字）"
                allow-clear
                @keydown="createUserLockedItemCode = true"
                @paste="createUserLockedItemCode = true"
                @blur="
                  createForm.itemCode = normalizeItemCode(
                    createForm.itemCode as any,
                  )
                "
              />
            </FormItem>
          </div>
          <FormItem label="图片（选填）" class="mb-0 mt-2">
            <ImageUpload v-model="createForm.picUrl" :max-number="1" />
          </FormItem>
          <FormItem label="备注" class="mb-0 mt-2">
            <Input
              v-model:value="createForm.remark"
              placeholder="备注"
              allow-clear
            />
          </FormItem>
          <Button
            type="primary"
            :loading="savingPattern"
            @click="handleCreatePattern"
          >
            保存新增
          </Button>
        </Form>
      </div>

      <div class="rounded-md border border-border p-3">
        <div class="mb-2 text-sm font-medium text-foreground">已有图案列表</div>
        <Spin :spinning="listLoading">
          <Table
            size="small"
            :columns="columns"
            :pagination="false"
            :data-source="list"
            row-key="id"
            bordered
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'pic'">
                <Image
                  v-if="record.picUrl"
                  :src="picPreviewSrc(record.picUrl, record.id)"
                  :width="48"
                  :height="48"
                  class="rounded object-cover"
                />
                <span v-else class="text-muted-foreground">-</span>
              </template>
              <template v-else-if="column.key === 'patternName'">
                <template v-if="editingId === record.id">
                  <Input v-model:value="editingForm.patternName" allow-clear />
                </template>
                <template v-else>
                  <span>{{ record.patternName }}</span>
                </template>
              </template>
              <template v-else-if="column.key === 'itemCode'">
                <template v-if="editingId === record.id">
                  <Input
                    v-model:value="editingForm.itemCode"
                    placeholder="如 LDKD、8ZLDKD"
                    allow-clear
                    @keydown="editingUserLockedItemCode = true"
                    @paste="editingUserLockedItemCode = true"
                    @blur="
                      editingForm.itemCode = normalizeItemCode(
                        editingForm.itemCode as any,
                      )
                    "
                  />
                </template>
                <template v-else>
                  <span class="font-mono">{{ record.itemCode }}</span>
                </template>
              </template>
              <template v-else-if="column.key === 'actions'">
                <template v-if="editingId === record.id">
                  <div class="flex flex-wrap gap-2">
                    <Button
                      type="primary"
                      size="small"
                      :loading="savingPattern"
                      @click="saveEdit"
                    >
                      保存
                    </Button>
                    <Button size="small" @click="cancelEdit">取消</Button>
                  </div>
                  <div class="mt-2">
                    <div class="mb-1 text-xs text-muted-foreground">图片</div>
                    <ImageUpload
                      :key="`edit-pic-${editingId}`"
                      v-model="editingForm.picUrl"
                      :max-number="1"
                    />
                  </div>
                  <div class="mt-2">
                    <div class="mb-1 text-xs text-muted-foreground">备注</div>
                    <Input v-model:value="editingForm.remark" allow-clear />
                  </div>
                </template>
                <template v-else>
                  <div class="flex flex-wrap items-center gap-2">
                    <Button size="small" @click="beginEdit(record)"
                      >编辑</Button
                    >
                    <Popconfirm
                      title="确定删除该图案商品？"
                      ok-text="删除"
                      cancel-text="取消"
                      @confirm="handleDelete(record)"
                    >
                      <Button size="small" danger>删除</Button>
                    </Popconfirm>
                  </div>
                </template>
              </template>
            </template>
            <template #emptyText>
              <div class="py-4 text-center text-muted-foreground">
                暂无图案数据
              </div>
            </template>
          </Table>
        </Spin>
      </div>
    </Spin>

    <div class="mt-4 flex justify-end border-t border-border pt-3">
      <Button @click="modalApi.close()">关闭</Button>
    </div>
  </VbenModal>
</template>
