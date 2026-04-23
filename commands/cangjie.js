import {
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
} from "discord-interactions";

export async function cangjieResponse(body, env) {
  const inputOptions = Object.fromEntries(
    body.data.options.map((option) => [option.name, option.value]),
  );
  const options = {
    q: inputOptions.text,
  };
  const urlOptions = new URLSearchParams(options);

  const lookup = await getCangjieLookupTable();

  const contents = [`# ${inputOptions.text}\n`];
  for (const char of inputOptions.text) {
    if (lookup[char]) {
      contents.push(`**${char}** ${mapToCangjie(lookup[char][0])}`);
    }
  }

  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: contents.join("\n"),
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

const cangjie_chars = {
  a: "日",
  b: "月",
  c: "金",
  d: "木",
  e: "水",
  f: "火",
  g: "土",
  h: "竹",
  i: "戈",
  j: "十",
  k: "大",
  l: "中",
  m: "一",
  n: "弓",
  o: "人",
  p: "心",
  q: "手",
  r: "口",
  s: "尸",
  t: "廿",
  u: "山",
  v: "女",
  w: "田",
  x: "難",
  y: "卜",
  z: "重",
};

const mapToCangjie = (s) => {
  return s
    .split("")
    .map((c) => cangjie_chars[c] || c)
    .join("");
};

async function getCangjieLookupTable() {
  const response = await fetch(
    "https://gaveta.atsui.click/cj5-tc-rev.v1.min.json.br",
  );
  return response.json();
}
