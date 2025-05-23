import { Curl } from './curl';
import { constants } from '../bindings';

/**
 * 浏览器指纹配置接口
 */
export interface BrowserFingerprint {
  userAgent: string;
  acceptHeader: string;
  acceptLanguage: string;
  acceptEncoding: string;
  httpVersion: number;
  tlsSettings?: TlsSettings;
}

/**
 * TLS 设置接口
 */
export interface TlsSettings {
  cipherSuites?: string[];
  curves?: string[];
  alpnProtocols?: string[];
}

/**
 * 预定义的浏览器指纹
 */
export const BROWSER_FINGERPRINTS: { [key: string]: BrowserFingerprint } = {
  chrome110: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    httpVersion: constants.CURL_HTTP_VERSION.CURL_HTTP_VERSION_2_0
  },
  firefox109: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.5',
    acceptEncoding: 'gzip, deflate, br',
    httpVersion: constants.CURL_HTTP_VERSION.CURL_HTTP_VERSION_2_0
  },
  safari15_5: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15',
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    httpVersion: constants.CURL_HTTP_VERSION.CURL_HTTP_VERSION_2_0
  }
};

/**
 * 浏览器指纹应用器
 */
export class BrowserImpersonator {
  /**
   * 应用浏览器指纹到 Curl 实例
   */
  static applyFingerprint(curl: Curl, fingerprintName: string): void {
    const fingerprint = BROWSER_FINGERPRINTS[fingerprintName];
    if (!fingerprint) {
      throw new Error(`未知的浏览器指纹: ${fingerprintName}`);
    }

    // 设置 User-Agent
    curl.setopt(constants.CURLOPT.USERAGENT, fingerprint.userAgent);

    // 设置 HTTP 版本
    curl.setopt(constants.CURLOPT.HTTP_VERSION, fingerprint.httpVersion);

    // 设置默认请求头
    const headers = [
      `Accept: ${fingerprint.acceptHeader}`,
      `Accept-Language: ${fingerprint.acceptLanguage}`,
      `Accept-Encoding: ${fingerprint.acceptEncoding}`,
      'Cache-Control: no-cache',
      'Upgrade-Insecure-Requests: 1'
    ];

    curl.setopt(constants.CURLOPT.HTTPHEADER, headers);

    // 应用 TLS 设置（如果支持的话）
    if (fingerprint.tlsSettings) {
      BrowserImpersonator.applyTlsSettings(curl, fingerprint.tlsSettings);
    }
  }

  /**
   * 应用 TLS 设置
   */
  private static applyTlsSettings(curl: Curl, tlsSettings: TlsSettings): void {
    // 注意：这些设置可能需要特定版本的 libcurl 支持
    if (tlsSettings.cipherSuites) {
      // curl.setopt(constants.CURLOPT.SSL_CIPHER_LIST, tlsSettings.cipherSuites.join(':'));
    }

    if (tlsSettings.alpnProtocols) {
      // 设置 ALPN 协议
      // curl.setopt(constants.CURLOPT.HTTP2, 1);
    }
  }

  /**
   * 获取所有可用的浏览器指纹名称
   */
  static getAvailableFingerprints(): string[] {
    return Object.keys(BROWSER_FINGERPRINTS);
  }
}
