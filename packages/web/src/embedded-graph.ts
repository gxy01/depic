import { createHash } from 'node:crypto';

export const GRAPH_DATA_ELEMENT_ID = 'depic-graph-data';
export const GRAPH_DATA_PLACEHOLDER = '%%GRAPH_JSON%%';
export const CSP_PLACEHOLDER = '%%CONTENT_SECURITY_POLICY%%';

export const FALLBACK_HTML_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${CSP_PLACEHOLDER}">
</head>
<body>
<div id="root"></div>
<script type="application/json" id="${GRAPH_DATA_ELEMENT_ID}">${GRAPH_DATA_PLACEHOLDER}</script>
</body>
</html>`;

const HTML_BOUNDARY_ESCAPES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** Serialize JSON without leaving HTML parser boundaries in the raw document. */
export function serializeEmbeddedGraph(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Embedded graph data must be JSON-serializable.');
  return json.replace(/[<>&\u2028\u2029]/gu, (character) => HTML_BOUNDARY_ESCAPES[character]);
}

/** Render one graph payload and a deterministic CSP into a controlled HTML shell. */
export function renderGraphHtml(shell: string, graphData: unknown): string {
  const policy = createContentSecurityPolicy(shell);
  const withPolicy = replaceSinglePlaceholder(shell, CSP_PLACEHOLDER, policy);
  return replaceSinglePlaceholder(
    withPolicy,
    GRAPH_DATA_PLACEHOLDER,
    serializeEmbeddedGraph(graphData),
  );
}

export function getContentSecurityPolicy(html: string): string | undefined {
  return html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/iu,
  )?.[1];
}

function replaceSinglePlaceholder(shell: string, placeholder: string, value: string): string {
  const first = shell.indexOf(placeholder);
  if (first < 0 || shell.indexOf(placeholder, first + placeholder.length) >= 0) {
    throw new Error(`HTML shell must contain exactly one ${placeholder} placeholder.`);
  }
  return shell.slice(0, first) + value + shell.slice(first + placeholder.length);
}

function createContentSecurityPolicy(html: string): string {
  const hashes: string[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1];
    if (/\btype="application\/json"/iu.test(attributes)) continue;
    if (/\bsrc\s*=/iu.test(attributes)) {
      throw new Error('HTML shell must not contain external scripts.');
    }
    const digest = createHash('sha256').update(match[2], 'utf8').digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }

  const scriptSource = hashes.length > 0 ? [...new Set(hashes)].sort().join(' ') : "'none'";
  return [
    "default-src 'none'",
    `script-src ${scriptSource}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
