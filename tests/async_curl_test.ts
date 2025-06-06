import { AsyncCurl } from '../src/core/async_curl';
import { Curl } from '../src/core/curl';
import { constants } from '../src/bindings';
import { Buffer } from 'buffer';

/**
 * AsyncCurl 测试案例
 */

// 简单的 GET 请求测试
async function testSimpleGet() {
    console.log('=== 测试简单 GET 请求 ===');
    
    const asyncCurl = new AsyncCurl();
    const curl = new Curl();
    
    try {
        // 设置请求参数
        curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/get');
        curl.setopt(constants.CURLOPT.FOLLOWLOCATION, 1);
        curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
        curl.setopt(constants.CURLOPT.TIMEOUT, 15);
        curl.setopt(constants.CURLOPT.CONNECTTIMEOUT, 10);
        curl.setopt(constants.CURLOPT.VERBOSE, 0);
        
        // 设置写入回调来收集响应数据
        let responseData = '';
        let responseDataReceived = false;
        let totalBytesReceived = 0;
        
        curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
            const dataStr = data.toString();
            responseData += dataStr;
            responseDataReceived = true;
            totalBytesReceived += data.length;
            console.log(`接收到数据: ${data.length} 字节 (总计: ${totalBytesReceived} 字节)`);
            
            // 打印前100个字符来了解收到了什么
            if (totalBytesReceived <= 300) {
                console.log(`数据内容:`,dataStr);
            }
            
            return data.length;
        });
        
        // 设置头部回调来监控响应头
        curl.setopt(constants.CURLOPT.HEADERFUNCTION, (data: Buffer) => {
            const headerStr = data.toString().trim();
            if (headerStr) {
                console.log(`接收到头部: ${headerStr}`);
            }
            return data.length;
        });
        
        console.log('开始异步请求...');
        
        // 异步执行请求，添加超时保护
        const startTime = Date.now();
        await asyncCurl.addHandle(curl)
        
        const endTime = Date.now();
        
        console.log(`请求完成，耗时: ${endTime - startTime}ms`);
        console.log('响应状态码:', curl.getinfo(constants.CURLINFO.RESPONSE_CODE));
        console.log('响应数据长度:', responseData.length);
        console.log('是否接收到数据:', responseDataReceived);
        console.log('总接收字节数:', totalBytesReceived);
        
        if (responseData.length > 0) {
            console.log('响应内容预览:', responseData.substring(0, 500) + '...');
        } else {
            console.log('警告: 没有接收到响应数据');
        }
        
    } catch (error) {
        console.error('请求失败:', error);
    } finally {
        try {
            console.log('开始清理资源...');
            curl.close();
            await asyncCurl.close();
            console.log('资源清理完成');
        } catch (closeError) {
            console.error('关闭时出错:', closeError);
        }
    }
}

// 并发请求测试
async function testConcurrentRequests() {
    console.log('\n=== 测试并发请求 ===');
    
    const asyncCurl = new AsyncCurl();
    const urls = [
        'https://httpbin.org/get?test=1',
        'https://httpbin.org/get?test=2',
        'https://httpbin.org/get?test=3',
        'https://httpbin.org/user-agent',
        'https://httpbin.org/headers'
    ];
    
    try {
        const promises = urls.map(async (url, index) => {
            const curl = new Curl();
            let responseData = '';
            
            // 设置请求参数
            curl.setopt(constants.CURLOPT.URL, url);
            curl.setopt(constants.CURLOPT.FOLLOWLOCATION, 1);
            curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
            curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
            curl.setopt(constants.CURLOPT.TIMEOUT, 30);
            curl.setopt(constants.CURLOPT.USERAGENT, `AsyncCurl-Test-${index + 1}`);
            
            // 设置写入回调
            curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
                responseData += data.toString();
                return data.length;
            });
            
            try {
                const startTime = Date.now();
                await asyncCurl.addHandle(curl);
                const endTime = Date.now();
                
                const statusCode = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);
                console.log(`请求 ${index + 1} (${url}) 完成:`);
                console.log(`  状态码: ${statusCode}, 耗时: ${endTime - startTime}ms, 数据长度: ${responseData.length}`);
                
                return {
                    url,
                    statusCode,
                    responseTime: endTime - startTime,
                    dataLength: responseData.length
                };
            } finally {
                curl.close();
            }
        });
        
        const startTime = Date.now();
        const results = await Promise.all(promises);
        const endTime = Date.now();
        
        console.log(`\n所有并发请求完成，总耗时: ${endTime - startTime}ms`);
        console.log('结果摘要:');
        results.forEach((result, index) => {
            console.log(`  ${index + 1}. ${result.url}: ${result.statusCode} (${result.responseTime}ms)`);
        });
        
    } catch (error) {
        console.error('并发请求失败:', error);
    } finally {
        await asyncCurl.close();
    }
}

// POST 请求测试
async function testPostRequest() {
    console.log('\n=== 测试 POST 请求 ===');
    
    const asyncCurl = new AsyncCurl();
    const curl = new Curl();
    
    try {
        const postData = JSON.stringify({
            name: 'AsyncCurl Test',
            message: 'Hello from koffi-curl!',
            timestamp: new Date().toISOString()
        });
        
        // 设置请求参数
        curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/post');
        curl.setopt(constants.CURLOPT.POST, 1);
        curl.setopt(constants.CURLOPT.POSTFIELDS, postData);
        curl.setopt(constants.CURLOPT.FOLLOWLOCATION, 1);
        curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
        curl.setopt(constants.CURLOPT.TIMEOUT, 30);
        
        // 设置请求头
        curl.setHeaders({
            'Content-Type': 'application/json',
            'User-Agent': 'AsyncCurl-Test/1.0'
        });
        
        // 设置写入回调
        let responseData = '';
        curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
            responseData += data.toString();
            return data.length;
        });
        
        // 异步执行请求
        const startTime = Date.now();
        await asyncCurl.addHandle(curl);
        const endTime = Date.now();
        
        console.log(`POST 请求完成，耗时: ${endTime - startTime}ms`);
        console.log('响应状态码:', curl.getinfo(constants.CURLINFO.RESPONSE_CODE));
        console.log('发送的数据:', postData);
        console.log('响应数据长度:', responseData.length);
        
        // 解析响应数据
        try {
            const response = JSON.parse(responseData);
            console.log('服务器接收到的数据:', response.json);
        } catch (e) {
            console.log('响应内容预览:', responseData.substring(0, 300) + '...');
        }
        
    } catch (error) {
        console.error('POST 请求失败:', error);
    } finally {
        curl.close();
        await asyncCurl.close();
    }
}

// 模拟浏览器请求测试
async function testBrowserImpersonation() {
    console.log('\n=== 测试浏览器伪装 ===');
    
    const asyncCurl = new AsyncCurl();
    const curl = new Curl();
    
    try {
        // 设置请求参数
        curl.setopt(constants.CURLOPT.URL, 'https://httpbin.org/user-agent');
        curl.setopt(constants.CURLOPT.FOLLOWLOCATION, 1);
        curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
        curl.setopt(constants.CURLOPT.TIMEOUT, 30);
        
        // 伪装成 Chrome 浏览器
        try {
            curl.impersonate('chrome120');
            console.log('成功设置浏览器伪装: Chrome 120');
        } catch (e) {
            console.log('浏览器伪装失败，使用默认 User-Agent');
            curl.setopt(constants.CURLOPT.USERAGENT, 
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        }
        
        // 设置写入回调
        let responseData = '';
        curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
            responseData += data.toString();
            return data.length;
        });
        
        // 异步执行请求
        const startTime = Date.now();
        await asyncCurl.addHandle(curl);
        const endTime = Date.now();
        
        console.log(`浏览器伪装请求完成，耗时: ${endTime - startTime}ms`);
        console.log('响应状态码:', curl.getinfo(constants.CURLINFO.RESPONSE_CODE));
        
        // 解析响应查看 User-Agent
        try {
            const response = JSON.parse(responseData);
            console.log('服务器识别的 User-Agent:', response['user-agent']);
        } catch (e) {
            console.log('响应内容:', responseData);
        }
        
    } catch (error) {
        console.error('浏览器伪装请求失败:', error);
    } finally {
        curl.close();
        await asyncCurl.close();
    }
}

// 错误处理测试
async function testErrorHandling() {
    console.log('\n=== 测试错误处理 ===');
    
    const asyncCurl = new AsyncCurl();
    const curl = new Curl();
    
    try {
        // 设置一个无效的 URL
        curl.setopt(constants.CURLOPT.URL, 'https://invalid-domain-that-does-not-exist-12345.com');
        curl.setopt(constants.CURLOPT.TIMEOUT, 5); // 短超时
        curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
        
        let responseData = '';
        curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
            responseData += data.toString();
            return data.length;
        });
        
        console.log('尝试请求无效域名...');
        const startTime = Date.now();
        
        try {
            await asyncCurl.addHandle(curl);
            console.log('意外成功 - 这不应该发生');
        } catch (error) {
            const endTime = Date.now();
            console.log(`预期的错误发生，耗时: ${endTime - startTime}ms`);
            console.log('错误信息:', error.message);
        }
        
    } catch (error) {
        console.error('测试错误处理时发生意外错误:', error);
    } finally {
        curl.close();
        await asyncCurl.close();
    }
}

// 主测试函数
async function runAllTests() {
    console.log('开始 AsyncCurl 测试...\n');
    console.log('libcurl 版本:', AsyncCurl.version());
    
    try {
        await testSimpleGet();
        await testConcurrentRequests();
        await testPostRequest();
        await testBrowserImpersonation();
        await testErrorHandling();
        
        console.log('\n=== 所有测试完成 ===');
    } catch (error) {
        console.error('测试过程中发生错误:', error);
    }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    runAllTests().catch(console.error);
}

export {
    testSimpleGet,
    testConcurrentRequests,
    testPostRequest,
    testBrowserImpersonation,
    testErrorHandling,
    runAllTests
};
