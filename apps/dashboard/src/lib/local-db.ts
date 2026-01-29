// Local SQLite Database for PM Dashboard
// Stores all incoming reports locally, only syncs summaries to cloud

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = process.env.LOCAL_DB_PATH || 
  path.join(os.homedir(), '.flowsight', 'pm-dashboard.db');

let db: Database.Database | null = null;

export function getLocalDb(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dir = path.dirname(DB_PATH);
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  if (!db) return;
  
  db.exec(`
    -- Configuration
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    -- Developers in this team
    CREATE TABLE IF NOT EXISTS developers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      device_id TEXT UNIQUE,
      is_online INTEGER DEFAULT 0,
      last_seen_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Raw activity reports (kept locally, NOT synced to cloud)
    CREATE TABLE IF NOT EXISTS activity_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      developer_id TEXT NOT NULL,
      description TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      app_name TEXT,
      window_title TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (developer_id) REFERENCES developers(id)
    );
    
    -- Daily summaries (these GET synced to cloud)
    CREATE TABLE IF NOT EXISTS daily_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      developer_id TEXT,
      summary_date TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      total_reports INTEGER DEFAULT 0,
      coding_minutes INTEGER DEFAULT 0,
      browsing_minutes INTEGER DEFAULT 0,
      meeting_minutes INTEGER DEFAULT 0,
      terminal_minutes INTEGER DEFAULT 0,
      other_minutes INTEGER DEFAULT 0,
      synced_to_cloud INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(developer_id, summary_date)
    );
    
    -- Sync log
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      records_synced INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_reports_developer ON activity_reports(developer_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON activity_reports(created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_type ON activity_reports(activity_type);
    CREATE INDEX IF NOT EXISTS idx_summaries_date ON daily_summaries(summary_date);
    CREATE INDEX IF NOT EXISTS idx_summaries_synced ON daily_summaries(synced_to_cloud);
  `);
}

// ============================================
// DEVELOPER OPERATIONS
// ============================================

export function registerDeveloper(id: string, name: string, deviceId: string) {
  const db = getLocalDb();
  const stmt = db.prepare(`
    INSERT INTO developers (id, name, device_id, is_online, last_seen_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      is_online = 1,
      last_seen_at = datetime('now')
  `);
  stmt.run(id, name, deviceId);
}

export function updateDeveloperStatus(id: string, isOnline: boolean) {
  const db = getLocalDb();
  const stmt = db.prepare(`
    UPDATE developers SET is_online = ?, last_seen_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(isOnline ? 1 : 0, id);
}

export function getDevelopers() {
  const db = getLocalDb();
  return db.prepare('SELECT * FROM developers ORDER BY last_seen_at DESC').all();
}

// ============================================
// REPORT OPERATIONS
// ============================================

export function saveReport(
  developerId: string,
  description: string,
  activityType: string,
  appName?: string,
  windowTitle?: string
): number {
  const db = getLocalDb();
  const stmt = db.prepare(`
    INSERT INTO activity_reports (developer_id, description, activity_type, app_name, window_title)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(developerId, description, activityType, appName || null, windowTitle || null);
  
  // Update developer's last seen
  updateDeveloperStatus(developerId, true);
  
  return result.lastInsertRowid as number;
}

export function getRecentReports(limit: number = 50, developerId?: string) {
  const db = getLocalDb();
  
  if (developerId) {
    return db.prepare(`
      SELECT r.*, d.name as developer_name
      FROM activity_reports r
      JOIN developers d ON r.developer_id = d.id
      WHERE r.developer_id = ?
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(developerId, limit);
  }
  
  return db.prepare(`
    SELECT r.*, d.name as developer_name
    FROM activity_reports r
    JOIN developers d ON r.developer_id = d.id
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(limit);
}

export function getReportsForDate(date: string, developerId?: string) {
  const db = getLocalDb();
  const startOfDay = `${date} 00:00:00`;
  const endOfDay = `${date} 23:59:59`;
  
  if (developerId) {
    return db.prepare(`
      SELECT * FROM activity_reports
      WHERE developer_id = ? AND created_at BETWEEN ? AND ?
      ORDER BY created_at
    `).all(developerId, startOfDay, endOfDay);
  }
  
  return db.prepare(`
    SELECT * FROM activity_reports
    WHERE created_at BETWEEN ? AND ?
    ORDER BY created_at
  `).all(startOfDay, endOfDay);
}

// ============================================
// STATS & SUMMARIES
// ============================================

export function getDailyStats(date: string) {
  const db = getLocalDb();
  const startOfDay = `${date} 00:00:00`;
  const endOfDay = `${date} 23:59:59`;
  
  return db.prepare(`
    SELECT 
      developer_id,
      activity_type,
      COUNT(*) as count
    FROM activity_reports
    WHERE created_at BETWEEN ? AND ?
    GROUP BY developer_id, activity_type
  `).all(startOfDay, endOfDay);
}

export function saveDailySummary(
  developerId: string | null,
  summaryDate: string,
  summaryText: string,
  stats: {
    totalReports: number;
    codingMinutes: number;
    browsingMinutes: number;
    meetingMinutes: number;
    terminalMinutes: number;
    otherMinutes: number;
  }
) {
  const db = getLocalDb();
  const stmt = db.prepare(`
    INSERT INTO daily_summaries 
    (developer_id, summary_date, summary_text, total_reports, 
     coding_minutes, browsing_minutes, meeting_minutes, terminal_minutes, other_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(developer_id, summary_date) DO UPDATE SET
      summary_text = excluded.summary_text,
      total_reports = excluded.total_reports,
      coding_minutes = excluded.coding_minutes,
      browsing_minutes = excluded.browsing_minutes,
      meeting_minutes = excluded.meeting_minutes,
      terminal_minutes = excluded.terminal_minutes,
      other_minutes = excluded.other_minutes
  `);
  stmt.run(
    developerId,
    summaryDate,
    summaryText,
    stats.totalReports,
    stats.codingMinutes,
    stats.browsingMinutes,
    stats.meetingMinutes,
    stats.terminalMinutes,
    stats.otherMinutes
  );
}

export function getUnsyncedSummaries() {
  const db = getLocalDb();
  return db.prepare(`
    SELECT * FROM daily_summaries
    WHERE synced_to_cloud = 0
    ORDER BY summary_date
  `).all();
}

export function markSummariesSynced(ids: number[]) {
  const db = getLocalDb();
  const stmt = db.prepare('UPDATE daily_summaries SET synced_to_cloud = 1 WHERE id = ?');
  const transaction = db.transaction((ids: number[]) => {
    for (const id of ids) {
      stmt.run(id);
    }
  });
  transaction(ids);
}

// ============================================
// CLEANUP
// ============================================

export function cleanupOldReports(daysToKeep: number = 7) {
  const db = getLocalDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const stmt = db.prepare(`
    DELETE FROM activity_reports
    WHERE created_at < ?
  `);
  const result = stmt.run(cutoffDate.toISOString());
  return result.changes;
}

export function getDbStats() {
  const db = getLocalDb();
  
  const reportCount = db.prepare('SELECT COUNT(*) as count FROM activity_reports').get() as { count: number };
  const devCount = db.prepare('SELECT COUNT(*) as count FROM developers').get() as { count: number };
  const summaryCount = db.prepare('SELECT COUNT(*) as count FROM daily_summaries').get() as { count: number };
  const unsyncedCount = db.prepare('SELECT COUNT(*) as count FROM daily_summaries WHERE synced_to_cloud = 0').get() as { count: number };
  
  return {
    totalReports: reportCount.count,
    totalDevelopers: devCount.count,
    totalSummaries: summaryCount.count,
    unsyncedSummaries: unsyncedCount.count,
  };
}
