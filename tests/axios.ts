import { CurlAxios, logger, LogLevel } from "../src";

logger.setLevel(LogLevel.DEBUG)

const axios = new CurlAxios({
    cookieEnable: true,
    impersonate: "chrome136",
    // proxy:"http://127.0.0.1:10808"
})

axios.get("https://tls.peet.ws/api/all", {
    impersonate: "chrome136"
}).then(x=>{
    console.log(x.data)
}).catch(e=>{
    console.log(e)
})
