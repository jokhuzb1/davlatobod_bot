const { Telegraf, session, Markup } = require('telegraf');
const { db } = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

bot.catch((err, ctx) => {
  console.error(`Telegram Bot Error [${ctx.updateType}]:`, err);
});

const CATEGORIES = {
  gaz: '🔥 Gaz',
  suv: '💧 Suv',
  elektr: '⚡ Elektr',
  obodonlashtirish: '🏗 Obodonlashtirish',
  boshqa: '📌 Boshqa'
};

const STATUS_TRANSLATIONS = {
  idle: "Ko'rib chiqilmagan",
  progress: "Jarayonda",
  completed: "Bajarilgan",
  rejected: "Rad etilgan"
};

const MAIN_MENU = Markup.keyboard([
  ['📝 Murojaat qoldirish'],
  ['📋 Mening murojaatlarim']
]).resize();

const CANCEL_KB = Markup.keyboard([
  ['❌ Bekor qilish']
]).resize();

bot.start((ctx) => {
  const telegramId = ctx.from.id;
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';
  
  db.prepare(`
    INSERT INTO users (telegram_id, full_name) 
    VALUES (?, ?) 
    ON CONFLICT(telegram_id) DO UPDATE SET full_name = excluded.full_name
  `).run(telegramId, fullName);
  
  ctx.session = { step: 'idle' };

  return ctx.reply(
    `👋 Salom, ${fullName}!\n\nKommunal xizmatlar bo'yicha murojaat qoldirishingiz mumkin.`,
    MAIN_MENU
  );
});

bot.hears('❌ Bekor qilish', (ctx) => {
  ctx.session = { step: 'idle' };
  return ctx.reply('❌ Murojaat bekor qilindi.', MAIN_MENU);
});

bot.hears('📋 Mening murojaatlarim', (ctx) => {
  const userQuery = db.prepare(`SELECT id FROM users WHERE telegram_id = ?`).get(ctx.from.id);
  if (!userQuery) return ctx.reply("Sizda hozircha murojaatlar yo'q.", MAIN_MENU);

  const murojaats = db.prepare(`SELECT * FROM murojaats WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`).all(userQuery.id);
  
  if (!murojaats || murojaats.length === 0) {
    return ctx.reply("Sizda hozircha murojaatlar yo'q.", MAIN_MENU);
  }
  
  const text = murojaats.map((m, i) => {
    return `${i + 1}. #${m.id} | Kategoriya: ${CATEGORIES[m.category] || m.category}\n` +
           `Holati: ${STATUS_TRANSLATIONS[m.status] || m.status}\n` +
           `Manba: ${m.source === 'telegram' ? '🤖 Bot' : (m.source === 'web' ? '🌐 Veb-sayt' : '☎️ Call Center')}\n` + 
           `Sana: ${m.created_at}`;
  }).join('\n\n');
  
  return ctx.reply(`Sizning murojaatlaringiz:\n\n${text}`, MAIN_MENU);
});

bot.hears('📝 Murojaat qoldirish', (ctx) => {
  ctx.session = { step: 'awaiting_category' };
  
  return ctx.reply(
    "Qaysi yo'nalish bo'yicha murojaat qoldirmoqchisiz?",
    Markup.inlineKeyboard([
      [Markup.button.callback('🔥 Gaz', 'cat_gaz'), Markup.button.callback('💧 Suv', 'cat_suv')],
      [Markup.button.callback('⚡ Elektr', 'cat_elektr')],
      [Markup.button.callback('🏗 Obodonlashtirish', 'cat_obodonlashtirish'), Markup.button.callback('📌 Boshqa', 'cat_boshqa')]
    ])
  );
});

bot.action(/cat_(.+)/, async (ctx) => {
  ctx.session = ctx.session || {};
  if (ctx.session.step !== 'awaiting_category') {
    return ctx.answerCbQuery("ℹ️ Amal muddati tugagan.", { show_alert: true });
  }
  
  const cat = ctx.match[1];
  ctx.session.murojaat = { category: cat };
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Yo'nalish: *${CATEGORIES[cat] || cat}*`, { parse_mode: 'Markdown' });
  
  // Fetch Mahallas to present
  const mahallas = db.prepare('SELECT * FROM mahallas ORDER BY name ASC').all();
  if (mahallas.length > 0) {
    ctx.session.step = 'awaiting_mahalla';
    
    // Chunk mahallas into rows of 2 for inline keyboard
    const buttons = [];
    for (let i = 0; i < mahallas.length; i += 2) {
      const row = [Markup.button.callback(mahallas[i].name, `mah_${mahallas[i].id}`)];
      if (mahallas[i + 1]) row.push(Markup.button.callback(mahallas[i + 1].name, `mah_${mahallas[i + 1].id}`));
      buttons.push(row);
    }
    
    return ctx.reply("Mahallangizni tanlang:", Markup.inlineKeyboard(buttons));
  } else {
    // No mahallas exist in DB
    return ctx.reply("Hozircha tizimda MFYlar ro'yxati yo'q, iltimos keyinroq urinib ko'ring.", MAIN_MENU);
  }
});

bot.action(/mah_(.+)/, async (ctx) => {
  ctx.session = ctx.session || {};
  if (ctx.session.step !== 'awaiting_mahalla') return ctx.answerCbQuery("ℹ️ Amal muddati tugagan.", { show_alert: true });
  
  const action = ctx.match[1];
  await ctx.answerCbQuery();

  const mahallaId = parseInt(action, 10);
  const mahalla = db.prepare('SELECT * FROM mahallas WHERE id = ?').get(mahallaId);
  ctx.session.murojaat.mahalla_id = mahallaId;
  ctx.session.murojaat.mahalla_name = mahalla.name;

  await ctx.editMessageText(`✅ Mahalla: *${mahalla.name}*`, { parse_mode: 'Markdown' });

  // Fetch buildings for this mahalla
  const buildings = db.prepare('SELECT * FROM buildings WHERE mahalla_id = ? ORDER BY name_or_number ASC').all(mahallaId);
  if (buildings.length > 0) {
    ctx.session.step = 'awaiting_building';
    const buttons = [];
    for (let i = 0; i < buildings.length; i += 2) {
      const row = [Markup.button.callback(`${buildings[i].name_or_number} (${buildings[i].type === 'apartment' ? 'Ko\'p qavatli uylar' : 'Xonadon'})`, `bld_${buildings[i].id}`)];
      if (buildings[i + 1]) {
        row.push(Markup.button.callback(`${buildings[i + 1].name_or_number} (${buildings[i + 1].type === 'apartment' ? 'K. qavatli uylar' : 'Xonadon'})`, `bld_${buildings[i + 1].id}`));
      }
      buttons.push(row);
    }
    buttons.push([Markup.button.callback("📌 Boshqa bino (Qo'lda kiritish)", 'bld_other')]);
    return ctx.reply("Uyingiz yoki binoni tanlang:", Markup.inlineKeyboard(buttons));
  } else {
    // No buildings yet
    ctx.session.step = 'awaiting_address_desc';
    return ctx.reply("Uy raqamingizni va muammo tavsifini yozing:", CANCEL_KB);
  }
});

bot.action(/bld_(.+)/, async (ctx) => {
  ctx.session = ctx.session || {};
  if (ctx.session.step !== 'awaiting_building') return ctx.answerCbQuery("ℹ️ Amal muddati tugagan.", { show_alert: true });
  
  const action = ctx.match[1];
  await ctx.answerCbQuery();

  if (action === 'other') {
    ctx.session.step = 'awaiting_address_desc';
    await ctx.editMessageText(`✅ Boshqa Bino`);
    return ctx.reply("Uy raqamingizni va muammo tavsifini yozing:", CANCEL_KB);
  }

  const buildingId = parseInt(action, 10);
  const bld = db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId);
  ctx.session.murojaat.building_id = buildingId;
  
  await ctx.editMessageText(`✅ Bino: *${bld.name_or_number}*`, { parse_mode: 'Markdown' });
  
  ctx.session.step = 'awaiting_address_desc';
  return ctx.reply("Muammo tavsifini yozing (ixtiyoriy, aniqroq tushunish uchun):", CANCEL_KB);
});


bot.on('text', (ctx, next) => {
  ctx.session = ctx.session || {};
  const text = ctx.message.text.trim();
  
  if (text.startsWith('/') || ['📝 Murojaat qoldirish', '📋 Mening murojaatlarim', '❌ Bekor qilish'].includes(text)) {
    return next();
  }

  if (ctx.session.step === 'awaiting_mikrorayon') {
    ctx.session.murojaat.mikrorayon = text;
    ctx.session.step = 'awaiting_address';
    return ctx.reply("Kucha / Bino raqami / Muammo tavsifini yozing:", CANCEL_KB);
  }
  
  if (ctx.session.step === 'awaiting_address') {
    ctx.session.murojaat.address = text;
    return askPhone(ctx);
  }

  if (ctx.session.step === 'awaiting_address_desc') {
    // For DB building selected, store details in address
    ctx.session.murojaat.address = text;
    // Set mikrorayon to the mahalla name if it exists so table shows it nicely
    if (ctx.session.murojaat.mahalla_name) ctx.session.murojaat.mikrorayon = ctx.session.murojaat.mahalla_name;
    return askPhone(ctx);
  }
  
  if (ctx.session.step === 'awaiting_contact') {
    const phone = text.replace(/[^0-9+]/g, '');
    if (phone.length >= 9) {
      return saveMurojaat(ctx, phone);
    } else {
      return ctx.reply("Iltimos, haqiqiy telefon raqamni kiriting yoki pastdagi tugmani bosing.", CANCEL_KB);
    }
  }

  return next();
});

bot.on('contact', (ctx) => {
  ctx.session = ctx.session || {};
  if (ctx.session.step === 'awaiting_contact') {
    const contact = ctx.message.contact;
    return saveMurojaat(ctx, contact.phone_number);
  }
});

function askPhone(ctx) {
  const userStmt = db.prepare(`SELECT phone FROM users WHERE telegram_id = ?`);
  const user = userStmt.get(ctx.from.id);
  
  if (user && user.phone) {
    return saveMurojaat(ctx, user.phone);
  } else {
    ctx.session.step = 'awaiting_contact';
    return ctx.reply(
      "Telefon raqamingizni yuboring 📱👇",
      Markup.keyboard([
        [Markup.button.contactRequest("📞 Telefon raqamni yuborish")],
        ['❌ Bekor qilish']
      ]).resize().oneTime()
    );
  }
}

function saveMurojaat(ctx, phone) {
  const telegramId = ctx.from.id;
  const m = ctx.session.murojaat;
  
  db.prepare(`UPDATE users SET phone = COALESCE(phone, ?) WHERE telegram_id = ?`).run(phone, telegramId);
  let userRow = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(telegramId);

  // Fallback: If the user was wiped from the DB (due to the old DB bug) but continued using the bot
  // or bypassed /start, insert them to prevent a crash
  if (!userRow) {
    const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';
    const info = db.prepare(`INSERT INTO users (telegram_id, full_name, phone) VALUES (?, ?, ?)`).run(telegramId, fullName, phone);
    userRow = { id: info.lastInsertRowid };
  }

  const stmt = db.prepare(`
    INSERT INTO murojaats (user_id, building_id, category, mikrorayon, address, status, source) 
    VALUES (?, ?, ?, ?, ?, 'idle', 'telegram')
  `);
  const info = stmt.run(
    userRow.id, 
    m.building_id || null, 
    m.category, 
    m.mikrorayon || '', 
    m.address || ''
  );
  
  ctx.session.step = 'idle';
  ctx.session.murojaat = null;
  
  return ctx.reply(
    `✅ Murojaat muvaffaqiyatli qabul qilindi!\n\nMurojaat ID: #${info.lastInsertRowid}\nTez orada ko'rib chiqamiz.`,
    MAIN_MENU
  );
}

module.exports = {
  bot
};
