import koffi from 'koffi';
import type { curl_write_callback, curl_header_callback, curl_xferinfo_callback, Pointer } from './types';
import { saveReference, getReference, releaseReference, pointerToBuffer } from './memory';
import { headerCallbackProto, progressCallbackProto } from './library';
import { debug } from '../utils/logger';

/**
 * 管理和转换 libcurl 回调函数
 */

// koffi 的类型字符串必须使用其定义的原始类型名称
// 例如: size_t -> UInt64 (假设为64位), void* -> Pointer, int -> Int32, double -> Float64

const REGISTERED_CALLBACKS = new Map<number, any>();
let nextCallbackId = 1;

export function createBufferCallback(
  callback: (data: Buffer) => number
): { callback: any, id: number } {
  const id = saveReference(callback);
  const writeCallback = function (ptr: any, size: number, nmemb: number, userdata: any) {
    try {
      const totalSize = size * nmemb;
      if (totalSize === 0) return 0;
      const data = pointerToBuffer(ptr, totalSize);
      const jsCallback = getReference(id) as (data: Buffer) => number;
      return jsCallback(data);
    } catch (err) {
      debug('Write callback 错误:', err);
      return 0;
    }
  };
  const callbackId = nextCallbackId++;
  // 关键：确保 koffi.register 被调用，并存储/返回其结果
  const functionPointer = koffi.register(writeCallback, koffi.pointer(headerCallbackProto));
  REGISTERED_CALLBACKS.set(callbackId, functionPointer); // 存储注册后的指针
  return { callback: functionPointer, id: callbackId }; // 返回注册后的指针
}


export function createProgressCallback(
  callback: (dlTotal: number, dlNow: number, ulTotal: number, ulNow: number) => number
): { callback: any, id: number } {
  const id = saveReference(callback);
  const progressCallback = function (clientp: any, dltotal: number, dlnow: number, ultotal: number, ulnow: number) {
    try {
      const jsCallback = getReference(id) as (dlTotal: number, dlNow: number, ulTotal: number, ulNow: number) => number;
      return jsCallback(dltotal, dlnow, ultotal, ulnow);
    } catch (err) {
      debug('Progress callback 错误:', err);
      return 0;
    }
  };
  const callbackId = nextCallbackId++;
  const functionPointer = koffi.register(progressCallback, koffi.pointer(progressCallbackProto));
  REGISTERED_CALLBACKS.set(callbackId, functionPointer);
  return { callback: functionPointer, id: callbackId };
}

export function releaseCallback(callbackId: number): void {
  koffi.unregister(REGISTERED_CALLBACKS.get(callbackId));
  releaseReference(callbackId);
  REGISTERED_CALLBACKS.delete(callbackId);
}

export function cleanupCallbacks(): void {
  REGISTERED_CALLBACKS.clear();
}

process.on('exit', () => {
  cleanupCallbacks();
});
