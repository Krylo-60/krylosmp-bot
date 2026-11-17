# KryloSMP Falix Server API

Small Express server for controlling your Falix Minecraft server while keeping your API key on the backend.

## Setup

1. Rotate the exposed API key in the provider dashboard.
2. Copy `.env.example` to `.env`.
3. Put the new key in `FALIX_API_KEY`.
4. Install and run:

```bash
npm install
npm run dev
```

## Endpoints

`GET /health`

Returns `{ "ok": true }`.

`GET /api/me`

Verifies the Falix API key and returns account/key details.

`GET /api/servers?include=status`

Lists servers visible to the key.

`GET /api/servers/:serverId/status`

Returns live state and resource usage.

`POST /api/servers/:serverId/power`

Sends a power action:

```json
{
  "signal": "start"
}
```

Allowed signals are `start`, `stop`, `restart`, and `kill`.

`POST /api/servers/:serverId/commands`

Sends one console command:

```json
{
  "command": "say hello from the API"
}
```

## Discord Bot

Add these values to `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_GUILD_ID=your_discord_server_id
FALIX_DEFAULT_SERVER_ID=your_falix_server_id
```

Register slash commands:

```bash
npm run bot:commands
```

Start the bot:

```bash
npm run bot
```

Commands:

```text
/mc-servers
/mc-status
/mc-power signal:start
/mc-command command:"say hello"
```

`/mc-power` and `/mc-command` require Discord's Manage Server permission unless `DISCORD_ADMIN_ROLE_ID` is set.
