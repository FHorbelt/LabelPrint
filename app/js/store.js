// Einziges Modul, das localStorage kennt. Jeder Zugriff ist abgesichert:
// im privaten Fenster oder bei vollem Kontingent laeuft die App weiter,
// nur ohne Merken.

const K = {
  settings: 'asn.settings',
  templates: 'asn.templates',
  history: 'asn.history',
  ui: 'asn.ui'
};

const MAX_RUNS = 200;

export function createStore(storage = globalThis.localStorage) {
  let ok = true;

  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const val = JSON.parse(raw);
      return val === null ? fallback : val;
    } catch {
      // Kaputter Speicher oder beschaedigter Inhalt: wie leer behandeln.
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      ok = false;
      return false;
    }
  };

  // Einmal fuehlen, ob der Speicher ueberhaupt funktioniert.
  try {
    storage.getItem(K.settings);
  } catch {
    ok = false;
  }

  const listRuns = () => {
    const runs = read(K.history, []);
    return Array.isArray(runs) ? runs : [];
  };

  return {
    isAvailable: () => ok,

    loadSettings: () => read(K.settings, null),
    saveSettings: (s) => { write(K.settings, s); },

    loadUi: () => read(K.ui, {}),
    saveUi: (u) => { write(K.ui, u); },

    listRuns,

    addRun(run) {
      const runs = listRuns();
      runs.push(run);
      while (runs.length > MAX_RUNS) runs.shift();
      write(K.history, runs);
    },

    undoLastRun() {
      const runs = listRuns();
      if (runs.length === 0) return null;
      const weg = runs.pop();
      write(K.history, runs);
      return weg;
    },

    // Der Zaehler wird abgeleitet, nicht getrennt gespeichert: hoechste
    // vergebene Nummer plus eins. Ein Wert weniger, der auseinanderlaufen kann.
    nextAsn() {
      const runs = listRuns();
      let hoechste = 0;
      for (const r of runs) {
        const to = Number(r && r.to);
        if (Number.isFinite(to) && to > hoechste) hoechste = to;
      }
      return hoechste + 1;
    },

    listUserTemplates() {
      const t = read(K.templates, []);
      return Array.isArray(t) ? t : [];
    },

    saveUserTemplate(t) {
      const all = this.listUserTemplates().filter((x) => x.id !== t.id);
      all.push(t);
      write(K.templates, all);
    },

    deleteUserTemplate(id) {
      write(K.templates, this.listUserTemplates().filter((x) => x.id !== id));
    }
  };
}
