"use strict";

const TarkovStorage = {
  create(getStorage) {
    const memory = new Map();
    return {
      get(key, fallback = null) {
        if (memory.has(key)) return memory.get(key);
        try {
          return getStorage().getItem(key) ?? fallback;
        } catch (_) {
          return fallback;
        }
      },
      set(key, value) {
        const text = String(value);
        memory.set(key, text);
        try {
          getStorage().setItem(key, text);
        } catch (_) {
          // Keep the setting for this session when browser storage is unavailable.
        }
      }
    };
  }
};

if (typeof module !== "undefined") module.exports = TarkovStorage;
