
export function mapToObject<T>(map: Map<string, T>): Record<string, T> {
    const obj: Record<string, T> = {};
    map.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

export function parseCookie(cookies: string) {
    if (!cookies) return {}
    const cmap = new Map<string, string>()
    cookies.split(";").forEach((item) => {
        const [key, val] = item.split("=")
        cmap.set(key.trim(), val.trim())
    })
    return mapToObject(cmap)
}

export function objectToCookie(obj: Record<string, string>) {
    const arr: string[] = []
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            arr.push(`${key}=${obj[key]}`)
        }
    }
    return arr.join("; ")
}

export function mergeCookieStr(cookies: string, cookies2: string) {
    return objectToCookie({
        ...parseCookie(cookies),
        ...parseCookie(cookies2),
    })
}