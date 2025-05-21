/**
 * 测试库能否正常导入
 */

console.log('尝试导入库...');

try {
  // 使用 Node.js 的 require 方式导入，应该可以在编译后找到指定模块
  const lib = require('../dist/index');
  console.log('库导入成功!');
  console.log('导出的对象:', Object.keys(lib));
  
  if (lib.Curl && lib.constants) {
    console.log('√ 导入测试通过');
    process.exit(0);
  } else {
    console.error('× 导入测试失败: 缺少预期的导出');
    process.exit(1);
  }
} catch (err) {
  console.error('导入失败:', err);
  process.exit(1);
}
