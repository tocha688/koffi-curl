const { asyncGet, asyncPost, asyncBatch, AsyncRequestPool } = require('./utils');

// 测试异步GET请求
async function testAsyncGet() {
  console.log('测试异步GET请求...');
  
  try {
    const response = await asyncGet('https://httpbin.org/get', {
      headers: { 'User-Agent': 'koffi-curl-async/1.0' }
    });
    
    console.log(`状态码: ${response.status}`);
    console.log(`响应长度: ${response.data.length} 字节`);
    
    if (response.status === 200) {
      console.log('✓ 异步GET请求测试通过');
    } else {
      console.error('✗ 异步GET请求测试失败');
    }
  } catch (error) {
    console.error('异步GET请求出错:', error);
  }
}

// 测试异步POST请求
async function testAsyncPost() {
  console.log('\n测试异步POST请求...');
  
  try {
    const postData = { name: 'async-test', timestamp: Date.now() };
    const response = await asyncPost('https://httpbin.org/post', postData);
    
    console.log(`状态码: ${response.status}`);
    
    const parsed = JSON.parse(response.data);
    if (parsed.json && parsed.json.name === 'async-test') {
      console.log('✓ 异步POST请求测试通过');
    } else {
      console.error('✗ 异步POST请求测试失败 - 数据不匹配');
    }
  } catch (error) {
    console.error('异步POST请求出错:', error);
  }
}

// 测试批量请求
async function testBatchRequests() {
  console.log('\n测试批量异步请求...');
  
  try {
    const requests = [
      { url: 'https://httpbin.org/get?test=1', method: 'GET' },
      { url: 'https://httpbin.org/get?test=2', method: 'GET' },
      { url: 'https://httpbin.org/get?test=3', method: 'GET' }
    ];
    
    const startTime = Date.now();
    const responses = await asyncBatch(requests);
    const duration = Date.now() - startTime;
    
    console.log(`批量请求完成: ${responses.length} 个请求，耗时 ${duration}ms`);
    
    const allSuccessful = responses.every(r => r.status === 200);
    if (allSuccessful) {
      console.log('✓ 批量异步请求测试通过');
    } else {
      console.error('✗ 批量异步请求测试失败');
    }
  } catch (error) {
    console.error('批量请求出错:', error);
  }
}

// 测试请求池
async function testRequestPool() {
  console.log('\n测试异步请求池...');
  
  const pool = new AsyncRequestPool({
    maxConcurrency: 3,
    timeout: 10000,
    retryAttempts: 2
  });
  
  try {
    const urls = [
      'https://httpbin.org/delay/1',
      'https://httpbin.org/delay/2',
      'https://httpbin.org/get',
      'https://httpbin.org/user-agent',
      'https://httpbin.org/headers'
    ];
    
    const startTime = Date.now();
    
    // 并发发送请求
    const promises = urls.map(url => 
      pool.request({ url, method: 'GET' })
    );
    
    const responses = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    console.log(`请求池测试完成: ${responses.length} 个请求，耗时 ${duration}ms`);
    console.log(`池状态:`, pool.getStatus());
    
    const allSuccessful = responses.every(r => r.status === 200);
    if (allSuccessful) {
      console.log('✓ 异步请求池测试通过');
    } else {
      console.error('✗ 异步请求池测试失败');
    }
    
    await pool.close();
  } catch (error) {
    console.error('请求池测试出错:', error);
    await pool.close();
  }
}

// 运行所有异步测试
async function runAsyncTests() {
  await testAsyncGet();
  await testAsyncPost();
  await testBatchRequests();
  await testRequestPool();
}

// 导出测试函数供其他模块使用
if (require.main === module) {
  runAsyncTests().catch(console.error);
}

module.exports = { runAsyncTests };
