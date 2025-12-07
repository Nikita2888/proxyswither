const TelegramBot = require("node-telegram-bot-api")
const { createClient } = require("@supabase/supabase-js")
const crypto = require("crypto")

// Конфигурация
const BOT_TOKEN = "8530886952:AAELDw3vMrljicbyl2Nyzwh1zDQMsCi8Jk0" // Замените на ваш токен
const SUPABASE_URL = "https://fbasfoutfoqqriinghht.supabase.co"
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiYXNmb3V0Zm9xcXJpaW5naGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4OTA1MDksImV4cCI6MjA4MDQ2NjUwOX0._EUg9Poiy616Tc-6JEkrKdXH7KO1xbA3iNymK5TKfFE"

const bot = new TelegramBot(BOT_TOKEN, { polling: true })
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Временное хранилище для выбора платформы
const userPlatformSelection = new Map()

// Генерация лицензионного ключа
function generateLicenseKey(platform = "PC") {
  const prefix = platform === "Mobile" ? "PS" : "PC"
  const part1 = crypto.randomBytes(3).toString("hex").toUpperCase().substring(0, 5)
  const part2 = crypto.randomBytes(3).toString("hex").toUpperCase().substring(0, 5)
  const part3 = crypto.randomBytes(3).toString("hex").toUpperCase().substring(0, 5)
  return `${prefix}-${part1}-${part2}-${part3}`
}

// Создание лицензии в Supabase
async function createLicense(userId, username, platform = "PC", durationDays = 30) {
  try {
    const licenseKey = generateLicenseKey(platform)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + durationDays)

    const tableName = platform === "Mobile" ? "licence_mobail" : "licenses"

    const licenseData = {
      license_key: licenseKey,
      user_id: userId,
      telegram_username: username,
      expires_at: expiresAt.toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
    }

    // Для PC добавляем дополнительные поля
    if (platform === "PC") {
      licenseData.hwid = null
      licenseData.activated_at = null
    } else {
      // Для Mobile
      licenseData.device_id = null
      licenseData.activated_at = null
    }

    const { data, error } = await supabase.from(tableName).insert([licenseData]).select()

    if (error) {
      console.error("Error creating license:", error)
      return null
    }

    return data[0]
  } catch (error) {
    console.error("Error in createLicense:", error)
    return null
  }
}

// Стартовое меню
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💎 Купить Premium", callback_data: "buy_premium" }],
        [{ text: "🔑 Мои лицензии", callback_data: "my_licenses" }],
        [{ text: "❓ Помощь", callback_data: "help" }],
      ],
    },
  }

  bot.sendMessage(chatId, "🌟 Добро пожаловать в ProxySwitcher Bot!\n\n" + "Выберите действие:", keyboard)
})

// Обработка кнопок
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const data = query.data
  const userId = query.from.id
  const username = query.from.username || "unknown"

  if (data === "buy_premium") {
    // Выбор платформы
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💻 ПК приложение", callback_data: "platform_pc" }],
          [{ text: "📱 Mobile приложение", callback_data: "platform_mobile" }],
          [{ text: "◀️ Назад", callback_data: "back_to_menu" }],
        ],
      },
    }

    bot.editMessageText(
      "🎯 Выберите платформу:\n\n" +
        "💻 ПК приложение - для Windows/macOS/Linux\n" +
        "📱 Mobile приложение - для Android",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard.reply_markup,
      },
    )
  } else if (data === "platform_pc" || data === "platform_mobile") {
    const platform = data === "platform_pc" ? "PC" : "Mobile"
    userPlatformSelection.set(userId, platform)

    // Тарифные планы
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 30 дней - 100₽", callback_data: "plan_30" }],
          [{ text: "📅 90 дней - 250₽", callback_data: "plan_90" }],
          [{ text: "📅 365 дней - 800₽", callback_data: "plan_365" }],
          [{ text: "◀️ Назад", callback_data: "buy_premium" }],
        ],
      },
    }

    const platformEmoji = platform === "PC" ? "💻" : "📱"
    bot.editMessageText(
      `${platformEmoji} Платформа: ${platform === "PC" ? "ПК" : "Mobile"}\n\n` +
        "💎 Выберите тарифный план:\n\n" +
        "📅 30 дней - 100₽\n" +
        "📅 90 дней - 250₽ (скидка 17%)\n" +
        "📅 365 дней - 800₽ (скидка 35%)",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard.reply_markup,
      },
    )
  } else if (data.startsWith("plan_")) {
    const days = Number.parseInt(data.split("_")[1])
    const platform = userPlatformSelection.get(userId) || "PC"

    let price
    switch (days) {
      case 30:
        price = 100
        break
      case 90:
        price = 250
        break
      case 365:
        price = 800
        break
      default:
        price = 100
    }

    // Здесь должна быть интеграция с платежной системой
    // Для демонстрации создаем лицензию сразу

    bot.editMessageText("⏳ Создаю лицензию...", {
      chat_id: chatId,
      message_id: messageId,
    })

    const license = await createLicense(userId, username, platform, days)

    if (license) {
      const platformEmoji = platform === "PC" ? "💻" : "📱"
      const expiresDate = new Date(license.expires_at).toLocaleDateString("ru-RU")

      bot.editMessageText(
        `✅ Лицензия успешно создана!\n\n` +
          `${platformEmoji} Платформа: ${platform}\n` +
          `🔑 Ключ: \`${license.license_key}\`\n` +
          `⏰ Действует до: ${expiresDate}\n\n` +
          `${
            platform === "Mobile"
              ? "📱 Скопируйте ключ и активируйте его в мобильном приложении ProxySwitcher в разделе Premium."
              : "💻 Скопируйте ключ и активируйте его в ПК приложении ProxySwitcher."
          }`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔑 Мои лицензии", callback_data: "my_licenses" }],
              [{ text: "◀️ В меню", callback_data: "back_to_menu" }],
            ],
          },
        },
      )

      // Очищаем выбор платформы
      userPlatformSelection.delete(userId)
    } else {
      bot.editMessageText("❌ Ошибка при создании лицензии. Попробуйте позже.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: "◀️ В меню", callback_data: "back_to_menu" }]],
        },
      })
    }
  } else if (data === "my_licenses") {
    // Получаем все лицензии пользователя из обеих таблиц
    const { data: pcLicenses } = await supabase.from("licenses").select("*").eq("user_id", userId)

    const { data: mobileLicenses } = await supabase.from("licence_mobail").select("*").eq("user_id", userId)

    const allLicenses = [
      ...(pcLicenses || []).map((l) => ({ ...l, platform: "PC" })),
      ...(mobileLicenses || []).map((l) => ({ ...l, platform: "Mobile" })),
    ]

    if (allLicenses.length === 0) {
      bot.editMessageText(
        "📋 У вас пока нет активных лицензий.\n\n" + "💎 Приобретите Premium для использования приложения.",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "💎 Купить Premium", callback_data: "buy_premium" }],
              [{ text: "◀️ В меню", callback_data: "back_to_menu" }],
            ],
          },
        },
      )
      return
    }

    let licensesText = "🔑 Ваши лицензии:\n\n"
    allLicenses.forEach((license, index) => {
      const expiresDate = new Date(license.expires_at).toLocaleDateString("ru-RU")
      const isActive = license.is_active && new Date(license.expires_at) > new Date()
      const status = isActive ? "✅ Активна" : "❌ Неактивна"
      const platformEmoji = license.platform === "PC" ? "💻" : "📱"

      licensesText += `${index + 1}. ${platformEmoji} ${license.platform}\n`
      licensesText += `   Ключ: \`${license.license_key}\`\n`
      licensesText += `   Статус: ${status}\n`
      licensesText += `   До: ${expiresDate}\n\n`
    })

    bot.editMessageText(licensesText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "◀️ В меню", callback_data: "back_to_menu" }]],
      },
    })
  } else if (data === "help") {
    bot.editMessageText(
      "❓ Помощь по боту\n\n" +
        "1️⃣ Выберите платформу (ПК или Mobile)\n" +
        "2️⃣ Выберите тарифный план\n" +
        "3️⃣ Оплатите подписку\n" +
        "4️⃣ Получите лицензионный ключ\n" +
        "5️⃣ Активируйте ключ в приложении\n\n" +
        "💻 ПК: Вставьте ключ в настройках\n" +
        "📱 Mobile: Раздел Premium → Активировать\n\n" +
        "📧 Поддержка: @support",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: "◀️ В меню", callback_data: "back_to_menu" }]],
        },
      },
    )
  } else if (data === "back_to_menu") {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💎 Купить Premium", callback_data: "buy_premium" }],
          [{ text: "🔑 Мои лицензии", callback_data: "my_licenses" }],
          [{ text: "❓ Помощь", callback_data: "help" }],
        ],
      },
    }

    bot.editMessageText("🌟 ProxySwitcher Bot\n\n" + "Выберите действие:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: keyboard.reply_markup,
    })
  }

  bot.answerCallbackQuery(query.id)
})

console.log("Bot started successfully!")
