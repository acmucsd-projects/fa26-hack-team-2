// Python's standard-library ZIP reader avoids adding a dependency. No HTTP.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function extractArchive(archive, destination) {
  if (!fs.existsSync(archive)) return;
  const result = spawnSync('python3', ['-c', `
import sys, zipfile, pathlib, stat
root = pathlib.Path(sys.argv[2]).resolve()
with zipfile.ZipFile(sys.argv[1]) as z:
    entries = []
    total = 0
    for i in z.infolist():
        p = pathlib.PurePosixPath(i.filename)
        if p.is_absolute() or '..' in p.parts or '\\\\' in i.filename or stat.S_ISLNK(i.external_attr >> 16):
            raise ValueError('Unsafe ZIP path: ' + i.filename)
        if i.is_dir() or p.parts[0] == '__MACOSX': continue
        total += i.file_size
        if p.suffix.lower() != '.html' or i.file_size > 20000000 or total > 200000000:
            raise ValueError('Unexpected or oversized ZIP entry: ' + i.filename)
        target = root.joinpath(*p.parts)
        if not target.resolve().is_relative_to(root): raise ValueError('ZIP escapes destination')
        data = z.read(i)
        if target.exists() and target.read_bytes() != data: raise ValueError('Existing capture differs: ' + str(target))
        entries.append((target, data))
    for target, data in entries:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists(): target.write_bytes(data)
`, archive, destination], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Cannot extract saved ZIP: ${result.error?.message || result.stderr}`);
}
function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e => {
    const file = path.join(dir,e.name);
    if (e.isSymbolicLink()) throw new Error(`Symlink input is not allowed: ${file}`);
    return e.isDirectory() ? htmlFiles(file) : /\.html?$/i.test(e.name) ? [file] : [];
  });
}

// Package only current generated files plus the README, never raw inputs,
// archives, credentials or a stale ZIP. The caller supplies an explicit allowlist.
function packageDataset(dataDir, relativeFiles) {
  const destination = path.join(dataDir, 'exports/hdh-web-validated.zip');
  const result = spawnSync('python3', ['-c', `
import sys, json, pathlib, zipfile
root = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2])
files = json.loads(sys.argv[3])
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in files:
        source = root / name
        if not source.resolve().is_relative_to(root): raise ValueError('Export path escapes data folder')
        if not name.startswith(('output/', 'reports/')) or not name.endswith('.json'): raise ValueError('Unexpected export file')
        z.write(source, name)
    z.write(sys.argv[4], 'README.md')
`, dataDir, destination, JSON.stringify(relativeFiles), path.join(__dirname, 'README.md')], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Cannot package dataset: ${result.error?.message || result.stderr}`);
  return destination;
}
module.exports = { extractArchive, htmlFiles, packageDataset };
