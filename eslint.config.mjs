import { defineConfig } from '@vben/eslint-config';

export default defineConfig([
  {
    // Upstream-owned source is immutable and verified by the SHA boundary
    // guard. This lint gate covers FDM composition plus the modules changed by
    // the ERP/WMS/MES decoupling; older FDM products retain their own debt.
    ignores: [
      '.playwright-cli/**',
      'apps/backend-mock/**',
      'apps/web-antdv-next/**',
      'apps/web-ele/**',
      'apps/web-naive/**',
      'apps/web-tdesign/**',
      'apps/web-antd/src/components/**',
      'apps/web-antd/src/api/{ai,bpm,crm,erp,fdmdata,fdmwaimao,fdmxui,fms,hrm,im,iot,mall,member,mes,mp,pay,product,promotion,report,system,wms}/**',
      'apps/web-antd/src/views/{ai,bpm,crm,erp,fdmai,fdmcaiwu,fdmcreative,fdmdata,fdmdingtalk,fdmneixiao,fdmperformance,fdmproduct,fdmwaimao,fdmwaimaocrm-prototype,fdmxui,fms,hrm,im,iot,mall,member,mes,mp,pay,product,promotion,report,system,wms}/**',
      'apps/web-antd/src/views/dashboard/**',
      'apps/web-antd/src/views/fdm-trade-shared/**',
      'apps/web-antd/src/views/fdmprocurement/{requisition,sourcing,supplier,supplier-product,supplier-quote}/**',
      'apps/web-antd/src/router/routes/modules/{ai,mes}.ts',
      'apps/web-antd/e2e/fixtures/FdmCreativeWorkbenchFixture.vue',
      'apps/web-antd/package.json',
      'apps/web-antd/playwright.config.ts',
      'apps/web-antd/src/api/fdmcaiwu/**',
      'docs/src/guide/fdmcreative/**',
      'packages/**',
      'pnpm-workspace.yaml',
    ],
  },
]);
