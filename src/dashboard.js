const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { bot, notifyBskStaff } = require('./bot');

const router = express.Router();
router.use(cors());

// A simple JWT secret - typically stored in .env
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_murojaat_key_2026';

const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: "Xavfsizlik tizimi: Ko'p urinishlar. Iltimos 15 daqiqadan so'ng qayta urining." } });
const publicLimiter = rateLimit({ windowMs: 10*60*1000, max: 5, message: { error: "Xavfsizlik: Juda ko'p murojaat yubordingiz. Birozdan so'ng qayta urining." } });

const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function compressAndSaveImage(buffer) {
  const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.jpg';
  const filepath = path.join(__dirname, '..', 'public', 'uploads', filename);
  await sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(filepath);
  return '/uploads/' + filename;
}

// -------------------------------------------------------------
// BSK Management 
// -------------------------------------------------------------
router.get('/bsks', authenticate, (req, res) => {
  try {
    const bsks = db.prepare('SELECT * FROM bsks ORDER BY name ASC').all();
    const mQuery = db.prepare('SELECT id FROM mahallas WHERE bsk_id = ?');
    const aQuery = db.prepare('SELECT id FROM admins WHERE bsk_id = ?');
    const bQuery = db.prepare('SELECT id FROM buildings WHERE bsk_id = ?');
    for (let b of bsks) {
      b.mahalla_ids = mQuery.all(b.id).map(r => r.id);
      b.admin_ids = aQuery.all(b.id).map(r => r.id);
      b.building_ids = bQuery.all(b.id).map(r => r.id);
    }
    res.json(bsks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/bsks', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { name, phone = '', address = '', mahalla_ids = [], admin_ids = [], building_ids = [] } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: "Nomi kiritilishi shart" });
  try {
    const tx = db.transaction(() => {
      const info = db.prepare('INSERT INTO bsks (name, phone, address) VALUES (?, ?, ?)').run(name.trim(), phone.trim(), address.trim());
      const newId = info.lastInsertRowid;
      
      const updateM = db.prepare('UPDATE mahallas SET bsk_id = ? WHERE id = ?');
      for (let mId of mahalla_ids) updateM.run(newId, mId);
      
      const updateA = db.prepare('UPDATE admins SET bsk_id = ? WHERE id = ?');
      for (let aId of admin_ids) updateA.run(newId, aId);

      const updateB = db.prepare('UPDATE buildings SET bsk_id = ? WHERE id = ?');
      for (let bId of building_ids) updateB.run(newId, bId);
      
      return newId;
    });
    res.json({ id: tx(), name: name.trim() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/bsks/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { name, phone = '', address = '', mahalla_ids = [], admin_ids = [], building_ids = [] } = req.body;
  const bskId = req.params.id;
  try {
    const tx = db.transaction(() => {
      if (name && name.trim() !== '') {
         db.prepare('UPDATE bsks SET name = ?, phone = ?, address = ? WHERE id = ?').run(name.trim(), phone.trim(), address.trim(), bskId);
      }
      db.prepare('UPDATE mahallas SET bsk_id = NULL WHERE bsk_id = ?').run(bskId);
      db.prepare('UPDATE admins SET bsk_id = NULL WHERE bsk_id = ?').run(bskId);
      db.prepare('UPDATE buildings SET bsk_id = NULL WHERE bsk_id = ?').run(bskId);
      
      const updateM = db.prepare('UPDATE mahallas SET bsk_id = ? WHERE id = ?');
      for (let mId of mahalla_ids) updateM.run(bskId, mId);
      
      const updateA = db.prepare('UPDATE admins SET bsk_id = ? WHERE id = ?');
      for (let aId of admin_ids) updateA.run(bskId, aId);

      const updateB = db.prepare('UPDATE buildings SET bsk_id = ? WHERE id = ?');
      for (let bId of building_ids) updateB.run(bskId, bId);
    });
    tx();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/bsks/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  try {
    const mCount = db.prepare('SELECT count(*) as c FROM mahallas WHERE bsk_id = ?').get(req.params.id);
    if (mCount.c > 0) return res.status(400).json({ error: "Bu BSKga avval biriktirilgan mahallalar mavjud!" });
    db.prepare('DELETE FROM bsks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// -------------------------------------------------------------
// 1. Authentication
// -------------------------------------------------------------
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Foydalanuvchi nomi va parol kiritilishi shart' });

  const user = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Noto\'g\'ri ma\'lumotlar' });

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) return res.status(401).json({ error: 'Noto\'g\'ri ma\'lumotlar' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, role: user.role, username: user.username, id: user.id });
});

// -------------------------------------------------------------
// 2A. Public Omnichannel Submission Endpoints
// -------------------------------------------------------------
router.get('/public/mahallas', (req, res) => {
  res.json(db.prepare(`
    SELECT m.*, b.name as bsk_name 
    FROM mahallas m 
    LEFT JOIN bsks b ON m.bsk_id = b.id 
    ORDER BY m.name ASC
  `).all());
});

router.get('/public/buildings', (req, res) => {
  const mahalla_id = req.query.mahalla_id;
  if (!mahalla_id) return res.status(400).json({ error: "mahalla_id kiritilishi shart" });
  res.json(db.prepare(`
    SELECT b.*, bs.name as bsk_name 
    FROM buildings b 
    LEFT JOIN bsks bs ON b.bsk_id = bs.id 
    WHERE b.mahalla_id = ? 
    ORDER BY b.name_or_number ASC
  `).all(mahalla_id));
});

router.get('/buildings/all', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  res.json(db.prepare(`
    SELECT b.*, m.name as mahalla_name, bs.name as bsk_name 
    FROM buildings b 
    JOIN mahallas m ON b.mahalla_id = m.id 
    LEFT JOIN bsks bs ON b.bsk_id = bs.id
    ORDER BY b.name_or_number ASC
  `).all());
});

// Admin Mahalla CRUD
router.post('/mahallas', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { name, bsk_id } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: "Nomi kiriting" });
  try {
    const finalBsk = bsk_id ? parseInt(bsk_id) : null;
    const info = db.prepare('INSERT INTO mahallas (name, bsk_id) VALUES (?, ?)').run(name.trim(), finalBsk);
    res.json({ id: info.lastInsertRowid, name: name.trim(), bsk_id: finalBsk });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/mahallas/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { name, bsk_id } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: "Nomi kiriting" });
  try {
    const finalBsk = bsk_id ? parseInt(bsk_id) : null;
    db.prepare('UPDATE mahallas SET name = ?, bsk_id = ? WHERE id = ?').run(name.trim(), finalBsk, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/mahallas/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  try {
    const bCount = db.prepare('SELECT count(*) as c FROM buildings WHERE mahalla_id = ?').get(req.params.id);
    if (bCount.c > 0) return res.status(400).json({ error: "Ushbu mahallaga tegishli binolar mavjud. Dastlab binolarni o'chiring yoki boshqa mahallaga o'tkazing." });
    
    db.prepare('DELETE FROM mahallas WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mahallas/:id/stats', authenticate, (req, res) => {
  try {
    const mahallaId = req.params.id;
    const bCountRow = db.prepare('SELECT count(*) as c FROM buildings WHERE mahalla_id = ?').get(mahallaId);
    
    const statusCounts = db.prepare(`
      SELECT m.status, count(*) as count 
      FROM murojaats m JOIN buildings b ON m.building_id = b.id 
      WHERE b.mahalla_id = ? GROUP BY m.status
    `).all(mahallaId);

    const stats = { total_buildings: bCountRow.c, total_murojaats: 0, completed: 0, in_progress: 0, idle: 0, rejected: 0 };
    statusCounts.forEach(s => {
      stats[s.status] = s.count;
      stats.total_murojaats += s.count;
    });

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/murojaats/public', publicLimiter, upload.array('images', 2), async (req, res) => {
  const { phone, full_name, category, building_id, mikrorayon, address, source, lat, lng } = req.body;
  if (!phone || !full_name || !category) return res.status(400).json({ error: "F.I.Sh, Telefon va Yo'nalish kiritilishi shart." });

  try {
    let img1 = null;
    let img2 = null;
    if (req.files && req.files.length > 0) {
      img1 = await compressAndSaveImage(req.files[0].buffer);
      if (req.files.length > 1) {
        img2 = await compressAndSaveImage(req.files[1].buffer);
      }
    }

    // Treat phone as unique enough identifier for non-telegram users
    let user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (!user) {
      const info = db.prepare('INSERT INTO users (phone, full_name) VALUES (?, ?)').run(phone, full_name);
      user = { id: info.lastInsertRowid };
    } else {
      // Update name if different
      db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(full_name, user.id);
    }
    
    const stmt = db.prepare(`
      INSERT INTO murojaats (user_id, building_id, category, mikrorayon, address, source, status, user_image1, user_image2, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?)
    `);
    
    // source could be 'web' or 'call'
    const finalSource = ['web', 'call'].includes(source) ? source : 'web';
    
    const info = stmt.run(user.id, building_id || null, category, mikrorayon || '', address || '', finalSource, img1, img2, lat || null, lng || null);
    
    // Notify user via Telegram about their submission + responsible BSK
    try {
      const telegramUser = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(user.id);
      if (telegramUser && telegramUser.telegram_id) {
        let bskInfo = '';
        if (building_id) {
          const bskRow = db.prepare(`
            SELECT bsk.name as bsk_name, bsk.phone as bsk_phone
            FROM buildings b
            JOIN mahallas mh ON b.mahalla_id = mh.id
            LEFT JOIN bsks bsk ON mh.bsk_id = bsk.id
            WHERE b.id = ?
          `).get(building_id);
          if (bskRow && bskRow.bsk_name) {
            bskInfo = `\n\n🏢 Mas'ul tashkilot: *${bskRow.bsk_name}*`;
            if (bskRow.bsk_phone) bskInfo += `\n📞 Aloqa: ${bskRow.bsk_phone}`;
          }
        }
        const confirmMsg = `✅ Murojaatingiz qabul qilindi!\n\nID: #${info.lastInsertRowid}\nYo'nalish: ${category}\nManzil: ${address || mikrorayon || 'Ko\'rsatilmagan'}${bskInfo}\n\nTez orada mutaxassis siz bilan bog'lanadi.`;
        await bot.telegram.sendMessage(telegramUser.telegram_id, confirmMsg, { parse_mode: 'Markdown' }).catch(e => console.error('Confirm msg failed:', e.message));
      }
    } catch (notifyErr) {
      console.error('BSK notification error:', notifyErr.message);
    }
    
    // Notify BSK staff about the new murojaat
    notifyBskStaff(info.lastInsertRowid).catch(err => console.error('BSK staff notify (public):', err.message));

    res.json({ success: true, id: info.lastInsertRowid });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token mavjud emas' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Yaroqsiz token' });
  }
}

// -------------------------------------------------------------
// 2. Murojaatlar Management
// -------------------------------------------------------------
router.get('/murojaats', authenticate, (req, res) => {
  const { role } = req.admin;
  const filterCat = req.query.category; // optional category filter from UI
  const { startDate, endDate } = req.query;
  
  let query = `
    SELECT m.*, u.full_name, u.phone, a.username as assigned_admin,
           a.full_name as staff_full_name, a.phone as staff_phone, a.job_title as staff_job_title,
           b.name_or_number as bino_nomi, b.type as bino_turi,
           mh.name as mahalla_biriktirilgan,
           bsk.name as bsk_name, bsk.phone as bsk_phone
    FROM murojaats m 
    JOIN users u ON m.user_id = u.id
    LEFT JOIN admins a ON m.assigned_admin_id = a.id
    LEFT JOIN buildings b ON m.building_id = b.id
    LEFT JOIN mahallas mh ON b.mahalla_id = mh.id
    LEFT JOIN bsks bsk ON mh.bsk_id = bsk.id
  `;
  const params = [];
  const clauses = [];

  if (role !== 'SuperAdmin') {
    // Restrict to their role, eg Gaz_Staff -> gaz
    clauses.push(`m.category = ?`);
    params.push(role.split('_')[0].toLowerCase());
  } else if (filterCat && filterCat !== 'barchasi') {
    clauses.push(`m.category = ?`);
    params.push(filterCat);
  }

  const filterMahalla = req.query.mahalla_name;
  if (filterMahalla) {
    clauses.push(`m.mikrorayon = ?`);
    params.push(filterMahalla);
  }

  if (startDate) {
    clauses.push(`m.created_at >= ?`);
    params.push(startDate + ' 00:00:00');
  }
  if (endDate) {
    clauses.push(`m.created_at <= ?`);
    params.push(endDate + ' 23:59:59');
  }

  if (clauses.length > 0) {
    query += ` WHERE ` + clauses.join(' AND ');
  }

  query += ` ORDER BY m.created_at DESC LIMIT 300`;
  const murojaats = db.prepare(query).all(...params);
  res.json(murojaats);
});

router.patch('/murojaats/:id/status', authenticate, upload.single('proof_image'), async (req, res) => {
  const id = req.params.id;
  const { status, comment, assigned_admin_id } = req.body;
  const adminId = req.admin.id;
  const role = req.admin.role;
  
  const m = db.prepare('SELECT * FROM murojaats WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Topilmadi' });

  // Access Control: If assigned to someone else, only that person or SuperAdmin can edit
  if (m.assigned_admin_id && m.assigned_admin_id !== adminId && role !== 'SuperAdmin') {
    return res.status(403).json({ error: "Siz bu murojaatni tahrir qila olmaysiz, u boshqa xodimga biriktirilgan." });
  }

  const final_assigned = assigned_admin_id !== undefined ? assigned_admin_id : m.assigned_admin_id;

  let proofImg = m.staff_proof_image;
  try {
    if (req.file) {
      proofImg = await compressAndSaveImage(req.file.buffer);
    }

    if (status === 'completed' && !proofImg) {
      return res.status(400).json({ error: "Bajarilgan holatga o'tkazish uchun isbot rasm yuklash majburiy." });
    }

    db.prepare('UPDATE murojaats SET status = ?, assigned_admin_id = ?, staff_proof_image = ? WHERE id = ?')
      .run(status, final_assigned || null, proofImg, id);

    if (final_assigned && final_assigned !== m.assigned_admin_id) {
       const staff = db.prepare('SELECT telegram_id FROM admins WHERE id = ?').get(final_assigned);
       if (staff && staff.telegram_id) {
          let binoInfo = '';
          if (m.building_id) {
            const b = db.prepare('SELECT b.name_or_number, b.type, mh.name as mh_name FROM buildings b JOIN mahallas mh ON b.mahalla_id = mh.id WHERE b.id = ?').get(m.building_id);
            if (b) binoInfo = `\nMahalla: ${b.mh_name}\nBino: ${b.name_or_number} (${b.type})`;
          }
          const msg = `❗️ Sizga yangi vazifa biriktirildi!\n\nMurojaat #${m.id}\nYo'nalish: ${m.category}\nHudud (Kirish): ${m.mikrorayon}${binoInfo}\n💬 Matn/Manzil: ${m.address}\n\nIltimos, uni tezkor ko'rib chiqing.`;
          const opts = {
             reply_markup: { inline_keyboard: [[ { text: "👁 Ko'rish (Boshqarish)", callback_data: `viewtask_${m.id}` } ]] }
          };
          
          if (m.user_image1 || m.user_image2) {
             const imgPath = m.user_image1 || m.user_image2;
             const fullPath = path.join(__dirname, '..', 'public', imgPath);
             bot.telegram.sendPhoto(staff.telegram_id, { source: fullPath }, { caption: msg, ...opts })
                .then(() => {
                   if (m.lat && m.lng) bot.telegram.sendLocation(staff.telegram_id, m.lat, m.lng).catch(e => console.error(e.message));
                })
                .catch(e => {
                   console.error("Photo send failed, falling back to text:", e.message);
                   bot.telegram.sendMessage(staff.telegram_id, msg, opts)
                      .then(() => {
                         if (m.lat && m.lng) bot.telegram.sendLocation(staff.telegram_id, m.lat, m.lng).catch(e => console.error(e.message));
                      })
                      .catch(err=>console.error(err.message));
                });
          } else {
             bot.telegram.sendMessage(staff.telegram_id, msg, opts)
                .then(() => {
                   if (m.lat && m.lng) bot.telegram.sendLocation(staff.telegram_id, m.lat, m.lng).catch(e => console.error(e.message));
                })
                .catch(e => console.error(e.message));
          }
       }
    }

    const STATUS_LABELS = {
      'idle': 'Kutilmoqda',
      'in_progress': 'Jarayonda',
      'completed': 'Bajarildi',
      'rejected': 'Rad etildi'
    };

    let notifyMessage = `🔔 Murojaatingiz bo'yicha yangi ma'lumot:\n\nID: #${m.id}\nHolat: ${STATUS_LABELS[status] || status}\n`;
    if (final_assigned && final_assigned !== m.assigned_admin_id) {
       notifyMessage += `\n🧑‍🔧 Murojaatingiz mutaxassisga biriktirildi va tez orada ko'rib chiqiladi!`;
    }
    if (comment) notifyMessage += `\n💬 Izoh: ${comment}`;
    
    try {
      const origUser = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(m.user_id);
      if (origUser && origUser.telegram_id) {
        if (status === 'completed') {
          // Send satisfaction verification prompt with Yes/No buttons
          const verifyMsg = `🎉 Murojaatingiz bajarildi deb belgilandi!\n\nID: #${m.id}\n${comment ? `💬 Xodim izohi: ${comment}\n` : ''}\n❓ Muammongiz haqiqatan ham hal etildimi?`;
          const verifyOpts = {
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Ha, bajarildi', callback_data: `verify_yes_${m.id}` },
                { text: '❌ Yo\'q, bajarilmagan', callback_data: `verify_no_${m.id}` }
              ]]
            }
          };
          if (proofImg) {
            const fullPath = path.join(__dirname, '..', 'public', proofImg);
            await bot.telegram.sendPhoto(origUser.telegram_id, { source: fullPath }, { caption: verifyMsg, ...verifyOpts }).catch(async () => {
              await bot.telegram.sendMessage(origUser.telegram_id, verifyMsg, verifyOpts);
            });
          } else {
            await bot.telegram.sendMessage(origUser.telegram_id, verifyMsg, verifyOpts);
          }
        } else {
          // For all other status changes: send a regular notification
          let notifyMsg = `🔔 Murojaatingiz bo'yicha yangi ma'lumot:\n\nID: #${m.id}\nHolat: ${STATUS_LABELS[status] || status}`;
          if (final_assigned && final_assigned !== m.assigned_admin_id) notifyMsg += `\n\n🧑‍🔧 Murojaatingiz mutaxassisga biriktirildi va tez orada ko'rib chiqiladi!`;
          if (comment) notifyMsg += `\n💬 Izoh: ${comment}`;
          if (m.status !== status || (final_assigned && final_assigned !== m.assigned_admin_id)) {
            await bot.telegram.sendMessage(origUser.telegram_id, notifyMsg).catch(e => console.error(e.message));
          }
        }
      }
    } catch (err) {
      console.error(`Status update notification failed for user ${m.user_id}:`, err.message);
    }


    res.json({ success: true, proof_image: proofImg });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// -------------------------------------------------------------
// 3. Stats & Admin Ratings
// -------------------------------------------------------------
router.get('/stats', authenticate, (req, res) => {
  const { role } = req.admin;
  let stats;
  if (role === 'SuperAdmin') {
     stats = db.prepare(`SELECT status, count(*) as c FROM murojaats GROUP BY status`).all();
  } else {
     const assignedCat = role.split('_')[0].toLowerCase();
     stats = db.prepare(`SELECT status, count(*) as c FROM murojaats WHERE category = ? GROUP BY status`).all(assignedCat);
  }
  
  const formatted = { total: 0, idle: 0, in_progress: 0, completed: 0, rejected: 0 };
  stats.forEach(s => {
    formatted[s.status] = s.c;
    formatted.total += s.c;
  });
  res.json(formatted);
});

router.get('/admin-stats', authenticate, (req, res) => {
   if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
   
   const { startDate, endDate } = req.query;
   let dateClause = '';
   let params = [];
   if (startDate) {
       dateClause += ` AND created_at >= ?`;
       params.push(startDate + ' 00:00:00');
   }
   if (endDate) {
       dateClause += ` AND created_at <= ?`;
       params.push(endDate + ' 23:59:59');
   }

   const admins = db.prepare(`SELECT id, username, role FROM admins WHERE role != 'SuperAdmin'`).all();
   const catTotals = db.prepare(`SELECT category, count(*) as count FROM murojaats WHERE 1=1 ${dateClause} GROUP BY category`).all(...params);
   const totalsMap = {};
   catTotals.forEach(c => totalsMap[c.category] = c.count);

   const statusTotals = db.prepare(`SELECT status, count(*) as count FROM murojaats WHERE 1=1 ${dateClause} GROUP BY status`).all(...params);
   const overallStats = { total: 0, completed: 0, in_progress: 0, idle: 0, rejected: 0 };
   statusTotals.forEach(s => {
       overallStats[s.status] = s.count;
       overallStats.total += s.count;
   });

   const adminStats = db.prepare(`
      SELECT assigned_admin_id, status, count(*) as count 
      FROM murojaats 
      WHERE assigned_admin_id IS NOT NULL ${dateClause}
      GROUP BY assigned_admin_id, status
   `).all(...params);

   const result = admins.map(a => {
       const roleCat = a.role.split('_')[0].toLowerCase();
       const catTotal = totalsMap[roleCat] || 0;
       
       const adminsInRole = admins.filter(x => x.role === a.role).length;
       const expected = adminsInRole > 0 ? catTotal / adminsInRole : 0;

       let completed = 0;
       let active = 0;
       let totalAssigned = 0;
       
       adminStats.forEach(stat => {
           if (stat.assigned_admin_id === a.id) {
               if (stat.status === 'completed') completed += stat.count;
               else if (stat.status === 'idle' || stat.status === 'in_progress') active += stat.count;
               totalAssigned += stat.count;
           }
       });

       let rating = 'average';
       if (expected > 0) {
           if (completed >= expected * 0.8) rating = 'good';
           else if (completed < expected * 0.4) rating = 'poor';
       } else if (completed === 0 && active === 0) {
           rating = 'good'; // empty backlog is considered good
       }

       return {
           id: a.id,
           username: a.username,
           role: a.role,
           completed,
           active,
           totalAssigned,
           expected: Math.round(expected),
           rating
       };
   });
   
   result.sort((a, b) => b.completed - a.completed);

   const probBuildings = db.prepare(`
     SELECT b.id, b.name_or_number, m.name as mahalla_name, COUNT(mur.id) as issues_count, GROUP_CONCAT(DISTINCT mur.category) as categories
     FROM buildings b
     JOIN mahallas m ON b.mahalla_id = m.id
     JOIN murojaats mur ON mur.building_id = b.id
     WHERE mur.status IN ('idle', 'in_progress') ${dateClause.replace(/created_at/g, 'mur.created_at')}
     GROUP BY b.id
     ORDER BY issues_count DESC
     LIMIT 10
   `).all(...params);

   res.json({
       staffPerformers: result,
       problematicBuildings: probBuildings,
       categoryBreakdown: totalsMap,
       overallStats: overallStats
   });
});

// -------------------------------------------------------------
// 4. Admin Management
// -------------------------------------------------------------
router.get('/staff', authenticate, (req, res) => {
  // Public staff list for dropdown assignments
  res.json(db.prepare(`
    SELECT a.id, a.username, a.role, a.full_name, a.phone, a.job_title, b.name as bsk_name 
    FROM admins a 
    LEFT JOIN bsks b ON a.bsk_id = b.id 
    ORDER BY a.id
  `).all());
});

router.get('/admins/:id/performance', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const adminId = req.params.id;
  const { startDate, endDate } = req.query;
  
  let dateClause = '';
  let params = [adminId];
  if (startDate) {
      dateClause += ` AND created_at >= ?`;
      params.push(startDate + ' 00:00:00');
  }
  if (endDate) {
      dateClause += ` AND created_at <= ?`;
      params.push(endDate + ' 23:59:59');
  }

  try {
    const assigned = db.prepare(`SELECT status, category, date(created_at) as d FROM murojaats WHERE assigned_admin_id = ? ${dateClause}`).all(...params);
    
    const overall = { total: 0, completed: 0, in_progress: 0, rejected: 0, idle: 0 };
    const catBreakdown = {};
    const dailyHash = {}; 

    assigned.forEach(m => {
       overall.total++;
       if (overall[m.status] !== undefined) overall[m.status]++;
       
       if (m.status === 'completed') {
          catBreakdown[m.category] = (catBreakdown[m.category] || 0) + 1;
          const d = m.d;
          dailyHash[d] = (dailyHash[d] || 0) + 1;
       }
    });

    const dailyTrend = Object.keys(dailyHash).sort().map(d => ({ date: d, count: dailyHash[d] }));

    res.json({ overall, catBreakdown, dailyTrend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/profile/stats', authenticate, (req, res) => {
  const stats = db.prepare(`SELECT status, count(*) as c FROM murojaats WHERE assigned_admin_id = ? GROUP BY status`).all(req.admin.id);
  const formatted = { total: 0, idle: 0, in_progress: 0, completed: 0, rejected: 0 };
  stats.forEach(s => {
    formatted[s.status] = s.c;
    formatted.total += s.c;
  });
  res.json(formatted);
});

router.get('/profile/murojaats', authenticate, (req, res) => {
  const query = `
    SELECT m.*, u.full_name, u.phone, a.username as assigned_admin
    FROM murojaats m 
    JOIN users u ON m.user_id = u.id
    LEFT JOIN admins a ON m.assigned_admin_id = a.id
    WHERE m.assigned_admin_id = ?
    ORDER BY m.created_at DESC
  `;
  res.json(db.prepare(query).all(req.admin.id));
});

router.get('/admins', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  res.json(db.prepare(`
    SELECT a.id, a.username, a.role, a.bsk_id, a.full_name, a.phone, a.job_title, b.name as bsk_name 
    FROM admins a 
    LEFT JOIN bsks b ON a.bsk_id = b.id 
    ORDER BY a.id
  `).all());
});

router.post('/admins', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { username, password, role, bsk_id, full_name, phone, job_title } = req.body;
  if(!username || !password || !role) return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
  
  try {
     const finalBsk = bsk_id ? parseInt(bsk_id) : null;
     const hash = bcrypt.hashSync(password, 10);
     db.prepare('INSERT INTO admins (username, password_hash, role, bsk_id, full_name, phone, job_title) VALUES (?, ?, ?, ?, ?, ?, ?)').run(username, hash, role, finalBsk, full_name || null, phone || null, job_title || null);
     res.json({ success: true });
  } catch (err) {
     res.status(400).json({ error: "Bunday foydalanuvchi mavjud bo'lishi mumkin" });
  }
});

router.put('/admins/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { username, password, role, bsk_id, full_name, phone, job_title } = req.body;
  if(!username || !role) return res.status(400).json({ error: "Username va roleni to'ldiring" });
  
  try {
     const finalBsk = bsk_id ? parseInt(bsk_id) : null;
     if (password) {
       const hash = bcrypt.hashSync(password, 10);
       db.prepare('UPDATE admins SET username = ?, password_hash = ?, role = ?, bsk_id = ?, full_name = ?, phone = ?, job_title = ? WHERE id = ?').run(username, hash, role, finalBsk, full_name || null, phone || null, job_title || null, req.params.id);
     } else {
       db.prepare('UPDATE admins SET username = ?, role = ?, bsk_id = ?, full_name = ?, phone = ?, job_title = ? WHERE id = ?').run(username, role, finalBsk, full_name || null, phone || null, job_title || null, req.params.id);
     }
     res.json({ success: true });
  } catch (err) {
     res.status(400).json({ error: "Xatolik ro'y berdi" });
  }
});

router.delete('/admins/:id', authenticate, (req, res) => {
   if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
   const id = req.params.id;
   if (req.admin.id == id) return res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
   db.prepare('DELETE FROM admins WHERE id = ?').run(id);
   res.json({ success: true });
});

// Seed an initial SuperAdmin if none exist
function seedSuperAdmin() {
  const existing = db.prepare("SELECT count(*) as count FROM admins").get();
  if (existing.count === 0) {
    const defaultPass = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)`).run('admin', defaultPass, 'SuperAdmin');
  }
}
seedSuperAdmin();

// -------------------------------------------------------------
// 5. Mahalla Management
// -------------------------------------------------------------
router.get('/mahallas', authenticate, (req, res) => {
  res.json(db.prepare(`
    SELECT m.*, b.name as bsk_name 
    FROM mahallas m 
    LEFT JOIN bsks b ON m.bsk_id = b.id 
    ORDER BY m.name ASC
  `).all());
});

router.post('/mahallas', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { name } = req.body;
  if(!name) return res.status(400).json({ error: "Mahalla nomini kiriting" });
  try {
     const info = db.prepare('INSERT INTO mahallas (name) VALUES (?)').run(name);
     res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
     res.status(500).json({ error: err.message });
  }
});

router.delete('/mahallas/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  db.prepare('DELETE FROM mahallas WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.put('/mahallas/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { name } = req.body;
  if(!name) return res.status(400).json({ error: "Mahalla nomini kiriting" });
  try {
     db.prepare('UPDATE mahallas SET name = ? WHERE id = ?').run(name, req.params.id);
     res.json({ success: true });
  } catch (err) {
     res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. Buildings Management
// -------------------------------------------------------------
router.get('/buildings', authenticate, (req, res) => {
  if (req.query.all === 'true') {
     const query = `
       SELECT b.*, m.name as mahalla_name, bs.name as bsk_name,
         (SELECT COUNT(*) FROM murojaats mur WHERE mur.building_id = b.id AND mur.status IN ('idle', 'in_progress')) as active_issues,
         (SELECT GROUP_CONCAT(DISTINCT mur.category) FROM murojaats mur WHERE mur.building_id = b.id AND mur.status IN ('idle', 'in_progress')) as active_categories
       FROM buildings b 
       JOIN mahallas m ON b.mahalla_id = m.id
       LEFT JOIN bsks bs ON b.bsk_id = bs.id
       ORDER BY b.id DESC
     `;
     return res.json(db.prepare(query).all());
  }

  const mahalla_id = req.query.mahalla_id;
  if (!mahalla_id) return res.status(400).json({ error: "mahalla_id kiritilishi shart" });
  
  // Calculate active issues for the building
  const query = `
    SELECT b.*, bs.name as bsk_name,
      (SELECT COUNT(*) FROM murojaats m WHERE m.building_id = b.id AND m.status IN ('idle', 'in_progress')) as active_issues,
      (SELECT GROUP_CONCAT(DISTINCT m.category) FROM murojaats m WHERE m.building_id = b.id AND m.status IN ('idle', 'in_progress')) as active_categories
    FROM buildings b 
    LEFT JOIN bsks bs ON b.bsk_id = bs.id
    WHERE b.mahalla_id = ?
    ORDER BY b.id DESC
  `;
  res.json(db.prepare(query).all(mahalla_id));
});

router.post('/buildings', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { mahalla_id, type, name_or_number, levels, apartments_count, residents_count, bsk_id } = req.body;
  if (!mahalla_id || !type || !name_or_number) return res.status(400).json({ error: "Asosiy maydonlarni to'ldiring" });
  
  try {
     const info = db.prepare(`
       INSERT INTO buildings (mahalla_id, type, name_or_number, levels, apartments_count, residents_count, bsk_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
     `).run(mahalla_id, type, name_or_number, levels || null, apartments_count || null, residents_count || 0, bsk_id || null);
     res.json({ success: true, id: info.lastInsertRowid });
  } catch(err) {
     res.status(500).json({ error: err.message });
  }
});

router.delete('/buildings/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.put('/buildings/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { type, name_or_number, levels, apartments_count, residents_count, bsk_id } = req.body;
  if (!type || !name_or_number) return res.status(400).json({ error: "Asosiy maydonlarni to'ldiring" });
  
  try {
     db.prepare(`
       UPDATE buildings 
       SET type = ?, name_or_number = ?, levels = ?, apartments_count = ?, residents_count = ?, bsk_id = ?
       WHERE id = ?
     `).run(type, name_or_number, levels || null, apartments_count || null, residents_count || 0, bsk_id || null, req.params.id);
     res.json({ success: true });
  } catch(err) {
     res.status(500).json({ error: err.message });
  }
});

router.get('/buildings/:id/stats', authenticate, (req, res) => {
  const building_id = req.params.id;
  const stats = { total: 0, idle: 0, in_progress: 0, completed: 0, rejected: 0 };
  
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM murojaats WHERE building_id = ? GROUP BY status').all(building_id);
  
  rows.forEach(r => {
    stats.total += r.count;
    if (stats[r.status] !== undefined) stats[r.status] = r.count;
  });
  
  res.json(stats);
});

router.get('/buildings/:id/murojaats', authenticate, (req, res) => {
  const building_id = req.params.id;
  const query = `
    SELECT m.*, u.full_name, u.phone, a.username as assigned_admin
    FROM murojaats m 
    JOIN users u ON m.user_id = u.id 
    LEFT JOIN admins a ON m.assigned_admin_id = a.id
    WHERE m.building_id = ?
    ORDER BY m.created_at DESC
  `;
  res.json(db.prepare(query).all(building_id));
});

module.exports = router;
