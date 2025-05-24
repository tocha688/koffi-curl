import { constants, req, logger, LogLevel } from "../src";
import { libcurlVersion } from "../src/bindings";

// 只在测试时启用调试模式
// logger.setLevel(LogLevel.DEBUG);

console.log(libcurlVersion());

req.get("https://tls.peet.ws/api/all", {
  impersonate: "chrome136"
})
  .then((response) => {
    console.log("Status:", response.status);
    console.log("Response preview:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
console.log("------------------")
req.get("https://postman-echo.com/get?param1=value1&param2=value2", {
  impersonate: "chrome136"
})
  .then((response) => {
    console.log("Status:", response.status);
    console.log("Response preview:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });