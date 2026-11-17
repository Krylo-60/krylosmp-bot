import dotenv from "dotenv";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID in .env.");
  process.exit(1);
}

const serverIdOption = (builder) =>
  builder
    .setName("server_id")
    .setDescription("Falix server id. Uses FALIX_DEFAULT_SERVER_ID if omitted.")
    .setRequired(false);

const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("🔗 Link your Discord account to your Minecraft account!")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Your Minecraft In-Game Name (IGN)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("🔓 Unlink your currently connected Minecraft account."),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("👤 View your linked Minecraft profile, stats, and KryloCoins ($Kr).")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to view (defaults to yourself)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("mc-servers")
    .setDescription("List Falix servers visible to the bot key."),
  new SlashCommandBuilder()
    .setName("mc-status")
    .setDescription("Show live Minecraft server status.")
    .addStringOption(serverIdOption),
  new SlashCommandBuilder()
    .setName("mc-power")
    .setDescription("Start, stop, restart, or kill the Minecraft server.")
    .addStringOption((option) =>
      option
        .setName("signal")
        .setDescription("Power action")
        .setRequired(true)
        .addChoices(
          { name: "start", value: "start" },
          { name: "stop", value: "stop" },
          { name: "restart", value: "restart" },
          { name: "kill", value: "kill" }
        )
    )
    .addStringOption(serverIdOption),
  new SlashCommandBuilder()
    .setName("mc-command")
    .setDescription("Send one console command to the Minecraft server.")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Single console command")
        .setRequired(true)
    )
    .addStringOption(serverIdOption)
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

console.log("Registering Discord slash commands...");
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
console.log("Discord slash commands registered successfully!");
