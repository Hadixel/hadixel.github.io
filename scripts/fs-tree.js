const fs = require('node:fs');
const path = require('node:path');

function collectFiles(dir, found = []) {
  if (!fs.existsSync(dir)) {
    return found;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(entryPath, found);
    } else if (entry.isFile()) {
      found.push(entryPath);
    }
  }
  return found;
}

function collectDirectories(dir, found = []) {
  if (!fs.existsSync(dir)) {
    return found;
  }
  found.push(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      collectDirectories(path.join(dir, entry.name), found);
    }
  }
  return found;
}

module.exports = { collectFiles, collectDirectories };
