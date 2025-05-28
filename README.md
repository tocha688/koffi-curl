# Koffi-Curl

[![npm version](https://badge.fury.io/js/koffi-curl.svg)](https://badge.fury.io/js/koffi-curl)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/koffi-curl.svg)](https://nodejs.org/)

Node.js libcurl bindings using koffi with browser TLS/JA3 fingerprint capabilities.

**Inspired by** [curl_cffi](https://github.com/lexiforest/curl_cffi)  
**Uses** [curl-impersonate](https://github.com/lexiforest/curl-impersonate)

## ✨ Features

- 🚀 **High Performance**: Direct libcurl bindings via koffi
- 🕵️ **Browser TLS/JA3 Fingerprint**: Simulate Chrome, Firefox, Safari, Edge
- 🔄 **HTTP/2 & HTTP/3**: Full modern protocol support
- 🍪 **Cookie Management**: Automatic cookie handling with tough-cookie
- 🔒 **SSL/TLS**: Advanced SSL configuration and verification
- 📦 **Dual Module**: CommonJS and ESM support
- 🎯 **Axios Compatible**: Drop-in replacement with familiar API
- ⚡ **Async/Await**: Modern Promise-based API
- 🔧 **Proxy Support**: HTTP, HTTPS, SOCKS proxies

## 📦 Installation

```bash
npm install koffi-curl
```

## 🚀 Quick Start

### Basic Usage

#### ESM (ES Modules)
```javascript
import { req, libcurlVersion } from "koffi-curl";

console.log("libcurl version:", libcurlVersion());

// Simple GET request
const response = await req.get("https://httpbin.org/get", {
  impersonate: "chrome136"
});

console.log("Status:", response.status);
console.log("Data:", response.data);
```

#### CommonJS
```javascript
const { req, libcurlVersion } = require("koffi-curl");

req.get("https://httpbin.org/get", {
  impersonate: "chrome136"
})
  .then((response) => {
    console.log("Status:", response.status);
    console.log("Response:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
```

### POST Request
```javascript
import { req } from "koffi-curl";

// JSON data
const response = await req.post("https://httpbin.org/post", {
  name: "John",
  age: 30
}, {
  impersonate: "chrome136",
  headers: {
    "Content-Type": "application/json"
  }
});

// Form data
const formResponse = await req.post("https://httpbin.org/post", 
  "key1=value1&key2=value2", 
  {
    impersonate: "firefox128",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  }
);
```

## 🔧 Axios Plugin

Use the familiar Axios API with curl-impersonate power:

```javascript
import { CurlAxios, logger, LogLevel } from "koffi-curl";

// Enable debug logging
logger.setLevel(LogLevel.DEBUG);

// Create axios instance with cookie support
const axios = new CurlAxios({
  baseURL: "https://api.example.com",
  timeout: 10000,
  cookieEnable: true,
  impersonate: "chrome136",
  verifySsl: true
});

// Use like regular axios
const response = await axios.get("/users", {
  params: { page: 1 }
});

const postResponse = await axios.post("/users", {
  name: "John Doe",
  email: "john@example.com"
});
```

## 🕵️ Browser Fingerprints

Supported browser fingerprints for impersonation:

| Browser | Versions Available |
|---------|-------------------|
| **Chrome** | chrome99, chrome100, chrome101, chrome104, chrome107, chrome110, chrome116, chrome119, chrome120, chrome123, chrome124, chrome126, chrome127, chrome131, chrome136 |
| **Firefox** | firefox91, firefox95, firefox98, firefox102, firefox105, firefox109, firefox117, firefox121, firefox128, firefox132, firefox133 |
| **Safari** | safari15_3, safari15_5, safari15_6_1, safari16, safari16_5, safari17_0, safari17_2_1, safari17_4_1, safari17_5, safari18_0 |
| **Edge** | edge99, edge101, edge122, edge127 |

```javascript
// Example with different browsers
await req.get("https://httpbin.org/headers", { impersonate: "chrome136" });
await req.get("https://httpbin.org/headers", { impersonate: "firefox128" });
await req.get("https://httpbin.org/headers", { impersonate: "safari17_5" });
```

## 📝 API Reference

### Request Options

```javascript
const options = {
  method: 'GET',           // HTTP method
  headers: {},             // Custom headers
  data: null,              // Request body (POST, PUT, PATCH)
  params: {},              // URL parameters
  timeout: 30000,          // Timeout in milliseconds
  followRedirects: true,   // Follow HTTP redirects
  maxRedirects: 5,         // Maximum redirect count
  proxy: 'http://...',     // Proxy URL
  userAgent: 'Custom',     // Custom User-Agent
  impersonate: 'chrome136', // Browser fingerprint
  verifySsl: true          // SSL certificate verification
};
```

### Response Object

```javascript
{
  status: 200,              // HTTP status code
  statusText: 'OK',         // HTTP status text
  headers: {},              // Response headers
  data: '...',              // Response body
  url: 'https://...',       // Final URL (after redirects)
  redirectCount: 0          // Number of redirects followed
}
```

### Request Methods

```javascript
import { req } from "koffi-curl";

// GET request
const response = await req.get(url, options);

// POST request  
const response = await req.post(url, data, options);

// PUT request
const response = await req.put(url, data, options);

// PATCH request
const response = await req.patch(url, data, options);

// DELETE request
const response = await req.delete(url, options);

// Custom request
const response = await req.request({
  url: 'https://example.com',
  method: 'POST',
  data: { key: 'value' }
});
```

## 🔄 Advanced Usage

### Proxy Configuration

```javascript
// HTTP proxy
await req.get("https://httpbin.org/ip", {
  proxy: "http://proxy.example.com:8080"
});

// SOCKS proxy
await req.get("https://httpbin.org/ip", {
  proxy: "socks5://proxy.example.com:1080"
});

// Authenticated proxy
await req.get("https://httpbin.org/ip", {
  proxy: "http://username:password@proxy.example.com:8080"
});
```

### Custom Headers

```javascript
await req.get("https://httpbin.org/headers", {
  headers: {
    "Authorization": "Bearer token123",
    "X-API-Key": "your-api-key",
    "Accept": "application/json"
  },
  impersonate: "chrome136"
});
```

### Cookie Management with Axios Plugin

```javascript
const axios = new CurlAxios({
  cookieEnable: true,  // Enable automatic cookie handling
  impersonate: "chrome136"
});

// Cookies are automatically managed across requests
await axios.post("/login", { username: "user", password: "pass" });
const profile = await axios.get("/profile"); // Cookies sent automatically
```

## 📊 Logging

Control logging output for debugging:

```javascript
import { logger, LogLevel } from "koffi-curl";

// Set log level
logger.setLevel(LogLevel.DEBUG);   // Verbose debugging
logger.setLevel(LogLevel.INFO);    // General information
logger.setLevel(LogLevel.WARN);    // Warnings only
logger.setLevel(LogLevel.ERROR);   // Errors only
```

## 🔒 SSL/TLS Configuration

```javascript
// Disable SSL verification (not recommended for production)
await req.get("https://self-signed.badssl.com/", {
  verifySsl: false
});

// Custom SSL configuration (advanced)
await req.get("https://example.com", {
  verifySsl: true,
  // Additional SSL options can be configured
});
```

## ⚡ Performance Tips

1. **Reuse connections**: The library automatically handles connection pooling
2. **Choose appropriate timeouts**: Set reasonable timeout values for your use case
3. **Use appropriate fingerprints**: Different fingerprints may have different performance characteristics
4. **Enable compression**: Most fingerprints automatically support gzip/brotli compression

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](https://github.com/tocha688/koffi-curl/blob/main/CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/tocha688/koffi-curl.git
cd koffi-curl

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## 📄 License

MIT © [tocha688](https://github.com/tocha688)

## 🐛 Issues & Support

Found a bug or need help? 

- 🐛 [Report a bug](https://github.com/tocha688/koffi-curl/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/tocha688/koffi-curl/issues/new?template=feature_request.md)
- 💬 [Ask a question](https://github.com/tocha688/koffi-curl/discussions)

## 🙏 Acknowledgments

- [curl_cffi](https://github.com/lexiforest/curl_cffi) - Python inspiration
- [curl-impersonate](https://github.com/lexiforest/curl-impersonate) - Core fingerprinting technology
- [koffi](https://github.com/Koromix/koffi) - Node.js FFI library
- [libcurl](https://curl.se/libcurl/) - The powerful HTTP library

---

⭐ **Star this repo if you find it useful!**