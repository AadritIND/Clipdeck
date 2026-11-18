'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * A tiny dependency-free JSON file with atomic writes.
 * Missing or corrupt files fall back to a fresh copy of the defaults.
 */
class JsonFile {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = this.#read();
  }

  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...structuredClone(this.defaults), ...parsed };
      }
    } catch {
      /* first run, or unreadable file */
    }
    return structuredClone(this.defaults);
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error('[store] could not save', this.file, error);
    }
  }
}

module.exports = { JsonFile };
