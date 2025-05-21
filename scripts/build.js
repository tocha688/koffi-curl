const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('开始构建 koffi-curl...');

try {
  // 检查是否已安装 TypeScript
  try {
    require.resolve('typescript');
  } catch (e) {
    console.log('正在安装 TypeScript...');
    execSync('npm install --no-save typescript', { stdio: 'inherit' });
  }

  // 运行 TypeScript 编译
  console.log('编译 TypeScript 代码...');
  execSync('npx tsc', { stdio: 'inherit' });

  // 检查 dist 目录是否存在
  const distDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 检查是否成功编译
  const indexFile = path.join(distDir, 'index.js');
  if (fs.existsSync(indexFile)) {
    console.log('编译成功！');
  } else {
    throw new Error('编译后的文件未找到');
  }
} catch (error) {
  console.error('构建失败:', error);
  process.exit(1);
}
