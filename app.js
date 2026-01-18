import 'dotenv/config';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import nacl from 'tweetnacl';
import { DurableObject } from 'cloudflare:workers';

// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

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

function testResponse() {
  return new Response(JSON.stringify({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          // Fetches a random emoji to send from a helper function
          content: `hello world ${getRandomEmoji()}`
        }
      ]
    },
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

export default {
  async fetch(req, env, ctx) {
    const rawBody = await req.text();

    const signature = req.headers.get('x-signature-ed25519');
    const timestamp = req.headers.get('x-signature-timestamp');
    const isVerified = nacl.sign.detached.verify(
      Buffer.from(`${timestamp}` + rawBody),
      Buffer.from(signature, 'hex'),
      Buffer.from(env.PUBLIC_KEY, 'hex')
    );

    if (!isVerified) {
      return new Response('Invalid signature', { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { id, type, data } = body;
    const activeGames = env.ACTIVE_GAMES.getByName('activeGames');

    /**
     * Handle ping requests
     * See https://discord.com/developers/docs/interactions/application-commands#interaction-object-interaction-structure
     */
    if (type === InteractionType.PING) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }));
    }

    /**
     * Handle slash command requests
     * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name } = data;

      // "test" command
      if (name === 'test') {
        // Send a message into the channel where command was triggered from
        return testResponse();
      } else if (name === 'challenge') {
        return handleChallenge(body, activeGames);
      } else {
        console.error(`unknown command: ${name}`);
        return new Response(JSON.stringify({ error: 'unknown command' }), {
          headers: {
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
    }

    if (type === InteractionType.MESSAGE_COMPONENT) {
      return handleComponent(body, env, ctx, activeGames);
    }

    return new Response(JSON.stringify({ error: 'Unknown interaction type' }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
}

async function handleChallenge(body, activeGames) {
  const id = body.id;

  // Interaction context
  const context = body.context;
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? body.member.user.id : body.user.id;

  // TODO: Store user's object choice
  const objectName = body.data.options[0].value;

  activeGames.setGame(id, {
    id: userId,
    objectName,
  });

  return new Response(JSON.stringify({
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
              label: 'Accept',
              style: ButtonStyleTypes.PRIMARY,
            },
          ],
        },
      ],
    },
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function handleComponent(body, env, ctx, activeGames) {
  // custom_id set in payload when sending message component
  const componentId = body.data.custom_id;
  // Interaction context
  const context = body.context;
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? body.member.user.id : body.user.id;

  if (componentId.startsWith('accept_button_')) {
    // get the associated game ID
    const gameId = componentId.replace('accept_button_', '');
    const response = new Response(JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        // Indicates it'll be an ephemeral message
        flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: 'What is your object of choice?',
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
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Delete message with token in request body
    async function deleteMessage() {
      const endpoint = `webhooks/${env.APP_ID}/${body.token}/messages/${body.message.id}`;
      await DiscordRequest(endpoint, { method: 'DELETE' });
    }
    ctx.waitUntil(deleteMessage());

    return response;
  } else if (componentId.startsWith('select_choice_')) {
    const gameId = componentId.replace('select_choice_', '');
    const game = await activeGames.getGame(gameId);
    if (!game) {
      return new Response(JSON.stringify({}));
    }


    await activeGames.deleteGame(gameId);

    async function updateMessage() {
      const endpoint = `webhooks/${env.APP_ID}/${body.token}/messages/${body.message.id}`;
      return await DiscordRequest(endpoint, {
        method: 'PATCH',
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

    return new Response(JSON.stringify({
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
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown component ID' }), {
    headers: {
      'Content-Type': 'application/json'
    },
    status: 400
  });
}