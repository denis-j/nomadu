#!/usr/bin/env node
// Builds a browser-ready package of Nomadu's core UI components for the
// design-sync converter (cfg.buildCmd). The app itself is React Native with
// no web build, so this compiles the real components from components/ with
// react-native aliased to react-native-web, and stubs the few native-only
// modules they import for data/side effects (SQLite, location, router...).
//
// Output: .design-sync/.cache/web-pkg/
//   package.json   name "nomadu", module dist/index.mjs, types dist/types/...
//   dist/index.mjs ESM bundle (react, react-dom external)
//   dist/types/    tsc declarations for the entry
//   tokens.css     CSS custom properties generated from constants/colors.ts
//                  and constants/typography.ts
//
// Usage (repo root): node .design-sync/web-build.mjs
// Needs: npm i in .ds-sync (esbuild, react-native-web).

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = join(ROOT, '.ds-sync');
const req = createRequire(join(DEPS, 'package.json'));
const esbuild = req('esbuild');
const RNW = dirname(req.resolve('react-native-web/package.json'));
const OUT = join(ROOT, '.design-sync/.cache/web-pkg');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'dist'), { recursive: true });

// Modules the components import only for native side effects or app data.
// Each becomes a Proxy whose members are no-op functions, so the component
// code itself stays untouched.
const STUBS = [
  'expo-sqlite', 'expo-crypto', 'expo-location', 'expo-router', 'expo-audio',
  'expo-haptics', 'expo-updates', 'expo-notifications', 'expo-file-system',
  '@react-native-menu/menu', '@sentry/react-native', 'expo-task-manager',
];
const stubRx = new RegExp(`^(${STUBS.map((s) => s.replace(/[/.]/g, '\\$&')).join('|')})(/.*)?$`);
// esbuild copies a CJS module's own keys into `import * as X`, so a bare
// Proxy yields an empty namespace. Scan the app sources for the members each
// stubbed module is used with and export exactly those.
const ENUMS = {
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
};
const SCAN_DIRS = ['components', 'lib', 'utils', 'constants', 'hooks', 'contexts'];
const sources = SCAN_DIRS.flatMap((d) => {
  const dir = join(ROOT, d);
  return existsSync(dir) ? readdirSync(dir, { recursive: true })
    .filter((f) => /\.(tsx?|jsx?)$/.test(f)).map((f) => readFileSync(join(dir, f), 'utf8')) : [];
});
function membersOf(mod) {
  const names = new Set();
  const q = mod.replace(/[/.]/g, '\\$&');
  for (const src of sources) {
    for (const m of src.matchAll(new RegExp(`import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]${q}['"]`, 'g')))
      for (const u of src.matchAll(new RegExp(`\\b${m[1]}\\.(\\w+)`, 'g'))) names.add(u[1]);
    for (const m of src.matchAll(new RegExp(`import\\s+(?:type\\s+)?(?:\\w+\\s*,\\s*)?\\{([^}]*)\\}\\s+from\\s+['"]${q}['"]`, 'g')))
      for (const part of m[1].split(',')) { const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]; if (n) names.add(n); }
  }
  return [...names];
}
const stubPlugin = {
  name: 'native-stubs',
  setup(b) {
    b.onResolve({ filter: stubRx }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => {
      const members = membersOf(a.path.replace(/\/.*$/, (m) => (a.path.startsWith('@') ? m : '')));
      return {
        loader: 'js',
        contents: `
          const fn = () => Promise.resolve();
          const enums = ${JSON.stringify(ENUMS)};
          const special = {
            router: { push: fn, replace: fn, back: fn, navigate: fn, canGoBack: () => false },
            useRouter: () => special.router,
            useLocalSearchParams: () => ({}),
            MenuView: ({ children }) => children,
          };
          const out = { __esModule: true };
          for (const k of ${JSON.stringify(members)}) out[k] = k in enums ? enums[k] : k in special ? special[k] : fn;
          Object.assign(out, enums, special);
          out.default = out;
          module.exports = out;
        `,
      };
    });
  },
};

const shared = {
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  alias: { 'react-native': join(ROOT, '.design-sync/rn-web-shim.js'), 'react-native-web': RNW },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx', '.json', '.mjs'],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'module', 'default'],
  define: {
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
    'process.env.EXPO_OS': '"web"',
    global: 'globalThis',
  },
  loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [stubPlugin],
  logLevel: 'warning',
  nodePaths: [join(ROOT, 'node_modules')],
};

await esbuild.build({
  ...shared,
  entryPoints: [join(ROOT, '.design-sync/web-entry.ts')],
  outfile: join(OUT, 'dist/index.mjs'),
  format: 'esm',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  // CommonJS deps (react-native-web, vector-icons...) call require('react')
  // at runtime; ESM output has no require, so route it to the externals.
  banner: { js: [
    "import * as __dsReact from 'react';",
    "import * as __dsReactDom from 'react-dom';",
    "import * as __dsJsx from 'react/jsx-runtime';",
    "const require = (m) => { const ns = { react: __dsReact, 'react-dom': __dsReactDom, 'react/jsx-runtime': __dsJsx }[m];",
    "  if (!ns) throw new Error('web-build: unexpected require ' + m); return ns.default ?? ns; };",
    // Reanimated and others read process.env.* keys the defines don't cover.
    "const process = globalThis.process ?? { env: { NODE_ENV: 'production', EXPO_OS: 'web' } };",
    // react-native-web keeps its rules in <style id="react-native-stylesheet">
    // (via insertRule, so the tag is textually empty). Created in <head> it is
    // the first [id^=r] element and the converter's render check reads it as
    // an empty mount root; pre-create it at the end of <body> instead.
    "if (typeof document !== 'undefined' && !document.getElementById('react-native-stylesheet')) {",
    "  const s = document.createElement('style'); s.id = 'react-native-stylesheet';",
    "  (document.body || document.head).appendChild(s); }",
  ].join('\n') },
});

// Declarations: the converter reads <Name>Props from the shipped .d.ts tree.
try {
  execFileSync(join(ROOT, 'node_modules/.bin/tsc'), [
    '--declaration', '--emitDeclarationOnly', '--skipLibCheck', '--noEmitOnError', 'false',
    '--jsx', 'react-jsx', '--esModuleInterop', '--resolveJsonModule', '--strict',
    '--moduleResolution', 'bundler', '--module', 'esnext', '--target', 'es2020',
    '--allowImportingTsExtensions', '--customConditions', 'react-native',
    '--rootDir', ROOT, '--outDir', join(OUT, 'dist/types'),
    join(ROOT, '.design-sync/web-entry.ts'),
  ], { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
} catch (e) {
  // Type errors elsewhere in the app don't block declaration emit.
  const out = String(e.stdout ?? '') + String(e.stderr ?? '');
  console.error(`  tsc reported ${(out.match(/error TS/g) ?? []).length} type errors (declarations still emitted)`);
}

// Tokens: evaluate constants/ in node with react-native stubbed, then write
// CSS custom properties the design agent can use for its own layout glue.
const tokOut = join(OUT, '.tokens.mjs');
await esbuild.build({
  stdin: { contents: "export { Colors } from './constants/colors'; export { Typography } from './constants/typography';", resolveDir: ROOT, loader: 'ts' },
  outfile: tokOut, bundle: true, format: 'esm', platform: 'node', logLevel: 'warning',
  plugins: [{ name: 'rn-stub', setup(b) {
    b.onResolve({ filter: /^react-native$/ }, () => ({ path: 'rn', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const Platform = { OS: "web", select: (o) => o.web ?? o.default }; export const PlatformColor = (n) => n;' }));
  } }],
});
const { Colors, Typography } = await import(pathToFileURL(tokOut).href + `?t=${Date.now()}`);
rmSync(tokOut);
const kebab = (s) => s.replace(/([a-z0-9])([A-Z0-9])/g, '$1-$2').toLowerCase();
const lines = [];
for (const [k, v] of Object.entries(Colors)) lines.push(`  --color-${kebab(k)}: ${v};`);
for (const [k, s] of Object.entries(Typography)) {
  if (s.fontSize) lines.push(`  --type-${kebab(k)}-size: ${s.fontSize}px;`);
  if (s.fontWeight) lines.push(`  --type-${kebab(k)}-weight: ${s.fontWeight};`);
  if (s.lineHeight) lines.push(`  --type-${kebab(k)}-line-height: ${s.lineHeight}px;`);
  if (s.letterSpacing != null) lines.push(`  --type-${kebab(k)}-letter-spacing: ${s.letterSpacing}px;`);
}
writeFileSync(join(OUT, 'tokens.css'), `/* Generated from constants/colors.ts and constants/typography.ts by .design-sync/web-build.mjs */
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
${lines.join('\n')}
}
html, body { font-family: var(--font-sans); color: var(--color-text); -webkit-font-smoothing: antialiased; }
`);

writeFileSync(join(OUT, 'package.json'), JSON.stringify({
  name: 'nomadu',
  version: '1.0.4',
  module: 'dist/index.mjs',
  main: 'dist/index.mjs',
  types: 'dist/types/.design-sync/web-entry.d.ts',
  style: 'tokens.css',
}, null, 2) + '\n');
console.error(`web-pkg built at ${OUT}`);
