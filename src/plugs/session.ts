
import { Axios, AxiosRequestConfig, AxiosResponse, HeadersDefaults } from "axios";
import req, { Response } from "../core/request";
import { RequestOptions } from "../core";
import { CookieJar } from "tough-cookie";

export type CurlSessionConfig = Omit<AxiosRequestConfig<any>, 'proxy'> & Omit<RequestOptions, 'url'> & {
    url?: string;
    proxy?: string;
};


export type CurlSessionResponse = Omit<AxiosResponse<any>, 'headers'> & Response & {
    text: string;
}

const customHttpClient = async (config: CurlSessionConfig): Promise<CurlSessionResponse> => {
    const response = await req.request(config as any);
    return {
        ...response,
        config: config as any,
        request: config,
        text: response.data as string,
    };
};


export class CurlSession {
    jar?: CookieJar;
    axios: Axios;
    constructor(config?: CurlSessionConfig) {
        const axios = this.axios = new Axios(config as any)
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
    post(url: string, data?: any, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.post(url, data, config as any);
    }
    get(url: string, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.get(url, config as any);
    }
    request(config: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.request(config as any);
    }
    delete(url: string, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.delete(url, config as any);
    }
    put(url: string, data?: any, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.put(url, data, config as any);
    }
    patch(url: string, data?: any, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.patch(url, data, config as any);
    }
    head(url: string, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.head(url, config as any);
    }
    options(url: string, config?: CurlSessionConfig): Promise<CurlSessionResponse> {
        return this.axios.options(url, config as any)
    }
}

export default CurlSession;