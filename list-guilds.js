import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (!client.guilds.cache.size) {
    console.log("This bot is not in any Discord servers.");
  } else {
    for (const guild of client.guilds.cache.values()) {
      console.log(`${guild.name}: ${guild.id}`);
    }
  }

  await client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
