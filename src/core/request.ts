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

export class ResponseHeader {
  header: { [key: string]: Array<string> } = {};
  constructor() { }
  set(key: string, value: string): void {
    key = key.toLowerCase();
    if (!this.header[key]) {
      this.header[key] = [];
    }
    this.header[key].push(value);
  }
  get(key: string): string | undefined {
    key = key.toLowerCase();
    if (!this.header[key]) {
      return undefined;
    }
    return this.header[key]?.[0];
  }
  getAll(key: string): string[] | undefined {
    key = key.toLowerCase();
    if (!this.header[key]) {
      return undefined;
    }
    return this.header[key];
  }
  toString(): string {
    return Object.entries(this.header)
      .map(([key, values]) => `${key}: ${Array.isArray(values) ? values.join(', ') : values}`)
      .join('\r\n');
  }
}
type RequestHeader = { [key: string]: string };


/**
 * HTTP 请求选项接口
 */
interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: RequestHeader;
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
  headers: ResponseHeader;
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
  verifySsl: true,
  acceptEncoding: 'gzip, deflate, br',
};

function buildUrl(baseUrl: string, params?: { [key: string]: string | number }): string {
  if (!params) return baseUrl;
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
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

function parseHeaders(headerBuffer: Buffer): ResponseHeader {
  const headers = new ResponseHeader();
  const headerString = headerBuffer.toString('utf8');
  const lines = headerString.split('\r\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      headers.set(key, value);
    }
  }

  return headers;
}

function decompressResponse(responseBuffer: Buffer, headers: ResponseHeader): string {
  const encoding = headers.get("content-encoding") as string ?? "";

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

function parseReponseData(body: string, headers: ResponseHeader): any {
  const contentType = headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch (e) {
      warn('JSON 解析失败:', e);
      return body; // 返回原始字符串
    }
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const result: { [key: string]: string } = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  }
  return body; // 默认返回原始字符串
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
          data: parseReponseData(decompressedData, headers),
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

async function request(options: RequestOptions): Promise<Response> {
  const opts = { ...defaultOptions, ...options };
  let currentUrl = buildUrl(opts.url, opts.params);
  let redirectCount = 0;
  const maxRedirects = opts.maxRedirects || 5;
  let finalResponseUrl = currentUrl; // 记录最终响应的URL

  while (redirectCount <= maxRedirects) {
    const curl = new Curl();

    try {
      //method
      const method = opts.method?.toLocaleUpperCase() || 'GET';
      if (method == "POST") {
        curl.setopt(constants.CURLOPT.POST, 1);
      } else if (method !== "GET") {
        curl.setopt(constants.CURLOPT.CUSTOMREQUEST, method)
      }
      if (method == "HEAD") {
        curl.setopt(constants.CURLOPT.NOBODY, 1);
      }

      //url
      curl.setopt(constants.CURLOPT.URL, currentUrl);

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
        const data = Buffer.from(body)
        curl.setopt(constants.CURLOPT.POSTFIELDS, data);
        curl.setopt(constants.CURLOPT.POSTFIELDSIZE, data.length);
        if (method == "GET") {
          curl.setopt(constants.CURLOPT.CUSTOMREQUEST, method);
        }
      }

      //headers
      const headers: RequestHeader = opts.headers || {};
      if (contentType) {
        headers['Content-Type'] = contentType;
      }
      curl.setHeaders(headers);

      //cookie
      curl.setopt(constants.CURLOPT.COOKIEFILE, '');
      curl.setopt(constants.CURLOPT.COOKIELIST, 'ALL');

      if (opts.jar) {
        const cookieJar = opts.jar;
        const cookies = cookieJar.getCookiesSync(currentUrl);
        if (cookies.length > 0) {
          const cookieString = cookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');
          curl.setopt(constants.CURLOPT.COOKIE, cookieString);
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

      // 禁用自动重定向，我们手动处理
      curl.setopt(constants.CURLOPT.FOLLOWLOCATION, 0);

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
          curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 1);
          curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 2);
          curl.setopt(constants.CURLOPT.CAINFO, certPath);
          curl.setopt(constants.CURLOPT.PROXY_CAINFO, certPath);
          curl.setopt(constants.CURLOPT.SSLVERSION, constants.CURL_SSLVERSION.DEFAULT);
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

      curl.setopt(constants.CURLOPT.MAX_RECV_SPEED_LARGE, 0);

      //------开始请求------
      const resp = await executeRequest(curl);

      // 记录当前响应的URL
      finalResponseUrl = resp.url || currentUrl;

      // 处理 cookie
      if (opts.jar) {
        if (resp.headers.get('set-cookie')) {
          const setCookieHeader = resp.headers.getAll('set-cookie') || [];
          setCookieHeader.forEach((cookie: string) => {
            try {
              debug(`从响应头设置 cookie: ${cookie}`);
              opts.jar && opts.jar.setCookieSync(cookie, finalResponseUrl);
            } catch (e) {
              debug('从响应头设置 cookie 失败:', e);
            }
          });
        }
      }

      // 检查是否需要重定向
      const locationHeader = resp.headers.get('location');
      if (opts.followRedirects && resp.status >= 300 && resp.status < 400 && locationHeader) {
        if (redirectCount >= maxRedirects) {
          throw new Error(`重定向次数超过限制 (${maxRedirects})`);
        }
        // 处理相对 URL 和绝对 URL
        try {
          currentUrl = new URL(locationHeader, currentUrl).toString();
        } catch (e) {
          // 如果解析失败，尝试直接使用 location
          currentUrl = locationHeader;
        }

        redirectCount++;
        debug(`重定向到: ${currentUrl} (第 ${redirectCount} 次)`);

        // 对于 POST/PUT/PATCH 请求在重定向后通常变为 GET
        if (resp.status === 301 || resp.status === 302 || resp.status === 303) {
          if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            opts.method = 'GET';
            opts.data = undefined; // 清除请求体
          }
        }

        continue; // 继续下一次请求
      }

      // 没有重定向，返回最终响应
      return {
        ...resp,
        url: finalResponseUrl, // 使用记录的最终响应URL
        redirectCount
      };

    } finally {
      curl.close();
    }
  }

  throw new Error(`重定向次数超过限制 (${maxRedirects})`);
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