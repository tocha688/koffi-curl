import { CurlAxios, logger, LogLevel } from "../src";

logger.setLevel(LogLevel.DEBUG)

const axios = new CurlAxios({})

axios.get("https://tls.peet.ws/api/all", {
    impersonate: "chrome136"
}).then(x=>{
    console.log(x.data)
}).catch(e=>{
    console.log(e)
})
