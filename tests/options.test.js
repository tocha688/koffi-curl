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

// 测试各种CURL选项
function testCurlOptions() {
  console.log('测试CURL选项设置...');
  
  const curl = new Curl();
  
  try {
    // 设置超时选项
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/delay/1');
    curl.setopt(constants.CURLOPT.TIMEOUT, 10);
    curl.setopt(constants.CURLOPT.CONNECTTIMEOUT, 5);
    
    // 设置跟随重定向
    curl.setopt(constants.CURLOPT.FOLLOWLOCATION, 1);
    curl.setopt(constants.CURLOPT.MAXREDIRS, 5);
    
    // 设置User-Agent
    const userAgent = 'koffi-curl/1.0 Test';
    curl.setopt(constants.CURLOPT.USERAGENT, userAgent);
    
    // 测试响应信息获取
    let responseData = '';
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      responseData += data.toString();
      return data.length;
    });
    
    // 执行请求
    const resultCode = curl.perform();
    
    if (resultCode !== 0) {
      console.error(`✗ 请求执行失败: ${Curl.strerror(resultCode)}`);
      return;
    }
    
    // 获取各种信息
    const effectiveUrl = curl.getinfo(constants.CURLINFO.EFFECTIVE_URL);
    const responseCode = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);
    const contentType = curl.getinfo(constants.CURLINFO.CONTENT_TYPE);
    const totalTime = curl.getinfo(constants.CURLINFO.TOTAL_TIME);
    const httpVersion = curl.getinfo(constants.CURLINFO.HTTP_VERSION);
    
    console.log('请求信息:');
    console.log(`- 有效URL: ${effectiveUrl}`);
    console.log(`- 响应代码: ${responseCode}`);
    console.log(`- 内容类型: ${contentType}`);
    console.log(`- 总时间: ${totalTime}秒`);
    console.log(`- HTTP版本: ${httpVersion}`);
    
    // 验证请求是否带上了自定义User-Agent
    try {
      const response = JSON.parse(responseData);
      const receivedUA = response.headers['User-Agent'];
      
      if (receivedUA === userAgent) {
        console.log(`✓ User-Agent测试通过 (${receivedUA})`);
      } else {
        console.error(`✗ User-Agent测试失败 (期望: ${userAgent}, 实际: ${receivedUA})`);
      }
    } catch (e) {
      console.error('✗ 无法解析响应JSON:', e);
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    curl.close();
  }
}

// 测试HTTP头部设置
function testHttpHeaders() {
  console.log('\n测试HTTP头部设置...');
  
  const curl = new Curl();
  
  try {
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/headers');
    
    // 设置自定义HTTP头
    curl.setopt(constants.CURLOPT.HTTPHEADER, [
      'X-Custom-Header: koffi-curl-test',
      'Authorization: Bearer test-token'
    ]);
    
    let responseData = '';
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      responseData += data.toString();
      return data.length;
    });
    
    const resultCode = curl.perform();
    
    if (resultCode !== 0) {
      console.error(`✗ 请求执行失败: ${Curl.strerror(resultCode)}`);
      return;
    }
    
    // 验证自定义头是否被传递
    try {
      const response = JSON.parse(responseData);
      const customHeader = response.headers['X-Custom-Header'];
      const authHeader = response.headers['Authorization'];
      
      console.log('收到的头部:');
      console.log(`X-Custom-Header: ${customHeader}`);
      console.log(`Authorization: ${authHeader}`);
      
      if (customHeader === 'koffi-curl-test' && authHeader === 'Bearer test-token') {
        console.log('✓ HTTP头部测试通过');
      } else {
        console.error('✗ HTTP头部测试失败 - 头部不匹配');
      }
    } catch (e) {
      console.error('✗ 无法解析响应JSON:', e);
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    curl.close();
  }
}

// 运行所有测试
function runTests() {
  testCurlOptions();
  testHttpHeaders();
}

runTests();
