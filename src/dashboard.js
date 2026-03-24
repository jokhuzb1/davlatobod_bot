const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { bot } = require('./bot');

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
  res.json(db.prepare('SELECT * FROM mahallas ORDER BY name ASC').all());
});

router.get('/public/buildings', (req, res) => {
  const mahalla_id = req.query.mahalla_id;
  if (!mahalla_id) return res.status(400).json({ error: "mahalla_id kiritilishi shart" });
  res.json(db.prepare('SELECT * FROM buildings WHERE mahalla_id = ? ORDER BY name_or_number ASC').all(mahalla_id));
});

router.post('/murojaats/public', publicLimiter, upload.array('images', 2), async (req, res) => {
  const { phone, full_name, category, building_id, mikrorayon, address, source } = req.body;
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
      INSERT INTO murojaats (user_id, building_id, category, mikrorayon, address, source, status, user_image1, user_image2)
      VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?)
    `);
    
    // source could be 'web' or 'call'
    const finalSource = ['web', 'call'].includes(source) ? source : 'web';
    
    const info = stmt.run(user.id, building_id || null, category, mikrorayon || '', address || '', finalSource, img1, img2);
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
    SELECT m.*, u.full_name, u.phone, a.username as assigned_admin
    FROM murojaats m 
    JOIN users u ON m.user_id = u.id
    LEFT JOIN admins a ON m.assigned_admin_id = a.id
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

    const STATUS_LABELS = {
      'idle': 'Kutilmoqda',
      'in_progress': 'Jarayonda',
      'completed': 'Bajarildi',
      'rejected': 'Rad etildi'
    };

    let notifyMessage = `🔔 Murojaatingiz holati o'zgardi:\n\nID: #${m.id}\nYangi Holat: ${STATUS_LABELS[status] || status}\n`;
    if (comment) notifyMessage += `\n💬 Izoh: ${comment}`;
    
    try {
      if (status === 'completed' && proofImg) {
        // Find public full path
        const fullPath = path.join(__dirname, '..', 'public', proofImg);
        await bot.telegram.sendPhoto(m.user_id, { source: fullPath }, { caption: notifyMessage });
      } else {
        await bot.telegram.sendMessage(m.user_id, notifyMessage);
      }
    } catch (err) {
      console.error(`Status update notification failed for ${m.user_id}:`, err.message);
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
       categoryBreakdown: totalsMap
   });
});

// -------------------------------------------------------------
// 4. Admin Management
// -------------------------------------------------------------
router.get('/staff', authenticate, (req, res) => {
  // Public staff list for dropdown assignments
  res.json(db.prepare('SELECT id, username, role FROM admins ORDER BY id').all());
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
  res.json(db.prepare('SELECT id, username, role FROM admins ORDER BY id').all());
});

router.post('/admins', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { username, password, role } = req.body;
  if(!username || !password || !role) return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
  
  try {
     const hash = bcrypt.hashSync(password, 10);
     db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
     res.json({ success: true });
  } catch (err) {
     res.status(400).json({ error: "Bunday foydalanuvchi mavjud bo'lishi mumkin" });
  }
});

router.put('/admins/:id', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { username, password, role } = req.body;
  if(!username || !role) return res.status(400).json({ error: "Username va roleni to'ldiring" });
  
  try {
     if (password) {
       const hash = bcrypt.hashSync(password, 10);
       db.prepare('UPDATE admins SET username = ?, password_hash = ?, role = ? WHERE id = ?').run(username, hash, role, req.params.id);
     } else {
       db.prepare('UPDATE admins SET username = ?, role = ? WHERE id = ?').run(username, role, req.params.id);
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
  res.json(db.prepare('SELECT * FROM mahallas ORDER BY name ASC').all());
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
       SELECT b.*, m.name as mahalla_name,
         (SELECT COUNT(*) FROM murojaats mur WHERE mur.building_id = b.id AND mur.status IN ('idle', 'in_progress')) as active_issues,
         (SELECT GROUP_CONCAT(DISTINCT mur.category) FROM murojaats mur WHERE mur.building_id = b.id AND mur.status IN ('idle', 'in_progress')) as active_categories
       FROM buildings b 
       JOIN mahallas m ON b.mahalla_id = m.id
       ORDER BY b.id DESC
     `;
     return res.json(db.prepare(query).all());
  }

  const mahalla_id = req.query.mahalla_id;
  if (!mahalla_id) return res.status(400).json({ error: "mahalla_id kiritilishi shart" });
  
  // Calculate active issues for the building
  const query = `
    SELECT b.*, 
      (SELECT COUNT(*) FROM murojaats m WHERE m.building_id = b.id AND m.status IN ('idle', 'in_progress')) as active_issues,
      (SELECT GROUP_CONCAT(DISTINCT m.category) FROM murojaats m WHERE m.building_id = b.id AND m.status IN ('idle', 'in_progress')) as active_categories
    FROM buildings b 
    WHERE b.mahalla_id = ?
    ORDER BY b.id DESC
  `;
  res.json(db.prepare(query).all(mahalla_id));
});

router.post('/buildings', authenticate, (req, res) => {
  if (req.admin.role !== 'SuperAdmin') return res.status(403).json({ error: "Ruxsat yo'q" });
  const { mahalla_id, type, name_or_number, levels, apartments_count, residents_count } = req.body;
  if (!mahalla_id || !type || !name_or_number) return res.status(400).json({ error: "Asosiy maydonlarni to'ldiring" });
  
  try {
     const info = db.prepare(`
       INSERT INTO buildings (mahalla_id, type, name_or_number, levels, apartments_count, residents_count)
       VALUES (?, ?, ?, ?, ?, ?)
     `).run(mahalla_id, type, name_or_number, levels || null, apartments_count || null, residents_count || 0);
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
  const { type, name_or_number, levels, apartments_count, residents_count } = req.body;
  if (!type || !name_or_number) return res.status(400).json({ error: "Asosiy maydonlarni to'ldiring" });
  
  try {
     db.prepare(`
       UPDATE buildings 
       SET type = ?, name_or_number = ?, levels = ?, apartments_count = ?, residents_count = ?
       WHERE id = ?
     `).run(type, name_or_number, levels || null, apartments_count || null, residents_count || 0, req.params.id);
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
