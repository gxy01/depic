# ESM ImportDeclaration / ExportDeclaration 产生式覆盖

此文檔追蹤 ECMAScript 規範中 ImportDeclaration 與 ExportDeclaration 各產生式對應的測試文件。

## 規範產生式索引

### ImportDeclaration

| 規範產生式 | 語法形式 | 測試文件 | 狀態 |
|---|---|---|---|
| `import ModuleSpecifier ;` | `import 'foo'` | `esm/import-declaration-side-effect.test.ts` | 🟢 |
| `import NamedImports FromClause ;` | `import { foo } from 'bar'` | `esm/import-declaration-named.test.ts` | 🟢 |
| `import ImportedDefaultBinding FromClause ;` | `import foo from 'bar'` | `esm/import-declaration-default.test.ts` | 🟢 |
| `import NameSpaceImport FromClause ;` | `import * as foo from 'bar'` | `esm/import-declaration-namespace.test.ts` | 🟢 |
| `import ImportedDefaultBinding , NameSpaceImport FromClause ;` | `import foo, * as bar from 'baz'` | `esm/import-declaration-default-namespace.test.ts` | 🟢 |
| `import ImportedDefaultBinding , NamedImports FromClause ;` | `import foo, { bar } from 'baz'` | `esm/import-declaration-default-named.test.ts` | 🟢 |

### 动态导入

| 規範產生式 / 語法 | 語法形式 | 測試文件 | 狀態 |
|---|---|---|---|
| `ImportCall` | `import('foo')` | `esm/import-call.test.ts` | 🟢 |
| `ImportCall` (variable) | `const x = import('foo')` | `esm/import-call.test.ts` | 🟢 |

### ExportDeclaration

| 規範產生式 | 語法形式 | 測試文件 | 狀態 |
|---|---|---|---|
| `export NamedExports ;` | `export { foo }` | `esm/export-declaration-named.test.ts` | 🟢 |
| `export DefaultExportDeclaration ;` | `export default expr` | `esm/export-declaration-default.test.ts` | 🟢 |
| `export Declaration` | `export const foo = ...` | `esm/export-declaration-decl.test.ts` | 🟢 |
| `export { ExportsList } FromClause ;` | `export { foo } from 'bar'` | `esm/export-declaration-re-export.test.ts` | 🟢 |
| `export * FromClause ;` | `export * from 'bar'` | `esm/export-declaration-re-export-all.test.ts` | 🟢 |
| `export * as Identifier FromClause ;` | `export * as ns from 'bar'` | `esm/export-declaration-re-export-ns.test.ts` | 🟢 |

### TypeScript 扩展

| 語法形式 | 範例 | 測試文件 | 狀態 |
|---|---|---|---|
| `import type` (all type) | `import type { Foo } from 'bar'` | `ts/import-type.test.ts` | 🟢 |
| `import type` (default) | `import type Foo from 'bar'` | `ts/import-type.test.ts` | 🟢 |
| `export type` (named) | `export type { Foo }` | `ts/export-type.test.ts` | 🟢 |
| `export type` (re-export) | `export type { Foo } from 'bar'` | `ts/export-type.test.ts` | 🟢 |
| inline `type` modifier | `import { type Foo } from 'bar'` | `ts/import-inline-type.test.ts` | 🟢 |
| `/// <reference path="..." />` | Triple-slash | `ts/triple-slash-reference.test.ts` | ❌ |

### specifier 后缀 → kind 自动分类

Parser 根据 specifier 的文件扩展名自动覆盖 import kind。

| 分类 | 扩展名 | kind | 狀態 |
|---|---|---|---|
| CSS & preprocessors | `.css` `.scss` `.sass` `.less` `.styl` | `css-import` | 🟢 |
| Images | `.png` `.jpg` `.jpeg` `.gif` `.svg` `.ico` `.webp` `.avif` `.bmp` | `asset-import` | 🟢 |
| Fonts | `.woff` `.woff2` `.ttf` `.eot` `.otf` | `asset-import` | 🟢 |
| Media | `.mp4` `.webm` `.mp3` `.wav` | `asset-import` | 🟢 |
| Binary / 3D | `.wasm` `.glb` `.gltf` `.pdf` | `asset-import` | 🟢 |
| JSON | `.json` | 保持原 kind（static-import） | 🟢 |
| JS/TS | `.ts` `.tsx` `.js` `.jsx` | 保持原 kind | 🟢 |

测试文件：`esm/import-extension-kind.test.ts`（41 tests）

### CommonJS

| 語法形式 | 範例 | 測試文件 | 狀態 |
|---|---|---|---|
| `require()` | `const x = require('foo')` | `cjs/require.test.ts` | ❌ |
| destructured require | `const { a } = require('foo')` | `cjs/require-destructure.test.ts` | ❌ |

## 狀態圖例

| 圖示 | 含義 |
|---|---|
| ❌ | 測試文件不存在，尚未開始 |
| 🔴 | 測試存在但未通過（紅色） |
| 🟢 | 測試存在且通過（綠色） |
