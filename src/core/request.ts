import { Curl } from './curl';
import { constants } from '../bindings';
import { Buffer } from 'buffer';
import { debug, warn, info } from '../utils/logger';
import { CURL_IMPERSONATE } from '../bindings/constants';
import os from "os"
import path from "path"
import fs from "fs"
import { getLibHome } from '../bindings/library';
import zlib from 'zlib';
import { config } from 'koffi';
import { CookieJar } from 'tough-cookie';

/**
 * HTTP 请求选项接口
 */
interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: { [key: string]: string };
  data?: any;
  params?: { [key: string]: string | number };
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  proxy?: string;
  referer?: string;
  acceptEncoding?: string;
  userAgent?: string;
  impersonate?: CURL_IMPERSONATE;
  verifySsl?: boolean;
  jar?: CookieJar;
  auth?: {
    username: string;
    password: string;
  }
}

/**
 * HTTP 响应接口
 */
interface Response {
  status: number;
  statusText: string;
  headers: { [key: string]: string };
  data: string;
  url: string;
  redirectCount: number;
  buffer: Buffer;
}

const defaultOptions: Partial<RequestOptions> = {
  method: 'GET',
  timeout: 30000,
  followRedirects: true,
  maxRedirects: 5,
  verifySsl: true
};

function buildUrl(baseUrl: string, params?: { [key: string]: string | number }): string {
  if (!params) return baseUrl;
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function setHttpMethod(curl: Curl, method: string, data?: any): void {
  switch (method.toUpperCase()) {
    case 'POST':
      curl.setopt(constants.CURLOPT.POST, 1);
      if (data) setRequestData(curl, data);
      break;
    case 'PUT':
      curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'PUT');
      if (data) setRequestData(curl, data);
      break;
    case 'PATCH':
      curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'PATCH');
      if (data) setRequestData(curl, data);
      break;
    case 'DELETE':
      curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'DELETE');
      break;
    case 'HEAD':
      curl.setopt(constants.CURLOPT.NOBODY, 1);
      break;
    case 'OPTIONS':
      curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'OPTIONS');
      break;
    // GET 是默认方法，不需要特殊设置
  }
}

function setRequestData(curl: Curl, data: any): void {
  let postData: string;
  let contentType = 'application/json';

  if (typeof data === 'string') {
    postData = data;
    contentType = 'text/plain';
  } else if (data instanceof URLSearchParams) {
    postData = data.toString();
    contentType = 'application/x-www-form-urlencoded';
  } else {
    postData = JSON.stringify(data);
    contentType = 'application/json';
  }

  curl.setopt(constants.CURLOPT.POSTFIELDS, postData);
  curl.setopt(constants.CURLOPT.HTTPHEADER, [`Content-Type: ${contentType}`]);
}
function getCertPath(): string | undefined {
  // 启用SSL验证
  // curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 1);
  // curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 2);
  // 首先尝试使用项目内置的CA证书
  const projectCaPath = path.join(getLibHome(), 'cacert.pem');
  if (fs.existsSync(projectCaPath)) {
    return projectCaPath;
  } else if (os.platform() === 'win32') {
    // Windows - libcurl-impersonate应该已经包含证书
    debug('Windows系统，使用libcurl-impersonate内置证书');
    // 不设置CAINFO，让libcurl使用默认配置
  } else if (os.platform() === 'darwin') {
    // macOS
    const macPaths = [
      '/usr/local/etc/openssl/cert.pem',
      '/etc/ssl/cert.pem',
      '/usr/local/etc/openssl@1.1/cert.pem'
    ];
    return macPaths.find(p => fs.existsSync(p));
  } else {
    // Linux
    const linuxPaths = [
      '/etc/ssl/certs/ca-certificates.crt',
      '/etc/pki/tls/certs/ca-bundle.crt',
      '/usr/share/ssl/certs/ca-bundle.crt',
      '/usr/local/share/certs/ca-root-nss.crt'
    ];
    return linuxPaths.find(p => fs.existsSync(p));
  }
}

function parseHeaders(headerBuffer: Buffer): { [key: string]: string } {
  const headers: { [key: string]: string } = {};
  const headerString = headerBuffer.toString('utf8');
  const lines = headerString.split('\r\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  return headers;
}

function decompressResponse(responseBuffer: Buffer, headers: { [key: string]: string }): string {
  const encoding = headers['content-encoding'];

  if (!encoding) {
    return responseBuffer.toString('utf8');
  }

  try {
    switch (encoding.toLowerCase()) {
      case 'gzip':
        return zlib.gunzipSync(responseBuffer).toString('utf8');
      case 'deflate':
        return zlib.inflateSync(responseBuffer).toString('utf8');
      case 'br':
        return zlib.brotliDecompressSync(responseBuffer).toString('utf8');
      default:
        debug(`未知的编码格式: ${encoding}，使用原始数据`);
        return responseBuffer.toString('utf8');
    }
  } catch (error: any) {
    warn(`解压缩失败 (${encoding}): ${error.message}，使用原始数据`);
    return responseBuffer.toString('utf8');
  }
}

function getStatusText(status: number): string {
  const statusTexts: { [key: number]: string } = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error'
  };

  return statusTexts[status] || 'Unknown';
}

async function executeRequest(curl: Curl): Promise<Response> {
  return new Promise((resolve, reject) => {
    const responseDataBuffers: Buffer[] = [];
    const responseHeaderBuffers: Buffer[] = [];

    // 设置响应体回调
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
      responseDataBuffers.push(data);
      return data.length;
    });

    // 设置响应头回调
    curl.setopt(constants.CURLOPT.HEADERFUNCTION, (data: Buffer) => {
      responseHeaderBuffers.push(data);
      return data.length;
    });

    // 在新的事件循环迭代中执行 curl 请求
    setImmediate(() => {
      try {
        const resultCode = curl.perform();

        if (resultCode !== 0) {
          reject(new Error(`CURL 错误 (${resultCode}): ${Curl.strerror(resultCode)}`));
          return;
        }

        // 获取响应信息，增加错误处理
        const status = curl.getinfo(constants.CURLINFO.RESPONSE_CODE);

        // 对于可能失败的字符串信息，使用默认值
        let finalUrl = '';
        let redirectCount = 0;

        try {
          finalUrl = curl.getinfo(constants.CURLINFO.EFFECTIVE_URL) || '';
        } catch (e) {
          debug('无法获取有效URL，使用空字符串');
          finalUrl = '';
        }

        try {
          redirectCount = curl.getinfo(constants.CURLINFO.REDIRECT_COUNT) || 0;
        } catch (e) {
          debug('无法获取重定向次数，使用0');
          redirectCount = 0;
        }

        // 合并Buffer数组
        const responseHeaderBuffer = Buffer.concat(responseHeaderBuffers);
        const responseDataBuffer = Buffer.concat(responseDataBuffers);

        // 解析响应头
        const headers = parseHeaders(responseHeaderBuffer);
        const statusText = getStatusText(status);

        // 根据响应头解压缩响应数据
        const decompressedData = decompressResponse(responseDataBuffer, headers);

        resolve({
          status,
          statusText,
          headers,
          data: decompressedData,
          buffer: responseDataBuffer,
          url: finalUrl,
          redirectCount
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// async function request(options: RequestOptions): Promise<Response> {
//   const opts = { ...defaultOptions, ...options };
//   const curl = new Curl()

//   // 构建完整 URL
//   const url = buildUrl(opts.url, opts.params);
//   curl.setopt(constants.CURLOPT.URL, url);

//   // 设置 HTTP 方法
//   setHttpMethod(curl, opts.method || 'GET', opts.data);

//   // 设置请求头
//   if (opts.headers) {
//     curl.setHeaders(opts.headers);
//   }

//   // 设置超时
//   if (opts.timeout) {
//     curl.setopt(constants.CURLOPT.TIMEOUT, Math.floor(opts.timeout / 1000));
//   }

//   // 设置重定向
//   curl.setopt(constants.CURLOPT.FOLLOWLOCATION, opts.followRedirects ? 1 : 0);
//   if (opts.maxRedirects) {
//     curl.setopt(constants.CURLOPT.MAXREDIRS, opts.maxRedirects);
//   }

//   // 设置代理
//   if (opts.proxy) {
//     curl.setopt(constants.CURLOPT.PROXY, opts.proxy);
//   }

//   // 设置 User-Agent
//   if (opts.userAgent) {
//     curl.setopt(constants.CURLOPT.USERAGENT, opts.userAgent);
//   }

//   // 设置浏览器指纹模拟
//   if (opts.impersonate) {
//     curl.impersonate(opts.impersonate, true);
//   }

//   // 设置 SSL 验证
//   SSLVerification(curl, opts.verifySsl, !!opts.proxy);

//   // 执行请求
//   return executeRequest(curl).finally(() => {
//     curl.close();
//   });
// }

async function request(options: RequestOptions) {
  const opts = { ...defaultOptions, ...options };
  const curl = new Curl()
  //method
  const method = opts.method || 'GET';
  if (method == "POST") {
    curl.setopt(constants.CURLOPT.POST, 1);
  } else if (method !== "GET") {
    curl.setopt(constants.CURLOPT.CUSTOMREQUEST, method)
  }
  if (method == "HEAD") {
    curl.setopt(constants.CURLOPT.NOBODY, 1);
  }
  //url
  const url = buildUrl(opts.url, opts.params);
  curl.setopt(constants.CURLOPT.URL, url);
  //data/body/json
  let body: any = "";
  let contentType = opts.headers?.['Content-Type'] || '';
  if (opts.data && typeof opts.data === 'object') {
    if (body instanceof URLSearchParams) {
      body = opts.data.toString()
      contentType = 'application/x-www-form-urlencoded';
    } else {
      body = JSON.stringify(opts.data)
      contentType = 'application/json';
    }
  } else if (typeof opts.data === 'string') {
    body = opts.data;
  }
  if (body || ["POST", "PUT", "PATCH"].includes(method)) {
    curl.setopt(constants.CURLOPT.POSTFIELDS, body);
    curl.setopt(constants.CURLOPT.POSTFIELDSIZE, body.length);
    if (method == "GET") {
      curl.setopt(constants.CURLOPT.CUSTOMREQUEST, method);
    }
  }
  //headers
  const headers = opts.headers || {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  curl.setHeaders(headers);
  //cookie
  curl.setopt(constants.CURLOPT.COOKIEFILE, '');
  curl.setopt(constants.CURLOPT.COOKIELIST, 'ALL');
  //
  if (opts.jar) {
    const cookieJar = opts.jar;
    const cookies = cookieJar.getCookiesSync(url);
    if (cookies.length > 0) {
      const cookieString = cookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');
      curl.setopt(constants.CURLOPT.COOKIELIST, cookieString);
    }
  }
  //auth
  if (opts.auth) {
    const { username, password } = opts.auth;
    curl.setopt(constants.CURLOPT.USERNAME, username);
    curl.setopt(constants.CURLOPT.PASSWORD, password);
  }
  //timeout
  curl.setopt(constants.CURLOPT.TIMEOUT_MS, (opts.timeout || 0) * 1000);
  //follow redirects
  curl.setopt(constants.CURLOPT.FOLLOWLOCATION, opts.followRedirects ? 1 : 0);
  curl.setopt(constants.CURLOPT.MAXREDIRS, opts.maxRedirects);
  //代理
  if (opts.proxy) {
    const proxy = new URL(opts.proxy);
    curl.setopt(constants.CURLOPT.PROXY, opts.proxy);
    if (!proxy.protocol.startsWith('socks')) {
      curl.setopt(constants.CURLOPT.HTTPPROXYTUNNEL, 1);
    }
    if (proxy.username && proxy.password) {
      curl.setopt(constants.CURLOPT.PROXYUSERNAME, proxy.username);
      curl.setopt(constants.CURLOPT.PROXYPASSWORD, proxy.password);
    }
  }
  // 显式禁用SSL验证
  if (opts.verifySsl === false) {
    curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
    curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
  } else {
    const certPath = getCertPath();
    if (certPath) {
      //证书
      curl.setopt(constants.CURLOPT.CAINFO, certPath);
      curl.setopt(constants.CURLOPT.PROXY_CAINFO, certPath);
      // 设置SSL选项以提高兼容性
      // curl.setopt(constants.CURLOPT.SSLVERSION, constants.CURL_SSLVERSION.DEFAULT);
    }
  }
  if (opts.referer) {
    curl.setopt(constants.CURLOPT.REFERER, opts.referer);
  }
  if (opts.acceptEncoding) {
    curl.setopt(constants.CURLOPT.ACCEPT_ENCODING, opts.acceptEncoding);
  }
  //指纹
  if (opts.impersonate) {
    curl.impersonate(opts.impersonate, true);
  }
  //ja3
  //akamai
  //extra_fp
  //http_version
  // curl.setopt(constants.CURLOPT.HTTP_VERSION, constants.CURL_HTTP_VERSION.V1_0);
  // curl.setopt(constants.CURLOPT.MAX_RECV_SPEED_LARGE, 0);
  //------开始请求------
  return executeRequest(curl).finally(() => {
    curl.close();
  })
}

async function get(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return request({ ...options, url, method: 'GET' });
}

/**
 * POST 请求
 */
async function post(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return request({ ...options, url, method: 'POST', data });
}

/**
 * PUT 请求
 */
async function put(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return request({ ...options, url, method: 'PUT', data });
}

/**
 * DELETE 请求
 */
async function apiDelete(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return request({ ...options, url, method: 'DELETE' });
}

/**
 * PATCH 请求
 */
async function patch(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return request({ ...options, url, method: 'PATCH', data });
}

export { request, get, post, put, apiDelete as delete, patch, RequestOptions, Response };
export default { request, get, post, put, delete: apiDelete, patch, Response };