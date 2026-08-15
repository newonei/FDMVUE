import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set([
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
  '.vue',
]);
const requiredTargets = [
  'apps/web-antd/src/api/fdmproduct',
  'apps/web-antd/src/api/fdmwaimaocrm',
  'apps/web-antd/src/api/fdmneimaocrm',
  'apps/web-antd/src/views/fdmwaimaocrm',
  'apps/web-antd/src/views/fdmneimaocrm',
];
const optionalTargets = [
  'apps/web-antd/src/api/fdm-crm-module-status.test.ts',
  'apps/web-antd/src/views/fdmproduct',
  'apps/web-antd/src/components/fdm-product-select',
  'apps/web-antd/src/components/fdm-money',
  'apps/web-antd/src/components/fdm-crm',
  'apps/web-antd/src/router/routes/modules/fdmproduct.ts',
  'apps/web-antd/src/router/routes/modules/fdmwaimaocrm.ts',
  'apps/web-antd/src/router/routes/modules/fdmneimaocrm.ts',
];

function collectFiles(target) {
  const absoluteTarget = resolve(repoRoot, target);
  if (!existsSync(absoluteTarget)) {
    return [];
  }
  if (statSync(absoluteTarget).isFile()) {
    return sourceExtensions.has(extname(absoluteTarget))
      ? [absoluteTarget]
      : [];
  }
  return readdirSync(absoluteTarget, { withFileTypes: true }).flatMap(
    (entry) => {
      const child = resolve(absoluteTarget, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(relative(repoRoot, child));
      }
      return sourceExtensions.has(extname(entry.name)) ? [child] : [];
    },
  );
}

const missingTargets = requiredTargets.filter(
  (target) => !existsSync(resolve(repoRoot, target)),
);
if (missingTargets.length > 0) {
  console.error(
    'FDM CRM boundary verification cannot run; required targets are missing:',
  );
  for (const target of missingTargets) {
    console.error(`- ${target}`);
  }
  process.exit(1);
}

const requiredFiles = requiredTargets.flatMap((target) => collectFiles(target));
const allFiles = [
  ...new Set([
    ...requiredFiles,
    ...optionalTargets.flatMap((target) => collectFiles(target)),
  ]),
];
const violations = [];

function scan(files, pattern, rule) {
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (pattern.test(line)) {
        violations.push({
          file: relative(repoRoot, file).replaceAll('\\', '/'),
          line: index + 1,
          rule,
          text: line.trim(),
        });
      }
    }
  }
}

scan(
  allFiles,
  /#\/(?:api|views)\/crm(?:\/|['"])/iu,
  'New frontend code must not import the official CRM namespace',
);
scan(
  allFiles,
  /['"]\/crm(?:\/|['"])/iu,
  'New frontend code must not use official /crm routes',
);
scan(
  allFiles,
  /(?<![\p{L}\p{N}_])crm:[\p{L}\p{N}:_-]+/iu,
  'New frontend code must not use crm:* permissions',
);

const exportFiles = [
  ...collectFiles('apps/web-antd/src/api/fdmwaimaocrm'),
  ...collectFiles('apps/web-antd/src/views/fdmwaimaocrm'),
];
const domesticFiles = [
  ...collectFiles('apps/web-antd/src/api/fdmneimaocrm'),
  ...collectFiles('apps/web-antd/src/views/fdmneimaocrm'),
];
const productFiles = [
  ...collectFiles('apps/web-antd/src/api/fdmproduct'),
  ...collectFiles('apps/web-antd/src/views/fdmproduct'),
];

scan(
  exportFiles,
  /#\/(?:api|views)\/fdmneimaocrm(?:\/|['"])/u,
  'Export CRM must not import domestic CRM',
);
scan(
  domesticFiles,
  /#\/(?:api|views)\/fdmwaimaocrm(?:\/|['"])/u,
  'Domestic CRM must not import export CRM',
);
scan(
  productFiles,
  /#\/(?:api|views)\/fdm(?:waimao|neimao)crm(?:\/|['"])/u,
  'Product center must not import either CRM',
);

const baseSelectorFiles = collectFiles(
  'apps/web-antd/src/components/fdm-product-select',
);
scan(
  baseSelectorFiles,
  /#\/api\/fdm(?:product|waimao|neimao)crm(?:\/|['"])/u,
  'The shared product selector must receive a data source instead of importing a business API',
);

if (violations.length > 0) {
  console.error(
    `FDM CRM boundary verification failed with ${violations.length} violation(s):`,
  );
  for (const violation of violations) {
    console.error(
      `[${violation.rule}] ${violation.file}:${violation.line} ${violation.text}`,
    );
  }
  process.exit(1);
}

console.log('FDM CRM boundary verification passed.');
console.log(
  'Checked official CRM isolation, dual-CRM isolation, and shared selector API boundaries.',
);
