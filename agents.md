# Project Context for AI Agents
You are a Senior Node.js Developer. We are building a "Communal Murojaat" system.

## Tech Stack
- Runtime: Node.js (Latest)
- Bot Framework: Telegraf.js
- Web Framework: Express.js (serving API and static files)
- Database: SQLite (via better-sqlite3)

## Architecture Rules
1. MONOLITH: The Bot and the Dashboard API must run in the SAME Node.js process.
2. DATABASE: Use a single `database.sqlite` file.
3. DOCUMENTATION: Every task must be logged in `PROJECT_JOURNAL.md` before proceeding.
4. NO PYTHON: Do not use Python or separate backend services.