import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * specifier 后缀 → import kind 自动分类：
 * .css/.scss/.sass/.less/.styl → css-import
 * 图片/字体/媒体/二进制 → asset-import
 * .json / 无后缀 → 保持原 kind
 */
describe('import extension → kind classification', () => {
  // --- CSS ---
  it('classifies .css as css-import', () => {
    const result = parse(`import './style.css';`);
    expect(result.imports[0].kind).toBe('css-import');
  });

  it('classifies .scss as css-import', () => {
    const result = parse(`import './style.scss';`);
    expect(result.imports[0].kind).toBe('css-import');
  });

  it('classifies .sass as css-import', () => {
    const result = parse(`import './style.sass';`);
    expect(result.imports[0].kind).toBe('css-import');
  });

  it('classifies .less as css-import', () => {
    const result = parse(`import './style.less';`);
    expect(result.imports[0].kind).toBe('css-import');
  });

  it('classifies .styl as css-import', () => {
    const result = parse(`import './style.styl';`);
    expect(result.imports[0].kind).toBe('css-import');
  });

  it('CSS side-effect import keeps symbols empty', () => {
    const result = parse(`import './style.css';`);
    expect(result.imports[0].symbols).toEqual([]);
  });

  // --- Images ---
  it.each(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif', '.bmp'])(
    'classifies %s as asset-import',
    (ext) => {
      const result = parse(`import x from './img${ext}';`);
      expect(result.imports[0].kind).toBe('asset-import');
    },
  );

  it('default import of image keeps symbols', () => {
    const result = parse(`import logo from './logo.png';`);
    expect(result.imports[0].symbols).toEqual([
      { imported: 'default', local: 'logo' },
    ]);
  });

  // --- Fonts ---
  it.each(['.woff', '.woff2', '.ttf', '.eot', '.otf'])(
    'classifies %s as asset-import',
    (ext) => {
      const result = parse(`import './font${ext}';`);
      expect(result.imports[0].kind).toBe('asset-import');
    },
  );

  // --- Media ---
  it.each(['.mp4', '.webm', '.mp3', '.wav'])(
    'classifies %s as asset-import',
    (ext) => {
      const result = parse(`import './media${ext}';`);
      expect(result.imports[0].kind).toBe('asset-import');
    },
  );

  // --- Binary / 3D ---
  it.each(['.wasm', '.glb', '.gltf', '.pdf'])(
    'classifies %s as asset-import',
    (ext) => {
      const result = parse(`import './file${ext}';`);
      expect(result.imports[0].kind).toBe('asset-import');
    },
  );

  // --- JSON stays static-import ---
  it('keeps .json as static-import', () => {
    const result = parse(`import data from './data.json';`);
    expect(result.imports[0].kind).toBe('static-import');
  });

  // --- No extension stays as-is ---
  it('keeps kind for specifier without extension', () => {
    const result = parse(`import React from 'react';`);
    expect(result.imports[0].kind).toBe('static-import');
  });

  // --- TS/JS extensions stay as-is ---
  it.each(['.ts', '.tsx', '.js', '.jsx'])(
    'keeps %s as static-import',
    (ext) => {
      const result = parse(`import { foo } from './mod${ext}';`);
      expect(result.imports[0].kind).toBe('static-import');
    },
  );

  // --- Dynamic import also gets classified ---
  it('classifies dynamic css import as css-import', () => {
    const result = parse(`const x = import('./lazy.css');`);
    expect(result.imports[0].kind).toBe('css-import');
  });

  it('classifies dynamic image import as asset-import', () => {
    const result = parse(`const x = import('./lazy.png');`);
    expect(result.imports[0].kind).toBe('asset-import');
  });

  // --- Fixtures ---
  it('parses CSS fixture', () => {
    const result = parseFixture('esm/import-css.ts');
    expect(result.imports[0].kind).toBe('css-import');
    expect(result.imports[0].specifier).toBe('./style.css');
  });

  it('parses image fixture', () => {
    const result = parseFixture('esm/import-image.ts');
    expect(result.imports[0].kind).toBe('asset-import');
  });

  it('parses font fixture', () => {
    const result = parseFixture('esm/import-font.ts');
    expect(result.imports[0].kind).toBe('asset-import');
  });

  it('parses JSON fixture (stays static-import)', () => {
    const result = parseFixture('esm/import-json.ts');
    expect(result.imports[0].kind).toBe('static-import');
  });
});
