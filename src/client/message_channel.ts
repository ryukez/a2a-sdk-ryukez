import * as schema from "../schema.js";
import { A2AClient } from "./client.js";
import AsyncLock from "async-lock";

export type UserMessage<C> = {
  taskId: string;
  sessionId: string;
  parts: schema.Part[];
  context: C;
};

export type OnStatusUpdate<C> = (
  userMessage: UserMessage<C>,
  event: schema.TaskStatusUpdateEvent
) => Promise<void>;

export type OnArtifactUpdate<C> = (
  userMessage: UserMessage<C>,
  event: schema.TaskArtifactUpdateEvent
) => Promise<void>;

class Queue<T> {
  private queue: T[] = [];
  private lock = new AsyncLock();

  constructor(private readonly processItem: (item: T) => Promise<void>) {}

  async add(item: T): Promise<void> {
    this.queue.push(item);
    await this.process();
  }

  private async process(): Promise<void> {
    await this.lock.acquire("processing", async () => {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;

        try {
          await this.processItem(item);
          break;
        } catch (error) {
          console.error(`Item processing failed:`, item);
        }
      }
    });
  }
}

export class AgentMessageChannel<C> {
  private queue: Queue<UserMessage<C>>;

  constructor(
    private readonly agentClient: A2AClient,
    private onStatusUpdate: OnStatusUpdate<C>,
    private onArtifactUpdate: OnArtifactUpdate<C>
  ) {
    this.queue = new Queue(this.processMessage.bind(this));
  }

  private async processMessage(userMessage: UserMessage<C>): Promise<void> {
    const params: schema.TaskSendParams = {
      id: userMessage.taskId,
      sessionId: userMessage.sessionId,
      message: {
        role: "user",
        parts: userMessage.parts,
      },
    };

    const stream: AsyncIterable<
      | schema.TaskStatusUpdateEvent
      | schema.TaskArtifactUpdateEvent
      | null
      | undefined
    > = this.agentClient.sendTaskSubscribe(params);

    for await (const event of stream) {
      if (!event) continue;
      if ("status" in event) await this.onStatusUpdate(userMessage, event);
      if ("artifact" in event) await this.onArtifactUpdate(userMessage, event);
    }
  }

  userMessage(message: UserMessage<C>): Promise<void> {
    return this.queue.add(message);
  }
}
