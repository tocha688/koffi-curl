import koffi from 'koffi';
import { libcurl, constants, memory } from '../bindings';
import { createSocketCallback, createTimerCallback, releaseCallback } from '../bindings/callbacks';
import type { CURL, CURLM } from '../bindings/types';
import { debug, warn } from '../utils/logger';
import { Curl } from './curl';

const CURLMSG_DONE = 1;
const CURL_SOCKET_TIMEOUT = -1;

interface CurlRequest {
    curl: Curl;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}

/**
 * AsyncCurl 类，提供基于 curl_multi 的异步 HTTP 请求功能
 * 使用事件驱动机制，避免轮询
 */
export class AsyncCurl {
    private multiHandle: CURLM | null = null;
    private curlIdToRequest: Map<bigint, CurlRequest> = new Map();
    private socketCallbackId: number | null = null;
    private timerCallbackId: number | null = null;
    private timer: NodeJS.Timeout | null = null;
    private pendingActions: Set<string> = new Set();
    private lastRunningCount: number = 0;

    constructor() {
        this.multiHandle = libcurl.curl_multi_init();
        if (!this.multiHandle) {
            throw new Error('无法初始化 CURL_MULTI 句柄');
        }
        this.setupCallbacks();
    }

    /**
     * 设置回调函数
     */
    private setupCallbacks(): void {
        const socketCallback = createSocketCallback((sockfd: number, what: number) => {
            this.handleSocketAction(sockfd, what);
        });
        this.socketCallbackId = socketCallback.id;

        const timerCallback = createTimerCallback((timeoutMs: number) => {
            this.handleTimer(timeoutMs);
        });
        this.timerCallbackId = timerCallback.id;

        try {
            libcurl.curl_multi_setopt_socket_callback(this.multiHandle, constants.CurlMOpt.SOCKETFUNCTION, socketCallback.callback);
            libcurl.curl_multi_setopt_timer_callback(this.multiHandle, constants.CurlMOpt.TIMERFUNCTION, timerCallback.callback);
        } catch (error) {
            debug('设置回调失败:', error);
        }
    }

    /**
     * 处理 socket 事件
     */
    private handleSocketAction(sockfd: number, what: number): void {
        if (!this.multiHandle) return;
        debug(`Socket 回调: sockfd=${sockfd}, what=${what}`);
        this.performSocketAction(sockfd, what);
    }

    /**
     * 执行 socket action
     */
    private performSocketAction(sockfd: number, evBitmask: number): void {
        if (!this.multiHandle) return;

        try {
            const runningPtr = memory.createLongPointerBuffer();
            const result = libcurl.curl_multi_socket_action(this.multiHandle, sockfd, evBitmask, runningPtr.ptr);

            if (result !== 0) {
                debug(`curl_multi_socket_action 失败: ${libcurl.curl_multi_strerror(result)}`);
            }

            const runningHandles = runningPtr.readLong();
            debug(`当前运行中的句柄数: ${runningHandles}`);

            // 检查是否有完成的传输
            if (runningHandles < this.lastRunningCount) {
                debug('检测到传输完成，检查完成的请求');
                this.checkCompletedRequests();
            }
            this.lastRunningCount = runningHandles;

        } catch (error) {
            debug('执行 socket action 时出错:', error);
        }
    }

    /**
     * 处理定时器回调
     */
    private handleTimer(timeoutMs: number): void {
        if (!this.multiHandle) return;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (timeoutMs >= 0) {
            debug(`定时器回调: timeout=${timeoutMs}ms`);
            this.timer = setTimeout(() => {
                debug('定时器触发');
                this.performSocketAction(CURL_SOCKET_TIMEOUT, 0);
            }, timeoutMs);
        } else {
            debug(`定时器回调: timeout=${timeoutMs}ms (不设置定时器)`);
        }
    }

    /**
     * 检查完成的请求
     */
    private checkCompletedRequests(): void {
        if (!this.multiHandle) return;

        // 使用 curl_multi_info_read 的替代方案：curl_multi_perform
        const runningPtr = memory.createLongPointerBuffer();
        const performResult = libcurl.curl_multi_perform(this.multiHandle, runningPtr.ptr);
        const currentRunning = runningPtr.readLong();
        
        debug(`当前活跃传输数: ${currentRunning}, 之前: ${this.lastRunningCount}`);
        
        // 如果活跃传输数减少，说明有传输完成
        const completedCount = this.lastRunningCount - currentRunning;
        if (completedCount > 0) {
            debug(`检测到 ${completedCount} 个完成的传输`);
            
            // 尝试使用 curl_multi_info_read 安全地读取完成信息
            this.readCompletedTransfers();
        }
        
        this.lastRunningCount = currentRunning;
    }

    /**
     * 读取完成的传输信息
     */
    private readCompletedTransfers(): void {
        if (!this.multiHandle) return;

        const msgInQueuePtr = memory.createLongPointerBuffer();
        let processedCount = 0;

        // 尝试读取完成的消息，但要更安全
        while (processedCount < 10) { // 限制循环次数防止无限循环
            try {
                const msgPtr = libcurl.curl_multi_info_read(this.multiHandle, msgInQueuePtr.ptr);
                if (!msgPtr) {
                    debug('没有更多消息');
                    break;
                }

                processedCount++;
                debug(`处理消息 #${processedCount}`);

                // 安全地处理消息 - 使用简化的方法
                this.handleMessageSafely(msgPtr);

            } catch (error) {
                debug('读取消息时出错:', error);
                // 如果读取消息失败，尝试其他方法检测完成
                this.fallbackCompletionCheck();
                break;
            }
        }

        const remainingMessages = msgInQueuePtr.readLong();
        debug(`处理了 ${processedCount} 条消息，队列中剩余 ${remainingMessages} 条`);
    }

    /**
     * 安全地处理消息
     */
    private handleMessageSafely(msgPtr: any): void {
        try {
            // 检查所有请求，找出已完成的
            for (const [curlId, request] of Array.from(this.curlIdToRequest.entries())) {
                const curl = request.curl;
                const curlHandle = curl.handle;

                try {
                    // 检查传输状态
                    const responseCode = curl.getinfo(constants.CurlInfo.RESPONSE_CODE);
                    const totalTime = curl.getinfo(constants.CurlInfo.TOTAL_TIME);
                    const effectiveUrl = curl.getinfo(constants.CurlInfo.EFFECTIVE_URL);
                    
                    debug(`检查请求状态: curlId=${curlId}, 响应码=${responseCode}, 耗时=${totalTime}, URL=${effectiveUrl}`);
                    
                    // 判断传输是否完成的条件：
                    // 1. 有响应码 (>= 100)
                    // 2. 或者有总时间且时间合理 (> 0.01秒)
                    // 3. 或者响应码为0但有明确的错误信息
                    const hasValidResponse = responseCode >= 100;
                    const hasCompletedWithTime = totalTime > 0.01;
                    const isCompleted = hasValidResponse || hasCompletedWithTime;
                    
                    if (isCompleted) {
                        debug(`检测到完成的请求: curlId=${curlId}, 响应码=${responseCode}, 耗时=${totalTime}`);
                        
                        // 从 multi handle 中移除
                        const removeResult = libcurl.curl_multi_remove_handle(this.multiHandle, curlHandle);
                        if (removeResult !== 0) {
                            debug(`移除句柄失败: ${libcurl.curl_multi_strerror(removeResult)}`);
                        }

                        // 清理映射
                        this.curlIdToRequest.delete(curlId);
                        debug(`请求完成处理，剩余请求数: ${this.curlIdToRequest.size}`);

                        // 根据不同情况处理结果
                        if (hasValidResponse) {
                            // 有HTTP响应码，无论成功还是失败都算完成
                            debug(`请求完成，HTTP状态码: ${responseCode}`);
                            request.resolve(curl);
                        } else if (hasCompletedWithTime) {
                            // 有耗时但没有响应码，可能是网络错误但仍然尝试获取错误信息
                            try {
                                // 尝试获取更详细的错误信息
                                const primaryIp = curl.getinfo(constants.CurlInfo.PRIMARY_IP);
                                const httpConnectCode = curl.getinfo(constants.CurlInfo.HTTP_CONNECTCODE);
                                
                                debug(`请求详情: IP=${primaryIp}, 连接码=${httpConnectCode}`);
                                
                                if (primaryIp && primaryIp.length > 0) {
                                    // 能连接到服务器但没有HTTP响应，可能是协议错误
                                    debug('能连接到服务器但没有HTTP响应，可能是协议问题');
                                    request.reject(new Error(`连接成功但协议错误，IP: ${primaryIp}`));
                                } else {
                                    // 连接失败
                                    debug('连接失败');
                                    request.reject(new Error('连接失败'));
                                }
                            } catch (infoError) {
                                debug('获取详细错误信息失败:', infoError);
                                request.reject(new Error(`请求失败，耗时: ${totalTime}秒`));
                            }
                        } else {
                            // 其他情况，直接报错
                            debug('请求失败，未知原因');
                            request.reject(new Error('请求失败，未知原因'));
                        }
                        
                        return; // 只处理一个完成的请求
                    } else {
                        debug(`请求尚未完成: curlId=${curlId}, 响应码=${responseCode}, 耗时=${totalTime}`);
                    }
                } catch (infoError) {
                    debug('获取传输信息时出错:', infoError);
                    // 如果无法获取信息，可能是传输已经失败
                    const removeResult = libcurl.curl_multi_remove_handle(this.multiHandle, curlHandle);
                    this.curlIdToRequest.delete(curlId);
                    request.reject(new Error(`获取传输信息失败: ${infoError}`));
                    return;
                }
            }
        } catch (error) {
            debug('处理消息时出错:', error);
        }
    }

    /**
     * 备用的完成检查方法
     */
    private fallbackCompletionCheck(): void {
        debug('使用备用方法检查完成的传输');
        
        for (const [curlId, request] of Array.from(this.curlIdToRequest.entries())) {
            try {
                const curl = request.curl;
                
                // 备用检查：尝试获取基本信息
                try {
                    const responseCode = curl.getinfo(constants.CurlInfo.RESPONSE_CODE);
                    const totalTime = curl.getinfo(constants.CurlInfo.TOTAL_TIME);
                    
                    // 更宽松的完成条件
                    if (responseCode > 0 || totalTime > 0.001) {
                        debug(`备用检查发现完成的请求: curlId=${curlId}, 响应码=${responseCode}, 耗时=${totalTime}`);
                        
                        const removeResult = libcurl.curl_multi_remove_handle(this.multiHandle, curl.handle);
                        if (removeResult === 0) {
                            this.curlIdToRequest.delete(curlId);
                            
                            if (responseCode > 0) {
                                request.resolve(curl);
                            } else {
                                request.reject(new Error(`请求超时或失败，耗时: ${totalTime}秒`));
                            }
                        }
                        return; // 只处理一个
                    }
                } catch (getInfoError) {
                    debug('备用检查获取信息失败:', getInfoError);
                    // 如果连基本信息都获取不到，说明传输可能已经失败
                    const removeResult = libcurl.curl_multi_remove_handle(this.multiHandle, curl.handle);
                    if (removeResult === 0) {
                        this.curlIdToRequest.delete(curlId);
                        request.reject(new Error('传输失败，无法获取状态信息'));
                    }
                    return;
                }
            } catch (error) {
                debug('备用检查时出错:', error);
            }
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
                const curlHandle = curl.handle;
                const curlId = curl.id;

                debug(`添加 curlId: ${curlId}`);

                // 添加到 multi handle
                const result = libcurl.curl_multi_add_handle(this.multiHandle, curlHandle);
                if (result !== 0) {
                    reject(new Error(`添加句柄失败: ${libcurl.curl_multi_strerror(result)}`));
                    return;
                }

                // 创建请求记录
                const request: CurlRequest = { curl, resolve, reject };
                this.curlIdToRequest.set(curlId, request);

                debug(`添加请求: curlId=${curlId}, 当前请求数: ${this.curlIdToRequest.size}`);

                // 更新运行计数
                this.lastRunningCount = this.curlIdToRequest.size;

                // 触发初始的 socket action
                this.performSocketAction(CURL_SOCKET_TIMEOUT, 0);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 移除请求
     */
    removeHandle(curl: Curl): void {
        const curlHandle = curl.handle;
        const curlId = curl.id;
        const request = this.curlIdToRequest.get(curlId);

        if (request) {
            try {
                if (this.multiHandle) {
                    libcurl.curl_multi_remove_handle(this.multiHandle, curlHandle);
                }
                this.curlIdToRequest.delete(curlId);

                debug(`移除请求: curlId=${curlId}, 剩余请求数: ${this.curlIdToRequest.size}`);
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
        if (!this.multiHandle) return;

        debug('开始关闭 AsyncCurl');

        try {
            // 停止定时器
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
                debug('定时器已停止');
            }

            // 先释放回调函数
            if (this.socketCallbackId !== null) {
                try {
                    releaseCallback(this.socketCallbackId);
                    this.socketCallbackId = null;
                    debug('Socket 回调已释放');
                } catch (e) {
                    debug('释放 Socket 回调时出错:', e);
                }
            }

            if (this.timerCallbackId !== null) {
                try {
                    releaseCallback(this.timerCallbackId);
                    this.timerCallbackId = null;
                    debug('Timer 回调已释放');
                } catch (e) {
                    debug('释放 Timer 回调时出错:', e);
                }
            }

            // 取消所有待处理的请求
            const requestsToCancel = Array.from(this.curlIdToRequest.entries());
            debug(`准备移除 ${requestsToCancel.length} 个请求`);

            for (const [curlId, request] of requestsToCancel) {
                try {
                    const curlHandle = request.curl.handle;
                    if (curlHandle && this.multiHandle) {
                        const removeResult = libcurl.curl_multi_remove_handle(this.multiHandle, curlHandle);
                        if (removeResult !== 0) {
                            debug(`移除句柄失败: ${libcurl.curl_multi_strerror(removeResult)}`);
                        } else {
                            debug(`成功移除句柄: curlId=${curlId}`);
                        }
                    }
                    request.reject(new Error('AsyncCurl 已关闭'));
                } catch (e) {
                    debug('移除句柄时出错:', e);
                }
            }

            // 清理映射
            this.curlIdToRequest.clear();
            debug('请求映射已清理');

            // 最后清理 multi handle
            if (this.multiHandle) {
                setImmediate(() => {
                    try {
                        debug('准备清理 multi handle');
                        const cleanupResult = libcurl.curl_multi_cleanup(this.multiHandle);
                        if (cleanupResult !== 0) {
                            debug(`清理 multi handle 返回错误码: ${cleanupResult}`);
                        } else {
                            debug('Multi handle 清理成功');
                        }
                    } catch (cleanupError) {
                        // debug('清理 multi handle 时出错:', cleanupError);
                    }
                    this.multiHandle = null;
                })
            }

            debug('AsyncCurl 关闭完成');

        } catch (error) {
            console.error('关闭 AsyncCurl 时出错:', error);
            this.multiHandle = null;
        }
    }

    /**
     * 获取版本信息
     */
    static version(): string {
        return libcurl.curl_version();
    }
}
