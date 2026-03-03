import "dotenv/config";
import { getRPSChoices } from "./game.js";
import { capitalize, InstallGlobalCommands } from "./utils.js";

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
const TEST_COMMAND = {
  name: "test",
  description: "Basic command",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Command containing options
const CHALLENGE_COMMAND = {
  name: "challenge",
  description: "Challenge to a match of rock paper scissors",
  options: [
    {
      type: 3,
      name: "object",
      description: "Pick your object",
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const PINYIN_COMMAND = {
  name: "pinyin",
  description: "Get pinyin for a snippet of Chinese",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      type: 3,
      name: "text",
      description: "Text to get pinyin for",
      required: true,
    },
  ],
};

const JYUTPING_COMMAND = {
  name: "jyutping",
  description: "Get jyutping for a snippet of Chinese",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      type: 3,
      name: "text",
      description: "Text to get jyutping for",
      required: true,
    },
  ],
};

const ALL_COMMANDS = [
  TEST_COMMAND,
  CHALLENGE_COMMAND,
  PINYIN_COMMAND,
  JYUTPING_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
