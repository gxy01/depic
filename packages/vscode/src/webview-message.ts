import type { DependencyGraph } from '@depic/core';
import { getFileDetails } from '@depic/web';

export interface FileDetailsResponse {
  type: 'fileDetails';
  fileId: string;
  data: object | null;
}

export function createFileDetailsResponse(
  graph: DependencyGraph,
  message: unknown,
): FileDetailsResponse | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const request = message as { type?: unknown; fileId?: unknown };
  if (request.type !== 'getFileDetails' || typeof request.fileId !== 'string') return undefined;
  return {
    type: 'fileDetails',
    fileId: request.fileId,
    data: getFileDetails(graph, request.fileId),
  };
}
