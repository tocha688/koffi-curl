import { CurlSslVersion } from "./constants";

// TLS 版本映射 (对应 python 中的 TLS_VERSION_MAP)
export const TLS_VERSION_MAP: { [key: number]: number } = {
  0x0301: CurlSslVersion.TLSv1_0,  // 769
  0x0302: CurlSslVersion.TLSv1_1,  // 770  
  0x0303: CurlSslVersion.TLSv1_2,  // 771
  0x0304: CurlSslVersion.TLSv1_3,  // 772
};

// TLS 密码套件映射 (对应 python 中的 TLS_CIPHER_NAME_MAP)
export const TLS_CIPHER_NAME_MAP: { [key: number]: string } = {
  0x000A: "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
  0x002F: "TLS_RSA_WITH_AES_128_CBC_SHA",
  0x0033: "TLS_DHE_RSA_WITH_AES_128_CBC_SHA",
  0x0035: "TLS_RSA_WITH_AES_256_CBC_SHA",
  0x0039: "TLS_DHE_RSA_WITH_AES_256_CBC_SHA",
  0x003C: "TLS_RSA_WITH_AES_128_CBC_SHA256",
  0x003D: "TLS_RSA_WITH_AES_256_CBC_SHA256",
  0x0067: "TLS_DHE_RSA_WITH_AES_128_CBC_SHA256",
  0x006B: "TLS_DHE_RSA_WITH_AES_256_CBC_SHA256",
  0x008C: "TLS_PSK_WITH_AES_128_CBC_SHA",
  0x008D: "TLS_PSK_WITH_AES_256_CBC_SHA",
  0x009C: "TLS_RSA_WITH_AES_128_GCM_SHA256",
  0x009D: "TLS_RSA_WITH_AES_256_GCM_SHA384",
  0x009E: "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256",
  0x009F: "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
  0x1301: "TLS_AES_128_GCM_SHA256",
  0x1302: "TLS_AES_256_GCM_SHA384",
  0x1303: "TLS_CHACHA20_POLY1305_SHA256",
  0xC008: "TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA",
  0xC009: "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
  0xC00A: "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
  0xC012: "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA",
  0xC013: "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
  0xC014: "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
  0xC023: "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
  0xC024: "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384",
  0xC027: "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
  0xC028: "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
  0xC02B: "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
  0xC02C: "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
  0xC02F: "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  0xC030: "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
  0xC035: "TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA",
  0xC036: "TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA",
  0xCCA8: "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
  0xCCA9: "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
  0xCCAC: "TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256",
};

// TLS 椭圆曲线映射 (对应 python 中的 TLS_EC_CURVES_MAP)
export const TLS_EC_CURVES_MAP: { [key: number]: string } = {
  19: "P-192",
  21: "P-224", 
  23: "P-256",
  24: "P-384",
  25: "P-521",
  29: "X25519",
  4588: "X25519MLKEM768",
  25497: "X25519Kyber768Draft00",
};

// TLS 扩展映射 (对应 python 中的 TLS_EXTENSION_NAME_MAP)
export const TLS_EXTENSION_NAME_MAP: { [key: number]: string } = {
  0: "server_name",
  1: "max_fragment_length",
  5: "status_request", 
  10: "supported_groups",
  11: "ec_point_formats",
  13: "signature_algorithms",
  16: "application_layer_protocol_negotiation",
  18: "signed_certificate_timestamp",
  21: "padding",
  23: "extended_master_secret",
  27: "compress_certificate",
  35: "session_ticket",
  43: "supported_versions",
  45: "psk_key_exchange_modes",
  51: "key_share",
  17513: "application_settings",
  17613: "application_settings new",
  65037: "encrypted_client_hello",
  65281: "renegotiation_info",
};

// 默认启用的扩展 (对应 python 中的 default_enabled)
export const DEFAULT_ENABLED_EXTENSIONS = new Set([0, 51, 13, 43, 65281, 23, 10, 45, 35, 11, 16]);
