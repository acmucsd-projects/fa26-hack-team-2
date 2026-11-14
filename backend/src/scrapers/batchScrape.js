const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rawDir = path.join(__dirname, "../../data/web/raw");

// Check that the HTML folder exists.
if (!fs.existsSync(rawDir)) {
  console.error(`Missing folder: ${rawDir}`);
  process.exit(1);
}

// Find every saved dining hall HTML file.
const htmlFiles = fs.readdirSync(rawDir)
  .filter((fileName) => /^.+-day[0-6]\.html$/.test(fileName))
  .sort();

if (htmlFiles.length === 0) {
  console.error("No hall-day HTML files found.");
  process.exit(1);
}

let succeeded = 0;
let failed = 0;

// Process every HTML file.
for (const fileName of htmlFiles) {
  const [, hallId, day] = fileName.match(
    /^(.+)-day([0-6])\.html$/
  );

  console.log(`\nProcessing ${fileName}`);

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "hdhScraper.js"), hallId, day],
    { stdio: "inherit" }
  );

  if (result.error || result.status !== 0) {
    console.error(`Failed: ${fileName}`);
    failed++;
  } else {
    succeeded++;
  }
}

console.log(
  `\nMenus processed: ${succeeded} successful, ${failed} failed.`
);

// Validate the generated JSON files.
if (failed > 0) {
  console.error("Fix failed menus before validating.");
  process.exitCode = 1;
} else {
  console.log("\nValidating all generated menus...");

  const validation = spawnSync(
    process.execPath,
    [path.join(__dirname, "validateMenu.js")],
    { stdio: "inherit" }
  );

  if (validation.error || validation.status !== 0) {
    process.exitCode = 1;
  }
}