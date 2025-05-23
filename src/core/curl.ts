import koffi from 'koffi';
import { curl, constants, memory, callbacks } from '../bindings';
import type { CURL, Pointer } from '../bindings/types';
import { Buffer } from 'buffer';
import { debug, warn } from '../utils/logger';

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
    this.handle = curl.curl_easy_init();
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
        curl.curl_slist_free_all(slist);
      });
      this.slists = {};
      
      // 释放回调引用
      Object.values(this.callbackRefs).forEach(id => {
        callbacks.releaseCallback(id);
      });
      this.callbackRefs = {};
      
      // 清理 CURL 句柄
      curl.curl_easy_cleanup(this.handle);
      this.handle = null as any;
    }
  }
  
  /**
   * 重置 CURL 句柄为初始状态
   */
  reset(): void {
    if (!this.handle) throw new Error('CURL 句柄已关闭');
    curl.curl_easy_reset(this.handle);
    
    // 清理链表和回调
    Object.values(this.slists).forEach(slist => {
      curl.curl_slist_free_all(slist);
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
          const result = curl.curl_easy_setopt_string(this.handle, option, strValue);
          if (result !== 0) {
            throw new Error(`设置字符串选项失败: ${curl.curl_easy_strerror(result)}`);
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
          const result = curl.curl_easy_setopt_long(this.handle, option, numValue);
          if (result !== 0) {
            throw new Error(`设置数值选项失败: ${curl.curl_easy_strerror(result)}`);
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
          let result = curl.curl_easy_setopt_callback(this.handle, option, cb.callback);
          
          if (result !== 0) {
            throw new Error(`设置回调选项失败: ${curl.curl_easy_strerror(result)}`);
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
          const result = curl.curl_easy_setopt_pointer(this.handle, option, cb.callback);
          if (result !== 0) {
            throw new Error(`设置进度回调失败: ${curl.curl_easy_strerror(result)}`);
          }
          this.callbackRefs.progress = cb.id;
          
          // 启用进度回调
          curl.curl_easy_setopt_long(this.handle, constants.CURLOPT.NOPROGRESS, 0);
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
            slist = curl.curl_slist_append(slist, headerStr);
          }
          
          // 保存链表引用以便后续释放
          const id = this.nextSlistId++;
          if (slist) {
            const result = curl.curl_easy_setopt_pointer(this.handle, option, slist);
            if (result !== 0) {
              throw new Error(`设置链表选项失败: ${curl.curl_easy_strerror(result)}`);
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
          const result = curl.curl_easy_setopt_pointer(this.handle, option, dataPtr);
          if (result !== 0) {
            throw new Error(`设置POST数据失败: ${curl.curl_easy_strerror(result)}`);
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
            const result = curl.curl_easy_setopt_long(this.handle, option, Number(value));
            if (result !== 0) {
              // 如果失败，尝试作为字符串
              const strResult = curl.curl_easy_setopt_string(this.handle, option, String(value));
              if (strResult !== 0) {
                throw new Error(`设置选项失败: ${curl.curl_easy_strerror(strResult)}`);
              }
            }
          } catch (err) {
            // 最后尝试作为指针
            const ptrResult = curl.curl_easy_setopt_pointer(this.handle, option, value);
            if (ptrResult !== 0) {
              throw new Error(`设置选项失败: ${curl.curl_easy_strerror(ptrResult)}`);
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
    return curl.curl_easy_perform(this.handle);
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
          const result = curl.curl_easy_getinfo_string(this.handle, info, ptr);
          if (result !== 0) {
            debug(`获取字符串信息失败 (${info}): ${curl.curl_easy_strerror(result)}`);
            return '';
          }
          const stringResult = readString();
          return stringResult;
        }
        
        // 长整数类型
        case 0x200000: {
          const { ptr, readLong } = memory.createLongPointerBuffer();
          const result = curl.curl_easy_getinfo_long(this.handle, info, ptr);
          if (result !== 0) {
            throw new Error(`获取信息失败: ${curl.curl_easy_strerror(result)}`);
          }
          return readLong();
        }
        
        // 双精度浮点型
        case 0x300000: {
          const { ptr, readDouble } = memory.createDoublePointerBuffer();
          const result = curl.curl_easy_getinfo_double(this.handle, info, ptr);
          if (result !== 0) {
            throw new Error(`获取信息失败: ${curl.curl_easy_strerror(result)}`);
          }
          return readDouble();
        }
        
        // 指针类型
        case 0x400000: {
          const buffer = Buffer.alloc(8);
          const ptr = memory.bufferToPointer(buffer);
          const result = curl.curl_easy_getinfo_pointer(this.handle, info, ptr);
          if (result !== 0) {
            throw new Error(`获取信息失败: ${curl.curl_easy_strerror(result)}`);
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
  
  /**
   * 复制当前 CURL 句柄
   * @returns 新的 Curl 实例
   */
  duplicate(): Curl {
    if (!this.handle) throw new Error('CURL 句柄已关闭');
    
    const newCurl = new Curl();
    // 关闭默认创建的句柄
    curl.curl_easy_cleanup(newCurl.handle);
    
    // 复制当前句柄
    newCurl.handle = curl.curl_easy_duphandle(this.handle);
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
    return curl.curl_easy_strerror(code);
  }
}
