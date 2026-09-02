import { oxlintConfig } from '@vben/oxlint-config';

import { defineConfig } from 'oxlint';

export default defineConfig({
  ...oxlintConfig,
  // Official source is immutable in FDM work and is checked against the pinned
  // upstream SHA. Lint only the application-owned composition and FDM code.
  ignorePatterns: [
    ...(oxlintConfig.ignorePatterns ?? []),
    'apps/backend-mock/**',
    'apps/web-antdv-next/**',
    'apps/web-ele/**',
    'apps/web-naive/**',
    'apps/web-tdesign/**',
    'apps/web-antd/src/components/**',
    'apps/web-antd/src/api/{ai,bpm,crm,erp,fms,hrm,im,iot,mall,member,mes,mp,pay,product,promotion,report,system,wms}/**',
    'apps/web-antd/src/views/{ai,bpm,crm,erp,fms,hrm,im,iot,mall,member,mes,mp,pay,product,promotion,report,system,wms}/**',
    'apps/web-antd/src/router/routes/modules/{ai,mes}.ts',
    // These existing FDM products are outside the ERP/WMS/MES decoupling
    // change. Their lint debt is tracked separately; this gate covers the
    // composition seams and the procurement/warehouse/factory/storage cut-over.
    'apps/web-antd/src/api/fdmdata/**',
    'apps/web-antd/src/views/{fdmai,fdmcaiwu,fdmcreative,fdmdata,fdmdingtalk,fdmneixiao,fdmperformance,fdmxui}/**',
    'apps/web-antd/e2e/fixtures/FdmCreativeWorkbenchFixture.vue',
    'packages/**',
  ],
});
