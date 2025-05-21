import { constants, Curl } from "../src";
import { libcurlVersion } from "../src/bindings";


console.log(libcurlVersion())

const curl = new Curl();
// 设置URL
curl.setopt(constants.CURLOPT.URL, 'https://tls.peet.ws/api/all');

// 临时禁用 SSL 对等方验证以进行测试
// 警告：不要在生产代码中使用此设置！
curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
// 有时也需要禁用主机名验证
// curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
    
// 设置POST数据
const postData = JSON.stringify({ name: 'koffi-curl', test: true });
// curl.setopt(constants.CURLOPT.POSTFIELDS, postData);

// 设置Content-Type头
curl.setopt(constants.CURLOPT.HTTPHEADER, [
  'Content-Type: application/json'
]);

// 输出到一个字符串
let responseData = '';
curl.setopt(constants.CURLOPT.WRITEFUNCTION, function(data){
  responseData += data.toString();
  return data.length;
});

// 执行请求
const resultCode = curl.perform();

// 获取响应代码
const responseCode = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);

console.log(`请求完成，结果代码: ${resultCode}`);
console.log(`HTTP响应代码: ${responseCode}`);
console.log(`响应内容预览: ${responseData}`);

// // 解析并验证返回的数据
// try {
//   const response = JSON.parse(responseData);
//   if (response.json && response.json.name === 'koffi-curl') {
//     console.log('✓ 基础POST请求测试通过');
//   } else {
//     console.error('✗ 基础POST请求测试失败 - 返回数据不匹配');
//   }
// } catch (e) {
//   console.error('✗ 基础POST请求测试失败 - 无法解析响应JSON');
// }