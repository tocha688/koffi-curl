import { constants, Curl } from "../src";
import { libcurlVersion } from "../src/bindings";

console.log(libcurlVersion());

const curl = new Curl();
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
curl.setopt(constants.CURLOPT.WRITEFUNCTION, function(data) {
  responseData += data.toString();
  return data.length;
});

try {
  // 执行请求
  const resultCode = curl.perform();

  // 获取响应代码
  const responseCode = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);

  console.log(`请求完成，结果代码: ${resultCode}`);
  console.log(`HTTP响应代码: ${responseCode}`);
  console.log(`响应内容预览: ${responseData.substring(0, 100)}...`);

  // 解析并验证返回的数据
  const response = JSON.parse(responseData);
  if (response.json && response.json.name === 'koffi-curl') {
    console.log('✓ 基础POST请求测试通过');
  } else {
    console.error('✗ 基础POST请求测试失败 - 返回数据不匹配');
  }
} catch (e) {
  console.error('✗ 测试发生错误:', e);
} finally {
  // 确保关闭curl句柄
  curl.close();
}
