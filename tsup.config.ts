import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: true,
    minify: false,
    target: 'node14',
    outDir: 'dist',
    outExtension: () => ({ js: '.mjs' }),
    external: [
      'koffi',
      'axios',
      'got',
      'lodash',
      'tar',
      'tough-cookie'
    ],
    define: {
      '__dirname': 'import.meta.dirname',
      '__filename': 'import.meta.filename'
    },
    esbuildOptions(options) {
      options.platform = 'node';
      options.format = 'esm';
    }
  },
  // CJS build
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: false,
    target: 'node14',
    outDir: 'dist',
    external: [
      'koffi',
      'axios',
      'got',
      'lodash',
      'tar',
      'tough-cookie'
    ],
    esbuildOptions(options) {
      options.platform = 'node';
      options.format = 'cjs';
    }
  },
  // Types build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: { only: true },
    outDir: 'dist'
  }
]);