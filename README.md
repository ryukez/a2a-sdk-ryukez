# A2A SDK

A2A (Agent-to-Agent) SDK sample for Node.js, copied from https://github.com/google/A2A.
This project is licensed under the same terms as the original repository.

## Install

```bash
npm install @ryukez/a2a-sdk@0.4.6
```

## Usage

### Server

```ts
import {
  schema,
  TaskContext,
  TaskYieldUpdate,
  A2AServer,
} from "@ryukez/a2a-sdk";

async function* agent({
  task,
  history,
}: TaskContext): AsyncGenerator<TaskYieldUpdate, schema.Task | void, unknown> {
  // Artifact
  yield {
    name: "python_code",
    parts: [
      {
        type: "text",
        text: `
if __name__ == "__main__":
    print("Hello, World!")
`,
      },
    ],
  };

  // Status Update
  yield {
    state: "completed",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Task Complete!" }],
    },
  };
}

const agentCard: schema.AgentCard = {
  name: "Python Agent",
  description: "An agent that executes Python code",
  url: "http://localhost:41241",
  version: "0.0.1",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  authentication: null,
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  skills: [
    {
      id: "python_code",
      name: "Python Code",
      description: "Executes Python code",
      tags: ["python", "code", "execution"],
      examples: ["I want to print 'Hello, World!' using Python"],
    },
  ],
};

const server = new A2AServer(agent, {
  card: agentCard,
});

server.start(); // Default port 41241
```

### Client (slack)

```ts
import { App } from "@slack/bolt";
import { A2AClient } from "@ryukez/a2a-sdk";
import { defaultSlackMessageChannel } from "@ryukez/a2a-sdk/client/slack";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
});

const agentClient = new A2AClient(process.env.AGENT_URL!);
const agentMessageChannel = defaultSlackMessageChannel(agentClient, app);

// mention
app.event("app_mention", async ({ event }) => {
  const threadTs = event.thread_ts || event.ts;

  agentMessageChannel.userMessage({
    taskId: threadTs,
    sessionId: threadTs,
    parts: [{ type: "text", text: event.text }],
    context: { channel: event.channel, threadTs },
  });
});

(async () => {
  await app.start();
  console.log("⚡️ Bolt app is running!");
})();
```
