import { InteractionResponseType, InteractionType } from "discord-interactions";
import nacl from "tweetnacl";
import { DurableObject } from "cloudflare:workers";
import testResponse from "./commands/test.js";
import { pinyinResponse, processPinyinMessage } from "./commands/pinyin.js";
import { cangjieResponse } from "./commands/cangjie.js";
import {
  challengeResponse,
  handleChallengeAccepted,
  handleChoiceSelected,
} from "./game.js";

export default {
  async fetch(req, env, ctx) {
    const rawBody = await req.text();
    if (!verifySignature(rawBody, req, env)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { type } = body;
    const activeGames = env.ACTIVE_GAMES.getByName("activeGames");

    /**
     * Handle ping requests
     * See https://discord.com/developers/docs/interactions/application-commands#interaction-object-interaction-structure
     */
    if (type === InteractionType.PING) {
      return new Response(
        JSON.stringify({ type: InteractionResponseType.PONG }),
      );
    }

    /**
     * Handle slash command requests
     * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      return await handleSlashCommand(body, env, ctx, activeGames);
    }

    if (type === InteractionType.MESSAGE_COMPONENT) {
      return await handleComponentInteraction(body, env, ctx, activeGames);
    }

    return new Response(JSON.stringify({ error: "Unknown interaction type" }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 400,
    });
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      switch (message.body.type) {
        case "pinyin":
          await processPinyinMessage(
            message.body.data.text,
            message.body.data.url,
            message.body.data.token,
            env.APP_ID,
          );
          break;
        default:
          console.error(`unknown message type: ${message.body.type}`);
          break;
      }
    }
  },
};

function verifySignature(rawBody, req, env) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  return nacl.sign.detached.verify(
    Buffer.from(`${timestamp}` + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(env.PUBLIC_KEY, "hex"),
  );
}

async function handleSlashCommand(body, env, ctx, activeGames) {
  const { name } = body.data;

  // "test" command
  switch (name) {
    case "test":
      // Send a message into the channel where command was triggered from
      return await testResponse(body, env);
    case "challenge":
      return await challengeResponse(body, activeGames);
    case "pinyin":
      return await pinyinResponse(false, false, body, env);
    case "jyutping":
      return await pinyinResponse(true, true, body, env);
    case "cangjie":
      return await cangjieResponse(body, env);
    default:
      console.error(`unknown command: ${name}`);
      return new Response(JSON.stringify({ error: "unknown command" }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 400,
      });
  }
}

async function handleComponentInteraction(body, env, ctx, activeGames) {
  // custom_id set in payload when sending message component
  const componentId = body.data.custom_id;
  if (componentId.startsWith("accept_button_")) {
    return handleChallengeAccepted(body, env, ctx);
  } else if (componentId.startsWith("select_choice_")) {
    return await handleChoiceSelected(body, env, ctx, activeGames);
  }

  return new Response(JSON.stringify({ error: "Unknown component ID" }), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 400,
  });
}

export class GameDurableObject extends DurableObject {
  async getGame(id) {
    return await this.ctx.storage.get(id);
  }

  async setGame(id, game) {
    await this.ctx.storage.put(id, game);
  }

  async deleteGame(id) {
    await this.ctx.storage.delete(id);
  }
}
