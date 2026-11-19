<script lang="ts" setup>
import type { TableColumnsType, UploadProps } from 'ant-design-vue';

import type { FdmcaiwuMouldProfileApi } from '#/api/fdmcaiwu/mould-profile';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  Card,
  Checkbox,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Upload,
} from 'ant-design-vue';

import {
  createMouldProfile,
  deleteMouldProfile,
  downloadMouldImportTemplate,
  getMouldProfilePage,
  importMouldProfiles,
  updateMouldProfile,
  updateMouldRecipeCharge,
} from '#/api/fdmcaiwu/mould-profile';

defineOptions({ name: 'FdmcaiwuMouldProfile' });

type Profile = FdmcaiwuMouldProfileApi.Profile;
type ProfileForm = FdmcaiwuMouldProfileApi.SaveReq;
type Reference = FdmcaiwuMouldProfileApi.Reference;
type Recipe = FdmcaiwuMouldProfileApi.RecipeColumn;

const DIMENSIONS = [
  { field: 'mouldLengthMm', label: '模腔长度' },
  { field: 'mouldWidthMm', label: '模腔宽度' },
  { field: 'mouldThicknessMm', label: '模腔厚度' },
  { field: 'boardLengthMm', label: '净板长度' },
  { field: 'boardWidthMm', label: '净板宽度' },
  { field: 'boardThicknessMm', label: '净板厚度' },
] as const;

const REFERENCE_FIELDS = [
  { field: 'lengthMm', label: '基准模腔长度 (mm)', precision: 3 },
  { field: 'widthMm', label: '基准模腔宽度 (mm)', precision: 3 },
  { field: 'thicknessMm', label: '基准模腔厚度 (mm)', precision: 3 },
  { field: 'weightKg', label: '基准装模量 (kg)', precision: 6 },
] as const;

const STATUS_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

const numberFormat = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 6,
  useGrouping: false,
});
const { hasAccessByCodes } = useAccess();
const canImport = computed(
  () =>
    hasAccessByCodes(['fdmcaiwu:mould-profile:create']) &&
    hasAccessByCodes(['fdmcaiwu:mould-profile:update']),
);

const loading = ref(false);
const rows = ref<Profile[]>([]);
const recipes = ref<Recipe[]>([]);
const total = ref(0);
const filters = reactive({
  enabled: undefined as number | undefined,
  keyword: '',
  pageNo: 1,
  pageSize: 20,
});
const recipeFilter = ref<number[]>([]);
const recipeOptions = computed(() =>
  recipes.value.map((recipe) => ({
    label: `${recipe.recipeName} · ${recipe.recipeCode}`,
    value: recipe.id,
  })),
);
const visibleRecipes = computed(() =>
  recipeFilter.value.length
    ? recipes.value.filter((recipe) => recipeFilter.value.includes(recipe.id))
    : recipes.value,
);

const columns = computed<TableColumnsType<Profile>>(() => [
  {
    dataIndex: 'profileCode',
    fixed: 'left',
    key: 'profileCode',
    title: '模具编码',
    width: 155,
  },
  {
    dataIndex: 'profileName',
    ellipsis: true,
    key: 'profileName',
    title: '模具名称',
    width: 175,
  },
  { key: 'mouldSpecification', title: '模腔尺寸 (mm)', width: 175 },
  { key: 'boardSpecification', title: '净板尺寸 (mm)', width: 175 },
  ...(visibleRecipes.value.length
    ? [
        {
          children: visibleRecipes.value.map((recipe) => ({
            align: 'right' as const,
            dataIndex: ['recipeChargeWeightsKg', String(recipe.id)],
            key: `recipe-${recipe.id}`,
            title: recipe.recipeCode,
            width: 170,
          })),
          key: 'recipeCharges',
          title: '配方装模量 (kg / 模)',
        },
      ]
    : []),
  { key: 'enabled', title: '状态', width: 90 },
  { fixed: 'right', key: 'action', title: '操作', width: 120 },
]);
const scrollWidth = computed(() => 890 + visibleRecipes.value.length * 170);
const recipesByColumn = computed(
  () => new Map(recipes.value.map((recipe) => [`recipe-${recipe.id}`, recipe])),
);

function specification(values: (number | string)[]) {
  return values.map((value) => numberFormat.format(Number(value))).join(' × ');
}

let latestRequest = 0;
async function loadData() {
  const request = ++latestRequest;
  loading.value = true;
  try {
    const result = await getMouldProfilePage({
      enabled: filters.enabled === undefined ? undefined : filters.enabled === 1,
      keyword: filters.keyword.trim() || undefined,
      pageNo: filters.pageNo,
      pageSize: filters.pageSize,
    });
    if (request !== latestRequest) return;
    rows.value = result.list;
    recipes.value = result.recipes;
    const activeIds = new Set(result.recipes.map((recipe) => recipe.id));
    recipeFilter.value = recipeFilter.value.filter((id) => activeIds.has(id));
    total.value = result.total;
  } finally {
    if (request === latestRequest) loading.value = false;
  }
}

function search() {
  filters.pageNo = 1;
  return loadData();
}

function changePage(pagination: { current?: number; pageSize?: number }) {
  filters.pageNo = pagination.current ?? 1;
  filters.pageSize = pagination.pageSize ?? 20;
  return loadData();
}

const profileOpen = ref(false);
const profileSaving = ref(false);
const profileForm = ref<ProfileForm>(emptyProfile());

function emptyProfile(): ProfileForm {
  return {
    blockedReason: '',
    boardLengthMm: '',
    boardThicknessMm: '',
    boardWidthMm: '',
    enabled: true,
    mouldLengthMm: '',
    mouldThicknessMm: '',
    mouldWidthMm: '',
    profileCode: '',
    profileName: '',
  };
}

function editProfile(profile?: Profile) {
  profileForm.value = profile
    ? {
        blockedReason: profile.blockedReason ?? '',
        boardLengthMm: profile.boardLengthMm,
        boardThicknessMm: profile.boardThicknessMm,
        boardWidthMm: profile.boardWidthMm,
        enabled: profile.enabled,
        id: profile.id,
        mouldLengthMm: profile.mouldLengthMm,
        mouldThicknessMm: profile.mouldThicknessMm,
        mouldWidthMm: profile.mouldWidthMm,
        profileCode: profile.profileCode,
        profileName: profile.profileName,
      }
    : emptyProfile();
  profileOpen.value = true;
}

async function saveProfile() {
  const form = profileForm.value;
  if (!form.profileCode.trim() || !form.profileName.trim()) {
    message.warning('请填写模具编码和名称');
    return;
  }
  if (DIMENSIONS.some(({ field }) => !(Number(form[field]) > 0))) {
    message.warning('请填写大于 0 的模腔和净板尺寸');
    return;
  }
  profileSaving.value = true;
  try {
    if (form.id) {
      await updateMouldProfile(form);
    } else {
      await createMouldProfile(form);
    }
    profileOpen.value = false;
    message.success('模具已保存');
    await (form.id ? loadData() : search());
  } finally {
    profileSaving.value = false;
  }
}

function removeProfile(profile: Profile) {
  Modal.confirm({
    content: `删除「${profile.profileName}」后，该模具将从可选模具中移除。`,
    okText: '删除',
    okType: 'danger',
    title: '删除模具',
    async onOk() {
      await deleteMouldProfile(profile.id);
      message.success('模具已删除');
      if (rows.value.length === 1 && filters.pageNo > 1) filters.pageNo--;
      await loadData();
    },
  });
}

const importOpen = ref(false);
const importing = ref(false);
const downloading = ref(false);
const importFile = ref<File>();
const disableMissing = ref(false);

function openImport() {
  importFile.value = undefined;
  disableMissing.value = false;
  importOpen.value = true;
}

const chooseFile: UploadProps['beforeUpload'] = (file) => {
  importFile.value = file;
  return false;
};

async function downloadTemplate() {
  downloading.value = true;
  try {
    downloadFileFromBlobPart({
      fileName: '模具导入模板.xlsx',
      source: await downloadMouldImportTemplate(),
    });
  } finally {
    downloading.value = false;
  }
}

async function applyImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const result = await importMouldProfiles(importFile.value, disableMissing.value);
    importOpen.value = false;
    message.success(
      `导入完成，新增 ${result.created} 个、更新 ${result.updated} 个、停用 ${result.disabled} 个。`,
    );
    await search();
  } finally {
    importing.value = false;
  }
}

const referenceOpen = ref(false);
const referenceSaving = ref(false);
const referenceRecipeId = ref<number>();
const referenceForm = ref<Reference>({});

function changeReferenceRecipe(id?: number) {
  referenceRecipeId.value = id;
  referenceForm.value = { ...recipes.value.find((recipe) => recipe.id === id)?.reference };
}

function openReference() {
  changeReferenceRecipe(recipes.value[0]?.id);
  referenceOpen.value = true;
}

async function saveReference() {
  const id = referenceRecipeId.value;
  if (id === undefined || REFERENCE_FIELDS.some(({ field }) => !(Number(referenceForm.value[field]) > 0))) {
    message.warning('请选择配方并填写完整的基准模腔尺寸和装模量');
    return;
  }
  referenceSaving.value = true;
  try {
    await updateMouldRecipeCharge(id, referenceForm.value);
    referenceOpen.value = false;
    message.success('配方装模基准已更新');
    await loadData();
  } finally {
    referenceSaving.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <Page title="模具管理">
    <Card :bordered="false">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Space wrap>
          <Input
            v-model:value="filters.keyword"
            allow-clear
            placeholder="模具编码或名称"
            @press-enter="search"
          />
          <Select
            v-model:value="filters.enabled"
            allow-clear
            class="w-28"
            :options="STATUS_OPTIONS"
            placeholder="全部状态"
            @change="search"
          />
          <Button :loading="loading" @click="search">
            <template #icon><IconifyIcon icon="lucide:search" /></template>
            查询
          </Button>
        </Space>
        <Space wrap>
          <Button
            v-access:code="['fdmcaiwu:recipe:update']"
            :disabled="recipes.length === 0"
            @click="openReference"
          >
            配方装模基准
          </Button>
          <Button v-if="canImport" @click="openImport">
            <template #icon><IconifyIcon icon="lucide:upload" /></template>
            导入模具
          </Button>
          <Button
            v-access:code="['fdmcaiwu:mould-profile:create']"
            type="primary"
            @click="editProfile()"
          >
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            新增模具
          </Button>
        </Space>
      </div>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <Select
          v-model:value="recipeFilter"
          allow-clear
          class="w-full sm:w-80"
          :disabled="recipes.length === 0"
          :max-tag-count="2"
          mode="multiple"
          option-filter-prop="label"
          :options="recipeOptions"
          placeholder="显示全部配方"
        />
        <span class="text-muted-foreground text-sm">
          {{ recipes.length ? '装模量按配方基准及模腔体积换算' : '暂无启用的配方' }}
        </span>
      </div>
      <Table
        bordered
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{
          current: filters.pageNo,
          pageSize: filters.pageSize,
          showSizeChanger: true,
          total,
        }"
        row-key="id"
        :scroll="{ x: scrollWidth }"
        size="middle"
        @change="changePage"
      >
        <template #headerCell="{ column }">
          <template v-if="recipesByColumn.has(String(column.key))">
            <div class="font-medium">
              {{ recipesByColumn.get(String(column.key))?.recipeName }}
            </div>
            <div class="text-muted-foreground text-xs font-normal">{{ column.title }}</div>
          </template>
        </template>
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === 'mouldSpecification'">
            {{ specification([record.mouldLengthMm, record.mouldWidthMm, record.mouldThicknessMm]) }}
          </template>
          <template v-else-if="column.key === 'boardSpecification'">
            {{ specification([record.boardLengthMm, record.boardWidthMm, record.boardThicknessMm]) }}
          </template>
          <template v-else-if="recipesByColumn.has(String(column.key))">
            <span v-if="text != null" class="tabular-nums">{{ numberFormat.format(Number(text)) }}</span>
            <span v-else class="text-muted-foreground text-xs">
              {{ recipesByColumn.get(String(column.key))?.reference.weightKg ? '无法计算' : '待设基准' }}
            </span>
          </template>
          <template v-else-if="column.key === 'enabled'">
            <Tooltip :title="record.blockedReason">
              <Tag :color="record.enabled ? 'success' : 'default'">
                {{ record.enabled ? '启用' : '停用' }}
              </Tag>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button v-access:code="['fdmcaiwu:mould-profile:update']" size="small" type="link" @click="editProfile(record as Profile)">
                编辑
              </Button>
              <Button v-access:code="['fdmcaiwu:mould-profile:delete']" danger size="small" type="link" @click="removeProfile(record as Profile)">
                删除
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="profileOpen"
      :confirm-loading="profileSaving"
      :title="profileForm.id ? '编辑模具' : '新增模具'"
      ok-text="保存"
      width="720px"
      @ok="saveProfile"
    >
      <Form :disabled="profileSaving" layout="vertical">
        <div class="grid gap-x-4 sm:grid-cols-2">
          <FormItem label="模具编码" required>
            <Input v-model:value="profileForm.profileCode" :maxlength="96" />
          </FormItem>
          <FormItem label="模具名称" required>
            <Input v-model:value="profileForm.profileName" :maxlength="192" />
          </FormItem>
        </div>
        <div class="grid gap-x-4 sm:grid-cols-3">
          <FormItem v-for="{ field, label } in DIMENSIONS" :key="field" :label="label" required>
            <InputNumber
              :value="profileForm[field] === '' ? undefined : profileForm[field]"
              addon-after="mm"
              class="w-full"
              :min="0.001"
              :precision="3"
              string-mode
              @update:value="(value) => (profileForm[field] = value ?? '')"
            />
          </FormItem>
        </div>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <FormItem label="启用">
            <Switch v-model:checked="profileForm.enabled" />
          </FormItem>
          <FormItem label="阻断原因">
            <Input v-model:value="profileForm.blockedReason" :maxlength="512" />
          </FormItem>
        </div>
      </Form>
    </Modal>

    <Modal
      v-model:open="importOpen"
      :confirm-loading="importing"
      :mask-closable="!importing"
      :ok-button-props="{ disabled: !importFile }"
      ok-text="导入"
      title="导入模具"
      @ok="applyImport"
    >
      <p class="mb-4 text-sm">按模具编码匹配。已有编码更新档案，新编码新增档案。</p>
      <Space class="mb-4" wrap>
        <Button :loading="downloading" @click="downloadTemplate">下载 Excel 模板</Button>
        <Upload
          accept=".xlsx,.xls"
          :before-upload="chooseFile"
          :disabled="importing"
          :show-upload-list="false"
        >
          <Button :disabled="importing">选择 Excel 文件</Button>
        </Upload>
        <span v-if="importFile">{{ importFile.name }}</span>
      </Space>
      <div>
        <Checkbox v-model:checked="disableMissing" :disabled="importing">
          停用本次文件中未列出的模具
        </Checkbox>
      </div>
    </Modal>

    <Modal
      v-model:open="referenceOpen"
      :confirm-loading="referenceSaving"
      ok-text="保存"
      title="配方装模基准"
      @ok="saveReference"
    >
      <Form :disabled="referenceSaving" layout="vertical">
        <FormItem label="配方" required>
          <Select
            :value="referenceRecipeId"
            option-filter-prop="label"
            :options="recipeOptions"
            show-search
            @change="(value) => changeReferenceRecipe(value as number)"
          />
        </FormItem>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <FormItem v-for="{ field, label, precision } in REFERENCE_FIELDS" :key="field" :label="label" required>
            <InputNumber
              :value="referenceForm[field] ?? undefined"
              class="w-full"
              :min="10 ** -precision"
              :precision="precision"
              string-mode
              @update:value="(value) => (referenceForm[field] = value)"
            />
          </FormItem>
        </div>
        <p class="text-muted-foreground mb-1 text-sm">
          装模量 = 基准装模量 × 当前模腔体积 ÷ 基准模腔体积
        </p>
      </Form>
    </Modal>
  </Page>
</template>