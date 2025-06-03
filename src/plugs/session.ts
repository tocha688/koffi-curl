
import { Axios, AxiosRequestConfig, AxiosResponse, HeadersDefaults } from "axios";
import req, { Response } from "../core/request";
import { RequestOptions } from "../core";
import { CookieJar } from "tough-cookie";

export type CurlAxiosConfig = AxiosRequestConfig<any> & RequestOptions;


export type CurlAxiosResponse = AxiosResponse & Response;


const customHttpClient = async (config: CurlAxiosConfig): Promise<CurlAxiosResponse> => {
    const response = await req.request(config as any);
    return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as any,
        url: response.url,
        redirectCount: response.redirectCount,
        buffer: response.buffer,
        config: config as any,
        request: config,
    };
};


export class CurlSession {
    jar?: CookieJar;
    axios: Axios;
    constructor(config?: CurlAxiosConfig) {
        const axios = this.axios = new Axios(config)
        //@ts-ignore
        axios.defaults.adapter = customHttpClient;
        if (!config) return;
        this.jar = new CookieJar();
        this.initHook();
    }
    private initHook() {
        this.axios.interceptors.request.use(async (config) => {
            // 从 cookieJar 中获取 Cookie
            if (this.jar) {
                //@ts-ignore
                config.jar = this.jar;
            }
            return config;
        });

        // 添加响应拦截器
        this.axios.interceptors.response.use(
            (response) => {
                return response;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }
    post(url: string, data?: any, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.post(url, data, config);
    }
    get(url: string, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.get(url, config);
    }
    request(config: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.request(config);
    }
    delete(url: string, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.delete(url, config);
    }
    put(url: string, data?: any, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.put(url, data, config);
    }
    patch(url: string, data?: any, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.patch(url, data, config);
    }
    head(url: string, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.head(url, config);
    }
    options(url: string, config?: CurlAxiosConfig): Promise<CurlAxiosResponse> {
        return this.axios.options(url, config)
    }
}

export default CurlSession;