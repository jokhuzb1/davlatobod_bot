require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { bot } = require('./bot');
const { db } = require('./db');

// Global error traps to prevent Node.js from exiting strictly on async bugs
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false })); // Allow React to load styles normally while securing other headers
app.use(morgan('short')); // Log HTTP requests minimally
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve React dashboard statically
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));

const dashboardRouter = require('./dashboard');

// Express API endpoints for dashboard (Phase 3)
app.use('/api', dashboardRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Murojaat System API running' });
});

// Global Express Error Boundary
app.use((err, req, res, next) => {
  console.error('Express Error Filter:', err);
  res.status(500).json({ error: 'Serverda vaqtinchalik xatolik yuz berdi' });
});

// Start Express and Bot in the single monolith process
async function start() {
  try {
    // Launch Telegram bot
    if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'your_telegram_bot_token_here') {
      bot.launch()
        .then(() => console.log('Telegram Bot running.'))
        .catch(err => console.error('Telegram Bot failed to start:', err));
    } else {
      console.warn('BOT_TOKEN is missing. Telegram bot is not started.');
    }

    // Launch Express
    app.listen(PORT, () => {
      console.log(`Express API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failure starting up:', error);
  }
}

start();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
