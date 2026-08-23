const fs = require('fs');
const path = require('path');

const refAtlasDir = path.resolve(__dirname, '../reference/space1-original/assets/atlas');
const clientAtlasDir = path.resolve(__dirname, '../Game.Engine/wwwroot/img/atlas');
const scssFiles = [
  path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/textureMap_high.scss'),
  path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/spriteModeMap_high.scss'),
  path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/textureMap_medium.scss'),
  path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/spriteModeMap_medium.scss'),
  path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/textureMap_low.scss'),
  path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/spriteModeMap_low.scss')
];

console.log('=== Spaceone.io Asset & Texture Parity Verification ===\n');

if (!fs.existsSync(refAtlasDir)) {
  console.error(`Error: Reference atlas directory not found: ${refAtlasDir}`);
  process.exit(1);
}

const refFiles = fs.readdirSync(refAtlasDir).filter(f => f.endsWith('.json'));
let totalRefFrames = 0;
const atlasFrames = {};

refFiles.forEach(file => {
  const filePath = path.join(refAtlasDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const frames = Object.keys(data.frames || {});
  atlasFrames[file] = frames;
  totalRefFrames += frames.length;
  console.log(`[Atlas: ${file}] ${frames.length} frames registered.`);
});

console.log(`\nTotal reference frames to verify: ${totalRefFrames}`);

// Check if atlas files are copied to client directory
let clientAtlasesPresent = true;
refFiles.forEach(file => {
  const jsonPath = path.join(clientAtlasDir, file);
  const pngPath = path.join(clientAtlasDir, file.replace('.json', '.png'));
  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    console.warn(`[Missing Client Atlas File] ${file} or its PNG is missing in ${clientAtlasDir}`);
    clientAtlasesPresent = false;
  }
});

// Check SCSS mappings
const combinedScss = scssFiles.map(sf => fs.existsSync(sf) ? fs.readFileSync(sf, 'utf8') : '').join('\n').toLowerCase();

let coveredFrames = 0;
const missingFrames = [];

for (const [atlas, frames] of Object.entries(atlasFrames)) {
  if (atlas === 'icons.json') continue; // icons are for browser/manifest, not gameplay renderer
  frames.forEach(frame => {
    const rawName = frame.replace('.png', '').toLowerCase();
    // Normalize variations like Particle_Ship_Blue -> particle_ship_blue or ship_blue_boost
    if (combinedScss.includes(rawName) || combinedScss.includes(rawName.replace(/_/g, '-')) || combinedScss.includes(`"${rawName}"`)) {
      coveredFrames++;
    } else {
      missingFrames.push(`${atlas}: ${frame}`);
    }
  });
}

const gameplayFramesTotal = totalRefFrames - (atlasFrames['icons.json'] ? atlasFrames['icons.json'].length : 0);
const coveragePercent = ((coveredFrames / gameplayFramesTotal) * 100).toFixed(1);

console.log(`\nGameplay Frames Coverage: ${coveredFrames}/${gameplayFramesTotal} (${coveragePercent}%)`);

if (missingFrames.length > 0) {
  console.log(`\nUnmapped Gameplay Frames (${missingFrames.length}):`);
  missingFrames.forEach(f => console.log(`  - ${f}`));
}

if (!clientAtlasesPresent || missingFrames.length > 0) {
  console.log('\nResult: Asset parity incomplete. Action required.');
  process.exit(clientAtlasesPresent && coveragePercent >= 90 ? 0 : 1);
} else {
  console.log('\nResult: 100% Asset Parity Verified! All gameplay frames are mapped.');
  process.exit(0);
}
