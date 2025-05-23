import { constants, Request, logger, LogLevel } from "../src";
import { libcurlVersion } from "../src/bindings";

// 只在测试时启用调试模式
logger.setLevel(LogLevel.DEBUG);

console.log(libcurlVersion());

const curl = new Request();
curl.get("https://tls.peet.ws/api/all", {
  // verifySsl: false  // 禁用SSL验证以进行测试
})
  .then((response) => {
    console.log("Status:", response.status);
    console.log("Response preview:", response.data.substring(0, 200));
  })
  .catch((error) => {
    console.error("Error:", error);
  });