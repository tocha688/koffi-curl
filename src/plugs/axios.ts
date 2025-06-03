
import { Axios, AxiosRequestConfig, AxiosResponse, HeadersDefaults } from "axios";
import req from "../core/request";
import { RequestOptions } from "../core";
import { CURL_IMPERSONATE } from "../bindings/constants";
import { CookieJar } from "tough-cookie";
import { mergeCookieStr } from "../utils/cookies";

export interface CurlAxiosConfig<D = any> extends AxiosRequestConfig {
    data?: any;
    params?: { [key: string]: string | number };
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
    proxy?: string | any;
    referer?: string;
    acceptEncoding?: string;
    userAgent?: string;
    impersonate?: CURL_IMPERSONATE;
    verifySsl?: boolean;
    jar?: CookieJar;
    //重试次数
    retryCount?: number;
    auth?: {
        username: string;
        password: string;
    }
    cookieEnable?: boolean;
}



const customHttpClient = async (config: CurlAxiosConfig): Promise<AxiosResponse> => {
    const response = await req.request(config as any);
    return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as any,
        config: config as any,
        request: config,
    };
};


export class CurlAxios extends Axios {
    jar?: CookieJar;
    constructor(config?: CurlAxiosConfig) {
        super(config);
        this.defaults.adapter = customHttpClient;
        if (!config) return;
        if (config.cookieEnable) {
            this.jar = new CookieJar();
        }
        this.initHook();
    }
    private initHook() {
        this.interceptors.request.use(async (config) => {
            // 从 cookieJar 中获取 Cookie
            if (this.jar) {
                //@ts-ignore
                config.jar = this.jar;
            }
            return config;
        });

        // 添加响应拦截器
        this.interceptors.response.use(
            (response) => {
                return response;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }
    post<T = any, R = AxiosResponse<T, any>, D = any>(url: string, data?: D, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.post(url, data, config);
    }
    get<T = any, R = AxiosResponse<T, any>, D = any>(url: string, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.get(url, config);
    }
    request<T = any, R = AxiosResponse<T, any>, D = any>(config: CurlAxiosConfig): Promise<R> {
        return super.request(config);
    }
    delete<T = any, R = AxiosResponse<T, any>, D = any>(url: string, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.delete(url, config);
    }
    put<T = any, R = AxiosResponse<T, any>, D = any>(url: string, data?: D, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.put(url, data, config);
    }
    patch<T = any, R = AxiosResponse<T, any>, D = any>(url: string, data?: D, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.patch(url, data, config);
    }
    head<T = any, R = AxiosResponse<T, any>, D = any>(url: string, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.head(url, config);
    }
    options<T = any, R = AxiosResponse<T, any>, D = any>(url: string, config?: CurlAxiosConfig<D>): Promise<R> {
        return super.options(url, config);
    }
}

export default CurlAxios;