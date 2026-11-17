import type { WorkBook } from 'xlsx';

import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';

type XmlNode = Record<string, any>;
const array = (value: any): XmlNode[] => value ? (Array.isArray(value) ? value : [value]) : [];
const color = (value?: XmlNode) => typeof value?.rgb === 'string' && /^(?:[\da-f]{6}|[\da-f]{8})$/i.test(value.rgb) ? `#${value.rgb.slice(-6)}` : undefined;

/** Preserve the common XLSX presentation properties without creating HTML from files. */
export function applySpreadsheetStyles(buffer: ArrayBuffer, workbook: WorkBook) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', processEntities: false, parseAttributeValue: false });
  const files = unzipSync(bytes, { filter: (entry) => entry.name === 'xl/styles.xml' || entry.name === 'xl/workbook.xml' || entry.name === 'xl/_rels/workbook.xml.rels' });
  if (!files['xl/styles.xml']) return;
  const styleSheet = parser.parse(strFromU8(files['xl/styles.xml'])).styleSheet;
  if (!styleSheet) return;
  const fonts = array(styleSheet.fonts?.font);
  const fills = array(styleSheet.fills?.fill);
  const borders = array(styleSheet.borders?.border);
  const styles = array(styleSheet.cellXfs?.xf).map((format) => {
    const result: Record<string, string> = {};
    const font = fonts[Number(format.fontId)];
    if (font) {
      if (font.b !== undefined && font.b?.val !== '0') result.fontWeight = '700';
      if (font.i !== undefined && font.i?.val !== '0') result.fontStyle = 'italic';
      if (font.u !== undefined) result.textDecoration = 'underline';
      if (color(font.color)) result.color = color(font.color)!;
      const size = Number(font.sz?.val);
      if (Number.isFinite(size) && size > 0) result.fontSize = `${Math.min(32, Math.max(12, size * 4 / 3))}px`;
    }
    const fill = fills[Number(format.fillId)]?.patternFill;
    if (fill?.patternType === 'solid' && color(fill.fgColor)) result.backgroundColor = color(fill.fgColor)!;
    const alignment = format.alignment;
    if (['left', 'center', 'right'].includes(alignment?.horizontal)) result.textAlign = alignment.horizontal;
    if (alignment?.wrapText === '1') result.whiteSpace = 'pre-wrap';
    const border = borders[Number(format.borderId)];
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const edge = border?.[side.toLowerCase()];
      if (!edge?.style || edge.style === 'none') continue;
      const width = ['thick', 'medium', 'mediumDashed'].includes(edge.style) ? 2 : 1;
      const line = edge.style === 'double' ? 'double' : edge.style.toLowerCase().includes('dash') ? 'dashed' : edge.style === 'dotted' ? 'dotted' : 'solid';
      result[`border${side}`] = `${width}px ${line} ${color(edge.color) ?? '#64748b'}`;
    }
    return result;
  });
  if (!files['xl/workbook.xml'] || !files['xl/_rels/workbook.xml.rels']) return;
  const sheetEntries = array(parser.parse(strFromU8(files['xl/workbook.xml'])).workbook?.sheets?.sheet);
  const relations = array(parser.parse(strFromU8(files['xl/_rels/workbook.xml.rels'])).Relationships?.Relationship);
  for (const entry of sheetEntries) {
    const relation = relations.find((item) => item.Id === entry['r:id']);
    if (!relation?.Target || relation.TargetMode === 'External') continue;
    const target = String(relation.Target);
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    if (!path.startsWith('xl/worksheets/') || path.includes('..')) continue;
    const data = unzipSync(bytes, { filter: (item) => item.name === path })[path];
    const sheet = workbook.Sheets[entry.name];
    if (!data || !sheet) continue;
    const xml = strFromU8(data);
    // Only inspect opening cell tags; never parse/evaluate cell content or formulas.
    for (const match of xml.matchAll(/<(?:\w+:)?c\s[^>]*>/g)) {
      const address = /\br="([A-Z]+[1-9]\d*)"/.exec(match[0])?.[1];
      const styleId = /\bs="(\d+)"/.exec(match[0])?.[1];
      if (address && styleId && sheet[address]) sheet[address].previewStyle = styles[Number(styleId)];
    }
  }
}
