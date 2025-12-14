import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface StoredEvent {
  id: string;
  timestamp: number;
  type: string;
  data: any;
  sessionId: string;
}

export class EventStore {
  private db: Database.Database;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.db = this.initializeDatabase();
    this.setupTables();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeDatabase(): Database.Database {
    const dbDir = path.join(os.homedir(), '.flowsight', 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'events.db');
    return new Database(dbPath);
  }

  private setupTables(): void {
    // Events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        session_id TEXT NOT NULL
      )
    `);

    // Sessions table for metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        total_events INTEGER DEFAULT 0
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    `);

    // Insert current session
    const insertSession = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (id, start_time) VALUES (?, ?)
    `);
    insertSession.run(this.sessionId, Date.now());
  }

  public add(event: { type: string; data: any }): void {
    try {
      const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const insertEvent = this.db.prepare(`
        INSERT INTO events (id, timestamp, type, data, session_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      insertEvent.run(
        eventId,
        Date.now(),
        event.type,
        JSON.stringify(event.data),
        this.sessionId
      );

      // Update session event count
      const updateSession = this.db.prepare(`
        UPDATE sessions SET total_events = total_events + 1 WHERE id = ?
      `);
      updateSession.run(this.sessionId);

    } catch (error) {
      console.error('Failed to store event:', error);
    }
  }

  public getRecent(limit: number = 100): StoredEvent[] {
    try {
      const selectEvents = this.db.prepare(`
        SELECT id, timestamp, type, data, session_id
        FROM events
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = selectEvents.all(limit) as any[];
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        data: JSON.parse(row.data),
        sessionId: row.session_id,
      }));
    } catch (error) {
      console.error('Failed to retrieve events:', error);
      return [];
    }
  }

  public getByType(eventType: string, limit: number = 50): StoredEvent[] {
    try {
      const selectByType = this.db.prepare(`
        SELECT id, timestamp, type, data, session_id
        FROM events
        WHERE type = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = selectByType.all(eventType, limit) as any[];
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        data: JSON.parse(row.data),
        sessionId: row.session_id,
      }));
    } catch (error) {
      console.error('Failed to retrieve events by type:', error);
      return [];
    }
  }

  public getByTimeRange(startTime: number, endTime: number): StoredEvent[] {
    try {
      const selectByTime = this.db.prepare(`
        SELECT id, timestamp, type, data, session_id
        FROM events
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
      `);

      const rows = selectByTime.all(startTime, endTime) as any[];
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        data: JSON.parse(row.data),
        sessionId: row.session_id,
      }));
    } catch (error) {
      console.error('Failed to retrieve events by time range:', error);
      return [];
    }
  }

  public getSessionStats(): {
    totalEvents: number;
    eventTypes: Record<string, number>;
    avgEventsPerHour: number;
  } {
    try {
      // Total events
      const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      const totalEvents = totalResult.count;

      // Events by type
      const typeResult = this.db.prepare(`
        SELECT type, COUNT(*) as count
        FROM events
        GROUP BY type
        ORDER BY count DESC
      `).all() as any[];

      const eventTypes: Record<string, number> = {};
      typeResult.forEach(row => {
        eventTypes[row.type] = row.count;
      });

      // Average events per hour (based on session duration)
      const sessionResult = this.db.prepare(`
        SELECT start_time, end_time, total_events
        FROM sessions
        WHERE id = ?
      `).get(this.sessionId) as any;

      let avgEventsPerHour = 0;
      if (sessionResult) {
        const duration = (sessionResult.end_time || Date.now()) - sessionResult.start_time;
        const hours = duration / (1000 * 60 * 60);
        avgEventsPerHour = hours > 0 ? sessionResult.total_events / hours : 0;
      }

      return {
        totalEvents,
        eventTypes,
        avgEventsPerHour,
      };
    } catch (error) {
      console.error('Failed to get session stats:', error);
      return {
        totalEvents: 0,
        eventTypes: {},
        avgEventsPerHour: 0,
      };
    }
  }

  public cleanup(daysOld: number = 90): number {
    try {
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

      const deleteOldEvents = this.db.prepare(`
        DELETE FROM events WHERE timestamp < ?
      `);
      const result = deleteOldEvents.run(cutoffTime);

      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup old events:', error);
      return 0;
    }
  }

  public close(): void {
    try {
      // Update session end time
      const updateSession = this.db.prepare(`
        UPDATE sessions SET end_time = ? WHERE id = ?
      `);
      updateSession.run(Date.now(), this.sessionId);

      this.db.close();
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
}




