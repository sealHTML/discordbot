// Discord bot for Roblox key generation and verification
import { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

// In-memory key store (replace with a database for production)
const keys = {};

// Express server for webhooks or Roblox verification (optional)
const app = express();
app.use(express.json());

// Discord bot commands
const commands = [
  {
    name: 'postkeyembed',
    description: 'Admin: Post the key generation embed in this channel.'
  },
  {
    name: 'help',
    description: 'Show help information'
  }
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});


// Cooldown map (userId: timestamp)
const cooldowns = new Map();

client.on('interactionCreate', async interaction => {
  // /postkeyembed command: admin only, send embed with button
  if (interaction.isCommand() && interaction.commandName === 'postkeyembed') {
    // Check admin permission
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', flags: 1 << 6 });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('Roblox Key Generator')
      .setDescription('Click the button below to generate a one-time key for your Roblox account.')
      .setColor(0x7289da);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_key_modal')
        .setLabel('Generate')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: 'Key generator embed posted!', flags: 1 << 6 });
    await interaction.channel.send({ embeds: [embed], components: [row] });
    return;
  }
  // Help command
  if (interaction.isCommand() && interaction.commandName === 'help') {
    await interaction.reply({ content: 'Use /generate to open the key generator. Click the button and enter your Roblox username to get a one-time key.', flags: 1 << 6 });
    return;
  }
  // Button interaction: open modal
  if (interaction.isButton() && interaction.customId === 'open_key_modal') {
    // Cooldown check
    const now = Date.now();
    const last = cooldowns.get(interaction.user.id) || 0;
    if (now - last < 30000) {
      await interaction.reply({ content: `⏳ Please wait ${Math.ceil((30000 - (now - last))/1000)}s before generating another key.`, flags: 1 << 6 });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId('key_modal')
      .setTitle('Generate Roblox Key');
    const usernameInput = new TextInputBuilder()
      .setCustomId('roblox_username')
      .setLabel('Roblox Username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const modalRow = new ActionRowBuilder().addComponents(usernameInput);
    modal.addComponents(modalRow);
    await interaction.showModal(modal);
    return;
  }
  // Modal submit: generate key
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'key_modal') {
    const username = interaction.fields.getTextInputValue('roblox_username');
    // Optionally verify Roblox username exists
    const robloxApi = `https://users.roblox.com/v1/usernames/users`;
    let userId = null;
    try {
      const res = await fetch(robloxApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username] })
      });
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        userId = data.data[0].id;
      } else {
        await interaction.reply({ content: 'Roblox username not found.', flags: 1 << 6 });
        return;
      }
    } catch (e) {
      await interaction.reply({ content: 'Error verifying Roblox username.', flags: 1 << 6 });
      return;
    }
    // Generate a unique key
    const key = uuidv4();
    keys[key] = { username, userId, used: false };
    cooldowns.set(interaction.user.id, Date.now());
    await interaction.reply({ content: `Your one-time key: **${key}**\nUse this in the Roblox game to link your account.`, flags: 1 << 6 });
    return;
  }
});

// Endpoint for Roblox game to verify and consume key
app.post('/verify-key', (req, res) => {
  const { key, username } = req.body;
  if (!key || !username) return res.status(400).json({ success: false, message: 'Missing key or username.' });
  const record = keys[key];
  if (!record) return res.status(404).json({ success: false, message: 'Key not found.' });
  if (record.used) return res.status(410).json({ success: false, message: 'Key already used.' });
  if (record.username !== username) return res.status(403).json({ success: false, message: 'Key does not match username.' });
  // Mark key as used
  record.used = true;
  return res.json({ success: true, message: 'Key verified.' });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

client.login(TOKEN);
