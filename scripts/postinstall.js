const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');
const { promisify } = require('util');
const exec = promisify(child_process.exec);
const stream = require('stream');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const tar = require('tar');
const got = require('got');

// 版本配置
const CURL_VERSION = '1.0.0';

// 读取架构配置
function loadArchConfig() {
    try {
        const libsJsonPath = path.join(__dirname, '..', 'libs.json');
        return JSON.parse(fs.readFileSync(libsJsonPath, 'utf8'));
    } catch (error) {
        console.error('Error loading libs.json:', error);
        process.exit(1);
    }
}

// 检测当前系统架构
function detectArch() {
    const archs = loadArchConfig();
    const system = os.platform() === 'win32' ? 'Windows' :
        os.platform() === 'darwin' ? 'Darwin' : 'Linux';

    let machine;
    if (system === 'Windows') {
        machine = os.arch() === 'x64' ? 'AMD64' :
            os.arch() === 'ia32' ? 'x86' :
                os.arch() === 'arm64' ? 'ARM64' : os.arch();
    } else {
        machine = os.arch() === 'x64' ? 'x86_64' :
            os.arch() === 'ia32' ? 'x86' :
                os.arch() === 'arm' ? 'armv7l' :
                    os.arch() === 'arm64' ? 'aarch64' : os.arch();
    }

    const pointerSize = os.arch().includes('64') ? 64 : 32;

    let libc = null;
    if (system === 'Linux') {
        libc = 'gnu';
        try {
            const lddOutput = child_process.execSync('ldd --version 2>&1 || true').toString();
            if (/musl/.test(lddOutput)) {
                libc = 'musl';
            } else if (/armv7l|armv6l/.test(machine)) {
                libc = 'gnueabihf';
            }
        } catch (e) {
            console.warn('无法检测libc类型，使用默认值:', libc);
        }
    }

    console.log(`正在查找架构匹配: ${system} ${machine} ${pointerSize}位${libc ? ' ' + libc : ''}`);

    const matchedArch = archs.find(arch => {
        if (arch.system !== system) return false;
        if (arch.machine !== machine) return false;
        if (arch.pointer_size !== pointerSize) return false;
        if (system === 'Linux' && arch.libc && arch.libc !== libc) return false;
        return true;
    });

    if (!matchedArch) {
        console.error('可用架构配置:');
        archs.forEach(arch => {
            console.error(`- ${arch.system} ${arch.machine} ${arch.pointer_size}位${arch.libc ? ' ' + arch.libc : ''}`);
        });
        throw new Error(`不支持的架构: ${system} ${machine} ${pointerSize}位${libc ? ' ' + libc : ''}`);
    }

    return matchedArch;
}

// 获取统一的库目录路径
function getLibraryDir(arch) {
    // 创建统一的目录名称格式: lib/{version}-{platform}
    const platformName = arch.system === 'Linux' ? 
        `linux-${arch.libc}` : 
        arch.sysname;
        
    const dirName = `${CURL_VERSION}-${platformName}`;
    const libRootDir = path.join(__dirname, '..', 'lib');
    const libDir = path.join(libRootDir, dirName);
    
    // 确保目录存在
    if (!fs.existsSync(libRootDir)) {
        fs.mkdirSync(libRootDir, { recursive: true });
    }
    
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }
    
    return libDir;
}

// 使用 got 进行高速下载
async function downloadFile(url, dest) {
    try {
        console.log(`开始下载: ${url} 到 ${dest}`);
        
        // 创建下载流
        const downloadStream = got.stream(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
                "Accept": "application/octet-stream"
            },
            followRedirect: true, // 自动跟随重定向
            retry: { limit: 3 },   // 失败时重试3次
        });
        
        // 创建写入流
        const fileWriterStream = fs.createWriteStream(dest);
        
        // 下载进度跟踪变量
        let downloadedBytes = 0;
        let totalBytes = 0;
        let lastLogTime = Date.now();
        let startTime = Date.now();
        
        // 监听响应头以获取文件大小
        downloadStream.on('response', response => {
            totalBytes = parseInt(response.headers['content-length'] || 0);
            console.log(`文件总大小: ${(totalBytes / 1048576).toFixed(2)} MB`);
        });
        
        // 监听数据，更新进度
        downloadStream.on('downloadProgress', ({ transferred, total, percent }) => {
            const currentTime = Date.now();
            
            // 限制日志输出频率，每200ms更新一次
            if (currentTime - lastLogTime > 200) {
                const elapsedSeconds = (currentTime - startTime) / 1000;
                const speed = transferred / elapsedSeconds;
                
                process.stdout.write(
                    `\r下载进度: ${(percent * 100).toFixed(1)}% | ` +
                    `${(transferred / 1048576).toFixed(2)}/${(total / 1048576).toFixed(2)} MB | ` + 
                    `速度: ${(speed / 1048576).toFixed(2)} MB/s`
                );
                
                lastLogTime = currentTime;
            }
        });
        
        // 使用 pipeline 确保内存不会爆炸
        await pipeline(downloadStream, fileWriterStream);
        
        console.log('\n下载完成!');
        return true;
    } catch (error) {
        console.error('下载失败:', error.message);
        throw error;
    }
}

// 使用 Node.js 解压 tar.gz 文件
async function extractTarGz(file, destination) {
    try {
        console.log(`使用 Node.js 内置功能解压文件到: ${destination}`);
        
        const tmpDir = path.join(os.tmpdir(), `curl-imp-${Date.now()}`);
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        
        const tarFile = path.join(tmpDir, 'temp.tar');
        
        await pipeline(
            fs.createReadStream(file),
            zlib.createGunzip(),
            fs.createWriteStream(tarFile)
        );
        
        console.log(`已解压 gzip 为 tar 文件: ${tarFile}`);
        
        await tar.extract({
            file: tarFile,
            cwd: destination,
            sync: false,
            strict: true
        });
        
        console.log(`已完成解压`);
        
        fs.unlinkSync(tarFile);
        fs.rmdirSync(tmpDir, { recursive: true });
        
        return true;
    } catch (error) {
        console.error('解压失败:', error);
        throw error;
    }
}

// 移动文件
function moveFiles(arch, extractedDir) {
    try {
        // 使用统一的目标目录
        const libDir = getLibraryDir(arch);
        
        console.log(`移动文件到 ${libDir}`);
        
        // 复制解压出的所有文件到统一库目录
        if (arch.system === 'Windows') {
            // 处理Windows特有的文件结构
            const srcLibDir = path.join(extractedDir, 'lib');
            const srcBinDir = path.join(extractedDir, 'bin');
            
            // 复制lib目录下的.lib文件
            if (fs.existsSync(srcLibDir)) {
                fs.readdirSync(srcLibDir).forEach(file => {
                    if (file.endsWith('.lib')) {
                        const srcPath = path.join(srcLibDir, file);
                        const destPath = path.join(libDir, file);
                        fs.copyFileSync(srcPath, destPath);
                        console.log(`复制: ${srcPath} -> ${destPath}`);
                    }
                });
            }
            
            // 复制bin目录下的.dll文件
            if (fs.existsSync(srcBinDir)) {
                fs.readdirSync(srcBinDir).forEach(file => {
                    if (file.endsWith('.dll')) {
                        const srcPath = path.join(srcBinDir, file);
                        const destPath = path.join(libDir, file);
                        fs.copyFileSync(srcPath, destPath);
                        console.log(`复制: ${srcPath} -> ${destPath}`);
                    }
                });
            }
        } else {
            // 处理Linux/MacOS
            // 递归复制所有文件
            copyFilesRecursive(extractedDir, libDir);
        }
        
        return libDir;
    } catch (error) {
        console.error('移动文件失败:', error);
        throw error;
    }
}

// 递归复制目录中的所有文件
function copyFilesRecursive(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        fs.readdirSync(src).forEach(childItemName => {
            const srcPath = path.join(src, childItemName);
            const destPath = path.join(dest, childItemName);
            
            copyFilesRecursive(srcPath, destPath);
        });
    } else {
        fs.copyFileSync(src, dest);
        console.log(`复制: ${src} -> ${dest}`);
    }
}

// 主函数
async function main() {
    try {
        const arch = detectArch();
        
        // 使用统一的库目录
        const libDir = getLibraryDir(arch);
        console.log(`使用 ${libDir} 存储libcurl-impersonate库文件`);
        
        // 检查库是否已下载
        const soFileName = arch.so_name;
        const soFilePath = path.join(libDir, soFileName);
        const soFileExists = fs.existsSync(soFilePath);
        
        if (soFileExists) {
            console.log(`${soFileName} 文件已下载到 ${soFilePath}`);
            return;
        }
        
        // 临时目录用于下载和解压
        const tempDir = path.join(os.tmpdir(), 'koffi-curl-tmp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // 临时解压目录，用于存放解压后的文件，之后再移动到最终位置
        const extractDir = path.join(tempDir, `extract-${Date.now()}`);
        if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
        }
        
        const tarballName = path.join(tempDir, 'libcurl-impersonate.tar.gz');
        let sysname = arch.system === 'Linux' ? `linux-${arch.libc}` : arch.sysname;
        const url = `https://github.com/lexiforest/curl-impersonate/releases/download/v${CURL_VERSION}/libcurl-impersonate-v${CURL_VERSION}.${arch.so_arch}-${sysname}.tar.gz`;
        
        console.log(`从 ${url} 下载libcurl-impersonate到临时目录 ${tempDir}...`);
        await downloadFile(url, tarballName);
        
        console.log(`解压下载的文件到临时目录 ${extractDir}...`);
        await extractTarGz(tarballName, extractDir);
        
        // 将文件移动到最终位置
        moveFiles(arch, extractDir);
        
        // 更新arch配置中的libdir为新的统一库目录
        arch.libdir = libDir;
        
        console.log('下载和配置完成！');
        console.log('库目录文件列表:');
        console.log(fs.readdirSync(libDir).join('\n'));
        
        // 清理临时文件
        fs.unlink(tarballName, (err) => {
            if (err) console.error(`清理临时文件失败: ${err.message}`);
            else console.log(`已清理临时文件: ${tarballName}`);
        });
        
        // 清理临时解压目录
        fs.rm(extractDir, { recursive: true, force: true }, (err) => {
            if (err) console.error(`清理临时解压目录失败: ${err.message}`);
            else console.log(`已清理临时解压目录: ${extractDir}`);
        });
        
    } catch (error) {
        console.error('下载和配置失败:', error);
        process.exit(1);
    }
}

// 运行主函数
main();
