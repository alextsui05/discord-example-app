import {
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
} from "discord-interactions";
import { DiscordRequest } from "../utils.js";

export async function cangjieResponse(body, env) {
  const inputOptions = Object.fromEntries(
    body.data.options.map((option) => [option.name, option.value]),
  );
  const options = {
    q: inputOptions.text,
  };
  const urlOptions = new URLSearchParams(options);

  await env.PINYIN_LOOKUPS.send({
    type: "cangjie",
    data: {
      text: inputOptions.text,
      url: `https://cangjie-lookup.alextsui05.workers.dev/?${urlOptions.toString()}`,
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

export async function processCangjieMessage(text, url, token, appId) {
  const response = await fetch(url);
  const data = await response.json();
  const contents = [`# ${text}\n`];
  for (const item of data) {
    contents.push(`**${item["char"]}** ${item.cangjie}`);
    // contents.push(`${JSON.stringify(item)}`);
  }

  const endpoint = `https://discord.com/api/v10/webhooks/${appId}/${token}`;
  const formData = new FormData();
  const payload = {
    content: contents.join("\n"),
  };
  formData.append("payload_json", JSON.stringify(payload));
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
