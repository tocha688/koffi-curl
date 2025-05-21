try {
  var { Curl, constants } = require('../dist/index');
} catch (e) {
  console.log('尝试从dist导入失败，错误:', e.message);
  // 尝试使用ts-node直接运行TS代码
  try {
    require('ts-node').register();
    var { Curl, constants } = require('../src/index.ts');
    console.log('已使用ts-node成功导入');
  } catch (tsError) {
    console.error('无法导入模块:', tsError);
    process.exit(1);
  }
}

// 测试写入回调
function testWriteCallback() {
  console.log('测试写入回调...');
  
  const curl = new Curl();
  
  try {
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/get');
    
    // 收集块数据到数组
    const chunks = [];
    
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      chunks.push(data);
      return data.length;
    });
    
    const resultCode = curl.perform();
    
    if (resultCode !== 0) {
      console.error(`✗ 请求执行失败: ${Curl.strerror(resultCode)}`);
      return;
    }
    
    console.log(`收到 ${chunks.length} 个数据块`);
    console.log(`总大小: ${chunks.reduce((acc, chunk) => acc + chunk.length, 0)} 字节`);
    
    if (chunks.length > 0) {
      console.log('✓ 写入回调测试通过');
    } else {
      console.error('✗ 写入回调测试失败 - 没有收到数据');
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    curl.close();
  }
}

// 测试头部回调
function testHeaderCallback() {
  console.log('\n测试头部回调...');
  
  const curl = new Curl();
  
  try {
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/get');
    curl.setopt(constants.CURLOPT.HEADER, 0); // 在body中不包含头部
    
    // 收集响应数据
    let responseBody = '';
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      responseBody += data.toString();
      return data.length;
    });
    
    // 收集头部数据
    const headers = [];
    curl.setopt(constants.CURLOPT.HEADERFUNCTION, (data) => {
      const headerLine = data.toString().trim();
      if (headerLine) headers.push(headerLine);
      return data.length;
    });
    
    const resultCode = curl.perform();
    
    if (resultCode !== 0) {
      console.error(`✗ 请求执行失败: ${Curl.strerror(resultCode)}`);
      return;
    }
    
    console.log(`收到 ${headers.length} 条头部信息:`);
    headers.slice(0, 5).forEach(h => console.log(`  ${h}`));
    if (headers.length > 5) console.log('  ...');
    
    console.log('响应数据:');
    console.log(responseBody.substring(0, 100) + '...');
    
    if (headers.length > 0 && responseBody.length > 0) {
      console.log('✓ 头部回调测试通过');
    } else {
      console.error('✗ 头部回调测试失败');
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    curl.close();
  }
}

// 测试进度回调
function testProgressCallback() {
  console.log('\n测试进度回调...');
  
  const curl = new Curl();
  
  try {
    // 使用较大的文件来测试进度回调
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/bytes/10000');
    
    let responseData = Buffer.alloc(0);
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      responseData = Buffer.concat([responseData, data]);
      return data.length;
    });
    
    // 进度信息记录
    const progressEvents = [];
    
    // 设置进度回调
    curl.setopt(constants.CURLOPT.XFERINFOFUNCTION, (dlTotal, dlNow, ulTotal, ulNow) => {
      progressEvents.push({ dlTotal, dlNow });
      console.log(`下载进度: ${dlNow}/${dlTotal} 字节`);
      return 0; // 继续传输
    });
    
    const resultCode = curl.perform();
    
    if (resultCode !== 0) {
      console.error(`✗ 请求执行失败: ${Curl.strerror(resultCode)}`);
      return;
    }
    
    console.log(`接收到 ${progressEvents.length} 个进度事件`);
    console.log(`最终下载大小: ${responseData.length} 字节`);
    
    // 验证进度事件是否合理
    if (progressEvents.length > 0) {
      const lastEvent = progressEvents[progressEvents.length - 1];
      if (lastEvent.dlNow === responseData.length) {
        console.log('✓ 进度回调测试通过');
      } else {
        console.error(`✗ 进度回调测试失败 - 大小不匹配 (最后进度: ${lastEvent.dlNow}, 实际大小: ${responseData.length})`);
      }
    } else {
      console.error('✗ 进度回调测试失败 - 没有进度事件');
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    curl.close();
  }
}

// 运行所有测试
function runTests() {
  testWriteCallback();
  testHeaderCallback();
  testProgressCallback();
}

runTests();
