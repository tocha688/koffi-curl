import { Curl } from './curl';
import { constants } from '../bindings';
import { EventEmitter } from 'events';

/**
 * WebSocket消息类型
 */
export enum WsMessageType {
  TEXT = 0x1,
  BINARY = 0x2,
  CLOSE = 0x8,
  PING = 0x9,
  PONG = 0xa
}

/**
 * WebSocket选项
 */
export interface WebSocketOptions {
  headers?: { [key: string]: string };
  protocols?: string[];
  timeout?: number;
  pingInterval?: number;
  pongTimeout?: number;
}

/**
 * WebSocket消息
 */
export interface WsMessage {
  type: WsMessageType;
  data: Buffer;
  text?: string;
}

/**
 * WebSocket客户端
 */
export class WebSocket extends EventEmitter {
  private curl: Curl;
  private connected = false;
  private closing = false;
  private pingTimer?: NodeJS.Timeout;
  private pongTimer?: NodeJS.Timeout;
  
  private options: Required<WebSocketOptions> = {
    headers: {},
    protocols: [],
    timeout: 30000,
    pingInterval: 30000,
    pongTimeout: 5000
  };

  constructor(url: string, options: WebSocketOptions = {}) {
    super();
    this.options = { ...this.options, ...options };
    this.curl = new Curl();
    this.setupCurl(url);
  }

  /**
   * 设置CURL选项
   */
  private setupCurl(url: string): void {
    // 设置WebSocket URL (ws:// -> http://, wss:// -> https://)
    const httpUrl = url.replace(/^ws/, 'http');
    this.curl.setopt(constants.CurlOpt.URL, httpUrl);

    // 设置WebSocket升级头
    const headers = [
      'Connection: Upgrade',
      'Upgrade: websocket',
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: ' + this.generateWebSocketKey(),
      ...Object.entries(this.options.headers).map(([k, v]) => `${k}: ${v}`)
    ];

    if (this.options.protocols.length > 0) {
      headers.push('Sec-WebSocket-Protocol: ' + this.options.protocols.join(', '));
    }

    this.curl.setopt(constants.CurlOpt.HTTPHEADER, headers);

    // 设置超时
    this.curl.setopt(constants.CurlOpt.TIMEOUT, Math.floor(this.options.timeout / 1000));

    // 设置回调处理WebSocket数据
    this.curl.setopt(constants.CurlOpt.WRITEFUNCTION, (data: Buffer) => {
      this.handleWebSocketData(data);
      return data.length;
    });
  }

  /**
   * 生成WebSocket密钥
   */
  private generateWebSocketKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < 22; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result + '==';
  }

  /**
   * 连接WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const resultCode = this.curl.perform();
        
        if (resultCode !== 0) {
          reject(new Error(`WebSocket连接失败: ${Curl.strerror(resultCode)}`));
          return;
        }

        const responseCode = this.curl.getinfo(constants.CurlInfo.RESPONSE_CODE);
        
        if (responseCode === 101) {
          this.connected = true;
          this.startPingInterval();
          this.emit('open');
          resolve();
        } else {
          reject(new Error(`WebSocket握手失败，HTTP状态码: ${responseCode}`));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 发送文本消息
   */
  async sendText(text: string): Promise<void> {
    const data = Buffer.from(text, 'utf8');
    return this.sendFrame(WsMessageType.TEXT, data);
  }

  /**
   * 发送二进制消息
   */
  async sendBinary(data: Buffer): Promise<void> {
    return this.sendFrame(WsMessageType.BINARY, data);
  }

  /**
   * 发送ping
   */
  async ping(data?: Buffer): Promise<void> {
    return this.sendFrame(WsMessageType.PING, data || Buffer.alloc(0));
  }

  /**
   * 发送pong
   */
  async pong(data?: Buffer): Promise<void> {
    return this.sendFrame(WsMessageType.PONG, data || Buffer.alloc(0));
  }

  /**
   * 发送WebSocket帧
   */
  private async sendFrame(opcode: WsMessageType, data: Buffer): Promise<void> {
    if (!this.connected) {
      throw new Error('WebSocket未连接');
    }

    // 构建WebSocket帧
    const frame = this.buildFrame(opcode, data);
    
    // 使用curl发送数据 (注意：这里需要libcurl的WebSocket支持)
    // 实际实现可能需要使用curl_ws_send函数
    try {
      // 这是一个简化的实现，实际需要使用libcurl的WebSocket API
      // const result = curl.curl_ws_send(this.curl.handle, frame, frame.length, ...);
      console.log(`发送WebSocket帧: opcode=${opcode}, length=${data.length}`);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 构建WebSocket帧
   */
  private buildFrame(opcode: WsMessageType, data: Buffer): Buffer {
    const mask = Buffer.from([
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
    ]);

    let headerLength = 2;
    let payloadLength = data.length;

    // 计算负载长度编码
    if (payloadLength < 126) {
      headerLength += 4; // mask
    } else if (payloadLength < 65536) {
      headerLength += 2 + 4; // extended length + mask
    } else {
      headerLength += 8 + 4; // extended length (64-bit) + mask
    }

    const frame = Buffer.alloc(headerLength + payloadLength);
    let offset = 0;

    // 第一字节：FIN + opcode
    frame[offset++] = 0x80 | (opcode & 0x0f);

    // 第二字节：MASK + payload length
    if (payloadLength < 126) {
      frame[offset++] = 0x80 | payloadLength;
    } else if (payloadLength < 65536) {
      frame[offset++] = 0x80 | 126;
      frame.writeUInt16BE(payloadLength, offset);
      offset += 2;
    } else {
      frame[offset++] = 0x80 | 127;
      frame.writeUInt32BE(0, offset); // 高32位
      frame.writeUInt32BE(payloadLength, offset + 4); // 低32位
      offset += 8;
    }

    // Mask
    mask.copy(frame, offset);
    offset += 4;

    // 负载数据（需要用mask进行异或）
    for (let i = 0; i < payloadLength; i++) {
      frame[offset + i] = data[i] ^ mask[i % 4];
    }

    return frame;
  }

  /**
   * 处理接收到的WebSocket数据
   */
  private handleWebSocketData(data: Buffer): void {
    // 解析WebSocket帧
    try {
      const message = this.parseFrame(data);
      if (message) {
        this.handleMessage(message);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 解析WebSocket帧
   */
  private parseFrame(data: Buffer): WsMessage | null {
    if (data.length < 2) return null;

    const firstByte = data[0];
    const secondByte = data[1];

    const fin = (firstByte & 0x80) === 0x80;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;

    let offset = 2;

    // 扩展负载长度
    if (payloadLength === 126) {
      if (data.length < offset + 2) return null;
      payloadLength = data.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (data.length < offset + 8) return null;
      // 简化处理，假设长度不超过32位
      payloadLength = data.readUInt32BE(offset + 4);
      offset += 8;
    }

    // Mask
    let mask: Buffer | null = null;
    if (masked) {
      if (data.length < offset + 4) return null;
      mask = data.slice(offset, offset + 4);
      offset += 4;
    }

    // 负载数据
    if (data.length < offset + payloadLength) return null;
    let payload = data.slice(offset, offset + payloadLength);

    // 解除mask
    if (mask) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    const message: WsMessage = {
      type: opcode as WsMessageType,
      data: payload
    };

    // 如果是文本消息，添加text字段
    if (opcode === WsMessageType.TEXT) {
      message.text = payload.toString('utf8');
    }

    return message;
  }

  /**
   * 处理消息
   */
  private handleMessage(message: WsMessage): void {
    switch (message.type) {
      case WsMessageType.TEXT:
        this.emit('message', message.text, message.type);
        break;
      case WsMessageType.BINARY:
        this.emit('message', message.data, message.type);
        break;
      case WsMessageType.PING:
        this.pong(message.data);
        this.emit('ping', message.data);
        break;
      case WsMessageType.PONG:
        this.handlePong();
        this.emit('pong', message.data);
        break;
      case WsMessageType.CLOSE:
        this.handleClose();
        break;
    }
  }

  /**
   * 处理pong响应
   */
  private handlePong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  /**
   * 处理关闭
   */
  private handleClose(): void {
    this.connected = false;
    this.stopPingInterval();
    this.emit('close');
  }

  /**
   * 开始ping间隔
   */
  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      if (this.connected && !this.closing) {
        this.ping().catch(err => this.emit('error', err));
        
        // 设置pong超时
        this.pongTimer = setTimeout(() => {
          this.emit('error', new Error('Pong超时'));
          this.close();
        }, this.options.pongTimeout);
      }
    }, this.options.pingInterval);
  }

  /**
   * 停止ping间隔
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  /**
   * 关闭WebSocket连接
   */
  async close(code = 1000, reason = ''): Promise<void> {
    if (!this.connected || this.closing) return;

    this.closing = true;
    
    // 发送关闭帧
    const reasonBuffer = Buffer.from(reason, 'utf8');
    const closeData = Buffer.alloc(2 + reasonBuffer.length);
    closeData.writeUInt16BE(code, 0);
    reasonBuffer.copy(closeData, 2);
    
    try {
      await this.sendFrame(WsMessageType.CLOSE, closeData);
    } catch (error) {
      // 忽略发送关闭帧的错误
    }

    this.connected = false;
    this.stopPingInterval();
    this.curl.close();
    this.emit('close');
  }

  /**
   * 获取连接状态
   */
  get readyState(): number {
    if (this.connected) return 1; // OPEN
    if (this.closing) return 2; // CLOSING
    return 3; // CLOSED
  }
}
