import {
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
} from "discord-interactions";
import { getRandomEmoji } from "../utils.js";

export default function testResponse(body) {
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
