const fs = require('fs');
const path = require('path');

console.log('后处理构建文件...');

try {
  // 创建 ESM package.json
  const esmPackageJson = {
    "type": "module"
  };
  
  const esmDir = path.join(__dirname, '..', 'dist', 'esm');
  if (!fs.existsSync(esmDir)) {
    fs.mkdirSync(esmDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(esmDir, 'package.json'),
    JSON.stringify(esmPackageJson, null, 2)
  );

  // 创建 CJS package.json
  const cjsPackageJson = {
    "type": "commonjs"
  };
  
  const cjsDir = path.join(__dirname, '..', 'dist', 'cjs');
  if (!fs.existsSync(cjsDir)) {
    fs.mkdirSync(cjsDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(cjsDir, 'package.json'),
    JSON.stringify(cjsPackageJson, null, 2)
  );

  console.log('✅ 后处理完成！');

} catch (error) {
  console.error('❌ 后处理失败:', error.message);
  process.exit(1);
}