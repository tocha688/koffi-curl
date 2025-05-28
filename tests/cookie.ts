import { CurlAxios, logger, LogLevel } from "../src";

logger.setLevel(LogLevel.DEBUG)

const axios = new CurlAxios({
    cookieEnable: true,
    impersonate: "chrome136",
    verifySsl: false,
})

async function test() {
    axios.jar?.setCookieSync("test=123", "https://tls.peet.ws");
    const res=await axios.get("https://tls.peet.ws/api/all")
    console.log("Status:", res.status);
    console.log("Response preview:", res.data);
}
test();