import koffi from 'koffi';
import { Buffer } from 'buffer';
import type { Pointer } from './types';

/**
 * 内存管理工具，处理 C 和 JavaScript 之间的内存交互
 */

// 管理对象引用，防止被垃圾回收
const references = new Map<number, any>();
let nextRefId = 1;

/**
 * 保存 JavaScript 对象引用，防止被垃圾回收
 * @param obj 需要保存的对象
 * @returns 引用 ID
 */
export function saveReference(obj: any): number {
  const id = nextRefId++;
  references.set(id, obj);
  return id;
}

/**
 * 获取保存的引用
 * @param id 引用 ID
 * @returns 保存的对象
 */
export function getReference(id: number): any {
  return references.get(id);
}

/**
 * 释放保存的引用
 * @param id 引用 ID
 */
export function releaseReference(id: number): void {
  references.delete(id);
}

/**
 * 将 JavaScript Buffer 转换为 C 指针
 * @param buffer 输入 Buffer
 * @returns C 指针
 */
export function bufferToPointer(buffer: Buffer): Pointer {
  return koffi.as(buffer, koffi.pointer('void'));
}

/**
 * 从 C 指针读取数据到 Buffer
 * @param ptr C 指针
 * @param size 数据大小
 * @returns 包含数据的 Buffer
 */
export function pointerToBuffer(ptr: Pointer, size: number): Buffer {
  // 创建新的 Buffer
  const buffer = Buffer.alloc(size);
  
  try {
    // 使用 koffi.decode 逐字节读取数据
    for (let i = 0; i < size; i++) {
      try {
        // 使用正确的 koffi API 读取单个字节
        buffer[i] = koffi.decode(ptr, i, 'uint8_t');
      } catch (e) {
        // 如果读取失败，设置为0
        buffer[i] = 0;
      }
    }
  } catch (e) {
    console.error('读取指针内存失败:', e);
    // 发生异常时，确保返回至少是一个空的buffer
  }
  
  return buffer;
}

/**
 * 创建一个指向整数值的指针
 * @param value 初始值
 * @returns 指针对象，包含释放方法
 */
export function createIntPointer(value: number = 0): { ptr: Pointer, value: () => number, free: () => void } {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value, 0);
  
  return {
    ptr: bufferToPointer(buffer),
    value: () => buffer.readInt32LE(0),
    free: () => {} // Buffer 会被 GC 处理
  };
}

/**
 * 创建一个指向字符串的指针
 * @param str 字符串
 * @returns 指针
 */
export function createStringPointer(str: string): Pointer {
  return koffi.as(str, koffi.pointer('char'));
}
