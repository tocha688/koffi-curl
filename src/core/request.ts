import { Curl } from './curl';
import { constants } from '../bindings';
import { Buffer } from 'buffer';
import { debug, warn, info } from '../utils/logger';

/**
 * HTTP 请求选项接口
 */
export interface RequestOptions {
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
  impersonate?: string;
  verifySsl?: boolean;
}

/**
 * HTTP 响应接口
 */
export interface Response {
  status: number;
  statusText: string;
  headers: { [key: string]: string };
  data: string;
  url: string;
  redirectCount: number;
}

/**
 * Request 类 - 提供高级 HTTP 请求功能
 */
export class Request {
  private curl: Curl;
  private defaultOptions: Partial<RequestOptions> = {
    method: 'GET',
    timeout: 30000,
    followRedirects: true,
    maxRedirects: 5,
    verifySsl: true
  };

  constructor(options: Partial<RequestOptions> = {}) {
    this.curl = new Curl();
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 发送 HTTP 请求
   */
  async request(options: RequestOptions): Promise<Response> {
    const opts = { ...this.defaultOptions, ...options };
    
    // 重置 curl 句柄
    this.curl.reset();

    // 构建完整 URL
    const url = this.buildUrl(opts.url, opts.params);
    this.curl.setopt(constants.CURLOPT.URL, url);

    // 设置 HTTP 方法
    this.setHttpMethod(opts.method || 'GET', opts.data);

    // 设置请求头
    if (opts.headers) {
      this.setHeaders(opts.headers);
    }

    // 设置超时
    if (opts.timeout) {
      this.curl.setopt(constants.CURLOPT.TIMEOUT, Math.floor(opts.timeout / 1000));
    }

    // 设置重定向
    this.curl.setopt(constants.CURLOPT.FOLLOWLOCATION, opts.followRedirects ? 1 : 0);
    if (opts.maxRedirects) {
      this.curl.setopt(constants.CURLOPT.MAXREDIRS, opts.maxRedirects);
    }

    // 设置代理
    if (opts.proxy) {
      this.curl.setopt(constants.CURLOPT.PROXY, opts.proxy);
    }

    // 设置 User-Agent
    if (opts.userAgent) {
      this.curl.setopt(constants.CURLOPT.USERAGENT, opts.userAgent);
    }

    // 设置浏览器指纹模拟
    if (opts.impersonate) {
      this.setImpersonation(opts.impersonate);
    }

    // 设置 SSL 验证
    this.setupSSLVerification(opts.verifySsl);

    // 执行请求
    return this.executeRequest();
  }

  /**
   * GET 请求
   */
  async get(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
    return this.request({ ...options, url, method: 'GET' });
  }

  /**
   * POST 请求
   */
  async post(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
    return this.request({ ...options, url, method: 'POST', data });
  }

  /**
   * PUT 请求
   */
  async put(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
    return this.request({ ...options, url, method: 'PUT', data });
  }

  /**
   * DELETE 请求
   */
  async delete(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
    return this.request({ ...options, url, method: 'DELETE' });
  }

  /**
   * PATCH 请求
   */
  async patch(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
    return this.request({ ...options, url, method: 'PATCH', data });
  }

  private buildUrl(baseUrl: string, params?: { [key: string]: string | number }): string {
    if (!params) return baseUrl;
    
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  private setHttpMethod(method: string, data?: any): void {
    switch (method.toUpperCase()) {
      case 'POST':
        this.curl.setopt(constants.CURLOPT.POST, 1);
        if (data) this.setRequestData(data);
        break;
      case 'PUT':
        this.curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'PUT');
        if (data) this.setRequestData(data);
        break;
      case 'PATCH':
        this.curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'PATCH');
        if (data) this.setRequestData(data);
        break;
      case 'DELETE':
        this.curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'DELETE');
        break;
      case 'HEAD':
        this.curl.setopt(constants.CURLOPT.NOBODY, 1);
        break;
      case 'OPTIONS':
        this.curl.setopt(constants.CURLOPT.CUSTOMREQUEST, 'OPTIONS');
        break;
      // GET 是默认方法，不需要特殊设置
    }
  }

  private setRequestData(data: any): void {
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

    this.curl.setopt(constants.CURLOPT.POSTFIELDS, postData);
    this.curl.setopt(constants.CURLOPT.HTTPHEADER, [`Content-Type: ${contentType}`]);
  }

  private setHeaders(headers: { [key: string]: string }): void {
    const headerList = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
    this.curl.setopt(constants.CURLOPT.HTTPHEADER, headerList);
  }

  private setImpersonation(browser: string): void {
    // 使用 curl-impersonate 的浏览器指纹模拟功能
    const browserMapping: { [key: string]: string } = {
      'chrome': 'chrome110',
      'firefox': 'firefox109',
      'safari': 'safari15_5',
      'edge': 'edge101'
    };

    const impersonateValue = browserMapping[browser.toLowerCase()] || browser;
    this.curl.setopt(constants.CURLOPT.USERAGENT, this.getBrowserUserAgent(impersonateValue));
  }

  private getBrowserUserAgent(browser: string): string {
    const userAgents: { [key: string]: string } = {
      'chrome110': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
      'firefox109': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
      'safari15_5': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15',
      'edge101': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36 Edg/101.0.1210.53'
    };

    return userAgents[browser] || userAgents['chrome110'];
  }

  private setupSSLVerification(verifySsl?: boolean): void {
    if (verifySsl === false) {
      // 显式禁用SSL验证
      this.curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
      this.curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
      return;
    }

    try {
      // 启用SSL验证
      this.curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 1);
      this.curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 2);
      
      // 尝试设置系统CA证书路径
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      let caPath = null;
      
      // 首先尝试使用项目内置的CA证书
      const projectCaPath = path.join(__dirname, '..', '..', 'lib', 'cacert.pem');
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
        this.curl.setopt(constants.CURLOPT.CAINFO, caPath);
      }
      
      // 设置SSL选项以提高兼容性
      this.curl.setopt(constants.CURLOPT.SSLVERSION, constants.CURL_SSLVERSION.DEFAULT);
      
    } catch (error:any) {
      warn('SSL配置警告:', error.message);
      // 如果SSL配置失败，作为最后手段禁用验证
      warn('降级为禁用SSL验证');
      this.curl.setopt(constants.CURLOPT.SSL_VERIFYPEER, 0);
      this.curl.setopt(constants.CURLOPT.SSL_VERIFYHOST, 0);
    }
  }

  private async executeRequest(): Promise<Response> {
    return new Promise((resolve, reject) => {
      let responseData = '';
      let responseHeaders = '';

      // 设置响应体回调
      this.curl.setopt(constants.CURLOPT.WRITEFUNCTION, (data: Buffer) => {
        responseData += data.toString();
        return data.length;
      });

      // 设置响应头回调
      this.curl.setopt(constants.CURLOPT.HEADERFUNCTION, (data: Buffer) => {
        responseHeaders += data.toString();
        return data.length;
      });

      // 在新的事件循环迭代中执行 curl 请求
      setImmediate(() => {
        try {
          const resultCode = this.curl.perform();
          
          if (resultCode !== 0) {
            reject(new Error(`CURL 错误 (${resultCode}): ${Curl.strerror(resultCode)}`));
            return;
          }

          // 获取响应信息，增加错误处理
          const status = this.curl.getinfo(constants.CURLINFO.RESPONSE_CODE);
          
          // 对于可能失败的字符串信息，使用默认值
          let finalUrl = '';
          let redirectCount = 0;
          
          try {
            finalUrl = this.curl.getinfo(constants.CURLINFO.EFFECTIVE_URL) || '';
          } catch (e) {
            debug('无法获取有效URL，使用空字符串');
            finalUrl = '';
          }
          
          try {
            redirectCount = this.curl.getinfo(constants.CURLINFO.REDIRECT_COUNT) || 0;
          } catch (e) {
            debug('无法获取重定向次数，使用0');
            redirectCount = 0;
          }

          // 解析响应头
          const headers = this.parseHeaders(responseHeaders);
          const statusText = this.getStatusText(status);

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

  private parseHeaders(headerString: string): { [key: string]: string } {
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

  private getStatusText(status: number): string {
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

  /**
   * 关闭并清理资源
   */
  close(): void {
    this.curl.close();
  }
}
