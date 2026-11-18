/**
 * Yamaha Audio Phraser - Session Storage & Auto-Save Manager
 * Uses IndexedDB to persist complete project state including raw PCM audio channel buffers.
 * Enables seamless crash recovery and reload restoration.
 */

const DB_NAME = 'AudioPhraserStorage';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_KEY = 'active_session';

export class SessionStorageManager {
  static openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save the current project state and all audio buffers to IndexedDB.
   */
  static async saveSession(project) {
    if (!project) return;

    try {
      // 1. Serialize audio pool
      const serializedAudioPool = [];
      for (const [name, entry] of project.audioPool.entries()) {
        const buf = entry.buffer;
        if (!buf) continue;

        const channels = [];
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          // Clone Float32Array so it stores cleanly in IndexedDB
          channels.push(new Float32Array(buf.getChannelData(ch)));
        }

        serializedAudioPool.push({
          name: name,
          sampleRate: buf.sampleRate,
          numberOfChannels: buf.numberOfChannels,
          length: buf.length,
          duration: buf.duration,
          channels: channels
        });
      }

      // 2. Count active sections
      let activeCount = 0;
      const activeNames = [];
      for (const [id, sec] of project.sections.entries()) {
        if (sec.hasAudio) {
          activeCount++;
          activeNames.push(sec.name);
        }
      }

      const sessionRecord = {
        id: SESSION_KEY,
        savedAt: Date.now(),
        projectName: project.name || 'Untitled Project',
        masterTempo: project.masterTempo,
        timeSignature: { ...project.timeSignature },
        selectedSectionId: project.selectedSectionId,
        sections: project.serializeState().sections,
        audioPool: serializedAudioPool,
        activeSectionCount: activeCount,
        activeSectionNames: activeNames
      };

      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(sessionRecord);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (err) {
      console.warn('Session auto-save failed:', err);
      return false;
    }
  }

  /**
   * Check if a valid unsaved session exists.
   */
  static async hasSession() {
    try {
      const session = await this.getSessionSummary();
      if (!session) return false;
      // Valid if has audio or modified
      return session.activeSectionCount > 0 || session.projectName !== 'New Audio Style';
    } catch {
      return false;
    }
  }

  /**
   * Get metadata summary of existing session for prompt dialog.
   */
  static async getSessionSummary() {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(SESSION_KEY);
        req.onsuccess = () => {
          db.close();
          const rec = req.result;
          if (!rec) {
            resolve(null);
            return;
          }
          resolve({
            savedAt: rec.savedAt,
            projectName: rec.projectName,
            masterTempo: rec.masterTempo,
            timeSignature: rec.timeSignature,
            activeSectionCount: rec.activeSectionCount,
            activeSectionNames: rec.activeSectionNames || []
          });
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Restore project and rebuild AudioBuffers via audioContext.
   */
  static async restoreSession(project, audioCtx) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);

      req.onsuccess = async () => {
        db.close();
        const record = req.result;
        if (!record) {
          resolve(false);
          return;
        }

        try {
          // 1. Rebuild AudioPool from raw channel Float32Arrays
          project.audioPool.clear();
          for (const item of record.audioPool) {
            const buf = audioCtx.createBuffer(
              item.numberOfChannels,
              item.length,
              item.sampleRate
            );
            for (let ch = 0; ch < item.numberOfChannels; ch++) {
              buf.copyToChannel(item.channels[ch], ch);
            }
            project.addAudioToPool(item.name, buf);
          }

          // 2. Restore project data and link buffers to sections
          project.restoreState({
            name: record.projectName,
            masterTempo: record.masterTempo,
            timeSignature: record.timeSignature,
            selectedSectionId: record.selectedSectionId,
            sections: record.sections
          });

          resolve(true);
        } catch (err) {
          console.error('Failed to reconstruct restored session:', err);
          reject(err);
        }
      };

      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  /**
   * Delete saved session (e.g. after deliberate new project or discarded session).
   */
  static async clearSession() {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(SESSION_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch {
      return false;
    }
  }
}
