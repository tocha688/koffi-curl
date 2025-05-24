# Koffi-Curl

Node.js libcurl bindings using koffi with browser fingerprint capabilities.

Inspired by https://github.com/lexiforest/curl_cffi 

Use https://github.com/lexiforest/curl-impersonate

## Installation

To install dependencies:

```bash
npm install koffi-curl
```


## Running

### Basic usage

```javascript
import { req, libcurlVersion } from "koffi-curl";

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
```

### Axios Plugins

```javascript
import { CurlAxios, logger, LogLevel } from "koffi-curl";

logger.setLevel(LogLevel.DEBUG)

const axios = new CurlAxios({
    cookieEnable: true,
    impersonate: "chrome136",
})

axios.get("https://tls.peet.ws/api/all", {
    impersonate: "chrome136"
}).then(x=>{
    console.log(x.data)
}).catch(e=>{
    console.log(e)
})

```

### logger
```javascript
const { logger, LogLevel } = require('koffi-curl');

logger.setLevel(LogLevel.DEBUG);

logger.setLevel(LogLevel.WARN);

logger.setLevel(LogLevel.INFO);

logger.setLevel(LogLevel.ERROR);
```
