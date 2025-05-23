import { Request, RequestOptions, Response } from '../core/request';
import { BrowserImpersonator } from '../core/browser';

/**
 * 全局默认配置
 */
let defaultConfig: Partial<RequestOptions> = {
  timeout: 30000,
  followRedirects: true,
  maxRedirects: 5,
  verifySsl: true
};

/**
 * 设置全局默认配置
 */
export function setDefaults(config: Partial<RequestOptions>): void {
  defaultConfig = { ...defaultConfig, ...config };
}

/**
 * 创建请求实例
 */
export function create(config: Partial<RequestOptions> = {}): Request {
  return new Request({ ...defaultConfig, ...config });
}

/**
 * 默认请求实例
 */
const defaultRequest = new Request(defaultConfig);

/**
 * GET 请求
 */
export async function get(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return defaultRequest.get(url, options);
}

/**
 * POST 请求
 */
export async function post(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return defaultRequest.post(url, data, options);
}

/**
 * PUT 请求
 */
export async function put(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return defaultRequest.put(url, data, options);
}

/**
 * DELETE 请求
 */
export async function del(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return defaultRequest.delete(url, options);
}

/**
 * PATCH 请求
 */
export async function patch(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return defaultRequest.patch(url, data, options);
}

/**
 * 通用请求方法
 */
export async function request(options: RequestOptions): Promise<Response> {
  return defaultRequest.request(options);
}

/**
 * 导出浏览器指纹相关功能
 */
export const browser = {
  impersonate: BrowserImpersonator.applyFingerprint,
  getAvailableFingerprints: BrowserImpersonator.getAvailableFingerprints
};

// 导出类型
export type { RequestOptions, Response } from '../core/request';
export type { BrowserFingerprint, TlsSettings } from '../core/browser';
export { Request } from '../core/request';
export { BrowserImpersonator } from '../core/browser';
