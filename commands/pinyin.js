import {
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
} from "discord-interactions";
import { DiscordRequest } from "../utils.js";

export async function pinyinResponse(trad, jyutping, body, env) {
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

export async function processPinyinMessage(text, url, token, appId) {
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
