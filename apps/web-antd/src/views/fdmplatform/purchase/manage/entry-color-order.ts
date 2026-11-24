import type { EntryRow } from './entry-model';

const unknownColors = new Set([
  '-',
  'n/a',
  'unknown',
  '待核实',
  '无',
  '未维护',
]);
const markedColorAtEnd =
  /(?:\bpantone|色号|颜色编码)[\s:#-]*([a-z\d]+(?:[ .-][a-z\d]+){0,2})$/i;
const namedColorAtEnd =
  /(?:(?:baby|coffee|dark|dusty|forest|hot|light|navy|olive|pale|royal|sky) +)?(?:beige|black|blue|brown|cream|cyan|gold|gray|green|grey|ivory|lavender|maroon|navy|olive|orange|pink|purple|red|silver|teal|turquoise|violet|white|yellow)$/i;
const chineseColorAtEnd =
  /(?:[亮天奶浅深米藏银]?[兰棕灰白粉紫红绿蓝褐金银青黄黑]色|卡其色|咖啡色|玫瑰色|橙色|黑白色|灰蓝色|蓝绿色|粉红色|紫红色)$/;

function colorValue(value?: null | string) {
  const normalized = value?.normalize('NFKC').trim().toLowerCase();
  if (!normalized || unknownColors.has(normalized)) return '';
  return normalized.replaceAll(/[-\s]+/g, ' ').trim();
}

function colorFromName(name: string) {
  const marked = name.match(markedColorAtEnd)?.[1];
  if (marked) return colorValue(marked);

  const spacedName = name.replaceAll(/[-\s]+/g, ' ');
  const named = namedColorAtEnd.exec(spacedName);
  if (named) {
    const prefix = spacedName.slice(0, named.index);
    // 旧包材名称也有大写系列名与颜色直接相连的写法，例如 PULSpurple。
    const followsSeries = /[A-Z]{2}$/.test(prefix) && /[a-z]/.test(named[0]);
    if (!/[a-z\d]$/i.test(prefix) || followsSeries) {
      return colorValue(named[0]);
    }
  }
  return colorValue(name.match(chineseColorAtEnd)?.[0]);
}

function rowColor(row: EntryRow) {
  if (!row.productId && !row.contractItemId) return '';
  const structure = row.structure;
  const code = colorValue(structure?.colorCode);
  const front = colorValue(structure?.frontColor);
  const back = colorValue(structure?.backColor);

  if (structure?.colorMode === 'DUAL') {
    return front && back ? JSON.stringify([front, back]) : '';
  }
  if (
    !code &&
    structure?.colorMode !== 'SINGLE' &&
    front &&
    back &&
    front !== back
  ) {
    return JSON.stringify([front, back]);
  }

  const recorded = code || front || back || colorValue(structure?.color);
  if (recorded) return recorded;

  const name = row.name.normalize('NFKC').trim();
  return colorValue(name) === colorValue(row.code) ? '' : colorFromName(name);
}

export function entryRowsByColor(rows: EntryRow[]): EntryRow[] {
  const groups = new Map<string, EntryRow[]>();
  const uncolored: EntryRow[] = [];
  for (const row of rows) {
    const color = rowColor(row);
    if (!color) {
      uncolored.push(row);
      continue;
    }

    const group = groups.get(color);
    if (group) group.push(row);
    else groups.set(color, [row]);
  }
  return [...[...groups.values()].flat(), ...uncolored];
}
