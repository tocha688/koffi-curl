import koffi from 'koffi';

/**
 * curl 相关的 C 结构体和类型定义
 */

// 通用指针类型 - 不再使用类型别名，直接使用 any
export type Pointer = any;

// CURL 句柄类型
export type CURL = any;
export type CURLSH = any;
export type CURLM = any;
export type CURLcode = number;
export type CURLMcode = number;
export type CURLINFO = number;
export type CURLoption = number;

// 避免使用 curl_slist 命名，防止冲突
export type SList = any;

// 创建一个普通的占位符指针，避免再次使用 koffi.opaque
// 实际使用时会直接传递 null 或通过 curl_slist_append 创建的结构
export const CURL_SLIST_NULL = null;

// 回调函数类型
export type curl_xferinfo_callback = (
  clientp: any, 
  dltotal: number, 
  dlnow: number, 
  ultotal: number, 
  ulnow: number
) => number;

export type curl_write_callback = (
  buffer: any, 
  size: number, 
  nitems: number, 
  userdata: any
) => number;

export type curl_read_callback = (
  buffer: any, 
  size: number, 
  nitems: number, 
  userdata: any
) => number;

export type curl_header_callback = (
  buffer: any, 
  size: number, 
  nitems: number, 
  userdata: any
) => number;
