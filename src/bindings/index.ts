// 导出绑定相关的所有内容

import * as _constants from './constants';
import * as _types from './types';
import { lib as libcurl } from './library';
import * as _memory from './memory';
import * as _callbacks from './callbacks';

// 导出绑定相关内容
export const constants = _constants;
export const types = _types;
export const memory = _memory;
export const callbacks = _callbacks;
export { libcurl };

// 导出版本信息
export const libcurlVersion = () => libcurl.curl_version();

export default {
    constants,
    types,
    memory,
    callbacks,
    libcurl,
    libcurlVersion,
}