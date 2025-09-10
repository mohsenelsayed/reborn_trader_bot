// traderBot.js
import axios from "axios";
import * as cheerio from "cheerio";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config(); // load .env variables

// Config from .env
const USERNAME = process.env.JD_USERNAME;
const PASSWORD = process.env.JD_PASSWORD;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const LOGIN_URL = "https://classic.jadedynasty.online/?page=account&login_scripts=1&login=1";
const TRADER_URL = "https://classic.jadedynasty.online/page.php?page=account&subpage=trader";

async function fetchTraderTable() {
  const session = axios.create({ withCredentials: true });

  // 1. Login
  await session.post(LOGIN_URL, new URLSearchParams({
    login: USERNAME,
    passwd: PASSWORD
  }));

  // 2. Get Trader Page
  const res = await session.get(TRADER_URL);
  const $ = cheerio.load(res.data);

  // 3. Parse table
  const rows = $("table tr").slice(1); // skip header
  const items = [];
  rows.each((i, row) => {
    const cols = $(row).find("td").map((j, col) => $(col).text().trim()).get();
    if (cols.length) items.push(cols);
  });

  // 4. Format as Discord message
  let msg = "**📦 Daily Trader Items**\n\n```";
  msg += `${"Item".padEnd(20)} ${"Grade".padEnd(6)} ${"Amount".padEnd(6)} ${"Price".padEnd(8)}\n`;
  msg += "-".repeat(50) + "\n";
  for (const [item, grade, amount, price] of items) {
    msg += `${item.padEnd(20)} ${grade.padEnd(6)} ${amount.padEnd(6)} ${price.padEnd(8)}\n`;
  }
  msg += "```";

  return msg;
}

// --- Discord Bot ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Send immediately on startup
  const channel = await client.channels.fetch(CHANNEL_ID);
  const msg = await fetchTraderTable();
  await channel.send(msg);

  // Schedule every 24h
  setInterval(async () => {
    const msg = await fetchTraderTable();
    await channel.send(msg);
  }, 24 * 60 * 60 * 1000); // 24h
});

client.login(DISCORD_TOKEN);
