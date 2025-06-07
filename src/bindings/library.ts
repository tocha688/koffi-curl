import koffi from 'koffi';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * libcurl 库加载和管理
 */

// 版本配置
const CURL_VERSION = '1.0.0';

export function getLibHome() {
    // 构建库的相对路径
    let libPath = path.join(__dirname, '..', 'lib');
    if (!fs.existsSync(libPath)) {
        libPath = path.join(__dirname, '..', '..', 'lib');
    }
    if (!fs.existsSync(libPath)) {
        throw new Error(`找不到库目录: ${libPath}`);
    }
    return libPath;
}

// 获取当前运行的平台名称
function getPlatformName(): string {
    const platform = os.platform();
    if (platform === 'win32') return 'win32';
    if (platform === 'darwin') return 'macos';
    if (platform === 'linux') {
        // Linux 可能有不同 libc 版本
        try {
            const lddOutput = require('child_process').execSync('ldd --version 2>&1 || true').toString();
            if (/musl/.test(lddOutput)) {
                return 'linux-musl';
            } else {
                return 'linux-gnu';
            }
        } catch (e) {
            return 'linux-gnu'; // 默认 GNU libc
        }
    }
    throw new Error(`不支持的平台: ${platform}`);
}


// 获取库路径
function getLibraryPath(): string {
    const platform = getPlatformName();
    const arch = os.arch() === 'x64' ? 'x86_64' :
        os.arch() === 'ia32' ? 'i686' :
            os.arch() === 'arm64' ? 'aarch64' :
                os.arch();

    // 构建库的相对路径
    const libPath = path.join(getLibHome(), `${CURL_VERSION}-${platform}`);
    if (!fs.existsSync(libPath)) {
        throw new Error(`找不到库目录: ${libPath}`);
    }

    // 根据平台确定文件名
    let libName: string;
    if (platform === 'win32') {
        libName = 'libcurl.dll';
    } else if (platform === 'macos') {
        libName = 'libcurl-impersonate.4.dylib';
    } else {
        libName = 'libcurl-impersonate.so';
    }

    const fullPath = path.join(libPath, libName);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`找不到库文件: ${fullPath}`);
    }

    return fullPath;
}

export const CURLMsg = koffi.struct("CURLMsg", {
    msg: "int",
    easy_handle: "void*",
    data: koffi.union("data", {
        whatever: "void*",
        result: "int"
    })
});

// 声明 libcurl 函数
const libcurl = koffi.load(getLibraryPath());

// 定义回调原型 - 确保参数类型正确
export const headerCallbackProto = koffi.proto('size_t HeaderCallbackProto(void*, size_t, size_t, void*)');
export const progressCallbackProto = koffi.proto('int ProgressCallbackProto(void*, double, double, double, double)');

// 新增 multi handle 回调原型 - 修正参数类型
export const socketCallbackProto = koffi.proto('int SocketCallbackProto(void*, int, int, void*, void*)');
export const timerCallbackProto = koffi.proto('int TimerCallbackProto(void*, long, void*)');

// 导出 libcurl 函数 - 使用具体类型而不是可变参数
export const lib = {
    // 初始化/清理函数
    curl_global_init: libcurl.func('curl_global_init', 'int', ['long']),
    curl_global_cleanup: libcurl.func('curl_global_cleanup', 'void', []),

    // 句柄管理 - 使用void*替代pointer
    curl_easy_init: libcurl.func('curl_easy_init', 'void*', []),
    curl_easy_cleanup: libcurl.func('curl_easy_cleanup', 'void', ['void*']),
    curl_easy_reset: libcurl.func('curl_easy_reset', 'void', ['void*']),
    curl_easy_duphandle: libcurl.func('curl_easy_duphandle', 'void*', ['void*']),

    // 选项和信息 - 使用正确的类型声明
    curl_easy_setopt_string: libcurl.func('curl_easy_setopt', 'int', ['void*', 'int', 'string']),
    curl_easy_setopt_long: libcurl.func('curl_easy_setopt', 'int', ['void*', 'int', 'int64_t']),
    curl_easy_setopt_pointer: libcurl.func('curl_easy_setopt', 'int', ['void*', 'int', 'void*']),
    curl_easy_setopt_callback: libcurl.func('curl_easy_setopt', 'int', ['void*', 'int', koffi.pointer(headerCallbackProto)]),

    // 添加通用 curl_easy_setopt 函数，用于处理回调函数
    curl_easy_setopt: libcurl.func('curl_easy_setopt', 'int', ['void*', 'int', 'void*']),

    // 修复 getinfo 函数的参数类型 - 使用 char** 来接收字符串指针
    curl_easy_getinfo_string: libcurl.func('curl_easy_getinfo', 'int', ['void*', 'int', 'void*']),
    curl_easy_getinfo_long: libcurl.func('curl_easy_getinfo', 'int', ['void*', 'int', 'void*']),
    curl_easy_getinfo_double: libcurl.func('curl_easy_getinfo', 'int', ['void*', 'int', 'void*']),
    curl_easy_getinfo_pointer: libcurl.func('curl_easy_getinfo', 'int', ['void*', 'int', 'void*']),

    // cdef.c中定义的额外函数
    curl_easy_impersonate: libcurl.func('curl_easy_impersonate', 'int', ['void*', 'string', 'int']),
    curl_easy_upkeep: libcurl.func('curl_easy_upkeep', 'int', ['void*']),

    // 执行和错误处理
    curl_easy_perform: libcurl.func('curl_easy_perform', 'int', ['void*']),
    curl_easy_strerror: libcurl.func('curl_easy_strerror', 'string', ['int']),

    // 链表管理 - 使用void*替代指向结构的指针
    curl_slist_append: libcurl.func('curl_slist_append', 'void*', ['void*', 'string']),
    curl_slist_free_all: libcurl.func('curl_slist_free_all', 'void', ['void*']),

    // 版本信息
    curl_version: libcurl.func('curl_version', 'string', []),

    // WebSocket支持
    curl_ws_recv: libcurl.func('curl_ws_recv', 'int', ['void*', 'void*', 'int', 'void*', 'void*']),
    curl_ws_send: libcurl.func('curl_ws_send', 'int', ['void*', 'void*', 'int', 'void*', 'int', 'unsigned int']),

    // MIME支持
    curl_mime_init: libcurl.func('curl_mime_init', 'void*', ['void*']),
    curl_mime_addpart: libcurl.func('curl_mime_addpart', 'void*', ['void*']),
    curl_mime_name: libcurl.func('curl_mime_name', 'int', ['void*', 'string']),
    curl_mime_data: libcurl.func('curl_mime_data', 'int', ['void*', 'string', 'int']),
    curl_mime_type: libcurl.func('curl_mime_type', 'int', ['void*', 'string']),
    curl_mime_filename: libcurl.func('curl_mime_filename', 'int', ['void*', 'string']),
    curl_mime_filedata: libcurl.func('curl_mime_filedata', 'int', ['void*', 'string']),
    curl_mime_free: libcurl.func('curl_mime_free', 'void', ['void*']),

    //curl_multi_init
    curl_multi_init: libcurl.func('curl_multi_init', 'void*', []),
    curl_multi_cleanup: libcurl.func('curl_multi_cleanup', 'int', ['void*']),
    curl_multi_add_handle: libcurl.func('curl_multi_add_handle', 'int', ['void*', 'void*']),
    curl_multi_remove_handle: libcurl.func('curl_multi_remove_handle', 'int', ['void*', 'void*']),
    curl_multi_socket_action: libcurl.func('curl_multi_socket_action', 'int', ['void*', 'int', 'int', 'void*']),
    curl_multi_setopt: libcurl.func('curl_multi_setopt', 'int', ['void*', 'int', 'void*']),
    curl_multi_assign: libcurl.func('curl_multi_assign', 'int', ['void*', 'int', 'void*']),
    curl_multi_perform: libcurl.func('curl_multi_perform', 'int', ['void*', 'void*']),
    curl_multi_timeout: libcurl.func('curl_multi_timeout', 'int', ['void*', 'void*']),
    curl_multi_wait: libcurl.func('curl_multi_wait', 'int', ['void*', 'void*', 'unsigned int', 'int', 'void*']),
    curl_multi_poll: libcurl.func('curl_multi_poll', 'int', ['void*', 'void*', 'unsigned int', 'int', 'void*']),
    curl_multi_wakeup: libcurl.func('curl_multi_wakeup', 'int', ['void*']),
    curl_multi_info_read: libcurl.func('curl_multi_info_read', "CURLMsg*", ['void*', 'void*']),
    curl_multi_strerror: libcurl.func('curl_multi_strerror', 'string', ['int']),
    //opt
    curl_multi_setopt_string: libcurl.func('curl_multi_setopt', 'int', ['void*', 'int', 'string']),
    curl_multi_setopt_long: libcurl.func('curl_multi_setopt', 'int', ['void*', 'int', 'int64_t']),
    curl_multi_setopt_pointer: libcurl.func('curl_multi_setopt', 'int', ['void*', 'int', 'void*']),
    curl_multi_setopt_socket_callback: libcurl.func('curl_multi_setopt', 'int', ['void*', 'int', koffi.pointer(socketCallbackProto)]),
    curl_multi_setopt_timer_callback: libcurl.func('curl_multi_setopt', 'int', ['void*', 'int', koffi.pointer(timerCallbackProto)]),
};

// 初始化 libcurl
lib.curl_global_init(3); // CURL_GLOBAL_ALL

// 在进程退出时清理
process.on('exit', () => {
    lib.curl_global_cleanup();
});