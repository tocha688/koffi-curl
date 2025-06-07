import koffi from 'koffi';
import { libcurl, constants, memory, callbacks } from '../bindings';
import type { CURL, Pointer } from '../bindings/types';
import { Buffer } from 'buffer';
import { debug, warn } from '../utils/logger';
import { TLS_VERSION_MAP, TLS_CIPHER_NAME_MAP, TLS_EC_CURVES_MAP, DEFAULT_ENABLED_EXTENSIONS } from '../bindings/tls';
import { CURL_IMPERSONATE } from '../bindings/constants';

/**
 * Curl 类，包装 libcurl 基础功能
 */
export class Curl {
  // 内部 CURL 句柄
  private _handle: CURL;

  // 添加数据收集
  private _responseData: Buffer[] = [];
  private _responseHeaders: string[] = [];

  // 回调引用，用于后续释放
  private callbackRefs: { [key: string]: number } = {};

  // 链表引用
  private slists: { [key: number]: Pointer } = {};
  private nextSlistId: number = 1;

  /**
   * 创建新的 Curl 实例
   */
  constructor() {
    this._handle = libcurl.curl_easy_init();
    if (!this._handle) {
      throw new Error('无法初始化 CURL 句柄');
    }
    debug(`创建 Curl 实例，ID: ${this.id}`);

    // 设置默认的数据收集回调
    this.setupDefaultCallbacks();
  }

  /**
   * 设置默认的回调函数来收集响应数据
   */
  private setupDefaultCallbacks(): void {
    // 设置写入回调来收集响应体
    this.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
      this._responseData.push(data);
      return data.length;
    });

    // 设置头部回调来收集响应头
    this.setopt(constants.CurlOpt.HEADERFUNCTION, (data: Buffer) => {
      const header = data.toString('utf8').trim();
      if (header) {
        this._responseHeaders.push(header);
      }
      return data.length;
    });
  }

  /**
   * 获取响应数据
   */
  getResponseData(): Buffer {
    return Buffer.concat(this._responseData);
  }

  /**
   * 获取响应数据的字符串形式
   */
  getResponseText(): string {
    return this.getResponseData().toString('utf8');
  }

  /**
   * 获取响应头
   */
  getResponseHeaders(): string[] {
    return [...this._responseHeaders];
  }

  /**
   * 清理响应数据
   */
  clearResponse(): void {
    this._responseData = [];
    this._responseHeaders = [];
  }

  /**
   * 获取句柄地址作为 ID
   */
  get id(): bigint {
    if (!this._handle) {
      throw new Error('CURL 句柄已关闭');
    }
    return koffi.address(this._handle);
  }

  /**
   * 获取内部句柄
   */
  get handle(): CURL {
    return this._handle;
  }

  /**
   * 关闭并清理 CURL 句柄
   */
  close(): void {
    if (this._handle) {
      // 清理链表
      Object.values(this.slists).forEach(slist => {
        libcurl.curl_slist_free_all(slist);
      });
      this.slists = {};

      // 释放回调引用
      Object.values(this.callbackRefs).forEach(id => {
        callbacks.releaseCallback(id);
      });
      this.callbackRefs = {};

      // 清理 CURL 句柄
      libcurl.curl_easy_cleanup(this._handle);
      this._handle = null as any;
    }
  }

  /**
   * 重置 CURL 句柄为初始状态
   */
  reset(): void {
    if (!this._handle) throw new Error('CURL 句柄已关闭');
    libcurl.curl_easy_reset(this._handle);

    // 清理链表和回调
    Object.values(this.slists).forEach(slist => {
      libcurl.curl_slist_free_all(slist);
    });
    this.slists = {};

    Object.values(this.callbackRefs).forEach(id => {
      callbacks.releaseCallback(id);
    });
    this.callbackRefs = {};

    // 清理响应数据
    this.clearResponse();

    // 重新设置默认回调
    this.setupDefaultCallbacks();
  }

  /**
   * 设置 CURL 选项
   * @param option CurlOpt 选项
   * @param value 选项值
   */
  setopt(option: number, value: any): void {
    if (!this._handle) throw new Error('CURL 句柄已关闭');
    try {
      if (typeof value === 'number') {
        const numValue = Number(value);
        const result = libcurl.curl_easy_setopt_long(this._handle, option, numValue);
        if (result !== 0) {
          throw new Error(`设置数值选项失败: ${libcurl.curl_easy_strerror(result)}`);
        }
      } else if (typeof value === 'string') {
        const strValue = String(value);
        const result = libcurl.curl_easy_setopt_string(this._handle, option, strValue);
        if (result !== 0) {
          throw new Error(`设置字符串选项失败: ${libcurl.curl_easy_strerror(result)}`);
        }
      } else if (typeof value === 'boolean') {
        // 处理布尔值选项
        const numValue = value ? 1 : 0;
        const result = libcurl.curl_easy_setopt_long(this._handle, option, numValue);
        if (result !== 0) {
          throw new Error(`设置布尔选项失败: ${libcurl.curl_easy_strerror(result)}`);
        }
      } else if (typeof value === 'function') {
        //
        const callbackType = option
        if (this.callbackRefs[callbackType]) {
          callbacks.releaseCallback(this.callbackRefs[callbackType]);
          delete this.callbackRefs[callbackType];
        }
        const cb = callbacks.createBufferCallback(value);
        // 使用 curl_easy_setopt_callback 传递回调函数指针
        let result = libcurl.curl_easy_setopt_callback(this._handle, option, cb.callback);
        if (result !== 0) {
          throw new Error(`设置回调选项失败: ${libcurl.curl_easy_strerror(result)}`);
        }
        this.callbackRefs[callbackType] = cb.id;
      } else if (Array.isArray(value)) {
        // 处理数组类型（例如 HTTP 头）
        let slist = null;
        for (const header of value) {
          const headerStr = header.toString();
          slist = libcurl.curl_slist_append(slist, headerStr);
        }
        const id = this.nextSlistId++;
        if (slist) {
          const result = libcurl.curl_easy_setopt_pointer(this._handle, option, slist);
          if (result !== 0) {
            throw new Error(`设置链表失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          this.slists[id] = slist;
        }
      } else if (value instanceof Buffer) {
        // 处理 Buffer 类型
        const dataPtr = memory.bufferToPointer(value);
        const result = libcurl.curl_easy_setopt_pointer(this._handle, option, dataPtr);
        if (result !== 0) {
          throw new Error(`设置 Buffer 选项失败: ${libcurl.curl_easy_strerror(result)}`);
        }
      } else {
        const result = libcurl.curl_easy_setopt_pointer(this._handle, option, value);
        if (result !== 0) {
          throw new Error(`设置选项失败: ${libcurl.curl_easy_strerror(result)}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      // 捕获并包装错误，提供更多上下文
      const optionName = Object.entries(constants.CurlOpt)
        .find(([_, val]) => val === option)?.[0] || option;
      throw new Error(`设置选项 ${optionName} 失败: ${err.message}`);
    }
  }

  /**
   * 执行 HTTP 请求
   * @returns 错误码
   */
  perform(): number {
    if (!this._handle) throw new Error('CURL 句柄已关闭');
    return libcurl.curl_easy_perform(this._handle);
  }


  impersonate(impersonate: string, isDefaultHeader: boolean = true) {
    return libcurl.curl_easy_impersonate(this._handle, impersonate, isDefaultHeader ? 1 : 0);
  }

  /**
   * 获取 CURL 信息
   * @param info 信息类型
   * @returns 信息值
   */
  getinfo(info: number): any {
    if (!this._handle) throw new Error('CURL 句柄已关闭');

    // 根据信息类型确定返回值的格式
    const infoType = info & 0xf00000;

    try {
      switch (infoType) {
        // 字符串类型
        case 0x100000: {
          const { ptr, readString } = memory.createStringPointerBuffer();
          const result = libcurl.curl_easy_getinfo_string(this._handle, info, ptr);
          if (result !== 0) {
            debug(`获取字符串信息失败 (${info}): ${libcurl.curl_easy_strerror(result)}`);
            return '';
          }
          const stringResult = readString();
          return stringResult;
        }

        // 长整数类型
        case 0x200000: {
          const { ptr, readLong } = memory.createLongPointerBuffer();
          const result = libcurl.curl_easy_getinfo_long(this._handle, info, ptr);
          if (result !== 0) {
            debug(`获取长整数信息失败 (${info}): ${libcurl.curl_easy_strerror(result)}`);
            return 0; // 返回默认值而不是抛出异常
          }
          return readLong();
        }

        // 双精度浮点型
        case 0x300000: {
          const { ptr, readDouble } = memory.createDoublePointerBuffer();
          const result = libcurl.curl_easy_getinfo_double(this._handle, info, ptr);
          if (result !== 0) {
            debug(`获取双精度信息失败 (${info}): ${libcurl.curl_easy_strerror(result)}`);
            return 0.0; // 返回默认值而不是抛出异常
          }
          return readDouble();
        }

        // 指针类型
        case 0x400000: {
          const buffer = Buffer.alloc(8);
          const ptr = memory.bufferToPointer(buffer);
          const result = libcurl.curl_easy_getinfo_pointer(this._handle, info, ptr);
          if (result !== 0) {
            debug(`获取指针信息失败 (${info}): ${libcurl.curl_easy_strerror(result)}`);
            return null; // 返回默认值而不是抛出异常
          }
          const ptrValue = buffer.readBigUInt64LE(0);
          return ptrValue === BigInt(0) ? null : koffi.as(ptrValue, 'void*');
        }

        // 不支持的类型
        default:
          debug(`不支持的信息类型: ${info.toString(16)}`);
          return null;
      }
    } catch (err: any) {
      debug(`获取信息时发生异常: ${err.message}`);
      
      // 根据信息类型返回合适的默认值
      switch (infoType) {
        case 0x100000: return ''; // 字符串类型
        case 0x200000: return 0;  // 长整数类型
        case 0x300000: return 0.0; // 双精度类型
        case 0x400000: return null; // 指针类型
        default: return null;
      }
    }
  }

  setHeaders(headers: { [key: string]: string }) {
    const headerList = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
    if (headerList.length === 0) return;
    this.setopt(constants.CurlOpt.HTTPHEADER, headerList);
  }

  upkeep() {
    libcurl.curl_easy_upkeep(this._handle)
  }

  static version(): string {
    return libcurl.curl_version()
  }

  /**
   * 复制当前 CURL 句柄
   * @returns 新的 Curl 实例
   */
  duplicate(): Curl {
    if (!this._handle) throw new Error('CURL 句柄已关闭');

    const newCurl = new Curl();
    // 关闭默认创建的句柄
    libcurl.curl_easy_cleanup(newCurl._handle);

    // 复制当前句柄
    newCurl._handle = libcurl.curl_easy_duphandle(this._handle);
    if (!newCurl._handle) {
      throw new Error('无法复制 CURL 句柄');
    }

    return newCurl;
  }

  /**
   * 返回最后一个错误的描述
   * @param code 错误码
   * @returns 错误描述
   */
  static strerror(code: number): string {
    return libcurl.curl_easy_strerror(code);
  }

  /**
   * 设置 JA3 指纹
   * @param ja3 JA3 指纹字符串
   * @param permute 是否允许扩展乱序
   */
  setJa3Fingerprint(ja3: string, permute: boolean = false): void {
    if (!this._handle) throw new Error('CURL 句柄已关闭');

    const parts = ja3.split(',');
    if (parts.length !== 5) {
      throw new Error('无效的 JA3 指纹格式，应为 5 部分用逗号分隔');
    }

    const [tlsVersion, ciphers, extensions, curves, curveFormats] = parts;

    // 设置 TLS 版本
    const curlTlsVersion = TLS_VERSION_MAP[parseInt(tlsVersion)];
    if (!curlTlsVersion) {
      throw new Error(`不支持的 TLS 版本: ${tlsVersion}`);
    }

    this.setopt(constants.CurlOpt.SSLVERSION, curlTlsVersion | constants.CurlSslVersion.MAX_DEFAULT);

    if (curlTlsVersion !== constants.CurlSslVersion.TLSv1_2) {
      warn('目前只有 TLS v1.2 完全支持 JA3 指纹');
    }

    // 设置密码套件
    const cipherNames: string[] = [];
    for (const cipher of ciphers.split('-')) {
      const cipherId = parseInt(cipher);
      const cipherName = TLS_CIPHER_NAME_MAP[cipherId];
      if (!cipherName) {
        throw new Error(`找不到密码套件: ${cipher} (0x${cipherId.toString(16)})`);
      }
      cipherNames.push(cipherName);
    }

    this.setopt(constants.CurlOpt.SSL_CIPHER_LIST, cipherNames.join(':'));

    // 处理扩展
    let processedExtensions = extensions;
    if (extensions.endsWith('-21')) {
      processedExtensions = extensions.slice(0, -3);
      warn('在 JA3 字符串中发现 Padding(21) 扩展，是否添加应由 SSL 引擎管理');
    }

    const extensionIds = new Set(processedExtensions.split('-').map(e => parseInt(e)));
    this.toggleExtensionsByIds(extensionIds);

    // 设置扩展顺序（如果不允许乱序）
    if (!permute) {
      this.setopt(constants.CurlOpt.TLS_EXTENSION_ORDER, processedExtensions);
    }

    // 设置椭圆曲线
    const curveNames: string[] = [];
    for (const curve of curves.split('-')) {
      const curveId = parseInt(curve);
      const curveName = TLS_EC_CURVES_MAP[curveId];
      if (!curveName) {
        throw new Error(`找不到椭圆曲线: ${curve}`);
      }
      curveNames.push(curveName);
    }

    this.setopt(constants.CurlOpt.SSL_EC_CURVES, curveNames.join(':'));

    // 验证曲线格式
    if (parseInt(curveFormats) !== 0) {
      throw new Error('只支持 curve_formats == 0');
    }
  }

  /**
   * 设置 Akamai 指纹
   * @param akamai Akamai 指纹字符串
   */
  setAkamaiFingerprint(akamai: string): void {
    if (!this._handle) throw new Error('CURL 句柄已关闭');

    const parts = akamai.split('|');
    if (parts.length !== 4) {
      throw new Error('无效的 Akamai 指纹格式，应为 4 部分用竖线分隔');
    }

    let [settings, windowUpdate, streams, headerOrder] = parts;

    // 兼容 tls.peet.ws 格式
    settings = settings.replace(/,/g, ';');

    // 强制使用 HTTP/2
    this.setopt(constants.CurlOpt.HTTP_VERSION, constants.CurlHttpVersion.V2_0);

    // 设置 HTTP/2 参数
    this.setopt(constants.CurlOpt.HTTP2_SETTINGS, settings);
    this.setopt(constants.CurlOpt.HTTP2_WINDOW_UPDATE, parseInt(windowUpdate));

    if (streams !== '0') {
      this.setopt(constants.CurlOpt.HTTP2_STREAMS, streams);
    }

    // 设置伪头部顺序 (m,a,s,p -> masp)
    this.setopt(constants.CurlOpt.HTTP2_PSEUDO_HEADERS_ORDER, headerOrder.replace(/,/g, ''));
  }

  /**
   * 根据扩展 ID 切换扩展
   * @param extensionIds 扩展 ID 集合
   */
  private toggleExtensionsByIds(extensionIds: Set<number>): void {
    // 需要启用的扩展
    const toEnableIds = new Set([...extensionIds].filter(id => !DEFAULT_ENABLED_EXTENSIONS.has(id)));
    for (const extId of toEnableIds) {
      this.toggleExtension(extId, true);
    }

    // 需要禁用的扩展
    const toDisableIds = new Set([...DEFAULT_ENABLED_EXTENSIONS].filter(id => !extensionIds.has(id)));
    for (const extId of toDisableIds) {
      this.toggleExtension(extId, false);
    }
  }

  /**
   * 切换单个扩展
   * @param extensionId 扩展 ID
   * @param enable 是否启用
   */
  private toggleExtension(extensionId: number, enable: boolean): void {
    switch (extensionId) {
      // ECH
      case 65037:
        this.setopt(constants.CurlOpt.ECH, enable ? 'grease' : '');
        break;

      // 证书压缩
      case 27:
        if (enable) {
          warn('证书压缩设置为 brotli，建议明确指定使用 zlib 或 brotli');
          this.setopt(constants.CurlOpt.SSL_CERT_COMPRESSION, 'brotli');
        } else {
          this.setopt(constants.CurlOpt.SSL_CERT_COMPRESSION, '');
        }
        break;

      // ALPS: 应用设置
      case 17513:
        this.setopt(constants.CurlOpt.SSL_ENABLE_ALPS, enable ? 1 : 0);
        break;

      case 17613:
        this.setopt(constants.CurlOpt.SSL_ENABLE_ALPS, enable ? 1 : 0);
        this.setopt(constants.CurlOpt.TLS_USE_NEW_ALPS_CODEPOINT, enable ? 1 : 0);
        break;

      // server_name
      case 0:
        throw new Error('server_name(0) 扩展不太可能被更改');

      // ALPN
      case 16:
        this.setopt(constants.CurlOpt.SSL_ENABLE_ALPN, enable ? 1 : 0);
        break;

      // status_request
      case 5:
        if (enable) {
          this.setopt(constants.CurlOpt.TLS_STATUS_REQUEST, 1);
        }
        break;

      // signed_certificate_timestamps
      case 18:
        if (enable) {
          this.setopt(constants.CurlOpt.TLS_SIGNED_CERT_TIMESTAMPS, 1);
        }
        break;

      // session_ticket
      case 35:
        this.setopt(constants.CurlOpt.SSL_ENABLE_TICKET, enable ? 1 : 0);
        break;

      // padding
      case 21:
        // padding 扩展通常由 SSL 引擎自动处理
        break;

      default:
        throw new Error(`扩展 ${extensionId} 暂时无法切换，可能会在后续版本中更新`);
    }
  }

  /**
   * 设置额外的指纹参数
   * @param extraFp 额外指纹配置
   */
  setExtraFingerprint(extraFp: {
    tlsMinVersion?: number;
    tlsGrease?: boolean;
    tlsPermuteExtensions?: boolean;
    tlsCertCompression?: 'zlib' | 'brotli';
    tlsSignatureAlgorithms?: string[];
    http2StreamWeight?: number;
    http2StreamExclusive?: number;
  }): void {
    if (!this._handle) throw new Error('CURL 句柄已关闭');

    if (extraFp.tlsSignatureAlgorithms) {
      this.setopt(constants.CurlOpt.SSL_SIG_HASH_ALGS, extraFp.tlsSignatureAlgorithms.join(','));
    }

    if (extraFp.tlsMinVersion !== undefined) {
      this.setopt(constants.CurlOpt.SSLVERSION, extraFp.tlsMinVersion | constants.CurlSslVersion.MAX_DEFAULT);
    }

    if (extraFp.tlsGrease !== undefined) {
      this.setopt(constants.CurlOpt.TLS_GREASE, extraFp.tlsGrease ? 1 : 0);
    }

    if (extraFp.tlsPermuteExtensions !== undefined) {
      this.setopt(constants.CurlOpt.SSL_PERMUTE_EXTENSIONS, extraFp.tlsPermuteExtensions ? 1 : 0);
    }

    if (extraFp.tlsCertCompression) {
      this.setopt(constants.CurlOpt.SSL_CERT_COMPRESSION, extraFp.tlsCertCompression);
    }

    if (extraFp.http2StreamWeight !== undefined) {
      this.setopt(constants.CurlOpt.STREAM_WEIGHT, extraFp.http2StreamWeight);
    }

    if (extraFp.http2StreamExclusive !== undefined) {
      this.setopt(constants.CurlOpt.STREAM_EXCLUSIVE, extraFp.http2StreamExclusive);
    }
  }
}
