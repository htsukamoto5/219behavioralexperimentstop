/**
 * generate_trials.js
 *
 * Run this ONCE before the experiment to pre-generate all trial layouts.
 * It reads your stimuli folder, computes positions and rotations, and writes trials.json.
 *
 * Usage (from your project root in the VS Code terminal):
 *   node generate_trials.js
 *
 * Folder structure expected:
 *   stimuli/
 *     present/
 *       spoons/        ← 16 images; the odd one is prefixed with "odd_"
 *       keychains/
 *       ...
 *     absent/
 *       vases/         ← all 16 belong to the category, no odd_ prefix needed
 *       bowls/
 *       ...
 *
 * Rotation convention:
 *   List category folder names in ROTATE_CATEGORIES below.
 *   Any category NOT in that list will have rotation = 0 for all images.
 */

const fs   = require("fs");
const path = require("path");

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const STIMULI_DIR = path.join(__dirname, "stimuli");
const OUTPUT_FILE = path.join(__dirname, "trials.json");

// List the category folder names that should have rotation applied.
// All other categories will have rotation locked to 0.
const ROTATE_CATEGORIES = [
  "spoons",
  "forks",
  "keychains",
  // add more as needed
];

// Rotation options (degrees). Images will be randomly assigned one of these.
const ROTATION_OPTIONS = [0, 45, 90, 135, 180, 225, 270, 315];

// Layout: 4 columns x 4 rows of zones.
// Each image is placed at the zone centre +/- a random jitter.
// Positions are expressed as percentages of the display area (0-100).
const GRID_COLS    = 4;
const GRID_ROWS    = 4;
const ZONE_W       = 100 / GRID_COLS;   // 25% per zone
const ZONE_H       = 100 / GRID_ROWS;   // 25% per zone
const MAX_JITTER_X = ZONE_W * 0.22;     // +/-22% of zone width
const MAX_JITTER_Y = ZONE_H * 0.22;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher-Yates shuffle (in-place, returns array) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate 16 non-overlapping positions using a jittered 4x4 grid.
 * Returns array of { x, y } objects (percentage of display area).
 */
function generatePositions() {
  const zones = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cx = col * ZONE_W + ZONE_W / 2;
      const cy = row * ZONE_H + ZONE_H / 2;
      zones.push({
        x: parseFloat((cx + rand(-MAX_JITTER_X, MAX_JITTER_X)).toFixed(2)),
        y: parseFloat((cy + rand(-MAX_JITTER_Y, MAX_JITTER_Y)).toFixed(2)),
      });
    }
  }
  return shuffle(zones);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Verify stimuli folder exists
if (!fs.existsSync(STIMULI_DIR)) {
  console.error("Could not find stimuli folder at: " + STIMULI_DIR);
  console.error("Make sure you are running this script from your project root.");
  process.exit(1);
}

const trials = [];
let totalSkipped = 0;

// Iterate over present/ and absent/ subfolders
for (const presence of ["present", "absent"]) {
  const presenceDir = path.join(STIMULI_DIR, presence);

  if (!fs.existsSync(presenceDir)) {
    console.warn('No "' + presence + '" folder found at ' + presenceDir + " -- skipping.");
    continue;
  }

  const isPresent = presence === "present";

  const categoryFolders = fs
    .readdirSync(presenceDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  if (categoryFolders.length === 0) {
    console.warn('No category subfolders found inside "' + presence + '" -- skipping.');
    continue;
  }

  console.log('\nProcessing "' + presence + '" trials...');

  for (const category of categoryFolders) {
    const folderPath    = path.join(presenceDir, category);
    const allowRotation = ROTATE_CATEGORIES.includes(category);

    const allFiles = fs
      .readdirSync(folderPath)
      .filter(f => supportedExtensions.has(path.extname(f).toLowerCase()));

    // Validate image count
    if (allFiles.length !== 16) {
      console.warn(
        '  "' + presence + "/" + category + '" has ' + allFiles.length +
        " image(s) (expected 16) -- skipping."
      );
      totalSkipped++;
      continue;
    }

    // Separate odd image from regular images
    const oddFiles     = allFiles.filter(f => f.toLowerCase().startsWith("odd_"));
    const regularFiles = allFiles.filter(f => !f.toLowerCase().startsWith("odd_"));

    // Validate odd_ prefix usage per folder type
    if (isPresent) {
      if (oddFiles.length === 0) {
        console.warn(
          '  "' + presence + "/" + category + '" has no "odd_" prefixed image -- skipping.'
        );
        totalSkipped++;
        continue;
      }
      if (oddFiles.length > 1) {
        console.warn(
          '  "' + presence + "/" + category + '" has ' + oddFiles.length + ' "odd_" images. ' +
          "Only the first (" + oddFiles[0] + ") will be used as the odd-one-out."
        );
      }
    } else {
      // Absent trials: warn if someone accidentally added an odd_ prefix
      if (oddFiles.length > 0) {
        console.warn(
          '  "' + presence + "/" + category + '" is in "absent" but contains "odd_" ' +
          "prefixed file(s): " + oddFiles.join(", ") + ". These will be treated as " +
          "regular images -- rename them if this is unintentional."
        );
      }
    }

    const oddFile = isPresent ? oddFiles[0] : null;

    // Generate fixed positions for this trial's 16 images
    const positions = generatePositions();

    const imageEntries = allFiles.map((file, idx) => ({
      file,
      x:        positions[idx].x,
      y:        positions[idx].y,
      rotation: allowRotation ? randChoice(ROTATION_OPTIONS) : 0,
      is_odd:   file === oddFile,
    }));

    // Unique trial ID: e.g. "present_spoons" or "absent_vases"
    const trialId = presence + "_" + category;

    trials.push({
      id:              trialId,
      category,
      presence_folder: presence,
      allow_rotation:  allowRotation,
      target_present:  isPresent,
      odd_file:        oddFile,
      images:          imageEntries,
    });

    console.log(
      "  " + category.padEnd(20) +
      " | target_present=" + String(isPresent).padEnd(5) +
      " | rotation=" + String(allowRotation).padEnd(5) +
      " | odd=" + (oddFile ?? "--")
    );
  }
}

// ─── WRITE OUTPUT ─────────────────────────────────────────────────────────────

if (trials.length === 0) {
  console.error("\nNo valid trials were generated. Check the warnings above.");
  process.exit(1);
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(trials, null, 2));

console.log(
  "\nDone!" +
  "\n  Trials generated : " + trials.length +
  "\n  Trials skipped   : " + totalSkipped +
  "\n  Output written to: " + OUTPUT_FILE
);
