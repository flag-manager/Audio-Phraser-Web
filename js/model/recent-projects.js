/**
 * Yamaha Audio Phraser - Recent Projects Manager
 * Stores and manages recent projects in browser storage with instant reload support.
 */

const STORAGE_KEY = 'audio_phraser_recent_projects';
const MAX_RECENTS = 8;

export class RecentProjectsManager {
  static getRecents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static addProject(project, serializedData = null) {
    if (!project) return;
    try {
      const recents = this.getRecents();
      let activeCount = 0;
      for (const sec of project.sections.values()) {
        if (sec.hasAudio) activeCount++;
      }

      const entry = {
        id: Date.now().toString(),
        name: project.name || 'Untitled Project',
        masterTempo: project.masterTempo,
        timeSignature: { ...project.timeSignature },
        activeSectionCount: activeCount,
        savedAt: Date.now(),
        data: serializedData || project.serializeState()
      };

      // Remove previous entry with exact same name if it exists
      const filtered = recents.filter((r) => r.name !== entry.name);
      filtered.unshift(entry);

      if (filtered.length > MAX_RECENTS) {
        filtered.length = MAX_RECENTS;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Could not store recent project:', e);
    }
  }

  static clearRecents() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}
