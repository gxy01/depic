import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFile } from '../parseFile';
import type { ParsedFile } from '../types';

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures');

/** 解析内联源码字符串 */
export function parse(source: string, filePath = '/virtual/test.ts'): ParsedFile {
  return parseFile(source, filePath);
}

/** 解析 fixtures 目录下的文件 */
export function parseFixture(relativePath: string): ParsedFile {
  const fullPath = resolve(FIXTURES_DIR, relativePath);
  const source = readFileSync(fullPath, 'utf-8');
  return parseFile(source, fullPath);
}
