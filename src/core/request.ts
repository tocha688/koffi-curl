import { Curl } from './curl';
import { constants } from '../bindings';
import { Buffer } from 'buffer';
import { debug, warn, info } from '../utils/logger';
import { CURL_IMPERSONATE } from '../bindings/constants';
import os from "os"
import path from "path"
import fs from "fs"
import { getLibHome } from '../bindings/library';

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
  userAgent?: string;
  impersonate?: CURL_IMPERSONATE;
  verifySsl?: boolean;
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
function SSLVerification(curl: Curl, verifySsl?: boolean,isProxy?:boolean): void {
  if (verifySsl === false) {
    // 显式禁用SSL验证
    curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
    curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
    return;
  }

  try {
    // 启用SSL验证
    curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 1);
    curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 2);


    let caPath = null;

    // 首先尝试使用项目内置的CA证书
    const projectCaPath = path.join(getLibHome(), 'cacert.pem');
    if (fs.existsSync(projectCaPath)) {
      caPath = projectCaPath;
      debug('使用项目CA证书包');
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
      caPath = macPaths.find(p => fs.existsSync(p));
    } else {
      // Linux
      const linuxPaths = [
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
        '/usr/share/ssl/certs/ca-bundle.crt',
        '/usr/local/share/certs/ca-root-nss.crt'
      ];
      caPath = linuxPaths.find(p => fs.existsSync(p));
    }

    if (caPath) {
      debug(`设置CA证书路径: ${caPath}`);
      curl.setopt(constants.CURLOPT.CAINFO, caPath);
      // if(isProxy){
      //   curl.setopt(constants.CURLOPT.PROXY_CAINFO, caPath);
      // }
    }

    // 设置SSL选项以提高兼容性
    curl.setopt(constants.CURLOPT.SSLVERSION, constants.CURL_SSLVERSION.DEFAULT);

  } catch (error: any) {
    warn('SSL配置警告:', error.message);
    // 如果SSL配置失败，作为最后手段禁用验证
    warn('降级为禁用SSL验证');
    curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
    curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
  }
}

function parseHeaders(headerString: string): { [key: string]: string } {
  const headers: { [key: string]: string } = {};
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
    let responseData = '';
    let responseHeaders = '';

    // 设置响应体回调
    curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
      responseData += data.toString();
      return data.length;
    });

    // 设置响应头回调
    curl.setopt(constants.CURLOPT.HEADERFUNCTION, (data: Buffer) => {
      responseHeaders += data.toString();
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

        // 解析响应头
        const headers = parseHeaders(responseHeaders);
        const statusText = getStatusText(status);

        resolve({
          status,
          statusText,
          headers,
          data: responseData,
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
  const curl = new Curl()

  // 构建完整 URL
  const url = buildUrl(opts.url, opts.params);
  curl.setopt(constants.CURLOPT.URL, url);

  // 设置 HTTP 方法
  setHttpMethod(curl, opts.method || 'GET', opts.data);

  // 设置请求头
  if (opts.headers) {
    curl.setHeaders(opts.headers);
  }

  // 设置超时
  if (opts.timeout) {
    curl.setopt(constants.CURLOPT.TIMEOUT, Math.floor(opts.timeout / 1000));
  }

  // 设置重定向
  curl.setopt(constants.CURLOPT.FOLLOWLOCATION, opts.followRedirects ? 1 : 0);
  if (opts.maxRedirects) {
    curl.setopt(constants.CURLOPT.MAXREDIRS, opts.maxRedirects);
  }

  // 设置代理
  if (opts.proxy) {
    curl.setopt(constants.CURLOPT.PROXY, opts.proxy);
  }

  // 设置 User-Agent
  if (opts.userAgent) {
    curl.setopt(constants.CURLOPT.USERAGENT, opts.userAgent);
  }

  // 设置浏览器指纹模拟
  if (opts.impersonate) {
    curl.impersonate(opts.impersonate, true);
  }

  // 设置 SSL 验证
  SSLVerification(curl, opts.verifySsl,!!opts.proxy);

  // 执行请求
  return executeRequest(curl).finally(() => {
    curl.close();
  });
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