import type { FdmWaimaoAiContextMode, FdmWaimaoAiQuestion } from './surfaces';

export interface FdmProductAiSurface {
  availability: 'enabled';
  description: string;
  key: 'product';
  questions: FdmWaimaoAiQuestion[];
  readOnlyNotice: string;
  title: string;
}

export interface ResolvedFdmProductAiSurface {
  businessId?: string;
  contextMode: FdmWaimaoAiContextMode;
  pageKey: string;
  pageTitle: string;
  queryPermission: 'fdmproduct:product:query';
  sessionSurfaceKey: string;
  surface: FdmProductAiSurface;
}

const PRODUCT_SURFACE: FdmProductAiSurface = {
  availability: 'enabled',
  description:
    '基于当前可见的 SPU、SKU、出口申报及包装资料提供只读完整性与业务风险分析。',
  key: 'product',
  questions: [
    {
      id: 'product-incomplete',
      label: '哪些产品资料还不完整？',
      prompt: '请检查当前产品资料完整性，并按影响优先级列出需要补充的字段。',
    },
    {
      id: 'product-export-risk',
      label: '出口申报资料有什么风险？',
      prompt:
        '请核对当前可见产品的出口申报字段，指出缺失、冲突或需要人工复核的风险。',
    },
    {
      id: 'product-sku-risk',
      label: 'SKU 与包装资料是否合理？',
      prompt:
        '请分析 SKU 编码、规格、单位、参考价、重量和尺寸资料是否存在异常。',
    },
    {
      id: 'product-focus',
      label: '总结当前产品的关键信息',
      prompt:
        '请用简洁结构总结当前产品及 SKU 的关键信息、资料状态和下一步建议。',
    },
  ],
  readOnlyNotice: '不会新建、编辑、启停产品，也不会修改分类、SKU 或出口资料。',
  title: '产品中心助手',
};

interface ProductRoutePattern {
  contextMode: FdmWaimaoAiContextMode;
  pageTitle: string;
  pattern: RegExp;
}

const PRODUCT_ROUTES: ProductRoutePattern[] = [
  {
    contextMode: 'form',
    pageTitle: '编辑产品',
    pattern: /^\/fdmbase\/product-center\/edit\/([^/]+)\/?$/,
  },
  {
    contextMode: 'detail',
    pageTitle: '产品详情',
    pattern: /^\/fdmbase\/product-center\/detail\/([^/]+)\/?$/,
  },
  {
    contextMode: 'form',
    pageTitle: '新建产品',
    pattern: /^\/fdmbase\/product-center\/create\/?$/,
  },
  {
    contextMode: 'list',
    pageTitle: '产品中心',
    pattern: /^\/fdmbase\/product-center\/?$/,
  },
];

export function resolveFdmProductAiSurface(
  path: string,
): ResolvedFdmProductAiSurface | undefined {
  for (const route of PRODUCT_ROUTES) {
    const match = route.pattern.exec(path);
    if (!match) continue;
    return {
      businessId: match[1] ? decodeURIComponent(match[1]) : undefined,
      contextMode: route.contextMode,
      pageKey: 'product',
      pageTitle: route.pageTitle,
      queryPermission: 'fdmproduct:product:query',
      sessionSurfaceKey: 'product',
      surface: PRODUCT_SURFACE,
    };
  }
  return undefined;
}

export function isFdmProductAiPath(path: string) {
  return (
    path === '/fdmbase/product-center' ||
    path.startsWith('/fdmbase/product-center/')
  );
}

export const FDM_PRODUCT_AI_SURFACE = PRODUCT_SURFACE;
