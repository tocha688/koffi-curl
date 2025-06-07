import { AsyncCurl } from '../src/core/async';
import { Curl } from '../src/core/curl';
import { constants } from '../src/bindings';
import { Buffer } from 'buffer';
import { logger, LogLevel } from '../src/utils/logger';

logger.setLevel(LogLevel.DEBUG)
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
        curl.setopt(constants.CurlOpt.URL, 'https://google.com');
        curl.setopt(constants.CurlOpt.FOLLOWLOCATION, 1);
        curl.setopt(constants.CurlOpt.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CurlOpt.SSL_VERIFYHOST, 0);
        curl.setopt(constants.CurlOpt.TIMEOUT, 30); // 增加超时时间
        curl.setopt(constants.CurlOpt.CONNECTTIMEOUT, 10);
        curl.setopt(constants.CurlOpt.VERBOSE, 0);
        
        // 设置写入回调来收集响应数据
        let responseData = '';
        let dataReceived = false;
        
        curl.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
            const dataStr = data.toString();
            responseData += dataStr;
            dataReceived = true;
            console.log(`接收到数据: ${data.length} 字节`);
            return data.length;
        });
        
        console.log('开始异步请求...');
        
        const startTime = Date.now();
        
        // 直接等待异步请求完成，不设置额外的超时
        try {
            await asyncCurl.addHandle(curl);
            const endTime = Date.now();
            
            console.log(`请求成功完成，耗时: ${endTime - startTime}ms`);
            console.log('响应状态码:', curl.getinfo(constants.CurlInfo.RESPONSE_CODE));
            console.log('数据接收状态:', dataReceived);
            console.log('响应数据长度:', responseData.length);
            
            if (responseData.length > 0) {
                console.log('响应内容预览:', responseData.substring(0, 200));
            }
            
        } catch (requestError: any) {
            const endTime = Date.now();
            console.log(`请求失败，耗时: ${endTime - startTime}ms`);
            console.log('错误信息:', requestError.message);
            console.log('数据接收状态:', dataReceived);
            
            if (dataReceived) {
                console.log('尽管请求失败，但接收到了一些数据');
                console.log('响应数据长度:', responseData.length);
                if (responseData.length > 0) {
                    console.log('部分响应内容:', responseData.substring(0, 200));
                }
            }
        }
        
    } catch (error) {
        console.error('设置请求时失败:', error);
    } finally {
        try {
            console.log('清理资源...');
            await curl.close();
            setTimeout(async()=>{
                await asyncCurl.close();
            },3000)
            console.log('清理完成');
        } catch (closeError) {
            console.error('清理时出错:', closeError);
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
            curl.setopt(constants.CurlOpt.URL, url);
            curl.setopt(constants.CurlOpt.FOLLOWLOCATION, 1);
            curl.setopt(constants.CurlOpt.SSL_VERIFYPEER, 0);
            curl.setopt(constants.CurlOpt.SSL_VERIFYHOST, 0);
            curl.setopt(constants.CurlOpt.TIMEOUT, 30);
            curl.setopt(constants.CurlOpt.USERAGENT, `AsyncCurl-Test-${index + 1}`);
            
            // 设置写入回调
            curl.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
                responseData += data.toString();
                return data.length;
            });
            
            try {
                const startTime = Date.now();
                await asyncCurl.addHandle(curl);
                const endTime = Date.now();
                
                const statusCode = curl.getinfo(constants.CurlInfo.RESPONSE_CODE);
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
        curl.setopt(constants.CurlOpt.URL, 'https://httpbin.org/post');
        curl.setopt(constants.CurlOpt.POST, 1);
        curl.setopt(constants.CurlOpt.POSTFIELDS, postData);
        curl.setopt(constants.CurlOpt.FOLLOWLOCATION, 1);
        curl.setopt(constants.CurlOpt.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CurlOpt.SSL_VERIFYHOST, 0);
        curl.setopt(constants.CurlOpt.TIMEOUT, 30);
        
        // 设置请求头
        curl.setHeaders({
            'Content-Type': 'application/json',
            'User-Agent': 'AsyncCurl-Test/1.0'
        });
        
        // 设置写入回调
        let responseData = '';
        curl.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
            responseData += data.toString();
            return data.length;
        });
        
        // 异步执行请求
        const startTime = Date.now();
        await asyncCurl.addHandle(curl);
        const endTime = Date.now();
        
        console.log(`POST 请求完成，耗时: ${endTime - startTime}ms`);
        console.log('响应状态码:', curl.getinfo(constants.CurlInfo.RESPONSE_CODE));
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
        curl.setopt(constants.CurlOpt.URL, 'https://httpbin.org/user-agent');
        curl.setopt(constants.CurlOpt.FOLLOWLOCATION, 1);
        curl.setopt(constants.CurlOpt.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CurlOpt.SSL_VERIFYHOST, 0);
        curl.setopt(constants.CurlOpt.TIMEOUT, 30);
        
        // 伪装成 Chrome 浏览器
        try {
            curl.impersonate('chrome120');
            console.log('成功设置浏览器伪装: Chrome 120');
        } catch (e) {
            console.log('浏览器伪装失败，使用默认 User-Agent');
            curl.setopt(constants.CurlOpt.USERAGENT, 
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        }
        
        // 设置写入回调
        let responseData = '';
        curl.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
            responseData += data.toString();
            return data.length;
        });
        
        // 异步执行请求
        const startTime = Date.now();
        await asyncCurl.addHandle(curl);
        const endTime = Date.now();
        
        console.log(`浏览器伪装请求完成，耗时: ${endTime - startTime}ms`);
        console.log('响应状态码:', curl.getinfo(constants.CurlInfo.RESPONSE_CODE));
        
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
        curl.setopt(constants.CurlOpt.URL, 'https://invalid-domain-that-does-not-exist-12345.com');
        curl.setopt(constants.CurlOpt.TIMEOUT, 5); // 短超时
        curl.setopt(constants.CurlOpt.SSL_VERIFYPEER, 0);
        curl.setopt(constants.CurlOpt.SSL_VERIFYHOST, 0);
        
        let responseData = '';
        curl.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
            responseData += data.toString();
            return data.length;
        });
        
        console.log('尝试请求无效域名...');
        const startTime = Date.now();
        
        try {
            await asyncCurl.addHandle(curl);
            console.log('意外成功 - 这不应该发生');
        } catch (error:any) {
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
        // await testConcurrentRequests();
        // await testPostRequest();
        // await testBrowserImpersonation();
        // await testErrorHandling();
        
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
