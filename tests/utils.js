/**
 * 帮助函数，用于安全地导入库
 */
function requireLibrary() {
  // 尝试不同的导入方法
  try {
    // 1. 首先尝试从编译后的dist目录导入
    return require('../dist/index');
  } catch (distError) {
    console.log('从dist导入失败:', distError.message);
    
    try {
      // 2. 尝试直接从编译后的单个文件导入（跳过索引文件）
      const { Curl } = require('../dist/core/curl');
      const constants = require('../dist/bindings/constants');
      return { Curl, constants };
    } catch (componentError) {
      console.log('从组件导入失败:', componentError.message);
      
      try {
        // 3. 尝试使用ts-node直接运行TypeScript文件
        require('ts-node').register();
        
        // 使用内联配置避免类型检查问题
        process.env.TS_NODE_TRANSPILE_ONLY = 'true';
        process.env.TS_NODE_COMPILER_OPTIONS = '{"module":"commonjs","target":"es2018"}';
        
        return require('../src/index');
      } catch (tsError) {
        console.error('无法导入模块:', tsError.message);
        console.error('详细错误:', tsError);
        process.exit(1);
      }
    }
  }
}

module.exports = requireLibrary();
