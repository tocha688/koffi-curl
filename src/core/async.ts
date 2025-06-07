import { callbacks, constants, libcurl, memory } from "../bindings";
import { createSocketCallback, createTimerCallback } from "../bindings/callbacks";
import { CurlMOpt } from "../bindings/constants";
import { CURLMsg } from "../bindings/library";
import { debug } from "../utils/logger";
import { Curl } from "./curl";
import koffi from 'koffi';

const CURLMSG_DONE = 1;

interface CurlRequest {
    curl: Curl;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}

export class AsyncCurl {
    private multiHandle = libcurl.curl_multi_init();
    //绑定回调的
    private _calls = new Map<bigint, CurlRequest>();
    //未完成请求数，0代表所有请求都已经完成
    private stillRunning = memory.createLongPointerBuffer();
    //
    private lastRunningCount = 0;
    constructor() {
        this.setupCallbacks();
    }

    //回调
    socketCallback?: { callback: any, id: number };
    timerCallback?: { callback: any, id: number };
    private setupCallbacks(): void {
        // this.socketCallback = createSocketCallback((sockfd: number, what: number) => {
        //     //socket变化回调
        //     debug('socketCallback - curl_multi_socket_action', sockfd, what);
        //     this.performSocketAction(sockfd, what);
        // });
        // libcurl.curl_multi_setopt_socket_callback(this.multiHandle, constants.CurlMOpt.SOCKETFUNCTION, this.socketCallback.callback);
        //轮询回调
        this.timerCallback = createTimerCallback((timeoutMs: number) => {
            debug('timerCallback - curl_multi_socket_action', timeoutMs);
            if (timeoutMs >= 0) {
                setTimeout(() => {
                    this.performSocketAction()
                }, timeoutMs)
            }
            //-1取消轮询
        });
        libcurl.curl_multi_setopt_timer_callback(this.multiHandle, constants.CurlMOpt.TIMERFUNCTION, this.timerCallback.callback);
    }
    /**
     * 执行 socket action
     */
    private performSocketAction(sockfd: number = -1, evBitmask: number = 0): void {
        if (!this.multiHandle) return;
        try {
            debug('performSocketAction - curl_multi_socket_action - start', sockfd, evBitmask);
            const result = libcurl.curl_multi_socket_action(this.multiHandle, sockfd, evBitmask, this.stillRunning.ptr);
            if (result !== 0) {
                debug(`curl_multi_socket_action 失败: ${libcurl.curl_multi_strerror(result)}`);
            }
            debug('performSocketAction - curl_multi_socket_action - end', sockfd, evBitmask);
            const currentRunning = this.stillRunning.readLong();
            const completedCount = this.lastRunningCount - currentRunning;
            this.lastRunningCount = currentRunning;
            debug(`当前活跃传输数: ${currentRunning}, 完成的传输数: ${completedCount}`);
            // 检查是否有完成的传输
            if (completedCount > 0) {
                this.checkCompletedRequests(completedCount);
            }
        } catch (error) {
            debug('执行 socket action 时出错:', error);
        }
    }
    /**
     * 检查完成的请求
     */
    private checkCompletedRequests(completedCount: number): void {
        debug('checkCompletedRequests - start');
        if (!this.multiHandle) return;
        // libcurl.curl_multi_perform(this.multiHandle, this.stillRunning.ptr);
        // const currentRunning = this.stillRunning.readLong();
        // // 如果活跃传输数减少，说明有传输完成
        // const completedCount = this.lastRunningCount - currentRunning;
        // this.lastRunningCount = currentRunning;
        if (completedCount > 0) {
            debug(`检测到 ${completedCount} 个完成的传输`);
            for (let i = 0; i < completedCount; i++) {
                const msgInQueuePtr = memory.createLongPointerBuffer();
                debug("checkCompletedRequests - curl_multi_info_read - start");
                const msgPtr = libcurl.curl_multi_info_read(this.multiHandle, msgInQueuePtr.ptr);
                debug("checkCompletedRequests - curl_multi_info_read - end", msgPtr);
                if (!msgPtr) continue;
                debug("checkCompletedRequests - decode - start");
                const msg = koffi.decode(msgPtr, CURLMsg);
                debug("checkCompletedRequests - decode - end");
                const result = msg.data.result;
                debug(`处理消息: ${msg.msg}, 结果: ${result}}`);
                //处理消息
                if (msg.msg !== CURLMSG_DONE) continue;
                const hid = koffi.address(msg.easy_handle);
                const req = this._calls.get(hid);
                this._calls.delete(hid);
                if (!req) continue;
                //处理请求
                if (result === 0) {
                    req.resolve(req.curl);
                } else {
                    req.reject(new Error(libcurl.curl_multi_strerror(result)));
                }
            }
        }
    }
    //设置参数
    setOption(option: CurlMOpt, value: any): void {
        if (typeof value === 'number') {
            const numValue = Number(value);
            libcurl.curl_multi_setopt_long(this.multiHandle, option, numValue);
        } else if (typeof value === 'string') {
            const strValue = String(value);
            libcurl.curl_multi_setopt_string(this.multiHandle, option, strValue);
        } else if (typeof value === 'boolean') {
            // 处理布尔值选项
            const numValue = value ? 1 : 0;
            libcurl.curl_multi_setopt_long(this.multiHandle, option, numValue);
        }
    }
    private pending = 0;
    //加入
    async addHandle(curl: Curl): Promise<Curl> {
        if (!this.multiHandle) throw new Error('AsyncCurl 已关闭');
        return new Promise<Curl>((resolve, reject) => {
            try {
                const curlHandle = curl.handle;
                // 添加到 multi handle
                const result = libcurl.curl_multi_add_handle(this.multiHandle, curlHandle);
                if (result !== 0) {
                    reject(new Error(`添加句柄失败: ${libcurl.curl_multi_strerror(result)}`));
                    return;
                }

                // 创建请求记录
                const request: CurlRequest = { curl, resolve, reject };
                this._calls.set(curl.id, request);
                this.lastRunningCount = this._calls.size;

                debug(`添加请求: curlId=${curl.id}, 当前请求数: ${this._calls.size}`);
                this.pending++;
                //触发请求
                // libcurl.curl_multi_perform(this.multiHandle, this.stillRunning.ptr)
                // this.performSocketAction();
            } catch (error) {
                reject(error);
            }
        });

    }

    async close() {
        if (!this.multiHandle) return;
        // 取消所有挂起的请求
        for (const [id, request] of this._calls.entries()) {
            request.reject(new Error('AsyncCurl 已关闭'));
            this._calls.delete(id);
        }
        this.stillRunning = {} as any;
        // 清理回调
        if (this.socketCallback?.callback) {
            // koffi.unregister(this.socketCallback.callback);
            libcurl.curl_multi_setopt(this.multiHandle, constants.CurlMOpt.TIMERFUNCTION, null);
            delete this.socketCallback
        }
        if (this.timerCallback?.callback) {
            callbacks.releaseCallback(this.timerCallback.id);
            // koffi.unregister(this.timerCallback.callback);
            libcurl.curl_multi_setopt(this.multiHandle, constants.CurlMOpt.TIMERFUNCTION, null);
            delete this.timerCallback;
        }
        // 清理 multi handle
        libcurl.curl_multi_cleanup(this.multiHandle);
        this.multiHandle = null;
        this.pending = 0;
        debug('AsyncCurl 已关闭');
    }

    static version(): string {
        return libcurl.curl_version();
    }

}