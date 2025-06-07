import os from "os"
import path from "path"
import fs from "fs"
import { getLibHome } from "../bindings/library";

export function getCertPath(): string | undefined {
    // 启用SSL验证
    // curl.setopt(constants.CurlOpt.SSL_VERIFYPEER, 1);
    // curl.setopt(constants.CurlOpt.SSL_VERIFYHOST, 2);
    // 首先尝试使用项目内置的CA证书
    const projectCaPath = path.join(getLibHome(), 'cacert.pem');
    if (fs.existsSync(projectCaPath)) {
      return projectCaPath;
    } else if (os.platform() === 'win32') {
      // Windows - libcurl-impersonate应该已经包含证书
      // 不设置CAINFO，让libcurl使用默认配置
    } else if (os.platform() === 'darwin') {
      // macOS
      const macPaths = [
        '/usr/local/etc/openssl/cert.pem',
        '/etc/ssl/cert.pem',
        '/usr/local/etc/openssl@1.1/cert.pem'
      ];
      return macPaths.find(p => fs.existsSync(p));
    } else {
      // Linux
      const linuxPaths = [
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
        '/usr/share/ssl/certs/ca-bundle.crt',
        '/usr/local/share/certs/ca-root-nss.crt'
      ];
      return linuxPaths.find(p => fs.existsSync(p));
    }
  }