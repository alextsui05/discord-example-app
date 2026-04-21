import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
} from "discord-interactions";
import { getRandomEmoji, DiscordRequest } from "./utils.js";
import { getShuffledOptions, getResult } from "./game.js";
import nacl from "tweetnacl";
import { DurableObject } from "cloudflare:workers";

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

function testResponse(body) {
  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            // Fetches a random emoji to send from a helper function
            content: `hello world ${getRandomEmoji()}`,
          },
        ],
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function pinyinResponse(trad, jyutping, body, env) {
  const inputOptions = Object.fromEntries(
    body.data.options.map((option) => [option.name, option.value]),
  );
  const options = {
    q: inputOptions.text,
  };
  if (trad) {
    options.trad = true;
  }
  if (jyutping) {
    options.jyutping = true;
  }
  const urlOptions = new URLSearchParams(options);
  await env.PINYIN_LOOKUPS.send({
    type: "pinyin",
    data: {
      text: inputOptions.text,
      url: `https://pinyin-api.atsui.click/furigana/hello?${urlOptions.toString()}`,
      token: body.token,
    },
  });

  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags:
          InteractionResponseFlags.IS_COMPONENTS_V2 |
          InteractionResponseFlags.EPHEMERAL,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: `Processing, give it a few seconds...\n\`${inputOptions.text}\``,
          },
        ],
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function postMessage(text, url, token, appId) {
  const response = await fetch(url);
  const pngBlob = await response.blob();

  const formData = new FormData();
  const payload = {
    content: `\`\`\`${text}\`\`\``,
    attachments: [
      {
        filename: "image.png",
        id: 0,
      },
    ],
  };
  formData.append("payload_json", JSON.stringify(payload));
  formData.append("files[0]", pngBlob, "image.png");

  const endpoint = `https://discord.com/api/v10/webhooks/${appId}/${token}`;
  await fetch(endpoint, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "User-Agent":
        "DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)",
    },
  });
  // delete original message
  const deleteEndpoint = `webhooks/${appId}/${token}/messages/@original`;
  await DiscordRequest(deleteEndpoint, { method: "DELETE" });
}

export default {
  async fetch(req, env, ctx) {
    const rawBody = await req.text();

    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const isVerified = nacl.sign.detached.verify(
      Buffer.from(`${timestamp}` + rawBody),
      Buffer.from(signature, "hex"),
      Buffer.from(env.PUBLIC_KEY, "hex"),
    );

    if (!isVerified) {
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { id, type, data } = body;
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
      const { name } = data;

      // "test" command
      switch (name) {
        case "test":
          // Send a message into the channel where command was triggered from
          return testResponse(body);
        case "challenge":
          return handleChallenge(body, activeGames);
        case "pinyin":
          return await pinyinResponse(false, false, body, env);
        case "jyutping":
          return await pinyinResponse(true, true, body, env);
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

    if (type === InteractionType.MESSAGE_COMPONENT) {
      return handleComponent(body, env, ctx, activeGames);
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
      if (message.body.type === "pinyin") {
        await postMessage(
          message.body.data.text,
          message.body.data.url,
          message.body.data.token,
          env.APP_ID,
        );
      }
    }
  },
};

async function handleChallenge(body, activeGames) {
  const id = body.id;

  // Interaction context
  const context = body.context;
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? body.member.user.id : body.user.id;

  // TODO: Store user's object choice
  const objectName = body.data.options[0].value;

  await activeGames.setGame(id, {
    id: userId,
    objectName,
  });

  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            // Fetches a random emoji to send from a helper function
            content: `Rock papers scissors challenge from <@${userId}>`,
          },
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                type: MessageComponentTypes.BUTTON,
                // Append the game ID to use later on
                custom_id: `accept_button_${id}`,
                label: "Accept",
                style: ButtonStyleTypes.PRIMARY,
              },
            ],
          },
        ],
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function handleComponent(body, env, ctx, activeGames) {
  // custom_id set in payload when sending message component
  const componentId = body.data.custom_id;
  // Interaction context
  const context = body.context;
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? body.member.user.id : body.user.id;
  if (componentId.startsWith("accept_button_")) {
    // get the associated game ID
    const gameId = componentId.replace("accept_button_", "");
    const response = new Response(
      JSON.stringify({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Indicates it'll be an ephemeral message
          flags:
            InteractionResponseFlags.EPHEMERAL |
            InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: "What is your object of choice?",
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.STRING_SELECT,
                  // Append game ID
                  custom_id: `select_choice_${gameId}`,
                  options: getShuffledOptions(),
                },
              ],
            },
          ],
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    // Delete message with token in request body
    async function deleteMessage() {
      const endpoint = `webhooks/${env.APP_ID}/${body.token}/messages/${body.message.id}`;
      await DiscordRequest(endpoint, { method: "DELETE" });
    }
    ctx.waitUntil(deleteMessage());

    return response;
  } else if (componentId.startsWith("select_choice_")) {
    const gameId = componentId.replace("select_choice_", "");
    const game = await activeGames.getGame(gameId);
    if (!game) {
      return new Response(JSON.stringify({}));
    }

    ctx.waitUntil(activeGames.deleteGame(gameId));

    async function updateMessage() {
      const endpoint = `webhooks/${env.APP_ID}/${body.token}/messages/${body.message.id}`;
      return await DiscordRequest(endpoint, {
        method: "PATCH",
        body: {
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: `Nice choice. ${getRandomEmoji()}`,
            },
          ],
        },
      });
    }
    ctx.waitUntil(updateMessage());

    const resultStr = getResult(game, {
      id: userId,
      objectName: body.data.values[0],
    });

    return new Response(
      JSON.stringify({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: resultStr,
            },
          ],
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  return new Response(JSON.stringify({ error: "Unknown component ID" }), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 400,
  });
}
