/**
 * Telegram Bot for selling ProxySwitcher subscriptions
 *
 * To run the bot:
 * 1. Create a bot via @BotFather in Telegram
 * 2. Get the bot token
 * 3. Install dependencies: npm install node-telegram-bot-api
 * 4. Configure environment variables or edit the config below
 * 5. Run: node telegram-bot.js
 *
 * Payment options can be used:
 * - YooMoney (for Russia)
 * - Telegram Payments (Stars)
 * - Cryptocurrency
 */

const TelegramBot = require("node-telegram-bot-api")
const crypto = require("crypto")
const fs = require("fs")
const http = require("http")

// Configuration
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || "YOUR_BOT_TOKEN_HERE",
  ADMIN_ID: process.env.ADMIN_ID || "YOUR_ADMIN_ID_HERE",
  PRICE: 150, // Price in rubles
  LICENSE_FILE: "./licenses.json",
  API_PORT: process.env.API_PORT || 3847,
  API_HOST: process.env.API_HOST || "0.0.0.0",
}

// Bot initialization
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true })

// License storage
let licenses = {}

// Load licenses from file
function loadLicenses() {
  try {
    if (fs.existsSync(CONFIG.LICENSE_FILE)) {
      licenses = JSON.parse(fs.readFileSync(CONFIG.LICENSE_FILE, "utf8"))
    }
  } catch (error) {
    console.error("Error loading licenses:", error)
    licenses = {}
  }
}

// Save licenses to file
function saveLicenses() {
  try {
    fs.writeFileSync(CONFIG.LICENSE_FILE, JSON.stringify(licenses, null, 2))
  } catch (error) {
    console.error("Error saving licenses:", error)
  }
}

// Generate license key
function generateLicenseKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const generatePart = () => {
    let part = ""
    for (let i = 0; i < 5; i++) {
      part += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return part
  }

  return `PS-${generatePart()}-${generatePart()}-${generatePart()}`
}

// Create new license
function createLicense(userId, username) {
  const key = generateLicenseKey()
  const license = {
    key,
    userId,
    username,
    createdAt: new Date().toISOString(),
    status: "active",
  }

  licenses[key] = license
  saveLicenses()

  return license
}

// Check license
function checkLicense(key) {
  const license = licenses[key]
  if (!license) return { valid: false, message: "Key not found" }
  if (license.status !== "active") return { valid: false, message: "License deactivated" }
  return { valid: true, license }
}

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const username = msg.from.username || msg.from.first_name

  const welcomeMessage = `
🛡️ *Welcome to ProxySwitcher Bot!*

Here you can purchase a Premium subscription for the ProxySwitcher application.

💎 *Premium subscription - ${CONFIG.PRICE}₽*
• Unlimited number of proxies
• Priority support
• Early access to new features

📋 *Available commands:*
/buy - Buy Premium subscription
/check - Check license key
/help - Help

🔗 Download the application: [ProxySwitcher](https://t.me/proxyswither)
  `

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  })
})

// Command /buy
bot.onText(/\/buy/, (msg) => {
  const chatId = msg.chat.id

  const buyMessage = `
💳 *Premium subscription purchase*

Cost: *${CONFIG.PRICE}₽*

*Payment methods:*

1️⃣ *Bank transfer:*
   \`4276 XXXX XXXX XXXX\` (Sberbank)
   
2️⃣ *YooMoney:*
   \`4100XXXXXXXXXXXX\`

After payment, send a screenshot of the receipt or type /paid

⚠️ *Important:* In the transfer comment, specify your Telegram username (@${msg.from.username || "your_username"})
  `

  const keyboard = {
    inline_keyboard: [
      [{ text: "💳 I paid", callback_data: "paid" }],
      [{ text: "❓ Contact support", url: "https://t.me/noname22444" }],
    ],
  }

  bot.sendMessage(chatId, buyMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  })
})

// Command /paid or button "I paid"
bot.onText(/\/paid/, (msg) => {
  handlePaymentConfirmation(msg.chat.id, msg.from)
})

bot.on("callback_query", (query) => {
  if (query.data === "paid") {
    handlePaymentConfirmation(query.message.chat.id, query.from)
    bot.answerCallbackQuery(query.id)
  } else if (query.data.startsWith("approve_")) {
    const [, userId, chatId] = query.data.split("_")
    handleApproval(query, userId, chatId, true)
  } else if (query.data.startsWith("reject_")) {
    const [, userId, chatId] = query.data.split("_")
    handleApproval(query, userId, chatId, false)
  }
})

function handlePaymentConfirmation(chatId, user) {
  const confirmMessage = `
📤 *Payment confirmation*

Please send a screenshot of the receipt.

After verification by the administrator, you will receive a license key.

⏱️ Usually, verification takes up to 30 minutes.
  `

  bot.sendMessage(chatId, confirmMessage, { parse_mode: "Markdown" })

  // Notify admin
  const adminMessage = `
🔔 *New payment request!*

👤 User: @${user.username || "unknown"} (${user.first_name})
🆔 ID: ${user.id}
📅 Date: ${new Date().toLocaleString("ru-RU")}
  `

  const adminKeyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve_${user.id}_${chatId}` },
        { text: "❌ Reject", callback_data: `reject_${user.id}_${chatId}` },
      ],
    ],
  }

  bot.sendMessage(CONFIG.ADMIN_ID, adminMessage, {
    parse_mode: "Markdown",
    reply_markup: adminKeyboard,
  })
}

function handleApproval(query, userId, chatId, approved) {
  if (query.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.answerCallbackQuery(query.id, { text: "You do not have permission" })
    return
  }

  if (approved) {
    // Create license
    const license = createLicense(userId, query.from.username)

    // Send key to user
    const userMessage = `
🎉 *Congratulations on purchasing Premium!*

Your license key:
\`${license.key}\`

📋 *How to activate:*
1. Open the ProxySwitcher application
2. Click on "Premium"
3. Enter the key and click "Activate"

Thank you for your purchase! 💎
    `

    bot.sendMessage(chatId, userMessage, { parse_mode: "Markdown" })

    // Notify admin
    bot.editMessageText(`✅ License issued!\n\nKey: \`${license.key}\`\nUser: ${userId}`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
    })
  } else {
    // Reject
    bot.sendMessage(
      chatId,
      "❌ Unfortunately, your payment has not been confirmed. Please contact support @noname22444",
    )

    bot.editMessageText("❌ Request rejected", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
    })
  }

  bot.answerCallbackQuery(query.id)
}

// Command /check - check key
bot.onText(/\/check (.+)/, (msg, match) => {
  const chatId = msg.chat.id
  const key = match[1].trim().toUpperCase()

  const result = checkLicense(key)

  if (result.valid) {
    bot.sendMessage(chatId, `✅ *License is valid!*\n\nStatus: Active\nCreated: ${result.license.createdAt}`, {
      parse_mode: "Markdown",
    })
  } else {
    bot.sendMessage(chatId, `❌ *License is invalid*\n\n${result.message}`, { parse_mode: "Markdown" })
  }
})

// Command /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id

  const helpMessage = `
📚 *Help for ProxySwitcher Bot*

*Commands:*
/start - Main menu
/buy - Buy Premium subscription
/check <key> - Check license key
/help - This help

*Problems?*
Write to support: @noname22444

*About the application:*
ProxySwitcher - a simple and convenient application for managing proxy servers on Windows.

🔗 Telegram channel: @proxyswither
  `

  bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" })
})

// Admin commands
bot.onText(/\/admin_generate/, (msg) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) return

  const license = createLicense(msg.from.id, msg.from.username)
  bot.sendMessage(msg.chat.id, `🔑 New key generated:\n\`${license.key}\``, { parse_mode: "Markdown" })
})

bot.onText(/\/admin_stats/, (msg) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) return

  const totalLicenses = Object.keys(licenses).length
  const activeLicenses = Object.values(licenses).filter((l) => l.status === "active").length

  bot.sendMessage(
    msg.chat.id,
    `
📊 *Statistics:*
Total licenses: ${totalLicenses}
Active: ${activeLicenses}
  `,
    { parse_mode: "Markdown" },
  )
})

// Load licenses at startup
loadLicenses()

const apiServer = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  // API: Проверка лицензии GET /check?key=PS-XXXXX-XXXXX-XXXXX
  if (req.method === "GET" && req.url.startsWith("/check")) {
    const url = new URL(req.url, `http://localhost:${CONFIG.API_PORT}`)
    const key = url.searchParams.get("key")

    if (!key) {
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ valid: false, error: "Key required" }))
      return
    }

    const result = checkLicense(key.toUpperCase())
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(result))
    return
  }

  // API: Активация лицензии POST /activate
  if (req.method === "POST" && req.url === "/activate") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      try {
        const { key } = JSON.parse(body)
        const result = checkLicense(key.toUpperCase())
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ valid: false, error: "Invalid request" }))
      }
    })
    return
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Not found" }))
})

apiServer.listen(CONFIG.API_PORT, CONFIG.API_HOST, () => {
  console.log(`📡 License API running on http://${CONFIG.API_HOST}:${CONFIG.API_PORT}`)
  console.log(`📡 For production, set your server IP in the app config`)
})

console.log("🤖 ProxySwitcher Bot started!")
