# Getting Started app for Discord (Cloudflare Worker version)

This project contains a basic rock-paper-scissors-style Discord app written in JavaScript and run in Cloudflare Workers, based on the [getting started guide](https://discord.com/developers/docs/getting-started).

The tutorial has you run your Discord app locally and expose it to the net with ngrok so you can use it to handle interactions from Discord.
However, ngrok is not a permanent solution, and you'll need to use a permanent solution for production.
One option is to use Cloudflare Workers, a serverless platform with a generous free tier that is perfect for small projects like this one.
See deployment notes on the bottom of this file for more information.

![Demo of app](https://github.com/discord/discord-example-app/raw/main/assets/getting-started-demo.gif?raw=true)

## Project structure
Below is a basic overview of the project structure:

```
├── examples    -> short, feature-specific sample apps
│   ├── app.js  -> finished app.js code
│   ├── button.js
│   ├── command.js
│   ├── modal.js
│   ├── selectMenu.js
├── .env.sample -> sample .env file
├── app.js      -> main entrypoint for app
├── commands.js -> slash command payloads + helpers
├── game.js     -> logic specific to RPS
├── utils.js    -> utility functions and enums
├── package.json
├── README.md
└── .gitignore
```

## Running app locally

Before you start, you'll need to install [NodeJS](https://nodejs.org/en/download/) and [create a Discord app](https://discord.com/developers/applications) with the proper permissions:
- `applications.commands`
- `bot` (with Send Messages enabled)


Configuring the app is covered in detail in the [getting started guide](https://discord.com/developers/docs/getting-started).

### Setup project

First clone the project:
```
git clone https://github.com/discord/discord-example-app.git
```

Then navigate to its directory and install dependencies:
```
cd discord-example-app
npm install
```
### Get app credentials

Fetch the credentials from your app's settings and add them to a `.env` file (see `.env.sample` for an example). You'll need your app ID (`APP_ID`), bot token (`DISCORD_TOKEN`), and public key (`PUBLIC_KEY`).

Fetching credentials is covered in detail in the [getting started guide](https://discord.com/developers/docs/getting-started).

> 🔑 Environment variables can be added to the `.env` file in Glitch or when developing locally, and in the Secrets tab in Replit (the lock icon on the left).

### Install slash commands

The commands for the example app are set up in `commands.js`. All of the commands in the `ALL_COMMANDS` array at the bottom of `commands.js` will be installed when you run the `register` command configured in `package.json`:

```
npm run register
```

### Run the app

After your credentials are added, go ahead and run the app:

```
npx wrangler dev
```

> ⚙️ A package [like `nodemon`](https://github.com/remy/nodemon), which watches for local changes and restarts your app, may be helpful while locally developing.

If you aren't following the [getting started guide](https://discord.com/developers/docs/getting-started), you can move the contents of `examples/app.js` (the finished `app.js` file) to the top-level `app.js`.

### Set up interactivity

The project needs a public endpoint where Discord can send requests. To develop and test locally, you can use something like [`ngrok`](https://ngrok.com/) to tunnel HTTP traffic.

Install ngrok if you haven't already, then start listening on port `8787`:

```
ngrok http 8787
```

You should see your connection open:

```
Tunnel Status                 online
Version                       2.0/2.0
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://1234-someurl.ngrok.io -> localhost:8787

Connections                  ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

Copy the forwarding address that starts with `https`, in this case `https://1234-someurl.ngrok.io`, then go to your [app's settings](https://discord.com/developers/applications).

On the **General Information** tab, there will be an **Interactions Endpoint URL**. Paste your ngrok address there, and append `/interactions` to it (`https://1234-someurl.ngrok.io/interactions` in the example).

Click **Save Changes**, and your app should be ready to run 🚀

## Other resources
- Read **[the documentation](https://discord.com/developers/docs/intro)** for in-depth information about API features.
- Browse the `examples/` folder in this project for smaller, feature-specific code examples
- Join the **[Discord Developers server](https://discord.gg/discord-developers)** to ask questions about the API, attend events hosted by the Discord API team, and interact with other devs.
- Check out **[community resources](https://discord.com/developers/docs/topics/community-resources#community-resources)** for language-specific tools maintained by community members.

## Deploying to Cloudflare Workers

First you'll need a Cloudflare account. Then you can log in to it using the `wrangler` CLI tool:

```
npx wrangler login
```

Next you should update the `wrangler.toml` file with your Cloudflare account ID and Discord app details.
Then you can deploy the app:

```
$ npx wrangler deploy

 ⛅️ wrangler 4.59.2
───────────────────
Total Upload: 144.63 KiB / gzip: 29.46 KiB
Worker Startup Time: 22 ms
Your Worker has access to the following bindings:
Binding                                                            Resource
env.ACTIVE_GAMES (GameDurableObject)                               Durable Object
env.APP_ID ("1462141501306961940")                                 Environment Variable
env.PUBLIC_KEY ("e756f515706b60344db04f49eb43ab7f2d9b7...")        Environment Variable

Uploaded discord-getting-started (3.04 sec)
Deployed discord-getting-started triggers (1.52 sec)
  https://[YOUR_WORKER_NAME].[USERNAME]workers.dev
Current Version ID: 1bb8c9e6-4bd5-4cd5-b2b5-b805cbf0d1a2
```

### Workaround for `require_streams(...) is not a function`

While support is improving, Cloudflare Workers environment is not standard Node.js, which causes issues like [this issue](https://github.com/cloudflare/workers-sdk/issues/9309) with the `iconv-lite` package.
As of 2026-01-17, there is no fix but there is a [workaround](https://github.com/cloudflare/workers-sdk/issues/9309#issuecomment-3019322829).
If you remove the following code from `node_modules/iconv-lite/package.json`:
```
    "browser": {
        "./lib/extend-node": false,
        "./lib/streams": false
    },
```
The error will disappear and you can deploy.