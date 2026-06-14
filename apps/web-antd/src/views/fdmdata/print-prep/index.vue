<script lang="ts" setup>
import type {
  PrintPrepApi,
  PrintPrepOutputFileKey,
} from '#/api/fdmdata/print-prep';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  createPrintPrepBaseJob,
  createPrintPrepLayoutJob,
  fetchPrintPrepOutputBlob,
  getPrintPrepHistory,
  getPrintPrepJob,
  getPrintPrepOptions,
  getPrintPrepFileLocation,
  PRINT_PREP_OUTPUT_FILE_DEFINITIONS,
  PRINT_PREP_API_BASE,
  resolvePrintPrepAssetUrl,
  uploadPrintPrepOutputBlob,
  uploadPrintPrepReferenceBlob,
} from '#/api/fdmdata/print-prep';

defineOptions({ name: 'FdmdataPrintPrep' });

type ProductType = '大号鼠标垫' | '麂皮绒垫' | '普拉提垫' | '小号鼠标垫';
type AiProvider =
  | 'ark_seedream'
  | 'gpt_image_2'
  | 'nanobanana'
  | 'nanobanana2'
  | 'nanobanana_pro'
  | 'none';
type AiSize = '1K' | '2K' | '4K';
type BackgroundMode = 'clean' | 'preserve';
type LayoutMode = 'pilates_template' | 'standard';
type LogoColor = 'auto' | 'black' | 'white';
type Orientation = 'auto' | 'landscape' | 'portrait';

interface PrintPrepFormState {
  addYugaLogo: boolean;
  aiPreprocessPrompt: string;
  aiPreprocessProvider: AiProvider;
  aiPreprocessSize: AiSize;
  aiReferenceUrl: string;
  backgroundMode: BackgroundMode;
  customerPrompt: string;
  layoutMode: LayoutMode;
  lightBackground: boolean;
  logoColor: LogoColor;
  logoStyle: 'boxed' | 'regular';
  logoText: string;
  orderNo: string;
  orientation: Orientation;
  placementOffsetX: number;
  placementOffsetY: number;
  placementScale: number;
  printProductType: ProductType;
  printSize: string;
  removeBlackBars: boolean;
  removeEdgeWatermark: boolean;
  superResolutionProvider: 'none' | 'topaz_api';
  targetLongPx: number;
  templateId: 'pilates_yuga_t_100x61';
}

interface GeneratedUploadSource {
  blob?: Blob;
  file?: PrintPrepApi.FileInfo;
  fileName: string;
  key: PrintPrepOutputFileKey;
  label: string;
  mimeType: string;
}

type CachedPrintPrepFormState = Partial<PrintPrepFormState> & {
  aiProviderDefaultMigrated?: boolean;
  aiPreprocessProvider?: string;
};

const FORM_CACHE_KEY = 'fdm_print_prep_vue_form_state_v1';
const DISABLED_AI_PROVIDERS = new Set(['grok_imagine', 'wan2_6']);
const DEFAULT_AI_PROVIDER: AiProvider = 'ark_seedream';
const PILATES_PREVIEW_RATIO = 1815 / 2920;
const PILATES_MASK_PREVIEW_URL = '/print-prep/pilates-mask.png';
const PILATES_OUTLINE_PREVIEW_URL = '/print-prep/pilates-outline.png';
const PILATES_DEFAULT_PLACEMENT_SCALE = 1.18;
const PILATES_FIXED_REFERENCE_URL =
  'https://hbfdm.oss-cn-wuhan-lr.aliyuncs.com/%E7%A9%BA%E6%9D%BF-%E6%99%AE%E6%8B%89%E6%8F%90.png';

const fallbackProductSizes: Record<ProductType, string[]> = {
  大号鼠标垫: [
    '60x30',
    '60x40',
    '70x30',
    '70x40',
    '80x30',
    '80x40',
    '90x30',
    '90x40',
    '100x50',
    '120x60',
  ],
  麂皮绒垫: ['183x68'],
  普拉提垫: ['61x100'],
  小号鼠标垫: ['22x18', '24x20', '26x21', '30x25'],
};

const defaultLongPx: Record<string, number> = {
  麂皮绒垫: 24_000,
  普拉提垫: 12_000,
};

const defaultAiPrompts: Record<'default' | ProductType, string> = {
  default:
    '去掉截图界面、黑边和靠边水印；去掉平台水印、文字标识和角落Logo；背景按上方“背景处理方式”执行；保持原图主体、颜色、光影、构图和真实细节不变；不要修改、重绘、美化或替换原图人物脸部，脸部必须保持和原图一致；不要重绘、不要换风格、不要新增物体、不要裁切主体；输出高清清晰，不能模糊、低清、像素化、过度磨皮或AI涂抹。',
  大号鼠标垫:
    '去掉截图界面、黑边和靠边水印；去掉平台水印、文字标识和角落Logo；背景按上方“背景处理方式”执行；保持原图主体、颜色、光影、构图和真实细节不变；不要修改、重绘、美化或替换原图人物脸部，脸部必须保持和原图一致；不要重绘、不要换风格、不要新增物体、不要裁切主体；输出高清清晰，不能模糊、低清、像素化、过度磨皮或AI涂抹。',
  小号鼠标垫:
    '去掉截图界面、黑边和靠边水印；去掉平台水印、文字标识和角落Logo；背景按上方“背景处理方式”执行；保持原图主体、颜色、光影、构图和真实细节不变；不要修改、重绘、美化或替换原图人物脸部，脸部必须保持和原图一致；不要重绘、不要换风格、不要新增物体、不要裁切主体；输出高清清晰，不能模糊、低清、像素化、过度磨皮或AI涂抹。',
  麂皮绒垫:
    '只对原图做高清清晰化；原图区域的画风、颜色、光影、纹理、构图、人物/主体、产品形状都不要改变；不要修改、重绘、美化或替换原图人物脸部，脸部必须保持和原图一致；不要重绘、不要换风格、不要AI插画化、不要美化改脸、不要新增物体；背景不足时只在原图外侧延展原背景，匹配原背景的纹理、透视、景深、噪点、光线和色彩，扩成麂皮绒垫183x68横版比例；不要拉伸、裁切、移动或放大主体；去掉截图界面、黑边、平台水印和靠边可去除文字标识；输出高清清晰，不能模糊、低清、像素化、过度磨皮或AI涂抹。',
  普拉提垫: [
    '为普拉提T形垫生成竖版超幅安全底图，不是最终裁切图；这张底图后续会以约1.18倍套入模板，并允许上下左右继续偏移约20%，所以四边必须有足够真实连续背景安全区。',
    '底图必须比61x100成品和约64x103出血画布更大，上、下、左、右都要扩出可裁切的真实场景内容；任何位置移动裁切时都不能露出白边、灰块、透明、空白带、硬矩形边或虚化占位。',
    '顶部把手区域要一直铺满到画布最上边，画面上方45%-50%只能是连续清晰的原背景/墙面/床品/窗帘/房间场景，不要出现头发、脸、皮肤、衣服、身体或枕头边缘。',
    '所有扩出来的背景必须和原图一样清晰，保持同一焦距、景深、噪点、纹理、透视和光影；禁止用模糊背景、柔焦过渡、涂抹补边、拉伸放大、低清渐变、上下分层拼接或水平接缝来填充顶部、边缘或底部。',
    '左右两侧和底部也必须预留大面积连续背景：人物左右各留35%-45%真实背景或床品，底部留18%-22%干净背景给Python后续贴YUGA，不能让人物或黑衣服贴到边缘。',
    '人物主体要明显缩小并放在下方宽主体区，脸清晰但不能大头贴，头脸约占画面宽度14%-20%；不要修改、重绘、美化或替换原图人物脸部，脸部必须保持和原图一致；只通过扩背景和缩小主体适配模具，不要改变人物身份、五官、发型、服装、光影和真实摄影质感。',
    '公网参考图固定为空板普拉提框架，只用于理解T形边界和安全区域，不能复制空板的白底、黑线、轮廓或空板样式；客户上传图片才是人物、五官、服装、姿势、光影和真实场景的唯一来源。',
    '不要把客户照片作为小矩形贴在新背景中，最终必须是一张连续完整的摄影扩背景图，不能出现相框感、照片贴照片、灰块、白块或渐变占位。不要画T形边框、不要画YUGA、不要画辅助线；去掉截图界面、黑边、平台水印、文字标识和角落Logo；输出高清清晰，不能模糊、低清、像素化、过度磨皮或AI涂抹。',
  ].join(''),
};

const managedAiPromptMarkers = [
  '普拉提T形模板需要AI底图',
  '只对原图做高清清晰化',
  '去掉截图界面、黑边和靠边水印',
  '不用Topaz，直接由AI完成高清清晰化处理',
  '为普拉提T形垫生成竖版超幅底图',
  '为普拉提T形垫生成竖版超幅安全底图',
];

const formState = reactive<PrintPrepFormState>({
  addYugaLogo: true,
  aiPreprocessPrompt: defaultAiPrompts.普拉提垫,
  aiPreprocessProvider: DEFAULT_AI_PROVIDER,
  aiPreprocessSize: '4K',
  aiReferenceUrl: PILATES_FIXED_REFERENCE_URL,
  backgroundMode: 'preserve',
  customerPrompt: '',
  layoutMode: 'pilates_template',
  lightBackground: false,
  logoColor: 'auto',
  logoStyle: 'regular',
  logoText: 'YUGA',
  orderNo: '',
  orientation: 'portrait',
  placementOffsetX: 0,
  placementOffsetY: 0,
  placementScale: PILATES_DEFAULT_PLACEMENT_SCALE,
  printProductType: '普拉提垫',
  printSize: '61x100',
  removeBlackBars: true,
  removeEdgeWatermark: true,
  superResolutionProvider: 'none',
  targetLongPx: 12_000,
  templateId: 'pilates_yuga_t_100x61',
});

const productSizes = ref<Record<string, string[]>>({ ...fallbackProductSizes });
const optionsLoading = ref(false);
const previewLoading = ref(false);
const baseLoading = ref(false);
const layoutLoading = ref(false);
const referenceUploading = ref(false);
const historyLoading = ref(false);
const historyOpen = ref(false);

const selectedFile = ref<File | null>(null);
const originalPreviewUrl = ref('');
const latestPlacementPreviewBlob = ref<Blob | null>(null);
const baseResult = ref<PrintPrepApi.PrintPrepResult | null>(null);
const finalResult = ref<PrintPrepApi.PrintPrepResult | null>(null);
const reportJson = ref('');
const historyList = ref<PrintPrepApi.HistoryItem[]>([]);
const errorMessage = ref('');
const uploadedFileMap = ref<Partial<Record<PrintPrepOutputFileKey, string>>>({});
const uploadErrors = ref<Partial<Record<PrintPrepOutputFileKey, string>>>({});
const uploadTargetKeys = ref<PrintPrepOutputFileKey[]>([]);
const uploadingGeneratedFiles = ref(false);
const uploadingFileKey = ref<'' | PrintPrepOutputFileKey>('');

const taskState = reactive({
  elapsedSeconds: 0,
  jobId: '',
  message: '',
  status: '待提交',
});

let pollToken = 0;
let previewDebounceTimer: number | undefined;
let placementDrag:
  | {
      pointerId: number;
      startOffsetX: number;
      startOffsetY: number;
      startX: number;
      startY: number;
      target: HTMLElement;
      targetHeight: number;
      targetWidth: number;
    }
  | undefined;

const productOptions = computed(() =>
  Object.keys(productSizes.value).map((value) => ({ label: value, value })),
);
const sizeOptions = computed(() =>
  (productSizes.value[formState.printProductType] || []).map((value) => ({
    label: `${value}cm`,
    value,
  })),
);
const isPilates = computed(() => formState.printProductType === '普拉提垫');
const isBusy = computed(
  () => baseLoading.value || layoutLoading.value || uploadingGeneratedFiles.value,
);
const canCreateBase = computed(() => !!selectedFile.value && !isBusy.value);
const canCreateLayout = computed(() => !!baseImagePath.value && !isBusy.value);

const baseImageLoadFailed = ref(false);
const baseFile = computed(() => {
  const files = baseResult.value?.files;
  return files?.base_image || files?.super_resolved || files?.ai_preprocessed || null;
});
const basePreviewFile = computed(() => {
  const files = baseResult.value?.files;
  return files?.base_preview || baseFile.value;
});
function getDerivedBasePreviewLocation(file: PrintPrepApi.FileInfo | null) {
  const location = file ? getPrintPrepFileLocation(file) : '';
  return location.replace(/_base_image\.(?:png|jpe?g|webp)$/i, '_base_preview.jpg');
}
const baseImagePath = computed(() => baseFile.value?.path || '');
const basePreferredImageUrl = computed(() =>
  resolveAssetUrl(
    baseResult.value?.files?.base_preview
      ? getPrintPrepFileLocation(basePreviewFile.value || undefined)
      : getDerivedBasePreviewLocation(baseFile.value),
  ),
);
const baseFallbackImageUrl = computed(() =>
  resolveAssetUrl(baseFile.value ? getPrintPrepFileLocation(baseFile.value) : undefined),
);
const baseImageUrl = computed(
  () =>
    (baseImageLoadFailed.value ? baseFallbackImageUrl.value : basePreferredImageUrl.value) ||
    baseFallbackImageUrl.value,
);
function handleBaseImageLoadError() {
  if (!baseImageLoadFailed.value && baseFallbackImageUrl.value) {
    baseImageLoadFailed.value = true;
  }
}
watch(basePreferredImageUrl, () => {
  baseImageLoadFailed.value = false;
});
const finalPreviewUrl = computed(() =>
  uploadedFileMap.value.preview ||
  resolveAssetUrl(finalResult.value?.files?.preview?.url),
);
const isPilatesTemplatePreview = computed(
  () => isPilates.value && formState.layoutMode === 'pilates_template',
);
const placementPreviewAspectRatio = computed(() =>
  isPilatesTemplatePreview.value
    ? `${PILATES_PREVIEW_RATIO}`
    : `${getPrintSizeRatio()}`,
);
const placementPreviewImageStyle = computed(() => ({
  '--placement-offset-x': `${getEffectivePlacementOffsetX()}%`,
  '--placement-offset-y': `${getEffectivePlacementOffsetY()}%`,
  '--placement-scale': String(getEffectivePlacementScale()),
}));

const downloadLinks = computed(() => {
  return PRINT_PREP_OUTPUT_FILE_DEFINITIONS.map((item) => ({
    ...item,
    url: uploadedFileMap.value[item.key],
  }))
    .filter((item) => item.url);
});

const uploadOutputItems = computed(() =>
  PRINT_PREP_OUTPUT_FILE_DEFINITIONS.filter(
    (item) =>
      uploadTargetKeys.value.includes(item.key) ||
      uploadedFileMap.value[item.key] ||
      uploadErrors.value[item.key],
  ).map((item) => {
    const url = uploadedFileMap.value[item.key];
    const error = uploadErrors.value[item.key];
    const isCurrent = uploadingGeneratedFiles.value && uploadingFileKey.value === item.key;
    return {
      ...item,
      error,
      status: error ? 'failed' : url ? 'success' : isCurrent ? 'uploading' : 'pending',
      url,
    };
  }),
);

const hasUploadFailures = computed(() =>
  Object.keys(uploadErrors.value).some((key) => !!uploadErrors.value[key as PrintPrepOutputFileKey]),
);

const resultSummary = computed(() => {
  const data = finalResult.value;
  if (!data) return [];
  return [
    { label: '订单编号', value: data.order_no || formState.orderNo || '-' },
    { label: '产品类型', value: data.product_type || formState.printProductType },
    { label: '成品尺寸', value: data.size_cm || formState.printSize },
    {
      label: '输出像素',
      value: data.pixel_size
        ? `${data.pixel_size.width || '-'} x ${data.pixel_size.height || '-'}`
        : '-',
    },
    {
      label: '画布尺寸',
      value: data.canvas_size_cm
        ? `${data.canvas_size_cm.width || '-'} x ${data.canvas_size_cm.height || '-'}cm`
        : '-',
    },
    { label: '出血', value: data.bleed_cm ? `${data.bleed_cm}cm` : '-' },
  ];
});

const historyButtonText = computed(() =>
  historyList.value.length > 0 ? `刷新历史记录（${historyList.value.length}）` : '查看历史记录',
);

function clampNumber(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function getPreviewOffsetFactor() {
  return isPilatesTemplatePreview.value ? 0.45 : 0.5;
}

function getEffectivePlacementOffsetX() {
  return Number(
    (clampNumber(formState.placementOffsetX, -100, 100) * getPreviewOffsetFactor()).toFixed(2),
  );
}

function getEffectivePlacementOffsetY() {
  return Number(
    (clampNumber(formState.placementOffsetY, -100, 100) * getPreviewOffsetFactor()).toFixed(2),
  );
}

function getEffectivePlacementScale() {
  const requestedScale = clampNumber(formState.placementScale || 1, isPilates.value ? 1 : 0.5, 3);
  if (!isPilatesTemplatePreview.value) return requestedScale;
  const offsetX = Math.abs(getEffectivePlacementOffsetX());
  const offsetY = Math.abs(getEffectivePlacementOffsetY());
  const requiredScale = 1 + (Math.max(offsetX, offsetY) / 50);
  return Number(clampNumber(Math.max(requestedScale, requiredScale), 1, 3).toFixed(2));
}

function parsePrintSizeRatio() {
  const match = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/.exec(
    formState.printSize || '',
  );
  if (!match) return 1;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return 1;
  if (formState.orientation === 'portrait') return Math.min(width, height) / Math.max(width, height);
  if (formState.orientation === 'landscape') return Math.max(width, height) / Math.min(width, height);
  return width / height;
}

function getPrintSizeRatio() {
  return Math.max(0.35, Math.min(3.2, parsePrintSizeRatio()));
}

function defaultAiPreprocessPrompt(productType: ProductType) {
  return defaultAiPrompts[productType] || defaultAiPrompts.default;
}

function isManagedAiPreprocessPrompt(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (Object.values(defaultAiPrompts).includes(text)) return true;
  return managedAiPromptMarkers.some((marker) => text.includes(marker));
}

function refreshAiPreprocessPromptForProduct(force = false) {
  if (force || isManagedAiPreprocessPrompt(formState.aiPreprocessPrompt)) {
    formState.aiPreprocessPrompt = defaultAiPreprocessPrompt(formState.printProductType);
  }
}

function normalizeOptions(data: PrintPrepApi.OptionsResp) {
  const fromRecord =
    data.product_sizes || data.sizes || data.print_size_options || undefined;
  if (fromRecord && Object.keys(fromRecord).length > 0) {
    productSizes.value = { ...fallbackProductSizes, ...fromRecord };
    return;
  }
  if (Array.isArray(data.products) && data.products.length > 0) {
    const next: Record<string, string[]> = {};
    data.products.forEach((item) => {
      const name = item.value || item.name || item.label;
      if (name && item.sizes?.length) next[name] = item.sizes;
    });
    if (Object.keys(next).length > 0) {
      productSizes.value = { ...fallbackProductSizes, ...next };
    }
  }
}

function normalizeProvider(value: unknown): AiProvider {
  if (typeof value !== 'string') return DEFAULT_AI_PROVIDER;
  if (DISABLED_AI_PROVIDERS.has(value)) return DEFAULT_AI_PROVIDER;
  if (
    [
      'ark_seedream',
      'gpt_image_2',
      'nanobanana2',
      'nanobanana',
      'nanobanana_pro',
      'none',
    ].includes(value)
  ) {
    return value as AiProvider;
  }
  return DEFAULT_AI_PROVIDER;
}

function normalizeCachedProvider(cache: CachedPrintPrepFormState): AiProvider {
  if (cache.aiPreprocessProvider === 'gpt_image_2' && !cache.aiProviderDefaultMigrated) {
    return DEFAULT_AI_PROVIDER;
  }
  return normalizeProvider(cache.aiPreprocessProvider);
}

function loadFormCache() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(FORM_CACHE_KEY) || '{}',
    ) as CachedPrintPrepFormState;
    Object.assign(formState, {
      ...raw,
      aiPreprocessProvider: normalizeCachedProvider(raw),
      aiReferenceUrl: '',
    });
    formState.aiReferenceUrl = isPilates.value ? PILATES_FIXED_REFERENCE_URL : '';
    if (isPilates.value && Number(formState.placementScale || 1) <= 1) {
      formState.placementScale = PILATES_DEFAULT_PLACEMENT_SCALE;
    }
    refreshAiPreprocessPromptForProduct();
  } catch {
    formState.aiPreprocessProvider = DEFAULT_AI_PROVIDER;
    formState.aiReferenceUrl = isPilates.value ? PILATES_FIXED_REFERENCE_URL : '';
    formState.placementScale = isPilates.value ? PILATES_DEFAULT_PLACEMENT_SCALE : 1;
    refreshAiPreprocessPromptForProduct();
  }
}

function saveFormCache() {
  const cache: CachedPrintPrepFormState = {
    ...formState,
    aiProviderDefaultMigrated: true,
  };
  delete cache.aiReferenceUrl;
  localStorage.setItem(FORM_CACHE_KEY, JSON.stringify(cache));
}

function resolveAssetUrl(url?: string) {
  return resolvePrintPrepAssetUrl(url);
}

function safeJson(value: unknown) {
  return JSON.stringify(value || {}, null, 2);
}

function compactPrintPrepError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('Wuyin generation timed out')) {
    const details = [
      text.match(/task_id=([^,\s]+)/)?.[0],
      text.match(/timeout_seconds=([^,\s]+)/)?.[0],
      text.match(/status=([^,\s]+)/)?.[0],
      text.match(/updated_at=([^,]+)/)?.[0],
    ]
      .filter(Boolean)
      .join('，');
    return `AI 服务生成超时：五音任务已提交，但在等待时间内没有返回图片。可以重新生成，或先把 AI 清晰度调到 2K/1K 后再试。${details ? `技术信息：${details}` : ''}`;
  }
  if (text.includes('Wuyin generation failed')) {
    return `AI 服务生成失败：${text.replace(/^.*?Wuyin generation failed:\s*/u, '')}`;
  }
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

function setError(error: unknown, prefix: string) {
  const text = compactPrintPrepError(error);
  errorMessage.value = `${prefix}：${text}`;
  message.error(errorMessage.value);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeFileToken(value: unknown, fallback: string) {
  const text = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function getOrderToken(result?: PrintPrepApi.PrintPrepResult | null) {
  return sanitizeFileToken(result?.order_no || formState.orderNo, 'no-order');
}

function getUploadTimestamp() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function getFileExt(file: PrintPrepApi.FileInfo | undefined, fallback: string) {
  const location = getPrintPrepFileLocation(file).split('?')[0] || '';
  const match = /\.([A-Za-z0-9]+)$/.exec(location);
  return (match?.[1] || fallback).toLowerCase();
}

function buildUploadFileName(
  definition: (typeof PRINT_PREP_OUTPUT_FILE_DEFINITIONS)[number],
  result: PrintPrepApi.PrintPrepResult,
  file?: PrintPrepApi.FileInfo,
) {
  const orderToken = getOrderToken(result);
  const ext = getFileExt(file, definition.fallbackExt);
  return `${orderToken}_${definition.namePart}.${ext}`;
}

function buildUploadDirectory(result: PrintPrepApi.PrintPrepResult) {
  return `print-prep/${getOrderToken(result)}/${getUploadTimestamp()}`;
}

function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener(
      'error',
      () => reject(new Error(`无法读取网页预览图片：${url}`)),
      { once: true },
    );
    image.src = url;
  });
}

function applyPilatesPreviewClip(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.beginPath();
  context.moveTo(width * 0.38, 0);
  context.lineTo(width * 0.62, 0);
  context.lineTo(width * 0.62, height * 0.26);
  context.lineTo(width, height * 0.26);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.lineTo(0, height * 0.26);
  context.lineTo(width * 0.38, height * 0.26);
  context.closePath();
  context.clip();
}

function strokePilatesPreviewGuide(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.beginPath();
  context.moveTo(width * 0.38, 1);
  context.lineTo(width * 0.62, 1);
  context.lineTo(width * 0.62, height * 0.26);
  context.lineTo(width - 1, height * 0.26);
  context.lineTo(width - 1, height - 1);
  context.lineTo(1, height - 1);
  context.lineTo(1, height * 0.26);
  context.lineTo(width * 0.38, height * 0.26);
  context.closePath();
  context.lineWidth = 3;
  context.strokeStyle = '#111827';
  context.stroke();
}

function drawPilatesPreviewLogo(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.save();
  context.fillStyle = '#ffffff';
  context.font = `700 ${Math.round(height * 0.034)}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('YUGA', width / 2, height * 0.95);
  context.restore();
}

function drawPlacementImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale =
    Math.max(width / image.naturalWidth, height / image.naturalHeight) *
    getEffectivePlacementScale();
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const centerX =
    width / 2 + width * (getEffectivePlacementOffsetX() / 100);
  const centerY =
    height / 2 + height * (getEffectivePlacementOffsetY() / 100);
  context.drawImage(
    image,
    centerX - drawWidth / 2,
    centerY - drawHeight / 2,
    drawWidth,
    drawHeight,
  );
}

function drawPlacementBleedBackground(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  context.save();
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * 1.22;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    width / 2 - drawWidth / 2,
    height / 2 - drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  context.restore();
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = 'image/jpeg',
  quality = 0.92,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('网页预览图生成失败'));
      },
      mimeType,
      quality,
    );
  });
}

async function renderLocalPlacementPreviewBlob({
  cache = true,
  mimeType = 'image/jpeg',
}: {
  cache?: boolean;
  mimeType?: string;
} = {}) {
  if (!baseImageUrl.value) throw new Error('没有可生成网页预览的 AI 底图地址');
  const ratio = isPilatesTemplatePreview.value ? PILATES_PREVIEW_RATIO : getPrintSizeRatio();
  const canvasWidth = isPilatesTemplatePreview.value ? 900 : 1000;
  const canvasHeight = Math.max(1, Math.round(canvasWidth / ratio));
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持生成网页预览图');

  const image = await loadCanvasImage(baseImageUrl.value);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const artworkCanvas = document.createElement('canvas');
  artworkCanvas.width = canvasWidth;
  artworkCanvas.height = canvasHeight;
  const artworkContext = artworkCanvas.getContext('2d');
  if (!artworkContext) throw new Error('浏览器不支持生成网页预览图');

  if (isPilatesTemplatePreview.value) {
    drawPlacementBleedBackground(artworkContext, image, canvasWidth, canvasHeight);
    drawPlacementImage(artworkContext, image, canvasWidth, canvasHeight);
    try {
      const mask = await loadCanvasImage(PILATES_MASK_PREVIEW_URL);
      artworkContext.globalCompositeOperation = 'destination-in';
      artworkContext.drawImage(mask, 0, 0, canvasWidth, canvasHeight);
      artworkContext.globalCompositeOperation = 'source-over';
    } catch {
      artworkContext.clearRect(0, 0, canvasWidth, canvasHeight);
      artworkContext.save();
      applyPilatesPreviewClip(artworkContext, canvasWidth, canvasHeight);
      drawPlacementImage(artworkContext, image, canvasWidth, canvasHeight);
      artworkContext.restore();
    }
  } else {
    drawPlacementImage(artworkContext, image, canvasWidth, canvasHeight);
  }
  context.drawImage(artworkCanvas, 0, 0);

  if (isPilatesTemplatePreview.value) {
    try {
      const outline = await loadCanvasImage(PILATES_OUTLINE_PREVIEW_URL);
      context.drawImage(outline, 0, 0, canvasWidth, canvasHeight);
      drawPilatesPreviewLogo(context, canvasWidth, canvasHeight);
    } catch {
      strokePilatesPreviewGuide(context, canvasWidth, canvasHeight);
      drawPilatesPreviewLogo(context, canvasWidth, canvasHeight);
    }
  } else {
    context.strokeStyle = '#111827';
    context.lineWidth = 3;
    context.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);
  }

  const blob = await canvasToBlob(canvas, mimeType);
  if (cache) latestPlacementPreviewBlob.value = blob;
  return blob;
}

function clearGeneratedUploads() {
  uploadedFileMap.value = {};
  uploadErrors.value = {};
  uploadTargetKeys.value = [];
  uploadingGeneratedFiles.value = false;
  uploadingFileKey.value = '';
}

async function buildGeneratedUploadSources(
  result: PrintPrepApi.PrintPrepResult,
): Promise<GeneratedUploadSource[]> {
  const files = {
    ...(baseResult.value?.files || {}),
    ...(result.files || {}),
  } as PrintPrepApi.ResultFiles;
  const finalFiles = result.files || {};

  const sources: GeneratedUploadSource[] = [];
  for (const definition of PRINT_PREP_OUTPUT_FILE_DEFINITIONS) {
    const file =
      definition.key === 'preview'
        ? finalFiles.preview
        : files[definition.key as keyof PrintPrepApi.ResultFiles];
    if (file && getPrintPrepFileLocation(file)) {
      sources.push({
        file,
        fileName: buildUploadFileName(definition, result, file),
        key: definition.key,
        label: definition.label,
        mimeType: definition.mimeType,
      });
      continue;
    }
    if (definition.key === 'preview' && !latestPlacementPreviewBlob.value) {
      try {
        await renderLocalPlacementPreviewBlob();
      } catch (error) {
        console.warn('local placement preview fallback failed', error);
      }
    }
    if (definition.key === 'preview' && latestPlacementPreviewBlob.value) {
      sources.push({
        blob: latestPlacementPreviewBlob.value,
        fileName: buildUploadFileName(definition, result),
        key: definition.key,
        label: definition.label,
        mimeType: definition.mimeType,
      });
      continue;
    }
    if (definition.key === 'report' && result.report !== undefined) {
      sources.push({
        blob: new Blob([safeJson(result.report)], {
          type: definition.mimeType,
        }),
        fileName: buildUploadFileName(definition, result),
        key: definition.key,
        label: definition.label,
        mimeType: definition.mimeType,
      });
    }
  }
  return sources;
}

async function uploadGeneratedFiles(options: { retryFailedOnly?: boolean } = {}) {
  const result = finalResult.value;
  if (!result) return;

  const allSources = await buildGeneratedUploadSources(result);
  uploadTargetKeys.value = allSources.map((source) => source.key);
  if (allSources.length === 0) {
    message.warning('没有可上传的制版输出文件');
    return;
  }

  const sources = options.retryFailedOnly
    ? allSources.filter((source) => uploadErrors.value[source.key])
    : allSources;
  if (sources.length === 0) {
    message.success('没有需要重试上传的文件');
    return;
  }

  if (!options.retryFailedOnly) {
    uploadedFileMap.value = {};
    uploadErrors.value = {};
  }

  const directory = buildUploadDirectory(result);
  uploadingGeneratedFiles.value = true;
  taskState.status = '上传系统文件库中';
  taskState.message = '正在把制版输出文件上传到当前系统文件库。';

  for (const source of sources) {
    uploadingFileKey.value = source.key;
    uploadErrors.value = {
      ...uploadErrors.value,
      [source.key]: undefined,
    };
    try {
      const blob =
        source.blob || (source.file ? (await fetchPrintPrepOutputBlob(source.file)).blob : null);
      if (!blob) throw new Error('没有可上传的文件内容');
      const url = await uploadPrintPrepOutputBlob({
        blob,
        directory,
        fileName: source.fileName,
        mimeType: source.mimeType,
      });
      uploadedFileMap.value = {
        ...uploadedFileMap.value,
        [source.key]: url,
      };
    } catch (error) {
      uploadErrors.value = {
        ...uploadErrors.value,
        [source.key]: errorText(error),
      };
    }
  }

  uploadingFileKey.value = '';
  uploadingGeneratedFiles.value = false;
  if (hasUploadFailures.value) {
    taskState.status = '部分文件上传失败';
    taskState.message = '部分文件未上传到系统文件库，可点击重新上传结果文件。';
    message.warning('部分制版输出文件上传失败');
  } else {
    taskState.status = '文件已上传系统库';
    taskState.message = '下载入口已切换为当前系统文件库 URL。';
    message.success('制版输出文件已上传到系统文件库');
  }
}

function retryUploadGeneratedFiles() {
  void uploadGeneratedFiles({ retryFailedOnly: true });
}

function buildReferenceUploadFileName() {
  return `${sanitizeFileToken(formState.orderNo, 'adjusted_preview')}_reference.png`;
}

function normalizeAiReferenceUrlForSubmit() {
  const url = formState.aiReferenceUrl.trim();
  if (isPilates.value) return PILATES_FIXED_REFERENCE_URL;
  return url;
}

async function uploadCurrentPreviewReference() {
  if (!baseImageUrl.value) {
    message.warning('请先生成 AI 底图，再上传当前预览为公网参考图');
    return;
  }
  referenceUploading.value = true;
  errorMessage.value = '';
  taskState.status = '公网参考图上传中';
  taskState.message = '正在把当前网页套入预览上传为公网参考图。';
  try {
    const blob = await renderLocalPlacementPreviewBlob({
      cache: false,
      mimeType: 'image/png',
    });
    const data = await uploadPrintPrepReferenceBlob({
      blob,
      fileName: buildReferenceUploadFileName(),
    });
    const url = data.url || data.upload?.url || '';
    if (!url) throw new Error('上传成功但没有返回公网 URL');
    formState.aiReferenceUrl = url;
    saveFormCache();
    taskState.status = '公网参考图已上传';
    taskState.message = '公网参考图 URL 已自动填入，可用于后续 AI 底图生成。';
    message.success('公网参考图已上传');
  } catch (error) {
    setError(error, '公网参考图上传失败');
  } finally {
    referenceUploading.value = false;
  }
}

async function copyReferenceUrl() {
  const url = formState.aiReferenceUrl.trim();
  if (!url) {
    message.warning('当前没有公网参考图 URL');
    return;
  }
  await navigator.clipboard.writeText(url);
  message.success('公网参考图 URL 已复制');
}

function uploadStatusColor(status: string) {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'uploading') return 'processing';
  return 'default';
}

function uploadStatusText(status: string) {
  if (status === 'success') return '已上传';
  if (status === 'failed') return '失败';
  if (status === 'uploading') return '上传中';
  return '等待上传';
}

function updateProductDefaults() {
  const sizes = productSizes.value[formState.printProductType] || [];
  if (!sizes.includes(formState.printSize)) {
    formState.printSize = sizes[0] || '';
  }
  formState.layoutMode = isPilates.value ? 'pilates_template' : 'standard';
  if (isPilates.value) {
    formState.backgroundMode = 'preserve';
    formState.orientation = 'portrait';
    formState.aiReferenceUrl = PILATES_FIXED_REFERENCE_URL;
  } else if (formState.printProductType === '麂皮绒垫') {
    formState.backgroundMode = 'preserve';
    formState.orientation = 'landscape';
    if (formState.aiReferenceUrl === PILATES_FIXED_REFERENCE_URL) formState.aiReferenceUrl = '';
  }
  if (!isPilates.value && formState.aiReferenceUrl === PILATES_FIXED_REFERENCE_URL) {
    formState.aiReferenceUrl = '';
  }
  formState.placementScale = isPilates.value ? PILATES_DEFAULT_PLACEMENT_SCALE : 1;
  formState.placementOffsetX = 0;
  formState.placementOffsetY = 0;
  formState.targetLongPx = defaultLongPx[formState.printProductType] || 6000;
  refreshAiPreprocessPromptForProduct();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;
  selectedFile.value = file;
  baseResult.value = null;
  finalResult.value = null;
  reportJson.value = '';
  errorMessage.value = '';
  formState.aiReferenceUrl = isPilates.value ? PILATES_FIXED_REFERENCE_URL : '';
  latestPlacementPreviewBlob.value = null;
  clearGeneratedUploads();
  clearPreviewDebounce();
  previewLoading.value = false;
  if (originalPreviewUrl.value) URL.revokeObjectURL(originalPreviewUrl.value);
  originalPreviewUrl.value = file ? URL.createObjectURL(file) : '';
}

function appendBaseFields(form: FormData) {
  if (!selectedFile.value) throw new Error('请先选择客户图片');
  form.append('file', selectedFile.value);
  form.append('product_type', formState.printProductType);
  form.append('size_cm', formState.printSize);
  form.append('order_no', formState.orderNo.trim());
  form.append('orientation', formState.orientation);
  form.append('light_background', String(formState.lightBackground));
  form.append('target_long_px', String(formState.targetLongPx || 6000));
  form.append('remove_black_bars', String(formState.removeBlackBars));
  form.append('remove_edge_watermark', String(formState.removeEdgeWatermark));
  form.append('ai_preprocess_provider', formState.aiPreprocessProvider);
  form.append('ai_preprocess_prompt', formState.aiPreprocessPrompt.trim());
  form.append('customer_prompt', formState.customerPrompt.trim());
  form.append('background_mode', formState.backgroundMode);
  form.append('ai_preprocess_size', formState.aiPreprocessSize);
  form.append('ai_reference_url', normalizeAiReferenceUrlForSubmit());
  form.append('super_resolution_provider', formState.superResolutionProvider);
  form.append('upscale_factor', '4');
  form.append('min_enhanced_long_px', '6000');
  form.append('layout_mode', formState.layoutMode);
  form.append('template_id', formState.templateId);
}

function appendLayoutFields(form: FormData) {
  if (!baseImagePath.value) throw new Error('请先生成 AI 底图');
  form.append('base_image_path', baseImagePath.value);
  form.append('product_type', formState.printProductType);
  form.append('size_cm', formState.printSize);
  form.append('order_no', formState.orderNo.trim());
  form.append('orientation', formState.orientation);
  form.append('light_background', String(formState.lightBackground));
  form.append('add_yuga_logo', String(formState.addYugaLogo));
  form.append('logo_text', formState.logoText.trim() || 'YUGA');
  form.append('logo_style', formState.logoStyle);
  form.append('logo_color', formState.logoColor);
  form.append('target_long_px', String(formState.targetLongPx || 6000));
  form.append('foreground_scale', '0.96');
  form.append('layout_mode', formState.layoutMode);
  form.append('template_id', formState.templateId);
  form.append('placement_scale', String(getEffectivePlacementScale()));
  form.append('placement_offset_x', String(getEffectivePlacementOffsetX()));
  form.append('placement_offset_y', String(getEffectivePlacementOffsetY()));
  form.append('customer_prompt', formState.customerPrompt.trim());
  form.append('background_mode', formState.backgroundMode);
}

async function loadOptions() {
  optionsLoading.value = true;
  try {
    const options = await getPrintPrepOptions();
    normalizeOptions(options);
  } catch (error) {
    console.warn('print prep options fallback', error);
    message.warning('制版尺寸选项接口不可用，已使用本地默认尺寸');
  } finally {
    optionsLoading.value = false;
    updateProductDefaults();
  }
}

function clearPreviewDebounce() {
  if (previewDebounceTimer) {
    window.clearTimeout(previewDebounceTimer);
    previewDebounceTimer = undefined;
  }
}

function schedulePlacementPreview() {
  if (!baseImagePath.value || baseLoading.value || layoutLoading.value) return;
  finalResult.value = null;
  reportJson.value = safeJson(baseResult.value?.report);
  latestPlacementPreviewBlob.value = null;
  clearGeneratedUploads();
  clearPreviewDebounce();
  refreshPlacementPreview('贴图位置已调整，网页预览已即时更新。');
}

function refreshPlacementPreview(successMessage = 'AI 底图套入预览已刷新。') {
  if (!baseImagePath.value) return;
  errorMessage.value = '';
  previewLoading.value = false;
  taskState.status = '网页预览已更新';
  taskState.message = successMessage;
  saveFormCache();
}

function canAdjustPlacement() {
  return !!baseImagePath.value && !isBusy.value;
}

function startPlacementDrag(event: PointerEvent) {
  if (!canAdjustPlacement()) return;
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  event.preventDefault();
  target.setPointerCapture?.(event.pointerId);
  placementDrag = {
    pointerId: event.pointerId,
    startOffsetX: Number(formState.placementOffsetX || 0),
    startOffsetY: Number(formState.placementOffsetY || 0),
    startX: event.clientX,
    startY: event.clientY,
    target,
    targetHeight: rect.height,
    targetWidth: rect.width,
  };
}

function movePlacementDrag(event: PointerEvent) {
  if (!placementDrag || placementDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const factor = getPreviewOffsetFactor();
  const deltaX = ((event.clientX - placementDrag.startX) / placementDrag.targetWidth) * 100;
  const deltaY = ((event.clientY - placementDrag.startY) / placementDrag.targetHeight) * 100;
  formState.placementOffsetX = Math.round(
    clampNumber(placementDrag.startOffsetX + deltaX / factor, -100, 100),
  );
  formState.placementOffsetY = Math.round(
    clampNumber(placementDrag.startOffsetY + deltaY / factor, -100, 100),
  );
}

function finishPlacementDrag(event: PointerEvent) {
  if (!placementDrag || placementDrag.pointerId !== event.pointerId) return;
  placementDrag.target.releasePointerCapture?.(event.pointerId);
  placementDrag = undefined;
}

async function pollJob(
  jobId: string,
  onCompleted: (result: PrintPrepApi.PrintPrepResult) => void,
) {
  const currentToken = ++pollToken;
  const startedAt = Date.now();
  taskState.jobId = jobId;
  taskState.elapsedSeconds = 0;
  while (currentToken === pollToken) {
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
    taskState.elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    const data = await getPrintPrepJob(jobId);
    taskState.status = data.status;
    taskState.message = data.message || '';
    if (data.status === 'completed') {
      if (!data.result) throw new Error('任务完成但没有返回结果');
      onCompleted(data.result);
      return;
    }
    if (data.status === 'failed') {
      throw new Error(data.error || data.message || '任务失败');
    }
  }
}

async function handleCreateBase() {
  baseLoading.value = true;
  errorMessage.value = '';
  baseResult.value = null;
  finalResult.value = null;
  reportJson.value = '';
  latestPlacementPreviewBlob.value = null;
  clearGeneratedUploads();
  clearPreviewDebounce();
  previewLoading.value = false;
  taskState.status = 'AI 底图提交中';
  taskState.message = '正在提交 AI 底图任务';
  try {
    taskState.status = 'AI 底图提交中';
    taskState.message = '正在提交 AI 底图任务';
    const form = new FormData();
    appendBaseFields(form);
    const resp = await createPrintPrepBaseJob(form);
    taskState.status = 'AI 底图已提交';
    taskState.message = resp.message || '后端正在生成 AI 底图';
    await pollJob(resp.job_id, (result) => {
      baseResult.value = result;
      reportJson.value = safeJson(result.report);
      taskState.status = 'AI 底图已生成';
      taskState.message = '可以调整贴图位置并生成最终印刷文件。';
      message.success('AI 底图已生成');
    });
    refreshPlacementPreview('AI 底图已自动套入模板，可继续调整位置。');
    saveFormCache();
  } catch (error) {
    setError(error, '生成 AI 底图失败');
  } finally {
    baseLoading.value = false;
  }
}

async function handleCreateLayout() {
  layoutLoading.value = true;
  errorMessage.value = '';
  clearGeneratedUploads();
  taskState.status = '最终文件提交中';
  taskState.message = '正在基于 AI 底图生成印刷文件';
  try {
    const form = new FormData();
    appendLayoutFields(form);
    const resp = await createPrintPrepLayoutJob(form);
    taskState.status = '最终文件已提交';
    taskState.message = resp.message || '后端正在导出印刷文件';
    await pollJob(resp.job_id, (result) => {
      finalResult.value = result;
      reportJson.value = safeJson(result.report);
      taskState.status = '印刷文件已生成';
      taskState.message = '印刷文件已生成，正在上传到系统文件库。';
      message.success('印刷文件已生成');
    });
    await uploadGeneratedFiles();
    saveFormCache();
  } catch (error) {
    setError(error, '生成最终文件失败');
  } finally {
    layoutLoading.value = false;
  }
}

function pickHistoryBaseFile(item: PrintPrepApi.HistoryItem) {
  const files = item.files || {};
  return files.base_image || files.super_resolved || files.ai_preprocessed || null;
}

async function loadHistory() {
  historyOpen.value = true;
  historyLoading.value = true;
  try {
    const data = await getPrintPrepHistory();
    historyList.value = Array.isArray(data) ? data : (data.items ?? data.list ?? []);
  } catch (error) {
    setError(error, '读取历史记录失败');
  } finally {
    historyLoading.value = false;
  }
}

function reuseHistory(item: PrintPrepApi.HistoryItem) {
  const file = pickHistoryBaseFile(item);
  if (!file?.path) {
    message.warning('该历史记录没有可复用的 AI 底图 path');
    return;
  }
  formState.printProductType = (item.product_type as ProductType) || formState.printProductType;
  formState.printSize = item.size_cm || formState.printSize;
  formState.orderNo = item.order_no || '';
  formState.layoutMode = (item.layout_mode as LayoutMode) || formState.layoutMode;
  formState.templateId =
    (item.template_id as 'pilates_yuga_t_100x61') || 'pilates_yuga_t_100x61';
  formState.customerPrompt = item.customer_prompt || formState.customerPrompt;
  formState.backgroundMode =
    (item.background_mode as BackgroundMode) || formState.backgroundMode;
  baseResult.value = {
    files: item.files,
    order_no: item.order_no,
    product_type: item.product_type,
    size_cm: item.size_cm,
  };
  finalResult.value = null;
  latestPlacementPreviewBlob.value = null;
  clearGeneratedUploads();
  historyOpen.value = false;
  taskState.status = '已复用历史底图';
  taskState.message = '正在基于历史 AI 底图生成套入预览。';
  message.success('已复用历史 AI 底图');
  saveFormCache();
  void refreshPlacementPreview('历史 AI 底图已自动套入模板，可继续调整位置。');
}

function resetPlacement() {
  formState.placementScale = isPilates.value ? PILATES_DEFAULT_PLACEMENT_SCALE : 1;
  formState.placementOffsetX = 0;
  formState.placementOffsetY = 0;
}

function nudgePlacement(
  key: 'placementOffsetX' | 'placementOffsetY' | 'placementScale',
  delta: number,
) {
  if (!canAdjustPlacement()) return;
  if (key === 'placementScale') {
    const minScale = isPilates.value ? 1 : 0.5;
    formState.placementScale = Number(
      clampNumber(Number(formState.placementScale || 1) + delta, minScale, 3).toFixed(2),
    );
    return;
  }
  formState[key] = Math.round(
    clampNumber(Number(formState[key] || 0) + delta, -100, 100),
  );
}

watch(
  () => formState.printProductType,
  () => {
    updateProductDefaults();
  },
);

watch(
  formState,
  () => {
    saveFormCache();
  },
  { deep: true },
);

watch(
  () => [
    formState.placementScale,
    formState.placementOffsetX,
    formState.placementOffsetY,
  ],
  () => {
    schedulePlacementPreview();
  },
);

watch(
  () => [
    formState.printProductType,
    formState.printSize,
    formState.layoutMode,
    formState.templateId,
    formState.orientation,
    formState.lightBackground,
    formState.addYugaLogo,
    formState.logoText,
    formState.logoStyle,
    formState.logoColor,
    formState.targetLongPx,
    formState.backgroundMode,
    formState.customerPrompt,
  ],
  () => {
    schedulePlacementPreview();
  },
);

onMounted(async () => {
  loadFormCache();
  await loadOptions();
});

onBeforeUnmount(() => {
  pollToken += 1;
  clearPreviewDebounce();
  if (originalPreviewUrl.value) URL.revokeObjectURL(originalPreviewUrl.value);
});
</script>

<template>
  <Page auto-content-height description="上传客户图案，先生成 AI 底图，再基于底图导出 JPG / PDF / AI-compatible 印刷文件。">
    <div class="print-prep-page">
      <div class="prep-grid">
        <Card class="prep-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:printer" />
              <span>印刷文件制版工作台</span>
            </div>
          </template>
          <template #extra>
            <Button size="small" :loading="historyLoading" @click="loadHistory">
              <template #icon>
                <IconifyIcon icon="lucide:history" />
              </template>
              {{ historyButtonText }}
            </Button>
          </template>

          <Alert
            class="mb-4"
            show-icon
            type="info"
            :message="`Python 制版后端：${PRINT_PREP_API_BASE}`"
          />

          <Form layout="vertical">
            <div class="form-grid">
              <FormItem label="客户图片" class="full">
                <input
                  class="file-input"
                  type="file"
                  accept="image/*"
                  :disabled="isBusy"
                  @change="onFileChange"
                />
              </FormItem>

              <FormItem label="产品类型">
                <Select
                  v-model:value="formState.printProductType"
                  :loading="optionsLoading"
                  :options="productOptions"
                />
              </FormItem>

              <FormItem label="成品尺寸">
                <Select
                  v-model:value="formState.printSize"
                  :loading="optionsLoading"
                  :options="sizeOptions"
                />
              </FormItem>

              <FormItem label="订单编号">
                <Input v-model:value="formState.orderNo" allow-clear placeholder="例如 123456" />
              </FormItem>

              <FormItem label="长边像素">
                <InputNumber
                  v-model:value="formState.targetLongPx"
                  class="w-full"
                  :min="1600"
                  :max="32_000"
                  :step="100"
                />
              </FormItem>

              <FormItem label="制版模式">
                <Select
                  v-model:value="formState.layoutMode"
                  :options="[
                    { label: '标准矩形制版', value: 'standard' },
                    { label: '普拉提 T 型模板', value: 'pilates_template' },
                  ]"
                />
              </FormItem>

              <FormItem v-if="isPilates" label="普拉提模板">
                <Select
                  v-model:value="formState.templateId"
                  :options="[
                    { label: 'YUGA 100x61 T 型模板', value: 'pilates_yuga_t_100x61' },
                  ]"
                />
              </FormItem>

              <FormItem label="方向">
                <Select
                  v-model:value="formState.orientation"
                  :options="[
                    { label: '自动匹配', value: 'auto' },
                    { label: '竖版', value: 'portrait' },
                    { label: '横版', value: 'landscape' },
                  ]"
                />
              </FormItem>

              <FormItem label="添加 YUGA Logo">
                <Switch v-model:checked="formState.addYugaLogo" />
              </FormItem>

              <FormItem label="Logo 文案">
                <Input v-model:value="formState.logoText" placeholder="YUGA" />
              </FormItem>

              <FormItem label="Logo 颜色">
                <Select
                  v-model:value="formState.logoColor"
                  :options="[
                    { label: '自动', value: 'auto' },
                    { label: '黑色', value: 'black' },
                    { label: '白色', value: 'white' },
                  ]"
                />
              </FormItem>

              <FormItem label="AI 扩背景/修图模型">
                <Select
                  v-model:value="formState.aiPreprocessProvider"
                  :options="[
                    { label: '豆包 Seedream 5.0', value: 'ark_seedream' },
                    { label: 'GPT-Image-2', value: 'gpt_image_2' },
                    { label: 'NanoBanana2', value: 'nanobanana2' },
                    { label: 'NanoBanana', value: 'nanobanana' },
                    { label: 'NanoBanana Pro', value: 'nanobanana_pro' },
                    { label: '关闭 AI 预处理', value: 'none' },
                  ]"
                />
              </FormItem>

              <FormItem label="AI 清晰度">
                <Select
                  v-model:value="formState.aiPreprocessSize"
                  :options="[
                    { label: '1K', value: '1K' },
                    { label: '2K', value: '2K' },
                    { label: '4K', value: '4K' },
                  ]"
                />
              </FormItem>

              <FormItem label="背景模式">
                <Select
                  v-model:value="formState.backgroundMode"
                  :options="[
                    { label: '统一干净背景', value: 'clean' },
                    { label: '保留原背景', value: 'preserve' },
                  ]"
                />
              </FormItem>

              <FormItem label="AI 提示词" class="full">
                <Textarea
                  v-model:value="formState.aiPreprocessPrompt"
                  :rows="5"
                  placeholder="输入 AI 底图处理要求"
                />
              </FormItem>

              <FormItem label="客户要求" class="full">
                <Textarea
                  v-model:value="formState.customerPrompt"
                  :rows="3"
                  placeholder="客户额外要求，例如保留背景、去掉水印、人物不变等"
                />
              </FormItem>
            </div>

            <Collapse class="advanced-collapse">
              <Collapse.Panel key="placement" header="贴图位置微调">
                <div class="placement-status">
                  <Tag :color="baseImagePath ? 'processing' : 'default'">
                    {{ baseImagePath ? '网页即时预览' : '生成 AI 底图后可调整' }}
                  </Tag>
                  <span v-if="baseImagePath" class="placement-tip">
                    拖动右侧预览图或使用数值微调，最终导出时才调用 Python。
                  </span>
                </div>
                <div class="range-grid">
                  <FormItem label="贴图缩放">
                    <div class="range-row">
                      <Slider
                        v-model:value="formState.placementScale"
                        :disabled="!baseImagePath || isBusy"
                        :min="isPilates ? 1 : 0.5"
                        :max="3"
                        :step="0.05"
                      />
                      <InputNumber
                        v-model:value="formState.placementScale"
                        :disabled="!baseImagePath || isBusy"
                        :min="isPilates ? 1 : 0.5"
                        :max="3"
                        :step="0.05"
                      />
                    </div>
                  </FormItem>
                  <FormItem label="左右偏移">
                    <div class="range-row">
                      <Slider
                        v-model:value="formState.placementOffsetX"
                        :disabled="!baseImagePath || isBusy"
                        :min="-100"
                        :max="100"
                        :step="1"
                      />
                      <InputNumber
                        v-model:value="formState.placementOffsetX"
                        :disabled="!baseImagePath || isBusy"
                        :min="-100"
                        :max="100"
                        :step="1"
                      />
                    </div>
                  </FormItem>
                  <FormItem label="上下偏移">
                    <div class="range-row">
                      <Slider
                        v-model:value="formState.placementOffsetY"
                        :disabled="!baseImagePath || isBusy"
                        :min="-100"
                        :max="100"
                        :step="1"
                      />
                      <InputNumber
                        v-model:value="formState.placementOffsetY"
                        :disabled="!baseImagePath || isBusy"
                        :min="-100"
                        :max="100"
                        :step="1"
                      />
                    </div>
                  </FormItem>
                  <FormItem label="快捷微调" class="full">
                    <div class="nudge-panel" aria-label="贴图微调按钮">
                      <span></span>
                      <Button
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="nudgePlacement('placementOffsetY', -2)"
                      >
                        上移
                      </Button>
                      <span></span>
                      <Button
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="nudgePlacement('placementOffsetX', -2)"
                      >
                        左移
                      </Button>
                      <Button
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="resetPlacement"
                      >
                        重置
                      </Button>
                      <Button
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="nudgePlacement('placementOffsetX', 2)"
                      >
                        右移
                      </Button>
                      <span></span>
                      <Button
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="nudgePlacement('placementOffsetY', 2)"
                      >
                        下移
                      </Button>
                      <span></span>
                      <Button
                        class="wide"
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="nudgePlacement('placementScale', 0.05)"
                      >
                        放大一点
                      </Button>
                      <Button
                        class="wide"
                        size="small"
                        :disabled="!baseImagePath || isBusy"
                        @click="nudgePlacement('placementScale', -0.05)"
                      >
                        缩小一点
                      </Button>
                    </div>
                  </FormItem>
                </div>
              </Collapse.Panel>

              <Collapse.Panel key="advanced" header="高级参数">
                <div class="form-grid">
                  <FormItem label="底色类型">
                    <Switch
                      v-model:checked="formState.lightBackground"
                      checked-children="浅色"
                      un-checked-children="非浅色"
                    />
                  </FormItem>
                  <FormItem label="Logo 版式">
                    <Select
                      v-model:value="formState.logoStyle"
                      :options="[
                        { label: '常规版', value: 'regular' },
                        { label: '带框版', value: 'boxed' },
                      ]"
                    />
                  </FormItem>
                  <FormItem label="裁掉截图黑边">
                    <Switch v-model:checked="formState.removeBlackBars" />
                  </FormItem>
                  <FormItem label="处理靠边水印">
                    <Switch v-model:checked="formState.removeEdgeWatermark" />
                  </FormItem>
                  <FormItem label="高清修复引擎">
                    <Select
                      v-model:value="formState.superResolutionProvider"
                      :options="[
                        { label: 'Topaz API', value: 'topaz_api' },
                        { label: '关闭', value: 'none' },
                      ]"
                    />
                  </FormItem>
                  <FormItem label="公网参考图 URL">
                    <Input
                      v-model:value="formState.aiReferenceUrl"
                      allow-clear
                      :disabled="isPilates"
                      placeholder="可留空；本字段不会写入本地缓存"
                    />
                    <Space class="reference-actions" wrap>
                      <Button
                        v-if="!isPilates"
                        size="small"
                        :disabled="!baseImageUrl || isBusy"
                        :loading="referenceUploading"
                        @click="uploadCurrentPreviewReference"
                      >
                        <template #icon>
                          <IconifyIcon icon="lucide:upload-cloud" />
                        </template>
                        上传当前预览为公网参考图
                      </Button>
                      <Button
                        size="small"
                        :disabled="!formState.aiReferenceUrl"
                        @click="copyReferenceUrl"
                      >
                        <template #icon>
                          <IconifyIcon icon="lucide:copy" />
                        </template>
                        复制公网 URL
                      </Button>
                    </Space>
                  </FormItem>
                </div>
              </Collapse.Panel>
            </Collapse>
          </Form>

          <div class="action-bar">
            <Button
              type="primary"
              :disabled="!canCreateBase"
              :loading="baseLoading"
              @click="handleCreateBase"
            >
              <template #icon>
                <IconifyIcon icon="lucide:sparkles" />
              </template>
              生成 AI 底图
            </Button>
            <Button
              type="primary"
              :disabled="!canCreateLayout"
              :loading="layoutLoading || uploadingGeneratedFiles"
              @click="handleCreateLayout"
            >
              <template #icon>
                <IconifyIcon icon="lucide:file-output" />
              </template>
              使用 AI 底图生成最终印刷文件
            </Button>
          </div>
        </Card>

        <Card class="result-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:monitor-check" />
              <span>预览与结果</span>
            </div>
          </template>
          <template #extra>
            <Tag color="processing">{{ taskState.status }}</Tag>
          </template>

          <Alert
            v-if="errorMessage"
            class="mb-4"
            show-icon
            type="error"
            :message="errorMessage"
          />

          <div class="task-panel">
            <div>
              <span class="task-label">任务 ID</span>
              <strong>{{ taskState.jobId || '-' }}</strong>
            </div>
            <div>
              <span class="task-label">已耗时</span>
              <strong>{{ taskState.elapsedSeconds }} 秒</strong>
            </div>
            <div class="full">
              <span class="task-label">当前状态</span>
              <strong>{{ taskState.message || '请选择客户图片开始制版。' }}</strong>
            </div>
          </div>

          <Descriptions
            v-if="resultSummary.length > 0"
            class="mb-4"
            size="small"
            bordered
            :column="2"
          >
            <Descriptions.Item
              v-for="item in resultSummary"
              :key="item.label"
              :label="item.label"
            >
              {{ item.value }}
            </Descriptions.Item>
          </Descriptions>

          <div class="preview-list">
            <div v-if="originalPreviewUrl" class="preview-block">
              <div class="preview-title">客户原图</div>
              <img :src="originalPreviewUrl" alt="客户原图" />
            </div>
            <div v-if="baseImageUrl" class="preview-block placement-preview-block">
              <div class="preview-title preview-title-row">
                <span>AI 底图套入预览</span>
                <Tag color="success">网页即时</Tag>
              </div>
              <div
                class="placement-preview-canvas"
                :class="{
                  'is-disabled': !canAdjustPlacement(),
                  'is-pilates': isPilatesTemplatePreview,
                  'is-standard': !isPilatesTemplatePreview,
                }"
                :style="{ aspectRatio: placementPreviewAspectRatio }"
                @pointercancel="finishPlacementDrag"
                @pointerdown="startPlacementDrag"
                @pointermove="movePlacementDrag"
                @pointerup="finishPlacementDrag"
              >
                <div
                  class="placement-preview-mask"
                  :class="{ 'is-pilates': isPilatesTemplatePreview }"
                >
                  <img
                    v-if="isPilatesTemplatePreview"
                    class="placement-preview-bleed"
                    :src="baseImageUrl"
                    alt=""
                    crossorigin="anonymous"
                    draggable="false"
                    @error="handleBaseImageLoadError"
                  />
                  <img
                    class="placement-preview-image"
                    :src="baseImageUrl"
                    alt="AI 底图套入预览"
                    :style="placementPreviewImageStyle"
                    crossorigin="anonymous"
                    draggable="false"
                    @error="handleBaseImageLoadError"
                  />
                </div>
                <img
                  v-if="isPilatesTemplatePreview"
                  class="pilates-template-overlay"
                  :src="PILATES_OUTLINE_PREVIEW_URL"
                  alt="普拉提透明轮廓"
                  draggable="false"
                />
                <span
                  v-if="isPilatesTemplatePreview"
                  class="pilates-preview-logo"
                >
                  YUGA
                </span>
                <div v-else class="standard-preview-guide"></div>
              </div>
              <div class="local-preview-note">
                这是浏览器快速预览；生成印刷文件时会把当前缩放和偏移参数提交给 Python 输出正式文件。
              </div>
            </div>
            <div v-if="baseImageUrl" class="preview-block">
              <div class="preview-title">AI 底图</div>
              <img :src="baseImageUrl" alt="AI 底图" @error="handleBaseImageLoadError" />
            </div>
            <div v-if="finalPreviewUrl" class="preview-block">
              <div class="preview-title">最终预览图</div>
              <img :src="finalPreviewUrl" alt="最终预览图" />
            </div>
            <Empty
              v-if="!originalPreviewUrl && !baseImageUrl && !finalPreviewUrl"
              description="先选择客户图片并生成 AI 底图"
            />
          </div>

          <div
            v-if="uploadOutputItems.length > 0 || uploadingGeneratedFiles"
            class="download-panel"
          >
            <div class="download-header">
              <div class="section-title">系统文件下载</div>
              <Button
                v-if="hasUploadFailures"
                size="small"
                :loading="uploadingGeneratedFiles"
                @click="retryUploadGeneratedFiles"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:refresh-cw" />
                </template>
                重新上传结果文件
              </Button>
            </div>
            <Alert
              v-if="uploadingGeneratedFiles"
              class="mb-3"
              show-icon
              type="info"
              message="正在上传到系统文件库，成功后下载按钮会自动启用。"
            />
            <Space v-if="downloadLinks.length > 0" wrap>
              <Button
                v-for="link in downloadLinks"
                :key="link.key"
                :href="link.url"
                target="_blank"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:download" />
                </template>
                {{ link.label }}
              </Button>
            </Space>
            <div class="upload-status-list">
              <div
                v-for="item in uploadOutputItems"
                :key="item.key"
                class="upload-status-item"
              >
                <span class="upload-status-name">{{ item.label }}</span>
                <Tag :color="uploadStatusColor(item.status)">
                  {{ uploadStatusText(item.status) }}
                </Tag>
                <span v-if="item.error" class="upload-error">{{ item.error }}</span>
              </div>
            </div>
          </div>

          <Collapse v-if="reportJson" class="mt-4">
            <Collapse.Panel key="report" header="后端 report JSON">
              <pre class="report-json">{{ reportJson }}</pre>
            </Collapse.Panel>
          </Collapse>
        </Card>
      </div>

      <Drawer
        v-model:open="historyOpen"
        title="制版历史记录"
        width="620"
        :destroy-on-close="false"
      >
        <div v-if="historyLoading" class="history-loading">正在读取历史记录...</div>
        <Empty v-else-if="historyList.length === 0" description="暂无历史记录" />
        <div v-else class="history-list">
          <div v-for="(item, index) in historyList" :key="index" class="history-item">
            <div>
              <strong>{{ item.order_no || '未填写订单号' }}</strong>
              <div class="history-meta">
                {{ item.product_type || '-' }} / {{ item.size_cm || '-' }}
              </div>
              <div class="history-path">
                {{ pickHistoryBaseFile(item)?.path || '无可复用底图 path' }}
              </div>
            </div>
            <Button
              size="small"
              :disabled="!pickHistoryBaseFile(item)?.path"
              @click="reuseHistory(item)"
            >
              复用底图
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  </Page>
</template>

<style scoped>
.print-prep-page {
  min-height: 100%;
}

.prep-grid {
  display: grid;
  grid-template-columns: minmax(460px, 640px) minmax(420px, 1fr);
  gap: 16px;
  align-items: start;
}

.prep-card,
.result-card {
  border-radius: 8px;
}

.card-title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-weight: 700;
}

.form-grid,
.range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.full {
  grid-column: 1 / -1;
}

.file-input {
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
}

.advanced-collapse {
  margin-top: 4px;
  background: transparent;
}

.placement-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.placement-tip {
  font-size: 12px;
  color: #64748b;
}

.range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 12px;
  align-items: center;
}

.nudge-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(78px, 1fr));
  gap: 8px;
  max-width: 380px;
}

.nudge-panel .wide {
  grid-column: span 1;
}

.reference-actions {
  margin-top: 8px;
}

.action-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 14px;
  margin-top: 14px;
  background: #fff;
  border-top: 1px solid #f0f0f0;
}

.task-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  margin-bottom: 16px;
  background: #f6f8fb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.task-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #64748b;
}

.preview-list {
  display: grid;
  gap: 12px;
}

.preview-block {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.preview-title,
.section-title {
  padding: 10px 12px;
  font-weight: 700;
  color: #1f2937;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.preview-title-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.preview-block img {
  display: block;
  width: 100%;
  max-height: 620px;
  object-fit: contain;
  background: #f1f5f9;
}

.placement-preview-block img {
  max-height: none;
  background: transparent;
}

.placement-preview-canvas {
  position: relative;
  width: min(100%, 520px);
  margin: 14px auto 10px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  user-select: none;
  background: #fff;
  border: 1px solid #d7dde6;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgb(15 23 42 / 4%);
}

.placement-preview-canvas:active {
  cursor: grabbing;
}

.placement-preview-canvas.is-disabled {
  cursor: default;
}

.placement-preview-mask {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.placement-preview-mask.is-pilates {
  /* stylelint-disable order/properties-order, property-no-vendor-prefix */
  -webkit-mask-image: url('/print-prep/pilates-mask.png');
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: 100% 100%;
  mask-image: url('/print-prep/pilates-mask.png');
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: 100% 100%;
  /* stylelint-enable order/properties-order, property-no-vendor-prefix */
}

.placement-preview-image {
  position: absolute;
  top: calc(50% + var(--placement-offset-y, 0%));
  left: calc(50% + var(--placement-offset-x, 0%));
  width: 100%;
  height: 100%;
  pointer-events: none;
  object-fit: cover;
  transform: translate(-50%, -50%) scale(var(--placement-scale, 1));
  transform-origin: center center;
}

.placement-preview-bleed {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  pointer-events: none;
  object-fit: cover;
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.22);
  transform-origin: center center;
}

.pilates-template-overlay,
.standard-preview-guide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.pilates-template-overlay {
  display: block;
  object-fit: fill;
}

.pilates-preview-logo {
  position: absolute;
  bottom: 4.1%;
  left: 50%;
  font-family: Arial, sans-serif;
  font-size: clamp(18px, 3.1vw, 34px);
  font-weight: 700;
  line-height: 1;
  color: #fff;
  pointer-events: none;
  transform: translateX(-50%);
}

.standard-preview-guide {
  border: 2px solid #111827;
  box-shadow: inset 0 0 0 10px rgb(255 255 255 / 26%);
}

.local-preview-note {
  padding: 0 12px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.download-panel {
  padding-bottom: 12px;
  margin-top: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.download-header {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.download-header .section-title {
  border-bottom: 0;
}

.download-header > :last-child {
  margin-right: 12px;
}

.download-panel :deep(.ant-space) {
  padding: 12px 12px 0;
}

.upload-status-list {
  display: grid;
  gap: 8px;
  padding: 12px 12px 0;
}

.upload-status-item {
  display: grid;
  grid-template-columns: minmax(90px, 140px) auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 28px;
}

.upload-status-name {
  font-weight: 600;
  color: #334155;
}

.upload-error {
  font-size: 12px;
  color: #dc2626;
  overflow-wrap: anywhere;
}

.report-json {
  max-height: 320px;
  padding: 12px;
  margin: 0;
  overflow: auto;
  color: #e5e7eb;
  white-space: pre-wrap;
  background: #111827;
  border-radius: 6px;
}

.history-loading {
  padding: 24px;
  color: #64748b;
  text-align: center;
}

.history-list {
  display: grid;
  gap: 10px;
}

.history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.history-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.history-path {
  margin-top: 6px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

@media (max-width: 1180px) {
  .prep-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .form-grid,
  .range-grid,
  .task-panel {
    grid-template-columns: 1fr;
  }

  .range-row {
    grid-template-columns: 1fr;
  }

  .action-bar {
    position: sticky;
    bottom: 0;
    z-index: 5;
    padding: 10px 0 0;
    box-shadow: 0 -10px 24px rgb(15 23 42 / 8%);
  }

  .action-bar :deep(.ant-btn) {
    flex: 1 1 150px;
  }

  .nudge-panel {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .upload-status-item {
    grid-template-columns: 1fr auto;
  }

  .upload-error {
    grid-column: 1 / -1;
  }
}
</style>
