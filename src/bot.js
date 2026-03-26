const { Telegraf, session, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

async function downloadAndCompressTelegramPhoto(ctx, fileId) {
  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    
    const filename = `bot_${Date.now()}_${Math.round(Math.random() * 1E9)}.jpg`;
    const filepath = path.join(__dirname, '..', 'public', 'uploads', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toFile(filepath);
      
    return '/uploads/' + filename;
  } catch (err) {
    console.error('Telegram photo processing failed:', err);
    return null;
  }
}

/**
 * Notify all BSK staff members about a new murojaat.
 * Traces: murojaat → building → mahalla → BSK → admins with telegram_id
 */
async function notifyBskStaff(murojaatId) {
  try {
    const m = db.prepare(`
      SELECT m.*, u.full_name, u.phone,
             b.name_or_number as bino_nomi, b.type as bino_turi,
             mh.name as mahalla_name, mh.bsk_id,
             bsk.name as bsk_name
      FROM murojaats m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN buildings b ON m.building_id = b.id
      LEFT JOIN mahallas mh ON b.mahalla_id = mh.id
      LEFT JOIN bsks bsk ON mh.bsk_id = bsk.id
      WHERE m.id = ?
    `).get(murojaatId);

    if (!m || !m.bsk_id) {
      // Also try matching via mikrorayon (mahalla name) if no building link
      if (m && !m.bsk_id && m.mikrorayon) {
        const mahalla = db.prepare('SELECT bsk_id FROM mahallas WHERE name = ?').get(m.mikrorayon);
        if (mahalla && mahalla.bsk_id) {
          m.bsk_id = mahalla.bsk_id;
        } else return;
      } else return;
    }

    // Find all staff assigned to this BSK who have linked their Telegram
    const staffList = db.prepare('SELECT id, username, telegram_id FROM admins WHERE bsk_id = ? AND telegram_id IS NOT NULL').all(m.bsk_id);
    if (!staffList || staffList.length === 0) return;

    const CATEGORIES = {
      gaz: '🔥 Gaz', suv: '💧 Suv', elektr: '⚡ Elektr',
      obodonlashtirish: '🏗 Obodonlashtirish', boshqa: '📌 Boshqa'
    };

    let binoInfo = '';
    if (m.bino_nomi) {
      const bType = m.bino_turi === 'apartment' ? 'Dom' : (m.bino_turi === 'house' ? 'Hovli' : 'Boshqa');
      binoInfo = `\n🏢 Bino: ${m.bino_nomi} (${bType})`;
    }

    const msg = `🆕 Yangi murojaat kelib tushdi!\n\n` +
      `📋 ID: #${m.id}\n` +
      `👤 Fuqaro: ${m.full_name}\n` +
      `📞 Tel: ${m.phone || 'Kiritilmagan'}\n` +
      `📁 Yo'nalish: ${CATEGORIES[m.category] || m.category}\n` +
      `📍 Hudud: ${m.mikrorayon || m.mahalla_name || 'Noma\'lum'}${binoInfo}\n` +
      `💬 Tavsif: ${m.address || 'Kiritilmagan'}`;

    const opts = {
      reply_markup: {
        inline_keyboard: [[{ text: "👁 Ko'rish", callback_data: `viewtask_${m.id}` }]]
      }
    };

    for (const staff of staffList) {
      try {
        if (m.user_image1) {
          const fullPath = path.join(__dirname, '..', 'public', m.user_image1);
          if (fs.existsSync(fullPath)) {
            await bot.telegram.sendPhoto(staff.telegram_id, { source: fullPath }, { caption: msg, ...opts });
          } else {
            await bot.telegram.sendMessage(staff.telegram_id, msg, opts);
          }
        } else {
          await bot.telegram.sendMessage(staff.telegram_id, msg, opts);
        }
        if (m.lat && m.lng) {
          await bot.telegram.sendLocation(staff.telegram_id, m.lat, m.lng).catch(() => {});
        }
      } catch (err) {
        console.error(`BSK staff notification failed for ${staff.username}:`, err.message);
      }
    }
  } catch (err) {
    console.error('notifyBskStaff error:', err.message);
  }
}


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

const STAFF_MENU = Markup.keyboard([
  ['📋 Menga biriktirilgan vazifalar'],
  ['🚪 Chiqish (Xodim)']
]).resize();

const CANCEL_KB = Markup.keyboard([
  ['❌ Bekor qilish']
]).resize();

const LOCATION_KB = Markup.keyboard([
  [Markup.button.locationRequest('📍 Joylashuvni yuborish (GPS)')],
  ['❌ Bekor qilish']
]).resize();

bot.start((ctx) => {
  const telegramId = ctx.from.id;
  
  const adminCheck = db.prepare('SELECT id, username FROM admins WHERE telegram_id = ?').get(telegramId);
  if (adminCheck) {
    ctx.session = { step: 'idle', admin_id: adminCheck.id };
    return ctx.reply(`👋 Salom, xodim ${adminCheck.username}!\n\nXizmat vazifalaringizni boshqarishingiz mumkin.`, STAFF_MENU);
  }

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

bot.command('login', async (ctx) => {
  const text = ctx.message.text.trim();
  const parts = text.split(' ');
  if (parts.length !== 3) {
    return ctx.reply("Foydalanish: /login <username> <password>");
  }
  const username = parts[1];
  const password = parts[2];

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) return ctx.reply("Bunday xodim topilmadi!");
  
  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) return ctx.reply("Parol noto'g'ri!");
  
  db.prepare('UPDATE admins SET telegram_id = ? WHERE id = ?').run(ctx.from.id, admin.id);
  ctx.session = { step: 'idle', admin_id: admin.id };
  return ctx.reply(`✅ Xush kelibsiz, ${username}! Endi siz Telegram orqali vazifalarni boshqara olasiz.`, STAFF_MENU);
});

const handleLogout = (ctx) => {
  db.prepare('UPDATE admins SET telegram_id = NULL WHERE telegram_id = ?').run(ctx.from.id);
  ctx.session = { step: 'idle' };
  return ctx.reply('🚪 Tizimdan chiqdingiz. Fuqaro rejimiga qaytdingiz.', MAIN_MENU);
};

bot.command('logout', handleLogout);
bot.hears('🚪 Chiqish (Xodim)', handleLogout);

bot.hears('❌ Bekor qilish', (ctx) => {
  const isAdmin = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(ctx.from.id);
  ctx.session = { step: 'idle' };
  return ctx.reply('❌ Amal bekor qilindi.', isAdmin ? STAFF_MENU : MAIN_MENU);
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

bot.hears('📋 Menga biriktirilgan vazifalar', (ctx) => {
  const admin = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(ctx.from.id);
  if (!admin) return ctx.reply("Siz xodim emassiz!");

  const assigned = db.prepare(`SELECT * FROM murojaats WHERE assigned_admin_id = ? AND status IN ('idle', 'in_progress') ORDER BY created_at ASC LIMIT 10`).all(admin.id);
  
  if (!assigned || assigned.length === 0) {
    return ctx.reply("Sizda yangi yoki jarayondagi vazifalar yo'q. 🎉", STAFF_MENU);
  }

  return ctx.reply("Sizga biriktirilgan vazifalar:", Markup.inlineKeyboard(
    assigned.map(m => [Markup.button.callback(`📋 #${m.id} - ${CATEGORIES[m.category] || m.category} qamrovi`, `viewtask_${m.id}`)])
  ));
});

bot.action(/viewtask_(\d+)/, async (ctx) => {
  const mId = ctx.match[1];
  await ctx.answerCbQuery();

  const admin = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(ctx.from.id);
  if (!admin) return;

  const m = db.prepare(`
     SELECT m.*, b.name_or_number, b.type as building_type
     FROM murojaats m 
     LEFT JOIN buildings b ON m.building_id = b.id 
     WHERE m.id = ? AND m.assigned_admin_id = ?
  `).get(mId, admin.id);
  if (!m) return ctx.reply(`Bunday vazifa topilmadi yoki sizga biriktirilmagan.`);

  let binoInfo = "";
  if (m.name_or_number) {
      const bType = m.building_type === 'apartment' ? 'Dom' : (m.building_type === 'house' ? 'Hovli' : 'Boshqa');
      binoInfo = `\n🏢 Bino: ${m.name_or_number} (${bType})`;
  }

  const txt = `📌 Vazifa #${m.id}\n📁 Yo'nalish: ${CATEGORIES[m.category] || m.category}\n` +
              `📍 Hudud: ${m.mikrorayon}${binoInfo}\n💬 Matn / Manzil: ${m.address}\n\nQuyidagi amallardan birini tanlang:`;

  if (m.lat && m.lng) {
      try { await ctx.replyWithLocation(m.lat, m.lng); } catch (e) { console.error('Location error:', e.message); }
  }

  return ctx.reply(txt, Markup.inlineKeyboard([
    [Markup.button.callback(`🏃‍♂️ Jarayonda (Boshlash)`, `progress_${m.id}`)],
    [Markup.button.callback(`✅ Bajarildi qilib belgilash`, `complete_${m.id}`)]
  ]));
});

bot.action(/progress_(\d+)/, async (ctx) => {
  const mId = ctx.match[1];
  await ctx.answerCbQuery();

  const admin = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(ctx.from.id);
  if (!admin) return ctx.reply("Siz xodim emassiz!");

  db.prepare(`UPDATE murojaats SET status = 'in_progress' WHERE id = ? AND assigned_admin_id = ?`).run(mId, admin.id);

  ctx.reply(`✅ Vazifa #${mId} muvaffaqiyatli "Jarayonda" deb belgilandi!`, STAFF_MENU);
  
  const m = db.prepare(`SELECT m.*, u.telegram_id AS u_tg_id FROM murojaats m JOIN users u ON m.user_id = u.id WHERE m.id = ?`).get(mId);
  if (m && m.u_tg_id && m.source === 'telegram') {
      try {
        await bot.telegram.sendMessage(m.u_tg_id, `🔔 Murojaatingiz holati o'zgardi:\n\nID: #${m.id}\nYangi Holat: Jarayonda 🏃‍♂️`);
      } catch (err) {}
  }
});

bot.action(/complete_(\d+)/, async (ctx) => {
  const mId = ctx.match[1];
  await ctx.answerCbQuery();

  const admin = db.prepare('SELECT id FROM admins WHERE telegram_id = ?').get(ctx.from.id);
  if (!admin) return ctx.reply("Siz xodim emassiz!");

  ctx.session = { step: 'awaiting_staff_proof_photo', murojaat_id: mId };
  return ctx.reply(`Vazifa #${mId} bajarilganligini isbotlash uchun rasmni yuboring yoki bekor qilish uchun pastdagi tugmani bosing:`, CANCEL_KB);
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
    buttons.push([Markup.button.callback('🔙 Orqaga', 'back_to_category')]);
    return ctx.reply("Mahallangizni tanlang:", Markup.inlineKeyboard(buttons));
  } else {
    // No mahallas exist in DB
    return ctx.reply("Hozircha tizimda MFYlar ro'yxati yo'q, iltimos keyinroq urinib ko'ring.", MAIN_MENU);
  }
});

bot.action('back_to_category', async (ctx) => {
  ctx.session = { step: 'awaiting_category' };
  await ctx.answerCbQuery();
  return ctx.editMessageText(
    "Qaysi yo'nalish bo'yicha murojaat qoldirmoqchisiz?",
    Markup.inlineKeyboard([
      [Markup.button.callback('🔥 Gaz', 'cat_gaz'), Markup.button.callback('💧 Suv', 'cat_suv')],
      [Markup.button.callback('⚡ Elektr', 'cat_elektr')],
      [Markup.button.callback('🏗 Obodonlashtirish', 'cat_obodonlashtirish'), Markup.button.callback('📌 Boshqa', 'cat_boshqa')]
    ])
  );
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
      const b1TypeStr = buildings[i].type === 'apartment' ? "Dom" : (buildings[i].type === 'house' ? 'Hovli' : 'Boshqa');
      const row = [Markup.button.callback(`Uy: ${buildings[i].name_or_number} (${b1TypeStr})`, `bld_${buildings[i].id}`)];
      if (buildings[i + 1]) {
        const b2TypeStr = buildings[i + 1].type === 'apartment' ? "Dom" : (buildings[i + 1].type === 'house' ? 'Hovli' : 'Boshqa');
        row.push(Markup.button.callback(`Uy: ${buildings[i + 1].name_or_number} (${b2TypeStr})`, `bld_${buildings[i + 1].id}`));
      }
      buttons.push(row);
    }
    buttons.push([Markup.button.callback("📌 Boshqa bino (Qo'lda kiritish)", 'bld_other')]);
    buttons.push([Markup.button.callback('🔙 Orqaga', 'back_to_mahalla')]);
    return ctx.reply("Uyingiz yoki binoni tanlang:", Markup.inlineKeyboard(buttons));
  } else {
    // No buildings yet
    ctx.session.step = 'awaiting_address_desc';
    return ctx.reply("Uy raqamingizni va muammo tavsifini yozing (yoki pastki tugma orqali GPS yuboring):", LOCATION_KB);
  }
});

bot.action('back_to_mahalla', async (ctx) => {
  ctx.session.step = 'awaiting_mahalla';
  await ctx.answerCbQuery();
  
  const mahallas = db.prepare('SELECT * FROM mahallas ORDER BY name ASC').all();
  if (mahallas.length > 0) {
    const buttons = [];
    for (let i = 0; i < mahallas.length; i += 2) {
      const row = [Markup.button.callback(mahallas[i].name, `mah_${mahallas[i].id}`)];
      if (mahallas[i + 1]) row.push(Markup.button.callback(mahallas[i + 1].name, `mah_${mahallas[i + 1].id}`));
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🔙 Orqaga', 'back_to_category')]);
    return ctx.editMessageText("Mahallangizni tanlang:", Markup.inlineKeyboard(buttons));
  } else {
    return ctx.editMessageText("Hozircha tizimda MFYlar ro'yxati yo'q, iltimos keyinroq urinib ko'ring.");
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
  return ctx.reply("Muammo tavsifini yozing (yoki pastki tugma orqali GPS yuboring):", LOCATION_KB);
});

bot.on('location', (ctx, next) => {
  ctx.session = ctx.session || {};
  if (ctx.session.step === 'awaiting_address_desc' || ctx.session.step === 'awaiting_address') {
    ctx.session.murojaat.lat = ctx.message.location.latitude;
    ctx.session.murojaat.lng = ctx.message.location.longitude;
    ctx.session.murojaat.address = (ctx.session.murojaat.address ? ctx.session.murojaat.address + " | " : "") + "📍 GPS Xaritadan belgilangan";
    
    if (ctx.session.murojaat.mahalla_name && !ctx.session.murojaat.mikrorayon) {
      ctx.session.murojaat.mikrorayon = ctx.session.murojaat.mahalla_name;
    }

    ctx.session.step = 'awaiting_photos';
    ctx.session.murojaat.photos = [];
    return ctx.reply(
      "📍 GPS Joylashuv qabul qilindi!\n\nEndi muammo rasmlarini yuboring (ko'pi bilan 2 ta) yoki o'tkazib yuborish uchun pastdagi tugmani bosing:", 
      Markup.keyboard([
        ['⏭ O\'tkazib yuborish'],
        ['❌ Bekor qilish']
      ]).resize()
    );
  }
  return next();
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
    return ctx.reply("Kucha / Bino raqami / Muammo tavsifini yozing (yoki GPS yuboring):", LOCATION_KB);
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
    
    ctx.session.step = 'awaiting_photos';
    ctx.session.murojaat.photos = [];
    return ctx.reply(
      "Muammo rasmlarini yuboring (ko'pi bilan 2 ta) yoki o'tkazib yuborish uchun pastdagi tugmani bosing:", 
      Markup.keyboard([
        ['⏭ O\'tkazib yuborish'],
        ['❌ Bekor qilish']
      ]).resize()
    );
  }
  
  if (ctx.session.step === 'awaiting_photos' && (text === "⏭ O'tkazib yuborish" || text === "✅ Yuborish")) {
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

bot.on('photo', async (ctx) => {
  ctx.session = ctx.session || {};
  
  if (ctx.session.step === 'awaiting_staff_proof_photo') {
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];
    
    const savedPath = await downloadAndCompressTelegramPhoto(ctx, largestPhoto.file_id);
    if (!savedPath) return ctx.reply("❌ Rasmni yuklashda xatolik. Qayta urinib ko'ring.");
    
    const mId = ctx.session.murojaat_id;
    db.prepare(`UPDATE murojaats SET status = 'completed', staff_proof_image = ? WHERE id = ?`).run(savedPath, mId);
    
    ctx.reply(`✅ Vazifa #${mId} muvaffaqiyatli "Bajarildi" deb belgilandi!`, STAFF_MENU);
    ctx.session = { step: 'idle' };

    // Send verification prompt to the citizen
    const m = db.prepare(`SELECT m.*, u.telegram_id AS u_tg_id FROM murojaats m JOIN users u ON m.user_id = u.id WHERE m.id = ?`).get(mId);
    if (m && m.u_tg_id) {
      try {
        const verifyMsg = `🎉 Sizning #${mId} raqamli murojaatingiz "Bajarildi" deb belgilandi!\n\n❓ Muammongiz haqiqatan ham hal etildimi?`;
        const verifyOpts = {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Ha, bajarildi', callback_data: `verify_yes_${mId}` },
              { text: '❌ Yo\'q, bajarilmagan', callback_data: `verify_no_${mId}` }
            ]]
          }
        };
        const sysPath = path.join(__dirname, '..', 'public', savedPath);
        if (fs.existsSync(sysPath)) {
           await bot.telegram.sendPhoto(m.u_tg_id, { source: fs.createReadStream(sysPath) }, { caption: verifyMsg, ...verifyOpts });
        } else {
           await bot.telegram.sendMessage(m.u_tg_id, verifyMsg, verifyOpts);
        }
      } catch (err) {
        console.error("Foydalanuvchiga xabar yuborishda xatolik:", err);
      }
    }
    return;
  }

  if (ctx.session.step === 'awaiting_photos') {
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1]; // last one is the largest resolution
    
    const savedPath = await downloadAndCompressTelegramPhoto(ctx, largestPhoto.file_id);
    if (savedPath) {
      ctx.session.murojaat.photos = ctx.session.murojaat.photos || [];
      ctx.session.murojaat.photos.push(savedPath);
      
      if (ctx.session.murojaat.photos.length >= 2) {
        await ctx.reply("✅ 2 ta rasm qabul qilindi.");
        return askPhone(ctx);
      } else {
        return ctx.reply("✅ 1-rasm qabul qilindi. Yana rasmingiz bo'lsa yuboring yoki quyidagi tugmani bosing.", 
          Markup.keyboard([['✅ Yuborish'], ['❌ Bekor qilish']]).resize()
        );
      }
    } else {
      return ctx.reply("❌ Rasmni yuklashda xatolik yuz berdi. Boshqa rasm yuboring yoki o'tkazib yuboring.");
    }
  }
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
    INSERT INTO murojaats (user_id, building_id, category, mikrorayon, address, status, source, user_image1, user_image2, lat, lng) 
    VALUES (?, ?, ?, ?, ?, 'idle', 'telegram', ?, ?, ?, ?)
  `);
  
  const img1 = (m.photos && m.photos.length > 0) ? m.photos[0] : null;
  const img2 = (m.photos && m.photos.length > 1) ? m.photos[1] : null;

  const info = stmt.run(
    userRow.id, 
    m.building_id || null, 
    m.category, 
    m.mikrorayon || '', 
    m.address || '',
    img1,
    img2,
    m.lat || null,
    m.lng || null
  );
  
  ctx.session.step = 'idle';
  ctx.session.murojaat = null;

  // Notify BSK staff about the new murojaat
  notifyBskStaff(info.lastInsertRowid).catch(err => console.error('BSK notify error:', err.message));
  
  // Tell user which BSK is responsible
  let bskMsg = '';
  if (m.building_id) {
    const bskRow = db.prepare(`
      SELECT bsk.name as bsk_name, bsk.phone as bsk_phone
      FROM buildings b
      JOIN mahallas mh ON b.mahalla_id = mh.id
      LEFT JOIN bsks bsk ON mh.bsk_id = bsk.id
      WHERE b.id = ?
    `).get(m.building_id);
    if (bskRow && bskRow.bsk_name) {
      bskMsg = `\n🏢 Mas'ul BSK: ${bskRow.bsk_name}`;
      if (bskRow.bsk_phone) bskMsg += `\n📞 Aloqa: ${bskRow.bsk_phone}`;
    }
  } else if (m.mahalla_id) {
    const bskRow = db.prepare(`
      SELECT bsk.name as bsk_name, bsk.phone as bsk_phone
      FROM mahallas mh
      LEFT JOIN bsks bsk ON mh.bsk_id = bsk.id
      WHERE mh.id = ?
    `).get(m.mahalla_id);
    if (bskRow && bskRow.bsk_name) {
      bskMsg = `\n🏢 Mas'ul BSK: ${bskRow.bsk_name}`;
      if (bskRow.bsk_phone) bskMsg += `\n📞 Aloqa: ${bskRow.bsk_phone}`;
    }
  }

  return ctx.reply(
    `✅ Murojaat muvaffaqiyatli qabul qilindi!\n\nMurojaat ID: #${info.lastInsertRowid}${bskMsg}\nTez orada ko'rib chiqamiz.`,
    MAIN_MENU
  );
}

// -------------------------------------------------------------------------
// Satisfaction Verification Callbacks
// -------------------------------------------------------------------------
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data && data.startsWith('verify_yes_')) {
    const murojaatId = data.replace('verify_yes_', '');
    try {
      // Edit the message to remove the inline buttons
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
      await ctx.answerCbQuery('✅ Javobingiz uchun rahmat!');
      await ctx.reply(
        `✅ Rahmat! Murojaatingiz muvaffaqiyatli yakunlandi.\n\nID: #${murojaatId}\n\nXizmatimizdan foydalanganingiz uchun minnatdormiz. 🙏`,
        MAIN_MENU
      );
    } catch (err) {
      console.error('verify_yes error:', err.message);
    }
    return;
  }

  if (data && data.startsWith('verify_no_')) {
    const murojaatId = data.replace('verify_no_', '');
    try {
      // Edit message to remove inline buttons
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
      await ctx.answerCbQuery('❌ Javobingiz qabul qilindi');
      await ctx.reply(
        `❗️ Afsuski, muammoingiz hal etilmaganligi haqida xabar berdingiz.\n\nID: #${murojaatId}\n\nMurojaatingiz qayta ko'rib chiqish uchun «Jarayonda» holatiga o'tkazildi. Tez orada mutaxassis siz bilan bog'lanadi.`,
        MAIN_MENU
      );

      // Revert murojaat back to in_progress
      const m = db.prepare('SELECT * FROM murojaats WHERE id = ?').get(murojaatId);
      if (m) {
        db.prepare("UPDATE murojaats SET status = 'in_progress' WHERE id = ?").run(murojaatId);

        // Notify the assigned staff if any
        if (m.assigned_admin_id) {
          const staff = db.prepare('SELECT telegram_id, username FROM admins WHERE id = ?').get(m.assigned_admin_id);
          if (staff && staff.telegram_id) {
            const reAlertMsg = `⚠️ Fuqaro murojaati hal etilmaganligini bildirdi!\n\nMurojaat #${murojaatId}\n\nIltimos, muammoni qayta tekshiring va fuqaro bilan bog'laning.`;
            await bot.telegram.sendMessage(staff.telegram_id, reAlertMsg, {
              reply_markup: {
                inline_keyboard: [[{ text: "👁 Ko'rish", callback_data: `viewtask_${murojaatId}` }]]
              }
            }).catch(e => console.error('Re-alert to staff failed:', e.message));
          }
        }
      }
    } catch (err) {
      console.error('verify_no error:', err.message);
    }
    return;
  }

  // Fallback: answer unknown callbacks silently
  await ctx.answerCbQuery().catch(() => {});
});

module.exports = {
  bot,
  notifyBskStaff
};
