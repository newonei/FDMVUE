import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const manifest = JSON.parse(
  readFileSync(
    resolve(scriptDirectory, 'fdm-official-boundaries.json'),
    'utf8',
  ),
);

function git(args, input) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function walk(relativePath) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  if (!existsSync(absolutePath)) return [];
  if (statSync(absolutePath).isFile())
    return [relativePath.replaceAll('\\', '/')];
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = `${relativePath.replaceAll('\\', '/')}/${entry.name}`;
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function verifyOfficialSources() {
  const listing = git([
    'ls-tree',
    '-r',
    '--full-tree',
    manifest.baseline,
    '--',
    ...manifest.officialPaths,
  ]);
  const expected = new Map();
  for (const line of listing.trim().split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/);
    if (match) expected.set(match[2], match[1]);
  }

  const actualFiles = [
    ...new Set(manifest.officialPaths.flatMap(walk)),
  ].toSorted((left, right) => left.localeCompare(right));
  const expectedFiles = [...expected.keys()].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const problems = [];
  for (const file of expectedFiles) {
    if (!actualFiles.includes(file)) problems.push(`missing: ${file}`);
  }
  for (const file of actualFiles) {
    if (!expected.has(file)) problems.push(`extra: ${file}`);
  }

  const comparableFiles = expectedFiles.filter((file) =>
    actualFiles.includes(file),
  );
  if (comparableFiles.length > 0) {
    const hashes = git(
      ['hash-object', '--stdin-paths'],
      `${comparableFiles.join('\n')}\n`,
    )
      .trim()
      .split(/\r?\n/);
    comparableFiles.forEach((file, index) => {
      if (hashes[index] !== expected.get(file))
        problems.push(`modified: ${file}`);
    });
  }

  if (problems.length > 0) {
    throw new Error(
      `Official source drift from ${manifest.baseline}:\n${problems
        .slice(0, 80)
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    );
  }
}

function fdmSourceFiles() {
  const sourceExtensions = new Set(['.json', '.ts', '.tsx', '.vue']);
  const roots = ['apps/web-antd/src', 'packages'];
  const runtimeGuardFiles = new Set([
    'apps/web-antd/src/router/disabled-official-business-menus.test.ts',
    'apps/web-antd/src/router/disabled-official-business-menus.ts',
  ]);
  return roots
    .flatMap((root) => walk(root))
    .filter((file) => sourceExtensions.has(extname(file).toLowerCase()))
    .filter((file) => !runtimeGuardFiles.has(file))
    .filter((file) => {
      if (/(?:^|\/)fdm[^/]*(?:\/|[-_.])/i.test(file)) return true;
      const source = readFileSync(resolve(repositoryRoot, file), 'utf8');
      return /(?:#|@)\/(?:api|views)\/fdm|(?:\.\.?\/)+(?:api|views)\/fdm|['"`]\/fdm[a-z0-9-]*(?:\/|['"`])/i.test(
        source,
      );
    });
}

function verifyFdmIsolation() {
  const forbidden = [
    {
      label: 'official API/view import',
      pattern:
        /(?:#|@)\/(?:api|views)\/(?:crm|erp|mes|wms)(?:\/|['"`])|['"`](?:\.\.?\/)+(?:[^'"`/]+\/)*(?:crm|erp|mes|wms)(?:\/|['"`])/i,
    },
    {
      label: 'official HTTP URL',
      pattern: /['"`](?:\/admin-api)?\/(?:crm|erp|mes|wms)(?:\/|['"`])/i,
    },
    {
      label: 'official permission code',
      pattern: /['"`](?:crm|erp|mes|wms):[a-z0-9:-]+['"`]/i,
    },
    {
      label: 'official Infra file import',
      pattern:
        /(?:#|@)\/api\/infra\/file(?:\/|['"`])|['"`](?:\.\.?\/)+(?:[^'"`/]+\/)*infra\/file(?:\/|['"`])/i,
    },
    {
      label: 'official Infra file HTTP URL',
      pattern: /['"`](?:\/admin-api)?\/infra\/file(?:\/|['"`])/i,
    },
    {
      label: 'legacy procurement boundary',
      pattern:
        /fdmprocurement\/(?:purchase-order-handoff|purchase-receipt|purchase-return|supplier-payment)(?:\/|['"`])/,
    },
    {
      label: 'legacy procurement permission',
      pattern:
        /fdmprocurement:(?:purchase-order-handoff|purchase-receipt|purchase-return|supplier-payment):/,
    },
    {
      label: 'legacy supplier-company authorization boundary',
      pattern: /fdmprocurement\/supplier\/authorize-company(?:\/|['"`])/,
    },
    {
      label: 'legacy supplier-company authorization permission',
      pattern: /fdmprocurement:supplier:authorize-company/,
    },
    {
      label: 'legacy warehouse boundary',
      pattern:
        /fdmwarehouse\/(?:availability|company-binding|shipment-reservation-consumed-outbox|outbound)(?:\/|['"`])/,
    },
    {
      label: 'legacy warehouse permission',
      pattern: /fdmwarehouse:outbound:/,
    },
    {
      label: 'legacy factory boundary',
      pattern: /fdmfactory\/site(?:\/|['"`])/,
    },
    {
      label: 'legacy factory permission',
      pattern: /fdmfactory:site:/,
    },
    {
      label: 'legacy factory item identity',
      pattern:
        /\bfactoryItemId\b|\bsourceItemId\b|\bfactoryItemCode\b|\bfactoryMappingVersion\b|\bproductSkuId\b/,
    },
    {
      label: 'legacy company authorization vocabulary',
      pattern:
        /authorize-company|company-authority|company-access|accessibleCompanyIds|canUserAccess/i,
    },
  ];
  const problems = [];
  for (const file of [...new Set(fdmSourceFiles())].toSorted((left, right) =>
    left.localeCompare(right),
  )) {
    const source = readFileSync(resolve(repositoryRoot, file), 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) problems.push(`${rule.label}: ${file}`);
    }
    if (
      file.includes('/fdmwaimao/shipment/') &&
      /\bWms|\bwms[A-Z_]|\bWMS\b|recover-wms-handoff/.test(source)
    ) {
      problems.push(`legacy WMS shipment contract: ${file}`);
    }
    if (
      file.includes('/fdmfactory/') &&
      /\bMes|\bmes[A-Z_]|\bMES\b|\bSite|\bsite[A-Z_]|\bSITE\b/.test(source)
    ) {
      problems.push(`legacy MES/site factory contract: ${file}`);
    }
    if (
      file.includes('/fdmprocurement/purchase-order/') &&
      /\bHandoff|\bhandoff[A-Z_]|\bHANDOFF\b|\bErp|\berp[A-Z_]|\bERP\b|\bPURCHASE_IN\b|\bpurchaseInItemId\b/.test(
        source,
      )
    ) {
      problems.push(`legacy ERP/handoff purchase-order contract: ${file}`);
    }
    if (
      file.includes('/fdmprocurement/') &&
      /\berpSupplierId\b|\bwriteModelSupplierId\b/.test(source)
    ) {
      problems.push(`legacy secondary supplier identity: ${file}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `FDM boundary violations:\n${[...new Set(problems)]
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    );
  }
}

function withoutComments(source) {
  let result = '';
  let index = 0;
  let quote = '';
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (quote) {
      result += current;
      if (current === '\\') {
        result += next ?? '';
        index += 2;
        continue;
      }
      if (current === quote) quote = '';
      index += 1;
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      quote = current;
      result += current;
      index += 1;
      continue;
    }
    if (current === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }
    result += current;
    index += 1;
  }
  return result;
}

function quotedValues(source, declaration) {
  const match = source.match(
    new RegExp(
      `const\\s+${declaration}\\s*=\\s*(?:new\\s+Set\\s*\\()?\\[([\\s\\S]*?)\\]`,
    ),
  );
  if (!match) return [];
  return [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(
    (value) => value[1],
  );
}

function sameValues(actual, expected) {
  const sortedActual = [...actual].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const sortedExpected = [...expected].toSorted((left, right) =>
    left.localeCompare(right),
  );
  return (
    sortedActual.length === sortedExpected.length &&
    sortedActual.every((value, index) => value === sortedExpected[index])
  );
}

function verifyRuntimeDisablement() {
  const access = withoutComments(
    readFileSync(
      resolve(repositoryRoot, 'apps/web-antd/src/router/access.ts'),
      'utf8',
    ),
  );
  const routes = withoutComments(
    readFileSync(
      resolve(repositoryRoot, 'apps/web-antd/src/router/routes/index.ts'),
      'utf8',
    ),
  );
  const menuFilter = withoutComments(
    readFileSync(
      resolve(
        repositoryRoot,
        'apps/web-antd/src/router/disabled-official-business-menus.ts',
      ),
      'utf8',
    ),
  );
  const routerHelper = withoutComments(
    readFileSync(
      resolve(repositoryRoot, 'apps/web-antd/src/utils/routerHelper.ts'),
      'utf8',
    ),
  );
  const expectedRoots = manifest.disabledOfficialRoots;
  const disabledSegments = expectedRoots.map((rootPath) =>
    rootPath.replace(/^\//, ''),
  );
  const problems = [];
  for (const segment of disabledSegments) {
    if (!access.includes(`!../views/${segment}/**/*.vue`)) {
      problems.push(`dynamic page map does not exclude ${segment}`);
    }
    if (!routes.includes(`!../../views/${segment}/**/*.vue`)) {
      problems.push(`component key map does not exclude ${segment}`);
    }
    if (!routerHelper.includes(`!../views/${segment}/**/*.{vue,tsx}`)) {
      problems.push(`BPM dynamic form map does not exclude ${segment}`);
    }
  }
  for (const moduleName of ['ai', 'crm', 'mes']) {
    if (!routes.includes(`!./modules/${moduleName}.ts`)) {
      problems.push(`static module glob does not exclude ${moduleName}`);
    }
  }
  const expectedComponents = expectedRoots.map(
    (rootPath) => `${rootPath.replace(/^\//, '')}/`,
  );
  if (
    !sameValues(quotedValues(menuFilter, 'DISABLED_ROOT_PATHS'), expectedRoots)
  ) {
    problems.push('stale-menu exact disabled root set changed');
  }
  if (
    !sameValues(
      quotedValues(menuFilter, 'DISABLED_COMPONENT_PREFIXES'),
      expectedComponents,
    )
  ) {
    problems.push('stale-menu exact disabled component set changed');
  }
  if (
    !/DISABLED_ROOT_PATHS\.has\(menu\.path\)/.test(menuFilter) ||
    !/component\.startsWith\(prefix\)/.test(menuFilter) ||
    !/filterDisabledOfficialBusinessMenus\(menu\.children\)/.test(menuFilter)
  ) {
    problems.push(
      'stale-menu recursive runtime filter is not wired to the exact guards',
    );
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
}

verifyOfficialSources();
verifyFdmIsolation();
verifyRuntimeDisablement();
console.log(
  `FDM boundaries OK: official sources match ${manifest.baseline}; disabled modules remain outside runtime; FDM code has no official CRM/ERP/WMS/MES/Infra coupling or legacy FDM domain aliases.`,
);
