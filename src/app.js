global.File = class {};
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const USERNAME = process.env.JD_USERNAME;
const PASSWORD = process.env.JD_PASSWORD;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PHPSESSID = process.env.PHPSESSID;
const JD_VIC = process.env.JD_VIC;

const LOGIN_URL = "https://classic.jadedynasty.online/?page=account&login_scripts=1&login=1";
const ACCOUNT_URL = "https://classic.jadedynasty.online/page.php?page=account&login_scripts=1&login=1";
const TRADER_URL = "https://classic.jadedynasty.online/page.php?page=account&subpage=trader";

function parseItemsFromMessage(content) {
  const lines = content.split('\n').filter(l =>
    l.trim() &&
    l.startsWith('|') &&
    !l.startsWith('| Item') &&
    !l.startsWith('|---')
  );
  const items = [];
  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 9) continue;
    const item = parts[1];
    const grade = parts[2];
    const amount = parseInt(parts[3].replace('x', ''));
    const priceStr = parts[4];
    // Remove all '.' thousands separators, then parse as integer, preserving zeros
    let price = parseInt(priceStr.replace(/\./g, ''));
    if (item && grade && amount && priceStr) {
      items.push({ item, grade, amount, price, priceStr, pricePerUnit: price });
    }
  }
  return items;
}

async function getHistoricalItemData(channel, botId, limit=1000) {
  let messages = [];
  let lastId = undefined;
  while (messages.length < limit) {
    const fetched = await channel.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) });
    if (fetched.size === 0) break;
    for (const msg of fetched.values()) {
      if (msg.author.id === botId) {
        messages.push(msg);
      }
    }
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }
  let history = [];
  for (const msg of messages) {
    history.push(...parseItemsFromMessage(msg.content));
  }
  return history;
}

async function fetchTraderTable() {
  const jar = new CookieJar();
  if (PHPSESSID) jar.setCookieSync(`PHPSESSID=${PHPSESSID}; Path=/`, 'https://classic.jadedynasty.online');
  if (JD_VIC) jar.setCookieSync(`jd_vic=${JD_VIC}; Path=/`, 'https://classic.jadedynasty.online');
  const session = wrapper(axios.create({ jar, withCredentials: true }));

  await session.post(
    LOGIN_URL,
    new URLSearchParams({
      login: USERNAME,
      passwd: PASSWORD,
      memory: "off"
    }),
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        "Cache-Control": "max-age=0",
        "Referer": TRADER_URL,
        "Origin": "https://classic.jadedynasty.online",
        "Content-Type": "application/x-www-form-urlencoded",
        "Upgrade-Insecure-Requests": "1"
      },
      maxRedirects: 5
    }
  );
  await session.get(ACCOUNT_URL);
  const res = await session.get(TRADER_URL);
  const $ = cheerio.load(res.data);
  const items = [];
  $("table.offer-table tbody tr").each((i, row) => {
    const $row = $(row);
    if ($row.hasClass("tr-empty") || $row.hasClass("tr-info")) return;
    const tds = $row.find("td");
    if (tds.length < 5) return;
    const item = tds.eq(0).find("span").text().trim();
    const grade = tds.eq(1).text().trim();
    const amount = parseInt(tds.eq(2).text().replace('x','').trim());
    const priceStrRaw = tds.eq(3).find("span.red").text().replace(',','').trim();
    const priceStr = priceStrRaw;
    // Remove all '.' thousands separators, then parse as integer, preserving zeros
    let price = parseInt(priceStr.replace(/\./g, ''));
    if (item && grade && amount && priceStr) {
      items.push({ item, grade, amount, price, priceStr, pricePerUnit: price });
    }
  });
  return items;
}

function buildTraderMessage(todayItems, history) {
  let msg = '**📦 Daily Trader Items**\n';
  msg += '```md\n';
  msg += '| Item                 | Grade     | Amount  | Price    | Avg      | Min      | Max      | Flag |\n';
  msg += '|----------------------|-----------|---------|----------|----------|----------|----------|------|\n';
  todayItems.slice(2).forEach(item => {
    // Match by item and grade
    const historyMatches = history.filter(h => h.item === item.item.slice(0, 20) && h.grade === item.grade);
    const pricesInt = historyMatches.map(h => h.pricePerUnit);
    let avg = null, min = null, max = null, flag = '';
    let itemName = item.item.length > 20 ? item.item.slice(0, 20) : item.item.padEnd(20);
    if (pricesInt.length) {
      avg = Math.floor(pricesInt.reduce((a,b)=>a+b,0)/pricesInt.length);
      min = Math.min(...pricesInt);
      max = Math.max(...pricesInt);
  // Show avg/min/max as per-unit prices only
  const avgStr = String(avg).padEnd(8);
  const minStr = String(min).padEnd(8);
  const maxStr = String(max).padEnd(8);
  flag = item.pricePerUnit <= avg ? '🟩' : '🟥';
  msg += `| ${itemName} | ${item.grade.padEnd(9)} | ${('x'+item.amount).padEnd(7)} | ${item.priceStr.padEnd(8)} | ${avgStr} | ${minStr} | ${maxStr} | ${flag} |\n`;
    } else {
      msg += `| ${itemName} | ${item.grade.padEnd(9)} | ${('x'+item.amount).padEnd(7)} | ${item.priceStr.padEnd(8)} | ${'new'.padEnd(8)} | ${'new'.padEnd(8)} | ${'new'.padEnd(8)} | 🟩 |\n`;
    }
  });
  msg += '```';
  return msg;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once("ready", async () => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const botId = client.user.id;
    const history = await getHistoricalItemData(channel, botId, 1000);
    const todayItems = await fetchTraderTable();
    const msg = buildTraderMessage(todayItems, history);
    await channel.send(msg);
    setInterval(async () => {
      const history = await getHistoricalItemData(channel, botId, 1000);
      const todayItems = await fetchTraderTable();
      const msg = buildTraderMessage(todayItems, history);
      await channel.send(msg);
    }, 24 * 60 * 60 * 1000); // 24h
  } catch (err) {
    console.error('Error sending trader table:', err);
  }
});

client.login(DISCORD_TOKEN);
client.login(DISCORD_TOKEN);
