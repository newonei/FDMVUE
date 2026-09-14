import type { ActionDefinition, Field } from './data';

import type { ContractAttachment, Directory } from '#/api/fdmplatform';

export function personLabel(directory: Directory | undefined, value: unknown) {
  const user = directory?.users.find(
    (entry) => String(entry.id) === String(value),
  );
  if (user)
    return `${user.nickname}${user.departmentName ? ` · ${user.departmentName}` : ''} (#${user.id})`;
  return value ? `用户 #${value}` : '未指定';
}

export function withDirectory(
  definition: ActionDefinition,
  directory?: Directory,
): ActionDefinition {
  const decorate = (field: Field): Field => {
    if (/userId$/i.test(field.key)) {
      return {
        ...field,
        type: 'select',
        label: field.label.replace(/用户 ID|系统用户 ID|系统用户编号/, '人员'),
        options: (directory?.users ?? []).map((user) => ({
          value: user.id,
          label: personLabel(directory, user.id),
        })),
        hint: '从当前系统的启用用户中选择。',
      };
    }
    if (field.key === 'departmentId') {
      return {
        ...field,
        type: 'select',
        label: '业务部门',
        hint: '从当前系统的启用部门中选择。',
        options: (directory?.departments ?? []).map((department) => ({
          value: department.id,
          label: department.name,
        })),
      };
    }
    return field;
  };
  return {
    ...definition,
    fields: definition.fields.map(decorate),
    ...(definition.lineFields
      ? { lineFields: definition.lineFields.map(decorate) }
      : {}),
  };
}

export function withEvidence(
  definition: ActionDefinition,
  attachments: ContractAttachment[],
): ActionDefinition {
  const references = (value: unknown) =>
    Array.isArray(value)
      ? value
      : String(value ?? '')
          .split(/[,，\n]/)
          .map((entry) => entry.trim())
          .filter(Boolean);
  const decorate = (field: Field): Field => {
    if (!['attachmentIds', 'evidenceIds', 'evidenceRef'].includes(field.key))
      return field;
    return {
      ...field,
      type: field.key === 'evidenceRef' ? 'reference' : 'references',
      options: attachments.map((item) => ({
        value: item.id,
        label: `${item.name} · ${item.category}`,
      })),
      hint: '选择当前合同可读取的附件；历史外部凭证可保留引用。可先在附件页上传文件。',
    };
  };
  const fields = definition.fields.map(decorate);
  const lineFields = definition.lineFields?.map(decorate);
  const initialValues = { ...definition.initialValues };
  for (const field of fields)
    if (field.type === 'references' && initialValues[field.key] !== undefined)
      initialValues[field.key] = references(initialValues[field.key]);
  if (definition.lineKey && Array.isArray(initialValues[definition.lineKey])) {
    initialValues[definition.lineKey] = (
      initialValues[definition.lineKey] as Record<string, unknown>[]
    ).map((line) => {
      const next = { ...line };
      for (const field of lineFields ?? [])
        if (field.type === 'references' && next[field.key] !== undefined)
          next[field.key] = references(next[field.key]);
      return next;
    });
  }
  return { ...definition, fields, lineFields, initialValues };
}
