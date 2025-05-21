// 使用工具函数导入库，处理各种导入场景
const { Curl, constants } = require('./utils');

// 基础GET请求测试
function testBasicGet() {
  console.log('测试基础GET请求...');
  
  const curl = new Curl();
  
  try {
    // 设置URL
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/get');
    
    // 启用响应头输出
    curl.setopt(constants.CURLOPT.HEADER, 1);
    
    // 输出到一个字符串
    let responseData = '';
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      responseData += data.toString();
      return data.length;
    });
    
    // 执行请求
    const resultCode = curl.perform();
    
    // 获取响应代码
    const responseCode = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);
    
    console.log(`请求完成，结果代码: ${resultCode}`);
    console.log(`HTTP响应代码: ${responseCode}`);
    console.log(`响应长度: ${responseData.length} 字节`);
    console.log(`响应内容预览: ${responseData.substring(0, 100)}...`);
    
    if (resultCode === 0 && responseCode === 200) {
      console.log('✓ 基础GET请求测试通过');
    } else {
      console.error('✗ 基础GET请求测试失败');
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    // 关闭并清理资源
    curl.close();
  }
}

// 基础POST请求测试
function testBasicPost() {
  console.log('\n测试基础POST请求...');
  
  const curl = new Curl();
  
  try {
    // 设置URL
    curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/post');
    
    // 设置POST数据
    const postData = JSON.stringify({ name: 'koffi-curl', test: true });
    curl.setopt(constants.CURLOPT.POSTFIELDS, postData);
    
    // 设置Content-Type头
    curl.setopt(constants.CURLOPT.HTTPHEADER, [
      'Content-Type: application/json'
    ]);
    
    // 输出到一个字符串
    let responseData = '';
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data) => {
      responseData += data.toString();
      return data.length;
    });
    
    // 执行请求
    const resultCode = curl.perform();
    
    // 获取响应代码
    const responseCode = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);
    
    console.log(`请求完成，结果代码: ${resultCode}`);
    console.log(`HTTP响应代码: ${responseCode}`);
    console.log(`响应内容预览: ${responseData.substring(0, 100)}...`);
    
    // 解析并验证返回的数据
    try {
      const response = JSON.parse(responseData);
      if (response.json && response.json.name === 'koffi-curl') {
        console.log('✓ 基础POST请求测试通过');
      } else {
        console.error('✗ 基础POST请求测试失败 - 返回数据不匹配');
      }
    } catch (e) {
      console.error('✗ 基础POST请求测试失败 - 无法解析响应JSON');
    }
    
  } catch (err) {
    console.error('测试出错:', err);
  } finally {
    // 关闭并清理资源
    curl.close();
  }
}

// 运行所有测试
function runTests() {
  testBasicGet();
  testBasicPost();
}

runTests();
