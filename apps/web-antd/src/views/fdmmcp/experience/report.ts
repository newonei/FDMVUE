import type { ExperienceInput } from '#/api/fdmmcp/experience';

export const lengths = {
  title: 120,
  scenario: 800,
  method: 4000,
  exception: 1000,
  source: 300,
} as const;

export async function sha256Hex(text: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function extractReport(
  date: string,
  raw: string,
): Promise<{ fields: ExperienceInput; sourceKey: string }> {
  const excerpt = raw.trim();
  if (!date || !excerpt) throw new Error('请选择日期并填写本人日报片段。');
  const lines = excerpt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pick = (pattern: RegExp) =>
    lines.map((line) => line.match(pattern)?.[1]?.trim()).find(Boolean) || '';
  const id = await sha256Hex(`${date}\n${excerpt}`);
  return {
    sourceKey: `report:${id}`,
    fields: {
      title: (pick(/^(?:标题|主题)[：:]\s*(.+)/) || lines[0] || '').slice(
        0,
        lengths.title,
      ),
      scenario: pick(/^(?:场景|适用场景|背景)[：:]\s*(.+)/).slice(
        0,
        lengths.scenario,
      ),
      method: pick(/^(?:做法|具体做法|经验|处理方法)[：:]\s*(.+)/).slice(
        0,
        lengths.method,
      ),
      exception: pick(/^(?:例外|注意事项|例外情况)[：:]\s*(.+)/).slice(
        0,
        lengths.exception,
      ),
      source: `${date} 工作日报`,
    },
  };
}
