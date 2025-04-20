import Redis from "ioredis";
import { TaskAndHistory } from "./store";
import { A2AError } from "./error";

export interface RedisStoreOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
}

export class RedisStore {
  private redis: Redis;
  private keyPrefix: string;

  constructor(options: RedisStoreOptions = {}) {
    const {
      host = "localhost",
      port = 6379,
      username,
      password,
      db = 0,
      keyPrefix = "a2a:",
      tls = process.env.REDIS_TLS === "true",
    } = options;

    this.keyPrefix = keyPrefix;
    this.redis = new Redis({
      host,
      port,
      username,
      password,
      db,
      tls: tls ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on("error", (error) => {
      console.error("Redis connection error:", error);
    });
  }

  private getTaskKey(taskId: string): string {
    return `${this.keyPrefix}task:${taskId}`;
  }

  private getHistoryKey(taskId: string): string {
    return `${this.keyPrefix}history:${taskId}`;
  }

  async load(taskId: string): Promise<TaskAndHistory | null> {
    try {
      const [taskData, historyData] = await Promise.all([
        this.redis.get(this.getTaskKey(taskId)),
        this.redis.get(this.getHistoryKey(taskId)),
      ]);

      if (!taskData) {
        return null;
      }

      const task = JSON.parse(taskData);
      const history = historyData ? JSON.parse(historyData) : [];

      return { task, history };
    } catch (error: any) {
      throw A2AError.internalError(
        `Failed to load task ${taskId}: ${error.message}`,
        error
      );
    }
  }

  async save(data: TaskAndHistory): Promise<void> {
    try {
      const { task, history } = data;
      const taskKey = this.getTaskKey(task.id);
      const historyKey = this.getHistoryKey(task.id);

      await Promise.all([
        this.redis.set(taskKey, JSON.stringify(task)),
        this.redis.set(historyKey, JSON.stringify(history)),
      ]);
    } catch (error: any) {
      throw A2AError.internalError(
        `Failed to save task ${data.task.id}: ${error.message}`,
        error
      );
    }
  }

  async delete(taskId: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(this.getTaskKey(taskId)),
        this.redis.del(this.getHistoryKey(taskId)),
      ]);
    } catch (error: any) {
      throw A2AError.internalError(
        `Failed to delete task ${taskId}: ${error.message}`,
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
