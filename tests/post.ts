import { constants, req as curl, logger, LogLevel } from "../src";
import { libcurlVersion } from "../src/bindings";

// 只在测试时启用调试模式
// logger.setLevel(LogLevel.DEBUG);

console.log(libcurlVersion());


curl.post("https://postman-echo.com/post", {
  hi: "111"
}, {
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
curl.post("https://postman-echo.com/post", "a=1&b=2", {
  impersonate: "chrome136"
})
  .then((response) => {
    console.log("Status:", response.status);
    console.log("Response preview:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
const data = new URLSearchParams()
data.append("a", "1")
data.append("b", "2")
curl.post("https://postman-echo.com/post", data, {
  impersonate: "chrome136"
})
  .then((response) => {
    console.log("Status:", response.status);
    console.log("Response preview:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });