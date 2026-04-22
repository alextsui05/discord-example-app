import { capitalize, getRandomEmoji, DiscordRequest } from "./utils.js";
import {
  ButtonStyleTypes,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
} from "discord-interactions";

export async function challengeResponse(body, activeGames) {
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

export function handleChallengeAccepted(body, env, ctx) {
  const componentId = body.data.custom_id;
  const gameId = componentId.replace("accept_button_", "");
  const response = new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
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

  async function deleteMessage() {
    const endpoint = `webhooks/${env.APP_ID}/${body.token}/messages/${body.message.id}`;
    await DiscordRequest(endpoint, { method: "DELETE" });
  }
  ctx.waitUntil(deleteMessage());

  return response;
}

export async function handleChoiceSelected(body, env, ctx, activeGames) {
  // Interaction context
  const context = body.context;
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? body.member.user.id : body.user.id;

  const gameId = body.data.custom_id.replace("select_choice_", "");
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

export function getResult(p1, p2) {
  let gameResult;
  if (RPSChoices[p1.objectName] && RPSChoices[p1.objectName][p2.objectName]) {
    // o1 wins
    gameResult = {
      win: p1,
      lose: p2,
      verb: RPSChoices[p1.objectName][p2.objectName],
    };
  } else if (
    RPSChoices[p2.objectName] &&
    RPSChoices[p2.objectName][p1.objectName]
  ) {
    // o2 wins
    gameResult = {
      win: p2,
      lose: p1,
      verb: RPSChoices[p2.objectName][p1.objectName],
    };
  } else {
    // tie -- win/lose don't
    gameResult = { win: p1, lose: p2, verb: "tie" };
  }

  return formatResult(gameResult);
}

function formatResult(result) {
  const { win, lose, verb } = result;
  return verb === "tie"
    ? `<@${win.id}> and <@${lose.id}> draw with **${win.objectName}**`
    : `<@${win.id}>'s **${win.objectName}** ${verb} <@${lose.id}>'s **${lose.objectName}**`;
}

// this is just to figure out winner + verb
const RPSChoices = {
  rock: {
    description: "sedimentary, igneous, or perhaps even metamorphic",
    virus: "outwaits",
    computer: "smashes",
    scissors: "crushes",
  },
  cowboy: {
    description: "yeehaw~",
    scissors: "puts away",
    wumpus: "lassos",
    rock: "steel-toe kicks",
  },
  scissors: {
    description: "careful ! sharp ! edges !!",
    paper: "cuts",
    computer: "cuts cord of",
    virus: "cuts DNA of",
  },
  virus: {
    description: "genetic mutation, malware, or something inbetween",
    cowboy: "infects",
    computer: "corrupts",
    wumpus: "infects",
  },
  computer: {
    description: "beep boop beep bzzrrhggggg",
    cowboy: "overwhelms",
    paper: "uninstalls firmware for",
    wumpus: "deletes assets for",
  },
  wumpus: {
    description: "the purple Discord fella",
    paper: "draws picture on",
    rock: "paints cute face on",
    scissors: "admires own reflection in",
  },
  paper: {
    description: "versatile and iconic",
    virus: "ignores",
    cowboy: "gives papercut to",
    rock: "covers",
  },
};

export function getRPSChoices() {
  return Object.keys(RPSChoices);
}

// Function to fetch shuffled options for select menu
export function getShuffledOptions() {
  const allChoices = getRPSChoices();
  const options = [];

  for (let c of allChoices) {
    // Formatted for select menus
    // https://discord.com/developers/docs/components/reference#string-select-select-option-structure
    options.push({
      label: capitalize(c),
      value: c.toLowerCase(),
      description: RPSChoices[c]["description"],
    });
  }

  return options.sort(() => Math.random() - 0.5);
}
