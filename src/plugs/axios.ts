
import { Axios, AxiosRequestConfig, AxiosResponse, HeadersDefaults } from "axios";
import req from "../core/request";
import { RequestOptions } from "../core";
import { CURL_IMPERSONATE } from "../bindings/constants";
import { CookieJar } from "tough-cookie";
import { mergeCookieStr } from "../utils/cookies";

export interface CurlAxiosConfig<D = any> extends AxiosRequestConfig {
    data?: D;
    followRedirects?: boolean;
    maxRedirects?: number;
    proxy?: string | any;
    userAgent?: string;
    impersonate?: CURL_IMPERSONATE;
    verifySsl?: boolean;
    cookieEnable?: boolean;
}


const customHttpClient = async (config: CurlAxiosConfig): Promise<AxiosResponse> => {
    const response = await req.request(config as any);
    return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
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
            //@ts-ignore
            config.jar=this.jar;
        }
        // this.initHook();
    }
    private initHook() {
        this.interceptors.request.use(async (config) => {
            // 从 cookieJar 中获取 Cookie
            if (this.jar) {
                const cookies = await this.jar.getCookiesSync(config.url || "");
                if (cookies && cookies.length > 0) {
                    const mcookie = cookies.map((cookie) => cookie.cookieString()).join("; ");
                    config.headers["cookie"] = mergeCookieStr(mcookie, config.headers["cookie"] || "");
                }
            }
            return config;
        });

        // 添加响应拦截器
        this.interceptors.response.use(
            (response) => {
                // 从响应中提取 Set-Cookie 头并存储到 cookieJar
                let setCookieHeader = response.headers["set-cookie"];
                if (setCookieHeader) {
                    if (!Array.isArray(setCookieHeader)) {
                        //@ts-ignore
                        setCookieHeader = [setCookieHeader];
                    }
                    setCookieHeader.forEach((cookie: string) => {
                        this.jar && this.jar.setCookieSync(cookie, response.request.url || "");
                    });
                }
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