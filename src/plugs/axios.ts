
import { Axios, AxiosRequestConfig, AxiosResponse } from "axios";
import { req } from "..";
import { RequestOptions } from "../core";
import _ from "lodash";

export type CurlAxiosConfig = AxiosRequestConfig & {
    CurlOptions?: Partial<RequestOptions>;
}

export type CurlAxios= Axios & {
    CurlOptions?: Partial<RequestOptions>;
}

const customHttpClient = async (config: CurlAxiosConfig): Promise<AxiosResponse> => {
    const response = await req.request(_.merge(config.CurlOptions || {}, {
        url: config.url!,
        method: config.method || "GET" as any,
        headers: config.headers as any,
        data: config.data,
        params: config.params,
        timeout: config.timeout || 5000
    }));

    return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: config as any
    };
};


export function useAxiosPlug(axios: Axios, options: Partial<RequestOptions> = {}) {
    axios.defaults.adapter = customHttpClient;
    (axios.defaults as any).CurlOptions = options;
}
export default useAxiosPlug;