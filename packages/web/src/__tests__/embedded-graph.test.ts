import { describe, expect, it } from 'vitest';
import {
  FALLBACK_HTML_SHELL,
  GRAPH_DATA_ELEMENT_ID,
  getContentSecurityPolicy,
  renderGraphHtml,
  serializeEmbeddedGraph,
} from '../embedded-graph';

const harmlessBoundary = '</ScRiPt><div data-depic-boundary="unexpected">';
const exactCharacters = '<tag>&"\\\u2028\u2029雪';

function embeddedText(html: string): string {
  const match = html.match(new RegExp(
    `<script type="application/json" id="${GRAPH_DATA_ELEMENT_ID}">([\\s\\S]*?)<\\/script>`,
    'u',
  ));
  if (!match) throw new Error('Embedded graph data element not found.');
  return match[1];
}

describe('embedded graph serialization', () => {
  it('round-trips every lightweight graph string field across HTML boundaries', () => {
    const graph = {
      nodes: [
        { kind: 'file', id: harmlessBoundary, package: exactCharacters },
        { kind: 'external', id: exactCharacters },
      ],
      edges: [{
        source: harmlessBoundary,
        target: exactCharacters,
        kind: exactCharacters,
        specifier: harmlessBoundary,
      }],
    };

    const serialized = serializeEmbeddedGraph(graph);

    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/u);
    expect(JSON.parse(serialized)).toEqual(graph);
  });

  it('renders the fallback shell as inert data under a deterministic CSP', () => {
    const graph = { nodes: [], edges: [{ specifier: harmlessBoundary }] };
    const first = renderGraphHtml(FALLBACK_HTML_SHELL, graph);
    const second = renderGraphHtml(FALLBACK_HTML_SHELL, graph);

    expect(first).toBe(second);
    expect(first).not.toContain('window.__GRAPH__');
    expect(first).not.toContain(harmlessBoundary);
    expect(JSON.parse(embeddedText(first))).toEqual(graph);
    expect(getContentSecurityPolicy(first)).toContain("script-src 'none'");
  });

  it('allows only the controlled inline program by content hash', () => {
    const shell = FALLBACK_HTML_SHELL.replace(
      '</body>',
      '<script>globalThis.__depicReady = true;</script></body>',
    );
    const html = renderGraphHtml(shell, { nodes: [], edges: [] });
    const policy = getContentSecurityPolicy(html);

    expect(policy).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/u);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
  });

  it('rejects malformed or externally scripted shells', () => {
    expect(() => renderGraphHtml('<html></html>', {})).toThrow(/placeholder/u);
    expect(() => renderGraphHtml(
      FALLBACK_HTML_SHELL.replace('</body>', '<script src="app.js"></script></body>'),
      {},
    )).toThrow(/external scripts/u);
  });
});
