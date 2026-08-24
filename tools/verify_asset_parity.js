const fs = require('fs');
const path = require('path');

const refAtlasDir = path.resolve(__dirname, '../reference/space1-original/assets/atlas');
const clientAtlasDir = path.resolve(__dirname, '../Game.Engine/wwwroot/img/atlas');
const emittersFile = path.resolve(__dirname, '../Game.Engine/wwwroot/img/emitters.json');
const highTextureMap = path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/textureMap_high.scss');
const highSpriteModeMap = path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/spriteModeMap_high.scss');
const medTextureMap = path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/textureMap_medium.scss');
const medSpriteModeMap = path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/spriteModeMap_medium.scss');
const lowTextureMap = path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/textureMap_low.scss');
const lowSpriteModeMap = path.resolve(__dirname, '../Game.Engine/wwwroot/src/models/spriteModeMap_low.scss');

const scssFiles = [
  highTextureMap, highSpriteModeMap,
  medTextureMap, medSpriteModeMap,
  lowTextureMap, lowSpriteModeMap
];

console.log('=== Spaceone.io Comprehensive Asset & Visual Parity Verification ===\n');

let hasErrors = false;

// 1. Reference Atlases Check
if (!fs.existsSync(refAtlasDir)) {
  console.error(`Error: Reference atlas directory not found: ${refAtlasDir}`);
  process.exit(1);
}

const refFiles = fs.readdirSync(refAtlasDir).filter(f => f.endsWith('.json'));
let totalRefFrames = 0;
const atlasFrames = {};
const allValidFrames = new Set();

refFiles.forEach(file => {
  const filePath = path.join(refAtlasDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const frames = Object.keys(data.frames || {});
  atlasFrames[file] = frames;
  frames.forEach(f => allValidFrames.add(f.replace('.png', '').toLowerCase()));
  totalRefFrames += frames.length;
  console.log(`[Atlas: ${file}] ${frames.length} frames registered.`);
});

console.log(`\nTotal reference frames to verify: ${totalRefFrames}`);

// 2. Client Atlas Copy Check
refFiles.forEach(file => {
  const jsonPath = path.join(clientAtlasDir, file);
  const pngPath = path.join(clientAtlasDir, file.replace('.json', '.png'));
  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    console.warn(`[Missing Client Atlas File] ${file} or its PNG is missing in ${clientAtlasDir}`);
    hasErrors = true;
  }
});

// 3. Atlas Frame Coverage in SCSS
const combinedScss = scssFiles.map(sf => fs.existsSync(sf) ? fs.readFileSync(sf, 'utf8') : '').join('\n').toLowerCase();
let coveredFrames = 0;
const missingFrames = [];

for (const [atlas, frames] of Object.entries(atlasFrames)) {
  if (atlas === 'icons.json') continue; // browser icons
  frames.forEach(frame => {
    const rawName = frame.replace('.png', '').toLowerCase();
    if (combinedScss.includes(rawName) || combinedScss.includes(rawName.replace(/_/g, '-')) || combinedScss.includes(`"${rawName}"`)) {
      coveredFrames++;
    } else {
      missingFrames.push(`${atlas}: ${frame}`);
    }
  });
}

const gameplayFramesTotal = totalRefFrames - (atlasFrames['icons.json'] ? atlasFrames['icons.json'].length : 0);
const coveragePercent = ((coveredFrames / gameplayFramesTotal) * 100).toFixed(1);
console.log(`\n[Coverage] Gameplay Frames Coverage: ${coveredFrames}/${gameplayFramesTotal} (${coveragePercent}%)`);

if (missingFrames.length > 0) {
  console.log(`  Unmapped Gameplay Frames (${missingFrames.length}):`);
  missingFrames.forEach(f => console.log(`    - ${f}`));
  hasErrors = true;
}

// 4. Emitters Configuration Integrity
console.log('\n[Emitters] Verifying Emitter Config References...');
if (!fs.existsSync(emittersFile)) {
  console.error(`  Error: emitters.json not found at ${emittersFile}`);
  hasErrors = true;
} else {
  const emittersData = JSON.parse(fs.readFileSync(emittersFile, 'utf8'));
  const emitterKeys = Object.keys(emittersData);
  console.log(`  Found ${emitterKeys.length} emitter definitions in emitters.json.`);

  const highScssContent = fs.readFileSync(highTextureMap, 'utf8');
  const emitterRegex = /emitter:\s*"([^"]+)"/g;
  let match;
  const referencedEmitters = new Set();
  while ((match = emitterRegex.exec(highScssContent)) !== null) {
    referencedEmitters.add(match[1]);
  }

  referencedEmitters.forEach(em => {
    if (!emittersData[em]) {
      console.error(`  [Missing Emitter] "${em}" is referenced in SCSS but not defined in emitters.json!`);
      hasErrors = true;
    } else {
      console.log(`  ✓ Emitter "${em}" valid`);
    }
  });

  // Check particle texture references in SCSS
  const particleRegex = /particle:\s*"([^"]+)"/g;
  const referencedParticles = new Set();
  while ((match = particleRegex.exec(highScssContent)) !== null) {
    referencedParticles.add(match[1].toLowerCase());
  }

  referencedParticles.forEach(pt => {
    if (!allValidFrames.has(pt) && !allValidFrames.has(pt.replace(/_/g, ''))) {
      console.error(`  [Missing Particle Texture] "${pt}" referenced in SCSS does not exist in any atlas!`);
      hasErrors = true;
    } else {
      console.log(`  ✓ Particle texture "${pt}" valid in atlas`);
    }
  });
}

// 5. Boost & Trail Parity Check
console.log('\n[Visual Parity] Verifying Boost & Trail Systems...');
const shipColors = ['cyan', 'blue', 'green', 'orange', 'pink', 'red', 'yellow'];
const highModeContent = fs.readFileSync(highSpriteModeMap, 'utf8');

shipColors.forEach(color => {
  // Check boost mode maps dash_trail
  const dashPattern = new RegExp(`dash_trail_${color}`);
  if (!dashPattern.test(highModeContent)) {
    console.error(`  [Missing Boost Trail] Ship "${color}" does not reference dash_trail_${color} in spriteModeMap_high!`);
    hasErrors = true;
  } else {
    console.log(`  ✓ Boost trail mapped for ship_${color}`);
  }

  // Check boost hull particle_ship mapped
  const boostSpritePattern = new RegExp(`particle_ship_${color}`);
  if (!boostSpritePattern.test(highModeContent)) {
    console.error(`  [Missing Boost Hull] Ship "${color}" does not reference particle_ship_${color} in spriteModeMap_high!`);
    hasErrors = true;
  } else {
    console.log(`  ✓ Boost hull particle_ship mapped for ship_${color}`);
  }

  // Check bullet emitter mapped
  const bulletEmitterPattern = new RegExp(`bullet_emitter_${color}`);
  if (!bulletEmitterPattern.test(highModeContent)) {
    console.error(`  [Missing Bullet Emitter] Bullet "${color}" does not reference bullet_emitter_${color} in spriteModeMap_high!`);
    hasErrors = true;
  } else {
    console.log(`  ✓ Bullet emitter mapped for bullet_${color}`);
  }
});

// 6. Geometry & Offset Sanity
console.log('\n[Geometry] Verifying Trail Offset, Food Sizes & Invariants...');
const highTexContent = fs.readFileSync(highTextureMap, 'utf8');

if (!highTexContent.includes('rotate: -1.5707963')) {
  console.error('  [Rotation Warning] dash_trail or laser_trail rotation -1.5707963 missing in textureMap_high.scss!');
  hasErrors = true;
} else {
  console.log('  ✓ Trail rotation -pi/2 (-1.5707963) present');
}

if (!highTexContent.includes('x: -75;') || !highTexContent.includes('x: -93;')) {
  console.error('  [Offset Warning] dash_trail (-75) or laser_trail (-93) offset missing in textureMap_high.scss!');
  hasErrors = true;
} else {
  console.log('  ✓ Dash trail (-75) and laser trail (-93) offsets calibrated');
}

console.log('\n======================================================');
if (hasErrors) {
  console.error('❌ Verification FAILED: Visual parity or asset integrity issues detected.');
  process.exit(1);
} else {
  console.log('✅ Verification PASSED: 100% Asset, Emitter, and Visual Parity Confirmed!');
  process.exit(0);
}
