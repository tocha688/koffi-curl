# Koffi-Curl

Node.js libcurl bindings using koffi with browser fingerprint capabilities.

## 使用方法

### 基础用法

```javascript
const { Request } = require('koffi-curl');

const client = new Request();
const response = await client.get('https://api.example.com/data');
console.log(response.data);
```

### 调试模式

**默认情况下，koffi-curl 只显示错误信息，不会输出其他日志**。可以通过以下方式启用调试模式来查看详细日志：

#### 1. 环境变量

```bash
# 设置日志级别为调试模式
export KOFFI_CURL_LOG_LEVEL=DEBUG
node your-script.js

# 或者设置调试模式
export DEBUG=koffi-curl
node your-script.js

# 或者设置开发模式
export NODE_ENV=development
node your-script.js

# 启用警告级别（包含警告和错误）
export KOFFI_CURL_LOG_LEVEL=WARN
node your-script.js

# 启用信息级别（包含信息、警告和错误）
export KOFFI_CURL_LOG_LEVEL=INFO
node your-script.js
```

#### 2. 代码中设置

```javascript
const { logger, LogLevel } = require('koffi-curl');

// 启用调试模式（显示所有日志）
logger.setLevel(LogLevel.DEBUG);

// 启用警告模式（显示警告和错误）
logger.setLevel(LogLevel.WARN);

// 启用信息模式（显示信息、警告和错误）
logger.setLevel(LogLevel.INFO);

// 回到默认模式（只显示错误）
logger.setLevel(LogLevel.ERROR);
```

### 日志级别

- `ERROR`: 只显示错误信息（**默认级别**）
- `WARN`: 显示警告和错误信息
- `INFO`: 显示信息、警告和错误信息
- `DEBUG`: 显示所有日志信息

**生产环境建议保持默认的 ERROR 级别**，这样可以保持输出清洁，只在需要调试时临时启用更高的日志级别。

### 临时启用调试模式的示例

```javascript
const { Request, logger, LogLevel } = require('koffi-curl');

// 临时启用调试模式
const originalLevel = logger.getLevel();
logger.setLevel(LogLevel.DEBUG);

try {
  const client = new Request();
  const response = await client.get('https://api.example.com/data');
  console.log(response.data);
} finally {
  // 恢复原来的日志级别
  logger.setLevel(originalLevel);
}
```

## Installation

To install dependencies:

```bash
bun install
```

## Running

To run:

```bash
bun run src/index.ts
```

This project was created using `bun init` in bun v1.2.13. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
