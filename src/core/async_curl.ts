import koffi from 'koffi';
import { libcurl, constants, memory } from '../bindings';
import type { CURL, CURLM } from '../bindings/types';
import { debug, warn } from '../utils/logger';
import { Curl } from './curl';

const CURLMSG_DONE = 1;

interface CurlRequest {
  curl: Curl;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * AsyncCurl 类，提供基于 curl_multi 的异步 HTTP 请求功能
 * 使用简化的轮询机制，避免复杂的事件循环集成
 */
export class AsyncCurl {
  private multiHandle: CURLM;
  private curlToRequest: Map<CURL, CurlRequest> = new Map();
  private curlToCurl: Map<CURL, Curl> = new Map();
  private running: boolean = false;
  private forceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.multiHandle = libcurl.curl_multi_init();
    if (!this.multiHandle) {
      throw new Error('无法初始化 CURL_MULTI 句柄');
    }
    this.startForceTimeout();
  }

  /**
   * 启动强制超时检查器
   */
  private startForceTimeout(): void {
    if (this.forceTimer) {
      clearInterval(this.forceTimer);
    }
    
    this.forceTimer = setInterval(() => {
      if (this.multiHandle && this.curlToRequest.size > 0) {
        debug(`强制检查: 待处理请求数=${this.curlToRequest.size}`);
        this.processData();
      }
    }, 50); // 改为50ms，更频繁的检查
  }

  /**
   * 处理数据和完成的传输
   */
  private processData(): void {
    if (!this.multiHandle) {
      return;
    }

    try {
      // 调用 curl_multi_perform 执行传输
      const runningPtr = memory.createLongPointerBuffer();
      const performResult = libcurl.curl_multi_perform(this.multiHandle, runningPtr.ptr);
      
      if (performResult !== 0) {
        debug(`curl_multi_perform 失败: ${libcurl.curl_multi_strerror(performResult)}`);
      }

      const runningHandles = runningPtr.readLong();
      debug(`当前运行中的句柄数: ${runningHandles}`);

      // 读取完成的消息
      this.readInfoMessages();

      // 如果没有运行中的句柄，但还有待处理的请求，可能是有问题
      if (runningHandles === 0 && this.curlToRequest.size > 0) {
        debug('警告: 没有运行中的句柄，但还有待处理的请求');
        // 强制检查消息队列
        this.readInfoMessages();
      }

    } catch (error) {
      warn('处理数据时出错:', error);
    }
  }

  /**
   * 读取完成的消息
   */
  private readInfoMessages(): void {
    if (!this.multiHandle) {
      return;
    }

    const msgInQueuePtr = memory.createLongPointerBuffer();
    let messagesRead = 0;
    
    while (true) {
      try {
        const curlMsg = libcurl.curl_multi_info_read(this.multiHandle, msgInQueuePtr.ptr);
        
        if (!curlMsg) {
          break;
        }

        messagesRead++;
        debug(`读取到消息 #${messagesRead}`);

        // 解析消息
        const msgType = memory.readCurlMsgType(curlMsg);
        debug(`消息类型: ${msgType} (期望 ${CURLMSG_DONE})`);
        
        if (msgType === CURLMSG_DONE) {
          const easyHandle = memory.readCurlMsgEasyHandle(curlMsg);
          const result = memory.readCurlMsgResult(curlMsg);
          
          debug(`句柄完成: result=${result}`);
          this.handleCompletedRequest(easyHandle, result);
        } else {
          debug(`未处理的消息类型: ${msgType}`);
        }
      } catch (error) {
        debug('读取消息时出错:', error);
        break;
      }
    }

    const remainingMessages = msgInQueuePtr.readLong();
    if (messagesRead > 0 || remainingMessages > 0) {
      debug(`本次读取了 ${messagesRead} 条消息，队列中还有 ${remainingMessages} 条`);
    }
  }

  /**
   * 处理完成的请求
   */
  private handleCompletedRequest(easyHandle: CURL, result: number): void {
    debug(`处理完成的请求: handle=${!!easyHandle}, result=${result}`);
    
    const request = this.curlToRequest.get(easyHandle);
    const curl = this.curlToCurl.get(easyHandle);
    
    if (!request || !curl) {
      debug('找不到对应的请求或 Curl 实例');
      debug(`当前映射数量: curlToRequest=${this.curlToRequest.size}, curlToCurl=${this.curlToCurl.size}`);
      return;
    }

    try {
      // 从 multi handle 中移除
      const removeResult = libcurl.curl_multi_remove_handle(this.multiHandle, easyHandle);
      if (removeResult !== 0) {
        debug(`移除句柄失败: ${libcurl.curl_multi_strerror(removeResult)}`);
      }
      
      // 清理映射
      this.curlToRequest.delete(easyHandle);
      this.curlToCurl.delete(easyHandle);

      debug(`请求完成处理，剩余请求数: ${this.curlToRequest.size}`);

      // 处理结果
      if (result === 0) {
        debug('请求成功完成');
        request.resolve(curl);
      } else {
        const errorMsg = libcurl.curl_easy_strerror(result);
        debug(`请求失败: ${errorMsg}`);
        request.reject(new Error(`请求失败: ${errorMsg}`));
      }
    } catch (error) {
      debug('处理完成请求时出错:', error);
      request.reject(new Error(`处理请求完成时出错: ${error}`));
    }
  }

  /**
   * 添加异步请求
   */
  async addHandle(curl: Curl): Promise<Curl> {
    if (!this.multiHandle) {
      throw new Error('AsyncCurl 已关闭');
    }

    return new Promise<Curl>((resolve, reject) => {
      try {
        const curlHandle = curl.curlHandle;
        
        // 添加到 multi handle
        const result = libcurl.curl_multi_add_handle(this.multiHandle, curlHandle);
        
        if (result !== 0) {
          reject(new Error(`添加句柄失败: ${libcurl.curl_multi_strerror(result)}`));
          return;
        }

        // 创建请求记录
        const request: CurlRequest = { curl, resolve, reject };
        this.curlToRequest.set(curlHandle, request);
        this.curlToCurl.set(curlHandle, curl);

        // 立即触发一次处理
        setImmediate(() => this.processData());

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 移除请求
   */
  removeHandle(curl: Curl): void {
    const curlHandle = curl.curlHandle;
    const request = this.curlToRequest.get(curlHandle);
    
    if (request) {
      try {
        // 从 multi handle 中移除
        libcurl.curl_multi_remove_handle(this.multiHandle, curlHandle);
        
        // 清理映射
        this.curlToRequest.delete(curlHandle);
        this.curlToCurl.delete(curlHandle);
        
        // 拒绝 Promise
        request.reject(new Error('请求被取消'));
      } catch (error) {
        debug('移除句柄时出错:', error);
      }
    }
  }

  /**
   * 设置 multi 选项
   */
  setopt(option: number, value: any): void {
    if (!this.multiHandle) {
      throw new Error('CURL_MULTI 句柄已关闭');
    }

    let result: number;

    try {
      if (typeof value === 'number') {
        result = libcurl.curl_multi_setopt_long(this.multiHandle, option, value);
      } else if (typeof value === 'string') {
        result = libcurl.curl_multi_setopt_string(this.multiHandle, option, value);
      } else {
        result = libcurl.curl_multi_setopt_pointer(this.multiHandle, option, value);
      }

      if (result !== 0) {
        throw new Error(`设置 multi 选项失败: ${libcurl.curl_multi_strerror(result)}`);
      }
    } catch (error) {
      debug('设置选项时出错:', error);
      throw error;
    }
  }

  /**
   * 关闭并清理
   */
  async close(): Promise<void> {
    if (!this.multiHandle) {
      return;
    }

    try {
      // 停止强制超时定时器
      if (this.forceTimer) {
        clearInterval(this.forceTimer);
        this.forceTimer = null;
      }

      // 取消所有待处理的请求
      const requestsToCancel = Array.from(this.curlToRequest.entries());
      for (const [easyHandle, request] of requestsToCancel) {
        try {
          libcurl.curl_multi_remove_handle(this.multiHandle, easyHandle);
          request.reject(new Error('AsyncCurl 已关闭'));
        } catch (e) {
          debug('移除句柄时出错:', e);
        }
      }
      
      this.curlToRequest.clear();
      this.curlToCurl.clear();

      // 清理 multi handle
      const cleanupResult = libcurl.curl_multi_cleanup(this.multiHandle);
      if (cleanupResult !== 0) {
        debug(`清理 multi handle 失败: ${libcurl.curl_multi_strerror(cleanupResult)}`);
      }
      
      this.multiHandle = null as any;
      
    } catch (error) {
      console.error('关闭 AsyncCurl 时出错:', error);
      // 确保句柄被清空，即使出错也要继续
      this.multiHandle = null as any;
    }
  }

  /**
   * 获取版本信息
   */
  static version(): string {
    return libcurl.curl_version();
  }
}
