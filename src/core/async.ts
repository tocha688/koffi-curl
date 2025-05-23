import { Request, RequestOptions, Response } from './request';
import { Worker } from 'worker_threads';
import * as path from 'path';

/**
 * 异步请求池配置
 */
export interface AsyncPoolOptions {
  maxConcurrency?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * 异步请求任务
 */
interface AsyncTask {
  id: string;
  options: RequestOptions;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  attempts: number;
  startTime: number;
}

/**
 * 异步请求池
 */
export class AsyncRequestPool {
  private tasks: Map<string, AsyncTask> = new Map();
  private queue: AsyncTask[] = [];
  private running: Set<string> = new Set();
  private workers: Worker[] = [];
  private nextTaskId = 1;
  
  private options: Required<AsyncPoolOptions> = {
    maxConcurrency: 10,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  };

  constructor(options: AsyncPoolOptions = {}) {
    this.options = { ...this.options, ...options };
    this.initWorkers();
  }

  /**
   * 初始化工作线程
   */
  private initWorkers(): void {
    // 注意：这里需要创建一个worker文件来处理实际的请求
    // 由于koffi不支持worker threads，我们使用Promise包装同步操作
  }

  /**
   * 添加异步请求任务
   */
  async request(options: RequestOptions): Promise<Response> {
    return new Promise((resolve, reject) => {
      const taskId = `task_${this.nextTaskId++}`;
      const task: AsyncTask = {
        id: taskId,
        options,
        resolve,
        reject,
        attempts: 0,
        startTime: Date.now()
      };

      this.tasks.set(taskId, task);
      this.queue.push(task);
      this.processQueue();
    });
  }

  /**
   * 处理队列中的任务
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.running.size < this.options.maxConcurrency) {
      const task = this.queue.shift()!;
      this.running.add(task.id);
      
      // 使用setImmediate确保异步执行
      setImmediate(() => this.executeTask(task));
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: AsyncTask): Promise<void> {
    try {
      task.attempts++;
      
      // 检查超时
      const elapsed = Date.now() - task.startTime;
      if (elapsed > this.options.timeout) {
        throw new Error(`请求超时 (${elapsed}ms)`);
      }

      // 创建新的Request实例来执行请求
      const request = new Request();
      
      try {
        const response = await request.request(task.options);
        task.resolve(response);
        this.completeTask(task.id);
      } finally {
        request.close();
      }

    } catch (error) {
      await this.handleTaskError(task, error as Error);
    }
  }

  /**
   * 处理任务错误
   */
  private async handleTaskError(task: AsyncTask, error: Error): Promise<void> {
    if (task.attempts < this.options.retryAttempts) {
      // 重试逻辑
      console.log(`任务 ${task.id} 失败，${this.options.retryDelay}ms后重试 (${task.attempts}/${this.options.retryAttempts})`);
      
      setTimeout(() => {
        this.queue.unshift(task); // 重新加入队列前端
        this.running.delete(task.id);
        this.processQueue();
      }, this.options.retryDelay);
    } else {
      // 达到最大重试次数，失败
      task.reject(error);
      this.completeTask(task.id);
    }
  }

  /**
   * 完成任务
   */
  private completeTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.running.delete(taskId);
    this.processQueue(); // 继续处理队列
  }

  /**
   * 批量执行请求
   */
  async batch(requests: RequestOptions[]): Promise<Response[]> {
    const promises = requests.map(options => this.request(options));
    return Promise.all(promises);
  }

  /**
   * 关闭池并清理资源
   */
  async close(): Promise<void> {
    // 等待所有任务完成
    while (this.running.size > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 清理worker线程
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
  }

  /**
   * 获取池状态
   */
  getStatus(): { running: number; queued: number; total: number } {
    return {
      running: this.running.size,
      queued: this.queue.length,
      total: this.tasks.size
    };
  }
}

/**
 * 全局异步请求池实例
 */
let globalPool: AsyncRequestPool | null = null;

/**
 * 获取或创建全局异步池
 */
export function getGlobalPool(options?: AsyncPoolOptions): AsyncRequestPool {
  if (!globalPool) {
    globalPool = new AsyncRequestPool(options);
  }
  return globalPool;
}

/**
 * 异步请求方法
 */
export async function asyncRequest(options: RequestOptions): Promise<Response> {
  const pool = getGlobalPool();
  return pool.request(options);
}

/**
 * 异步 GET 请求
 */
export async function asyncGet(url: string, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return asyncRequest({ ...options, url, method: 'GET' });
}

/**
 * 异步 POST 请求
 */
export async function asyncPost(url: string, data?: any, options: Omit<RequestOptions, 'url' | 'method'> = {}): Promise<Response> {
  return asyncRequest({ ...options, url, method: 'POST', data });
}

/**
 * 批量异步请求
 */
export async function asyncBatch(requests: RequestOptions[]): Promise<Response[]> {
  const pool = getGlobalPool();
  return pool.batch(requests);
}
