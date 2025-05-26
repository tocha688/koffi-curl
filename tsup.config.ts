import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'], // 入口文件
  format: ['esm', 'cjs'], // 同时支持 ESM 和 CJS
  dts: true, // 生成类型声明文件
  splitting: true, // 适用于 ESM
  clean: true // 清理旧的构建产物
});
