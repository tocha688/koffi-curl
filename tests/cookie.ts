import { CurlAxios, logger, LogLevel } from "../src";

logger.setLevel(LogLevel.DEBUG)

const axios = new CurlAxios({
    cookieEnable: true,
    impersonate: "chrome136",
})

async function test() {
    await axios.get("https://google.com")
    await axios.get("https://google.com")
}
test();