const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

console.log('开始运行测试...\n');

// 获取所有的测试文件
const testFiles = fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.test.js'))
  .map(file => path.join(__dirname, file));

console.log(`找到 ${testFiles.length} 个测试文件:`);
testFiles.forEach(file => console.log(`- ${path.basename(file)}`));
console.log('');

// 按顺序运行所有测试
const results = testFiles.map(file => {
  const testName = path.basename(file);
  console.log(`=== 运行测试: ${testName} ===`);
  
  try {
    // 添加 NODE_OPTIONS='--unhandled-rejections=strict' 使未捕获的 Promise 拒绝导致进程退出
    child_process.execSync(`node --unhandled-rejections=strict "${file}"`, { stdio: 'inherit' });
    console.log(`\n=== 测试 ${testName} 完成 ===\n`);
    return { file: testName, success: true };
  } catch (error) {
    console.error(`\n=== 测试 ${testName} 失败 ===\n`);
    return { file: testName, success: false };
  }
});

// 输出测试总结
console.log('\n=== 测试结果总结 ===');
const successful = results.filter(r => r.success).length;
console.log(`通过: ${successful}/${testFiles.length}`);

if (successful === testFiles.length) {
  console.log('✓ 所有测试通过!\n');
  process.exit(0);
} else {
  console.log('✗ 有测试失败!\n');
  process.exit(1);
}
