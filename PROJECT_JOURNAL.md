# Project Journal: Murojaat System

## Status Overview
- Current Phase: Phase 1 (Foundation & Bot Flow)
- Last Updated: 2026-03-17

## Task Checklist
- [x] Initialized Node.js Monolith & deleted previous code
- [x] Create AGENTS.md and PROJECT_JOURNAL.md
- [x] Initialize Node.js & SQLite Schema
- [x] Implement Bot Language & Category Selection
- [x] Implement Location & Contact Collection
- [x] Implement Murojaat Submission to DB
- [x] Implement "Mening Murojaatlarim" Status Check
- [x] Setup Express API & Entry Point
- [x] Implement Dashboard Auth (RBAC)

## Phase 3b: Dashboard UX & Features
- [x] O'zbek tiliga o'tkazish (Uzbek Localization)
- [x] Statistika paneli (Dashboard Statistics)
- [x] Yo'nalishlar bo'yicha filter (Category Filtering)
- [x] Xodimlarni boshqarish (Admin Management for SuperAdmin)

## Phase 4: Production Polish
- [x] Premium qiyofa (Premium UI/UX overhaul)
- [x] Kutilish holatlari (Loading states & animations)
- [x] Mobil moslashuvchanlik (Responsive Design refinements)

## Phase 5: Hududlar / Mahalla Monitoring
- [x] Add `mahallas` and `buildings` DB schemas
- [x] Modify Express endpoints to create/delete territories
- [x] Create visually-alerting `Hududlar` dashboard tab
- [x] Update Telegraf bot to dynamically list & map DB territories

## Phase 6: Advanced Building Management
- [x] Full CRUD functionality for Buildings
- [x] Form interactions moved to elegant Modals
- [x] Built the "Uy-joy Pasporti" drill-down view with building-specific analytics
- [x] Integrated Murojaat history filtering by specific building id

## Phase 7: Omnichannel Murojaat Submission
- [x] Upgraded Web App to load "Citizen Portal" by default for public complaints
- [x] Detached Database from strict `telegram_id` validation (`source`: web/bot/call)
- [x] Added "Qo'lda kiritish / Qo'ng'iroq" (Manual Entry) feature for Call Center staff

## Phase 8: Full Infrastructure CRUD Polish
- [x] Re-instated all physical descriptor fields (levels, capacity, etc) for new buildings.
- [x] Added `PUT` Mahallas logic to allow renaming Mahallas inline using Pencil button.
- [x] Added Edit capabilities for `Admins` in the Dashboard.

## Phase 9: Regional View & Profile Restoration
- [x] Recovered fully detailed CRUD Building Profile modal
- [x] Implemented "Barcha Binolar" master view spanning the whole district
- [x] Added `lat, lng` mapping capability discussion

## Phase 10: Manual Entry Precision & Visual Indicators
- [x] Migrated exact Mahalla & Building selectors into Call Center form.
- [x] Added optional "Xonadon raqami" modifier.
- [x] Display category-specific Emojis (🔥, 💧, ⚡, 🗑) natively on active building cards using `GROUP_CONCAT` in SQL.

## Phase 11: Task Delegation, KPIs & Staff Profiles
- [x] Added `assigned_admin_id` column to SQL database.
- [x] Secured API `PATCH /murojaats/:id/status` to lock modifications to assigned employee or SuperAdmin.
- [x] Delivered "Profilim" UX tab to Employee Dashboard for personalized metrics.
- [x] Debugged port lockout issues preventing explicit payload dispatch over `/login`.

## Phase 12: Production Readiness & QA
- [x] Hardened Express with `helmet` headers and detailed API logging using `morgan`.
- [x] Mitigated DDoS and Brute-force attacks via `express-rate-limit` on login and public submission routers.
- [x] Shielded Murojaats API iteration with a `LIMIT 300` constraint to prevent browser crashes during DB scale-ups.
- [x] Enforced Global Safety-Nets: Implemented `process.on(...)` traps for Node and `bot.catch` for Telegraf to swallow API errors instead of crashing the server.

## Phase 13: Hududlar UI / UX Scale Refactor
- [x] Promoted Mahalla selector to a Top-Bar layout to reclaim ~35% horizontal screen real estate for massive arrays of building cards.
- [x] Implemented on-the-fly computational KPI cards directly beneath the filter bar (Total, Problematic, Gas/Water/Elektr unique breakdown).
- [x] Refactored `Building` cards to use responsive `auto-fill` CSS grid configurations to comfortably map 1000+ architectures.
- [x] Refined UX by defaulting to "All Buildings" upon entry, embedding fixed glowing/grayscale categoric icons into every card, and deploying a "Show Only Problematic" checkbox filter.

## File Map
- `PROJECT_JOURNAL.md`: Dev Log
- `AGENTS.md`: Agent Instructions
