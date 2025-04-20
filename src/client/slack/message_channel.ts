import { App } from "@slack/bolt";
import { KnownBlock } from "@slack/types";
import {
  AgentMessageChannel,
  OnArtifactUpdate,
  OnStatusUpdate,
  UserMessage,
} from "../message_channel";
import { FilePart } from "../../schema";
import { A2AClient } from "../client";

type MessageContext = {
  channel: string;
  threadTs: string;
};

const handleFile = async (
  slack: App,
  userMessage: UserMessage<MessageContext>,
  parts: FilePart[]
): Promise<{
  blocks: KnownBlock[];
  uploads: (() => Promise<void>)[];
}> => {
  const blocks: KnownBlock[] = [];
  const uploads: (() => Promise<void>)[] = [];

  for (const part of parts) {
    if (part.file.uri) {
      if (part.file.mimeType?.startsWith("image/")) {
        blocks.push({
          type: "image",
          image_url: part.file.uri,
          alt_text: part.file.name ?? "image",
        });
      } else {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: part.file.uri,
          },
        });
      }
    } else if (part.file.bytes) {
      const bytes = part.file.bytes;
      uploads.push(async () => {
        const upload = await slack.client.filesUploadV2({
          channels: userMessage.context.channel,
          thread_ts: userMessage.context.threadTs,
          file: Buffer.from(bytes, "base64"),
          filename: part.file.name ?? "file",
        });

        // wait 5s for upload to complete
        await new Promise((resolve) => setTimeout(resolve, 5000));
      });
    }
  }

  return { blocks, uploads };
};

const onStatusUpdate =
  (slack: App): OnStatusUpdate<MessageContext> =>
  async (userMessage, event) => {
    const agentMessage = event.status.message;
    for (const part of agentMessage?.parts ?? []) {
      switch (part.type) {
        case "text": {
          await slack.client.chat.postMessage({
            text: part.text,
            channel: userMessage.context.channel,
            thread_ts: userMessage.context.threadTs,
          });
          break;
        }

        case "data": {
          const text = "```\n" + JSON.stringify(part.data, null, 2) + "\n```";

          await slack.client.chat.postMessage({
            text,
            channel: userMessage.context.channel,
            thread_ts: userMessage.context.threadTs,
          });
          break;
        }

        case "file": {
          const { blocks, uploads } = await handleFile(slack, userMessage, [
            part,
          ]);
          if (blocks.length > 0) {
            await slack.client.chat.postMessage({
              blocks,
              channel: userMessage.context.channel,
              thread_ts: userMessage.context.threadTs,
            });
          }
          for (const upload of uploads) {
            await upload();
          }
          break;
        }

        default: {
          throw new Error("Invalid part type");
        }
      }
    }
  };

const onArtifactUpdate =
  (slack: App): OnArtifactUpdate<MessageContext> =>
  async (userMessage, event) => {
    const artifact = event.artifact;

    const blocks: KnownBlock[] = [];
    const uploads: (() => Promise<void>)[] = [];

    if (artifact.name) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${artifact.name}*\n${artifact.description ?? ""}`,
        },
      });
    }

    const fileParts = (artifact.parts ?? []).map((part): FilePart => {
      switch (part.type) {
        case "text": {
          return {
            type: "file",
            file: {
              name: "text",
              bytes: Buffer.from(part.text).toString("base64"),
              mimeType: "text/plain",
            },
          };
        }

        case "data": {
          return {
            type: "file",
            file: {
              name: "data",
              bytes: Buffer.from(JSON.stringify(part.data)).toString("base64"),
              mimeType: "application/json",
            },
          };
        }

        case "file": {
          return part;
        }

        default: {
          throw new Error("Invalid part type");
        }
      }
    });

    const { blocks: fileBlocks, uploads: fileUploads } = await handleFile(
      slack,
      userMessage,
      fileParts
    );
    blocks.push(...fileBlocks);
    uploads.push(...fileUploads);

    await slack.client.chat.postMessage({
      text: artifact.name ?? "artifact",
      blocks,
      channel: userMessage.context.channel,
      thread_ts: userMessage.context.threadTs,
    });

    for (const upload of uploads) {
      await upload();
    }
  };

export const defaultSlackMessageChannel = (agentUrl: string, slack: App) =>
  new AgentMessageChannel<MessageContext>(
    new A2AClient(agentUrl),
    onStatusUpdate(slack),
    onArtifactUpdate(slack)
  );
