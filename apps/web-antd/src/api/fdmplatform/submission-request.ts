import { requestClient } from '#/api/request';
import {
  LARGE_FILE_TIMEOUT,
  withUploadProgress,
} from '#/components/upload-task';

import { submissionFormData } from './submission-files';

export function submitWithAttachments<T>(
  path: string,
  request: unknown,
  files: File[],
  categories?: string[],
) {
  const form = submissionFormData(request, files, categories);
  // The standard uploader indexes arrays; these endpoints require repeated "files" parts.
  return withUploadProgress(files, (onUploadProgress) =>
    requestClient.post<T>(`/fdmplatform/v1/submissions${path}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
      timeout: LARGE_FILE_TIMEOUT,
    }),
  );
}
