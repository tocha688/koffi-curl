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
  private handle: CURL;

  // 回调引用，用于后续释放
  private callbackRefs: { [key: string]: number } = {};

  // 链表引用
  private slists: { [key: number]: Pointer } = {};
  private nextSlistId: number = 1;

  /**
   * 创建新的 Curl 实例
   */
  constructor() {
    this.handle = libcurl.curl_easy_init();
    if (!this.handle) {
      throw new Error('无法初始化 CURL 句柄');
    }
  }

  /**
   * 关闭并清理 CURL 句柄
   */
  close(): void {
    if (this.handle) {
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
      libcurl.curl_easy_cleanup(this.handle);
      this.handle = null as any;
    }
  }

  /**
   * 重置 CURL 句柄为初始状态
   */
  reset(): void {
    if (!this.handle) throw new Error('CURL 句柄已关闭');
    libcurl.curl_easy_reset(this.handle);

    // 清理链表和回调
    Object.values(this.slists).forEach(slist => {
      libcurl.curl_slist_free_all(slist);
    });
    this.slists = {};

    Object.values(this.callbackRefs).forEach(id => {
      callbacks.releaseCallback(id);
    });
    this.callbackRefs = {};
  }

  /**
   * 设置 CURL 选项
   * @param option CURLOPT 选项
   * @param value 选项值
   */
  setopt(option: number, value: any): void {
    if (!this.handle) throw new Error('CURL 句柄已关闭');

    try {
      // 处理不同类型选项
      switch (option) {
        // 字符串选项
        case constants.CURLOPT.URL:
        case constants.CURLOPT.PROXY:
        case constants.CURLOPT.USERAGENT:
        case constants.CURLOPT.REFERER:
        case constants.CURLOPT.COOKIE:
        case constants.CURLOPT.COOKIEFILE:
        case constants.CURLOPT.COOKIEJAR:
        case constants.CURLOPT.CUSTOMREQUEST:
        case constants.CURLOPT.CAINFO: {
          const strValue = String(value);
          const result = libcurl.curl_easy_setopt_string(this.handle, option, strValue);
          if (result !== 0) {
            throw new Error(`设置字符串选项失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          break;
        }

        // 整数选项
        case constants.CURLOPT.FOLLOWLOCATION:
        case constants.CURLOPT.VERBOSE:
        case constants.CURLOPT.HEADER:
        case constants.CURLOPT.NOPROGRESS:
        case constants.CURLOPT.TIMEOUT:
        case constants.CURLOPT.CONNECTTIMEOUT:
        case constants.CURLOPT.SSL_VERIFYPEER:
        case constants.CURLOPT.SSL_VERIFYHOST:
        case constants.CURLOPT.HTTP_VERSION:
        case constants.CURLOPT.PORT:
        case constants.CURLOPT.MAXREDIRS:
        case constants.CURLOPT.POSTFIELDSIZE:
        case constants.CURLOPT.POST:
        case constants.CURLOPT.NOBODY:
        case constants.CURLOPT.SSLVERSION: {
          const numValue = Number(value);
          const result = libcurl.curl_easy_setopt_long(this.handle, option, numValue);
          if (result !== 0) {
            throw new Error(`设置数值选项失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          break;
        }

        // 回调选项
        case constants.CURLOPT.WRITEFUNCTION:
        case constants.CURLOPT.HEADERFUNCTION: {
          // 清理已存在的回调
          const callbackType = option === constants.CURLOPT.WRITEFUNCTION ? 'write' : 'header';
          if (this.callbackRefs[callbackType]) {
            callbacks.releaseCallback(this.callbackRefs[callbackType]);
            delete this.callbackRefs[callbackType];
          }

          // 创建新回调
          const cb = callbackType === 'write'
            ? callbacks.createWriteCallback(value)
            : callbacks.createHeaderCallback(value);

          // 使用 curl_easy_setopt_callback 传递回调函数指针
          let result = libcurl.curl_easy_setopt_callback(this.handle, option, cb.callback);

          if (result !== 0) {
            throw new Error(`设置回调选项失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          this.callbackRefs[callbackType] = cb.id;
          break;
        }

        case constants.CURLOPT.XFERINFOFUNCTION: {
          if (this.callbackRefs.progress) {
            callbacks.releaseCallback(this.callbackRefs.progress);
            delete this.callbackRefs.progress;
          }

          const cb = callbacks.createProgressCallback(value);
          const result = libcurl.curl_easy_setopt_pointer(this.handle, option, cb.callback);
          if (result !== 0) {
            throw new Error(`设置进度回调失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          this.callbackRefs.progress = cb.id;

          // 启用进度回调
          libcurl.curl_easy_setopt_long(this.handle, constants.CURLOPT.NOPROGRESS, 0);
          break;
        }

        // 链表选项 (例如 HTTP 头)
        case constants.CURLOPT.HTTPHEADER: {
          // 确保值是数组
          if (!Array.isArray(value)) {
            throw new TypeError('HTTPHEADER 选项必须是字符串数组');
          }

          let slist = null;
          for (const header of value) {
            const headerStr = header.toString();
            slist = libcurl.curl_slist_append(slist, headerStr);
          }

          // 保存链表引用以便后续释放
          const id = this.nextSlistId++;
          if (slist) {
            const result = libcurl.curl_easy_setopt_pointer(this.handle, option, slist);
            if (result !== 0) {
              throw new Error(`设置链表选项失败: ${libcurl.curl_easy_strerror(result)}`);
            }
            this.slists[id] = slist;
          } else {
            throw new Error('无法创建 HTTP 头链表');
          }
          break;
        }

        // 二进制数据选项
        case constants.CURLOPT.POSTFIELDS: {
          const postData = Buffer.isBuffer(value) ? value : Buffer.from(value.toString());
          const dataPtr = memory.bufferToPointer(postData);
          const result = libcurl.curl_easy_setopt_pointer(this.handle, option, dataPtr);
          if (result !== 0) {
            throw new Error(`设置POST数据失败: ${libcurl.curl_easy_strerror(result)}`);
          }

          // 设置 POST 数据大小
          const dataSize = postData.length;
          this.setopt(constants.CURLOPT.POSTFIELDSIZE, dataSize);
          break;
        }

        // 默认情况，尝试作为指针传递
        default: {
          try {
            // 首先尝试作为整数
            const result = libcurl.curl_easy_setopt_long(this.handle, option, Number(value));
            if (result !== 0) {
              // 如果失败，尝试作为字符串
              const strResult = libcurl.curl_easy_setopt_string(this.handle, option, String(value));
              if (strResult !== 0) {
                throw new Error(`设置选项失败: ${libcurl.curl_easy_strerror(strResult)}`);
              }
            }
          } catch (err) {
            // 最后尝试作为指针
            const ptrResult = libcurl.curl_easy_setopt_pointer(this.handle, option, value);
            if (ptrResult !== 0) {
              throw new Error(`设置选项失败: ${libcurl.curl_easy_strerror(ptrResult)}`);
            }
          }
          break;
        }
      }
    } catch (err: any) {
      console.error(err);
      // 捕获并包装错误，提供更多上下文
      const optionName = Object.entries(constants.CURLOPT)
        .find(([_, val]) => val === option)?.[0] || option;
      throw new Error(`设置选项 ${optionName} 失败: ${err.message}`);
    }
  }

  /**
   * 执行 HTTP 请求
   * @returns 错误码
   */
  perform(): number {
    if (!this.handle) throw new Error('CURL 句柄已关闭');
    return libcurl.curl_easy_perform(this.handle);
  }


  impersonate(impersonate: string, isDefaultHeader: boolean = true) {
    return libcurl.curl_easy_impersonate(this.handle, impersonate, isDefaultHeader ? 1 : 0);
  }

  /**
   * 获取 CURL 信息
   * @param info 信息类型
   * @returns 信息值
   */
  getinfo(info: number): any {
    if (!this.handle) throw new Error('CURL 句柄已关闭');

    // 根据信息类型确定返回值的格式
    const infoType = info & 0xf00000;

    try {
      switch (infoType) {
        // 字符串类型
        case 0x100000: {
          const { ptr, readString } = memory.createStringPointerBuffer();
          const result = libcurl.curl_easy_getinfo_string(this.handle, info, ptr);
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
          const result = libcurl.curl_easy_getinfo_long(this.handle, info, ptr);
          if (result !== 0) {
            throw new Error(`获取信息失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          return readLong();
        }

        // 双精度浮点型
        case 0x300000: {
          const { ptr, readDouble } = memory.createDoublePointerBuffer();
          const result = libcurl.curl_easy_getinfo_double(this.handle, info, ptr);
          if (result !== 0) {
            throw new Error(`获取信息失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          return readDouble();
        }

        // 指针类型
        case 0x400000: {
          const buffer = Buffer.alloc(8);
          const ptr = memory.bufferToPointer(buffer);
          const result = libcurl.curl_easy_getinfo_pointer(this.handle, info, ptr);
          if (result !== 0) {
            throw new Error(`获取信息失败: ${libcurl.curl_easy_strerror(result)}`);
          }
          const ptrValue = buffer.readBigUInt64LE(0);
          return ptrValue === BigInt(0) ? null : koffi.as(ptrValue, 'void*');
        }

        // 不支持的类型
        default:
          throw new Error(`不支持的信息类型: ${info.toString(16)}`);
      }
    } catch (err: any) {
      // 对于字符串类型的错误，返回空字符串而不是抛出异常
      if ((info & 0xf00000) === 0x100000) {
        debug(`获取字符串信息失败，返回空字符串: ${err.message}`);
        return '';
      }

      // 提供更详细的错误信息
      const infoName = Object.entries(constants.CURLINFO)
        .find(([_, val]) => val === info)?.[0] || info.toString();
      throw new Error(`获取信息 ${infoName} 失败: ${err.message}`);
    }
  }

  setHeaders( headers: { [key: string]: string }){
    const headerList = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
    this.setopt(constants.CURLOPT.HTTPHEADER, headerList);
  }

  upkeep(){
    libcurl.curl_easy_upkeep(this.handle)
  }

  static version(): string {
    return libcurl.curl_version()
  }

  /**
   * 复制当前 CURL 句柄
   * @returns 新的 Curl 实例
   */
  duplicate(): Curl {
    if (!this.handle) throw new Error('CURL 句柄已关闭');

    const newCurl = new Curl();
    // 关闭默认创建的句柄
    libcurl.curl_easy_cleanup(newCurl.handle);

    // 复制当前句柄
    newCurl.handle = libcurl.curl_easy_duphandle(this.handle);
    if (!newCurl.handle) {
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
    if (!this.handle) throw new Error('CURL 句柄已关闭');

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

    this.setopt(constants.CURLOPT.SSLVERSION, curlTlsVersion | constants.CURL_SSLVERSION.MAX_DEFAULT);

    if (curlTlsVersion !== constants.CURL_SSLVERSION.TLSv1_2) {
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

    this.setopt(constants.CURLOPT.SSL_CIPHER_LIST, cipherNames.join(':'));

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
      this.setopt(constants.CURLOPT.TLS_EXTENSION_ORDER, processedExtensions);
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

    this.setopt(constants.CURLOPT.SSL_EC_CURVES, curveNames.join(':'));

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
    if (!this.handle) throw new Error('CURL 句柄已关闭');

    const parts = akamai.split('|');
    if (parts.length !== 4) {
      throw new Error('无效的 Akamai 指纹格式，应为 4 部分用竖线分隔');
    }

    let [settings, windowUpdate, streams, headerOrder] = parts;

    // 兼容 tls.peet.ws 格式
    settings = settings.replace(/,/g, ';');

    // 强制使用 HTTP/2
    this.setopt(constants.CURLOPT.HTTP_VERSION, constants.CURL_HTTP_VERSION.V2_0);

    // 设置 HTTP/2 参数
    this.setopt(constants.CURLOPT.HTTP2_SETTINGS, settings);
    this.setopt(constants.CURLOPT.HTTP2_WINDOW_UPDATE, parseInt(windowUpdate));

    if (streams !== '0') {
      this.setopt(constants.CURLOPT.HTTP2_STREAMS, streams);
    }

    // 设置伪头部顺序 (m,a,s,p -> masp)
    this.setopt(constants.CURLOPT.HTTP2_PSEUDO_HEADERS_ORDER, headerOrder.replace(/,/g, ''));
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
        this.setopt(constants.CURLOPT.ECH, enable ? 'grease' : '');
        break;

      // 证书压缩
      case 27:
        if (enable) {
          warn('证书压缩设置为 brotli，建议明确指定使用 zlib 或 brotli');
          this.setopt(constants.CURLOPT.SSL_CERT_COMPRESSION, 'brotli');
        } else {
          this.setopt(constants.CURLOPT.SSL_CERT_COMPRESSION, '');
        }
        break;

      // ALPS: 应用设置
      case 17513:
        this.setopt(constants.CURLOPT.SSL_ENABLE_ALPS, enable ? 1 : 0);
        break;

      case 17613:
        this.setopt(constants.CURLOPT.SSL_ENABLE_ALPS, enable ? 1 : 0);
        this.setopt(constants.CURLOPT.TLS_USE_NEW_ALPS_CODEPOINT, enable ? 1 : 0);
        break;

      // server_name
      case 0:
        throw new Error('server_name(0) 扩展不太可能被更改');

      // ALPN
      case 16:
        this.setopt(constants.CURLOPT.SSL_ENABLE_ALPN, enable ? 1 : 0);
        break;

      // status_request
      case 5:
        if (enable) {
          this.setopt(constants.CURLOPT.TLS_STATUS_REQUEST, 1);
        }
        break;

      // signed_certificate_timestamps
      case 18:
        if (enable) {
          this.setopt(constants.CURLOPT.TLS_SIGNED_CERT_TIMESTAMPS, 1);
        }
        break;

      // session_ticket
      case 35:
        this.setopt(constants.CURLOPT.SSL_ENABLE_TICKET, enable ? 1 : 0);
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
    if (!this.handle) throw new Error('CURL 句柄已关闭');

    if (extraFp.tlsSignatureAlgorithms) {
      this.setopt(constants.CURLOPT.SSL_SIG_HASH_ALGS, extraFp.tlsSignatureAlgorithms.join(','));
    }

    if (extraFp.tlsMinVersion !== undefined) {
      this.setopt(constants.CURLOPT.SSLVERSION, extraFp.tlsMinVersion | constants.CURL_SSLVERSION.MAX_DEFAULT);
    }

    if (extraFp.tlsGrease !== undefined) {
      this.setopt(constants.CURLOPT.TLS_GREASE, extraFp.tlsGrease ? 1 : 0);
    }

    if (extraFp.tlsPermuteExtensions !== undefined) {
      this.setopt(constants.CURLOPT.SSL_PERMUTE_EXTENSIONS, extraFp.tlsPermuteExtensions ? 1 : 0);
    }

    if (extraFp.tlsCertCompression) {
      this.setopt(constants.CURLOPT.SSL_CERT_COMPRESSION, extraFp.tlsCertCompression);
    }

    if (extraFp.http2StreamWeight !== undefined) {
      this.setopt(constants.CURLOPT.STREAM_WEIGHT, extraFp.http2StreamWeight);
    }

    if (extraFp.http2StreamExclusive !== undefined) {
      this.setopt(constants.CURLOPT.STREAM_EXCLUSIVE, extraFp.http2StreamExclusive);
    }
  }
}
