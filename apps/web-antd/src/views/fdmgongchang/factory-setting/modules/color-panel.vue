<script setup lang="ts">
import type { ColorFilter } from './color-model';

import type { FdmgongchangColor } from '#/api/fdmgongchang/factory';

import { computed, onMounted, ref } from 'vue';

import {
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Radio,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  deleteFactoryColor,
  getFactoryColors,
  saveFactoryColor,
} from '#/api/fdmgongchang/factory';
import ImageUpload from '#/components/upload/image-upload.vue';

import {
  colorPreview,
  colorProblem,
  filterColors,
  HEX_PATTERN,
} from './color-model';

/**
 * 颜色配置：板材、片材等工序物料的色号，可选色值（列表里显示色块）和实物照片（有照片时优先显示）。
 * 系统字典 fdm_color 的颜色也列在这里，只能补色值、照片和备注。各厂共用。
 */
defineProps<{ canEdit: boolean }>();

const list = ref<FdmgongchangColor[]>([]);
const loading = ref(false);
const keyword = ref('');
const filter = ref<ColorFilter>('all');
/** 编辑中的颜色：文本字段都是字符串，方便绑定输入框。 */
interface Draft {
  code: string;
  dictLinked?: boolean;
  hex: string;
  id?: number;
  imageUrl: string;
  name: string;
  remark: string;
  sort: number;
  status: number;
}

const editing = ref<Draft>();
const saving = ref(false);

const rows = computed(() => filterColors(list.value, keyword.value, filter.value));
const missing = computed(
  () => list.value.filter((c) => colorPreview(c).kind === 'none').length,
);
const pickerValue = computed(() =>
  editing.value?.hex && HEX_PATTERN.test(editing.value.hex)
    ? editing.value.hex
    : '#FFFFFF',
);

const columns = [
  { title: '预览', key: 'preview', width: 72 },
  { title: '色号', dataIndex: 'code', key: 'code', width: 160 },
  { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
  { title: '色值', dataIndex: 'hex', key: 'hex', width: 100 },
  { title: '在用物料', dataIndex: 'itemCount', key: 'itemCount', width: 90 },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'action', width: 120 },
];

async function load() {
  loading.value = true;
  try {
    list.value = await getFactoryColors();
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function open(color?: FdmgongchangColor) {
  editing.value = {
    code: color?.code ?? '',
    dictLinked: color?.dictLinked,
    hex: color?.hex ?? '',
    id: color?.id,
    imageUrl: color?.imageUrl ?? '',
    name: color?.name ?? '',
    remark: color?.remark ?? '',
    sort: color?.sort ?? 0,
    status: color?.status ?? 0,
  };
}

/** 表格行转回颜色类型。 */
function row(record: Record<string, any>) {
  return record as FdmgongchangColor;
}

async function save() {
  const color = editing.value;
  if (!color) return;
  const problem = colorProblem(color);
  if (problem) {
    message.warning(problem);
    return;
  }
  saving.value = true;
  try {
    await saveFactoryColor({
      ...color,
      code: color.code.trim(),
      hex: color.hex.trim() || undefined,
      imageUrl: color.imageUrl || undefined,
      name: color.name.trim() || undefined,
      remark: color.remark.trim() || undefined,
    });
    message.success('已保存');
    editing.value = undefined;
    await load();
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}

async function remove(color: FdmgongchangColor) {
  if (!color.id) return;
  try {
    await deleteFactoryColor(color.id);
    message.success('已删除');
    await load();
  } catch {
    // 后端错误已由全局提示展示
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="m-0 text-sm font-semibold">
      颜色配置<span class="ml-2 text-xs font-normal text-muted-foreground">板材、片材等的色号；有照片显示照片，没有照片显示色值色块。各厂共用</span>
    </h2>
    <div class="flex flex-wrap items-center gap-2">
      <Input
        v-model:value="keyword"
        allow-clear
        class="w-56"
        placeholder="搜色号、名称、备注"
      />
      <Radio.Group v-model:value="filter" size="small" button-style="solid">
        <Radio.Button value="all">全部 {{ list.length }}</Radio.Button>
        <Radio.Button value="noPreview">缺预览 {{ missing }}</Radio.Button>
        <Radio.Button value="used">在用</Radio.Button>
        <Radio.Button value="disabled">停用</Radio.Button>
      </Radio.Group>
      <Button v-if="canEdit" type="primary" class="ml-auto" @click="open()">
        新建色号
      </Button>
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{ pageSize: 50, showSizeChanger: false }"
      row-key="id"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'preview'">
          <img
            v-if="colorPreview(row(record)).kind === 'image'"
            :src="colorPreview(row(record)).value"
            :alt="record.code"
            class="color-chip object-cover"
          />
          <span
            v-else-if="colorPreview(row(record)).kind === 'swatch'"
            class="color-chip"
            :style="{ background: colorPreview(row(record)).value }"
          ></span>
          <span v-else class="color-chip color-chip-empty">无</span>
        </template>
        <template v-else-if="column.key === 'code'">
          {{ record.code }}
          <Tag v-if="record.dictLinked" class="ml-1">系统字典</Tag>
        </template>
        <template v-else-if="column.key === 'hex'">
          <span class="font-mono text-xs">{{ record.hex || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag v-if="record.status === 1">停用</Tag>
          <span v-else class="text-xs text-muted-foreground">启用</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <template v-if="canEdit">
            <Button size="small" type="link" @click="open(row(record))">编辑</Button>
            <Popconfirm
              v-if="!record.dictLinked && !record.itemCount"
              title="删除这个色号？"
              @confirm="remove(row(record))"
            >
              <Button size="small" type="link" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </template>
    </Table>

    <Modal
      :open="!!editing"
      :title="editing?.id ? `编辑色号 ${editing.code}` : '新建色号'"
      :confirm-loading="saving"
      ok-text="保存"
      @ok="save"
      @cancel="editing = undefined"
    >
      <div v-if="editing" class="flex flex-col gap-3">
        <p v-if="editing.dictLinked" class="m-0 text-xs text-muted-foreground">
          这是系统字典里的颜色（SKU 编码共用），色号和名称在字典里维护，这里只补色值、照片和备注。
        </p>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">色号</span>
          <Input
            v-model:value="editing.code"
            :disabled="editing.dictLinked"
            :maxlength="64"
            placeholder="例如 2206、8C、崔先生7632"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">名称（可空）</span>
          <Input
            v-model:value="editing.name"
            :disabled="editing.dictLinked"
            :maxlength="64"
            placeholder="例如 菘蓝绿"
          />
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">色值</span>
          <div class="flex items-center gap-2">
            <input
              type="color"
              aria-label="选色值"
              class="color-picker"
              :value="pickerValue"
              @input="editing.hex = ($event.target as HTMLInputElement).value.toUpperCase()"
            />
            <Input
              v-model:value="editing.hex"
              :maxlength="7"
              class="w-32 font-mono"
              placeholder="#2E6B4F"
            />
            <Button v-if="editing.hex" size="small" type="link" @click="editing.hex = ''">
              清空
            </Button>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">实物照片（有照片时列表优先显示照片）</span>
          <ImageUpload
            v-model:value="editing.imageUrl"
            :max-number="1"
            :max-size="5"
            :show-description="false"
            directory="fdmgongchang/color"
          />
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">备注</span>
          <Input v-model:value="editing.remark" :maxlength="255" />
        </label>
        <div class="flex items-center gap-6">
          <label class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">排序</span>
            <InputNumber v-model:value="editing.sort" :min="0" :max="99999" size="small" />
          </label>
          <label v-if="!editing.dictLinked" class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">启用</span>
            <Switch
              :checked="editing.status !== 1"
              size="small"
              @change="(v) => (editing!.status = v ? 0 : 1)"
            />
          </label>
        </div>
      </div>
    </Modal>
  </section>
</template>

<style scoped>
.color-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 11px;
  vertical-align: middle;
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 6px;
}

.color-chip-empty {
  color: var(--ant-color-text-quaternary, #bfbfbf);
  border-style: dashed;
}

.color-picker {
  width: 36px;
  height: 32px;
  padding: 0;
  cursor: pointer;
  background: none;
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 6px;
}
</style>
