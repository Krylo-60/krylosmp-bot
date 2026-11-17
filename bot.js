import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from "discord.js";
import {
  getServerStatus,
  listServers,
  sendConsoleCommand,
  sendPowerSignal
} from "./falixClient.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.get("/", (_req, res) => {
  res.send("⚡ KryloSMP Discord Bot is Online & Ready!");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", bot: client.user?.tag || "starting" });
});

app.listen(port, () => {
  console.log(`🌐 HTTP health server listening on port ${port}`);
});

const token = process.env.DISCORD_TOKEN;
const defaultServerId = process.env.FALIX_DEFAULT_SERVER_ID;
const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;

if (!token) {
  console.error("Missing DISCORD_TOKEN in .env.");
  process.exit(1);
}

const DATA_FILE = path.join(process.cwd(), "linked_players.json");

function loadLinkedPlayers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error reading linked_players.json:", e);
  }
  return {};
}

function saveLinkedPlayers(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Error writing linked_players.json:", e);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

function getServerId(interaction) {
  return interaction.options.getString("server_id") || defaultServerId;
}

function canControlServer(interaction) {
  if (!interaction.inGuild()) return false;

  if (adminRoleId && interaction.member?.roles?.cache?.has(adminRoleId)) {
    return true;
  }

  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function falixErrorMessage(result) {
  if (result.payload?.error?.message) {
    const actionUrl = result.payload.error.action_url;
    return actionUrl
      ? `${result.payload.error.message}\n${actionUrl}`
      : result.payload.error.message;
  }

  if (result.payload?.error) return JSON.stringify(result.payload.error);
  return typeof result.payload === "string" ? result.payload : `Falix returned HTTP ${result.status}.`;
}

function serverLabel(server) {
  return server.name || server.display_name || server.identifier || server.id;
}

// ──────────────────────────────────────────────────────────
// 🔗 LINK / UNLINK / PROFILE HANDLERS
// ──────────────────────────────────────────────────────────

async function processLink(interaction, rawIgn, isModal = false) {
  const cleanIgn = (rawIgn || "").trim();

  // Validate Minecraft IGN: 3-16 chars (Java & Bedrock dot supported)
  if (!cleanIgn || cleanIgn.length < 3 || cleanIgn.length > 16 || !/^[a-zA-Z0-9_.]+$/.test(cleanIgn)) {
    const errorMsg = "❌ **Invalid Minecraft Username!**\nIGN must be 3–16 characters (alphanumeric, underscores, or leading dot for Bedrock).";
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  const users = loadLinkedPlayers();
  const existingUser = users[interaction.user.id];

  if (existingUser && existingUser.ign.toLowerCase() === cleanIgn.toLowerCase()) {
    return interaction.reply({
      content: `ℹ️ You are already linked to **\`${existingUser.ign}\`**! Use \`/profile\` to check your account.`,
      ephemeral: true
    });
  }

  // Calculate balance reward (+1,000 Kr on first link)
  const isFirstLink = !existingUser;
  const currentBalance = (existingUser?.balance || 0) + (isFirstLink ? 1000 : 0);

  users[interaction.user.id] = {
    discordId: interaction.user.id,
    tag: interaction.user.tag || interaction.user.username,
    ign: cleanIgn,
    balance: currentBalance,
    linkedAt: existingUser?.linkedAt || new Date().toISOString()
  };
  saveLinkedPlayers(users);

  // Assign Discord Roles
  const member = interaction.member;
  if (member && member.roles) {
    const rolesToAdd = [];
    // Verified role: 1538228607644737546
    if (!member.roles.cache.has("1538228607644737546")) rolesToAdd.push("1538228607644737546");
    // Member role: 1538230669467979846
    if (!member.roles.cache.has("1538230669467979846")) rolesToAdd.push("1538230669467979846");

    // Java (1542662169575817321) vs Bedrock (1542662171937472594)
    if (cleanIgn.startsWith(".")) {
      if (!member.roles.cache.has("1542662171937472594")) rolesToAdd.push("1542662171937472594");
    } else {
      if (!member.roles.cache.has("1542662169575817321")) rolesToAdd.push("1542662169575817321");
    }

    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd).catch(() => {});
    }

    // Try updating nickname: "Verified | <IGN>", "Mod | <IGN>", "Owner | <IGN>", etc.
    let prefix = 'Verified';
    if (member.id === interaction.guild?.ownerId) {
      prefix = 'Owner';
    } else if (member.roles.cache.some(r => r.name.toLowerCase().includes('admin'))) {
      prefix = 'Admin';
    } else if (member.roles.cache.some(r => r.name.toLowerCase().includes('mod'))) {
      prefix = 'Mod';
    } else if (member.roles.cache.some(r => r.name.toLowerCase().includes('booster'))) {
      prefix = 'Booster';
    } else if (member.roles.cache.some(r => r.name.toLowerCase().includes('vip'))) {
      prefix = 'VIP';
    }
    const formattedNick = `${prefix} | ${cleanIgn}`.slice(0, 32);

    try {
      if (interaction.guild?.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        await member.setNickname(formattedNick).catch(() => {});
      }
    } catch (_) {}
  }

  // Queue in-game command if server is reachable
  if (defaultServerId) {
    sendConsoleCommand(defaultServerId, `whitelist add ${cleanIgn}`).catch(() => {});
    sendConsoleCommand(defaultServerId, `tellraw ${cleanIgn} {"text":"§a§l[KryloSMP] §eLinked with Discord! (+1,000 Kr)","color":"green"}`).catch(() => {});
  }

  const isBedrock = cleanIgn.startsWith(".");
  const editionTag = isBedrock ? "📱 Bedrock Edition" : "☕ Java Edition";

  const successEmbed = new EmbedBuilder()
    .setColor(0x10B981)
    .setTitle("🎮 Account Linked Successfully!")
    .setAuthor({
      name: "KryloSMP Network • Account Verification",
      iconURL: interaction.guild?.iconURL() || interaction.user.displayAvatarURL()
    })
    .setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(cleanIgn)}/128`)
    .setDescription(
      `Hey <@${interaction.user.id}>! Your Discord account is now linked to **\`${cleanIgn}\`**!\n\n` +
      `• ⛏️ **Minecraft IGN:** \`${cleanIgn}\` (${editionTag})\n` +
      `• 💎 **Link Reward:** **+1,000 KryloCoins ($Kr)** deposited to your wallet!\n` +
      `• 🛡️ **Roles Granted:** <@&1538228607644737546> & <@&${isBedrock ? "1542662171937472594" : "1542662169575817321"}>\n` +
      `• 🚀 **Server Status:** Pre-registered & whitelisted for server launch!\n\n` +
      `*KryloSMP is launching soon! Keep an eye on announcements for the new server IP!* 🌟`
    )
    .setFooter({ text: "KryloSMP • Built for Krylo 亗" })
    .setTimestamp();

  return interaction.reply({ embeds: [successEmbed], ephemeral: isModal });
}

async function handleLink(interaction) {
  const ignOption = interaction.options.getString("username");

  if (!ignOption) {
    // Show Modal
    const modal = new ModalBuilder()
      .setCustomId("modal_link_minecraft")
      .setTitle("🎮 Link Minecraft Account");

    const ignInput = new TextInputBuilder()
      .setCustomId("link_mc_ign")
      .setLabel("Minecraft In-Game Name (IGN)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. Krylo_Plays, Steve, Notch")
      .setMinLength(3)
      .setMaxLength(16)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(ignInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  return processLink(interaction, ignOption, false);
}

async function handleUnlink(interaction) {
  const users = loadLinkedPlayers();
  const record = users[interaction.user.id];

  if (!record) {
    return interaction.reply({
      content: "❌ You don't have any linked Minecraft account.",
      ephemeral: true
    });
  }

  const oldIgn = record.ign;
  delete users[interaction.user.id];
  saveLinkedPlayers(users);

  // Remove roles
  const member = interaction.member;
  if (member && member.roles) {
    await member.roles.remove(["1538228607644737546", "1542662169575817321", "1542662171937472594"]).catch(() => {});
  }

  const unlinkEmbed = new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle("🔓 Account Unlinked")
    .setDescription(`Your Discord has been unlinked from **\`${oldIgn}\`**.\nYou can link a new account anytime with \`/link\`!`)
    .setFooter({ text: "KryloSMP Network" })
    .setTimestamp();

  return interaction.reply({ embeds: [unlinkEmbed], ephemeral: true });
}

async function handleProfile(interaction) {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const users = loadLinkedPlayers();
  const record = users[targetUser.id];

  if (!record) {
    return interaction.reply({
      content: targetUser.id === interaction.user.id
        ? "❌ You have not linked your Minecraft account yet! Use `/link` to connect."
        : `❌ <@${targetUser.id}> has not linked their Minecraft account yet.`,
      ephemeral: true
    });
  }

  const isBedrock = record.ign.startsWith(".");
  const edition = isBedrock ? "📱 Bedrock Edition" : "☕ Java Edition";
  const linkedDate = record.linkedAt ? new Date(record.linkedAt).toLocaleDateString() : "Recently";

  const profileEmbed = new EmbedBuilder()
    .setColor(0x3B82F6)
    .setTitle(`👤 ${record.ign}'s KryloSMP Profile`)
    .setAuthor({
      name: `${targetUser.username}'s Player Card`,
      iconURL: targetUser.displayAvatarURL()
    })
    .setThumbnail(`https://mc-heads.net/body/${encodeURIComponent(record.ign)}/128`)
    .addFields(
      { name: "⛏️ In-Game Name", value: `\`${record.ign}\``, inline: true },
      { name: "🎮 Platform", value: edition, inline: true },
      { name: "💰 Balance", value: `\`${Number(record.balance || 0).toLocaleString()} Kr\``, inline: true },
      { name: "📅 Member Since", value: linkedDate, inline: true },
      { name: "🛡️ Verification Status", value: "✅ Verified Human Player", inline: true }
    )
    .setFooter({ text: "KryloSMP Network • Profile System" })
    .setTimestamp();

  return interaction.reply({ embeds: [profileEmbed] });
}

// ──────────────────────────────────────────────────────────
// 🕹️ FALIX SERVER HANDLERS
// ──────────────────────────────────────────────────────────

async function handleServers(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const result = await listServers();
  if (!result.ok) {
    return interaction.editReply(`Could not list servers: ${falixErrorMessage(result)}`);
  }

  const servers = result.payload?.data || [];
  if (!servers.length) {
    return interaction.editReply("No Falix servers were visible to this API key.");
  }

  const lines = servers.slice(0, 10).map((server) => {
    const id = server.id || server.server_id || "unknown-id";
    const status = server.status?.state || server.state || "unknown";
    return `• ${serverLabel(server)} — \`${id}\` — ${status}`;
  });

  return interaction.editReply(lines.join("\n"));
}

async function handleStatus(interaction) {
  await interaction.deferReply();

  const serverId = getServerId(interaction);
  if (!serverId) {
    return interaction.editReply("Set `FALIX_DEFAULT_SERVER_ID` in `.env`, or pass `server_id`.");
  }

  const result = await getServerStatus(serverId);
  if (!result.ok) {
    return interaction.editReply(`Could not read status: ${falixErrorMessage(result)}`);
  }

  const status = result.payload?.data || result.payload;
  const state = status.state || "unknown";
  const memory = formatBytes(status.memory_bytes);
  const memoryLimit = formatBytes(status.memory_limit_bytes);
  const disk = formatBytes(status.disk_bytes);
  const cpu = Number.isFinite(status.cpu_absolute) ? `${status.cpu_absolute.toFixed(1)}%` : "unknown";

  return interaction.editReply(
    `KryloSMP status: **${state}**\nCPU: ${cpu}\nMemory: ${memory} / ${memoryLimit}\nDisk: ${disk}`
  );
}

async function handlePower(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!canControlServer(interaction)) {
    return interaction.editReply("You need Manage Server permission to use this command.");
  }

  const serverId = getServerId(interaction);
  const signal = interaction.options.getString("signal", true);

  if (!serverId) {
    return interaction.editReply("Set `FALIX_DEFAULT_SERVER_ID` in `.env`, or pass `server_id`.");
  }

  const result = await sendPowerSignal(serverId, signal);
  if (!result.ok) {
    return interaction.editReply(`Power action failed: ${falixErrorMessage(result)}`);
  }

  return interaction.editReply(`Sent \`${signal}\` to server \`${serverId}\`.`);
}

async function handleCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!canControlServer(interaction)) {
    return interaction.editReply("You need Manage Server permission to use this command.");
  }

  const serverId = getServerId(interaction);
  const command = interaction.options.getString("command", true).trim();

  if (!serverId) {
    return interaction.editReply("Set `FALIX_DEFAULT_SERVER_ID` in `.env`, or pass `server_id`.");
  }

  if (!command || command.includes("\n")) {
    return interaction.editReply("Command must be one non-empty line.");
  }

  const result = await sendConsoleCommand(serverId, command);
  if (!result.ok) {
    return interaction.editReply(`Command failed: ${falixErrorMessage(result)}`);
  }

  return interaction.editReply(`Sent command to server \`${serverId}\`.`);
}

// ──────────────────────────────────────────────────────────
// 🚀 BOT LIFECYCLE & EVENT LISTENERS
// ──────────────────────────────────────────────────────────

client.once("ready", () => {
  console.log(`===========================================`);
  console.log(`⚡ KryloSMP Bot ONLINE as ${client.user.tag}`);
  console.log(`🛡️ Account Link & Falix Controls Active!`);
  console.log(`===========================================`);
});

client.on("interactionCreate", async (interaction) => {
  // Handle Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "modal_link_minecraft") {
      const ign = interaction.fields.getTextInputValue("link_mc_ign");
      return processLink(interaction, ign, true);
    }
  }

  // Handle Slash Commands
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "link") await handleLink(interaction);
    else if (interaction.commandName === "unlink") await handleUnlink(interaction);
    else if (interaction.commandName === "profile") await handleProfile(interaction);
    else if (interaction.commandName === "mc-servers") await handleServers(interaction);
    else if (interaction.commandName === "mc-status") await handleStatus(interaction);
    else if (interaction.commandName === "mc-power") await handlePower(interaction);
    else if (interaction.commandName === "mc-command") await handleCommand(interaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`Bot error: ${message}`);
    } else {
      await interaction.reply({ content: `Bot error: ${message}`, ephemeral: true });
    }
  }
});

client.login(token);
