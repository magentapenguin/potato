import { MazeBuilder } from "./MazeBuilder.js";
import { currentSaveIndex } from "./currentSave.js";

const canvas = document.getElementById('canvas');
/** @type {CanvasRenderingContext2D} */
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const player = {
    x: 2.5,
    y: 2.5,
    angle: 0,
    size: 0.5,
    speedBoost: 0,
    vx: 0,
    vy: 0,
    paused: false,
    in_shop: false,
    minimap: false,
    inventory: {
        key: 0,
        coins: 0,
        purchases: [],
    },
    level: 1,
    observedCells: new Set(),
}

let lastFootstep = 0;
let lastLevelLoad = -Infinity;

const settings = {
    mouseSensitivity: 1,
    invertY: false,
    music: 'off',
    musicVolume: 1,
    sfxVolume: 1,
    footstepVolume: 1,
};

let currentMusic = null;

document.getElementById('mouse-sensitivity').addEventListener('input', (e) => {
    settings.mouseSensitivity = parseFloat(e.target.value);
});

document.getElementById('music-volume').addEventListener('input', (e) => {
    settings.musicVolume = parseFloat(e.target.value);
    if (currentMusic) {
        currentMusic.volume = settings.musicVolume;
    }
});

document.getElementById('sfx-volume').addEventListener('input', (e) => {
    settings.sfxVolume = parseFloat(e.target.value);
    if (coinSound) {
        coinSound.volume = settings.sfxVolume;
    }
    if (keySound) {
        keySound.volume = settings.sfxVolume;
    }
});

document.getElementById('footstep-volume').addEventListener('input', (e) => {
    settings.footstepVolume = parseFloat(e.target.value);
    footstepSounds.forEach(sound => {
        sound.volume = settings.sfxVolume;
    });
});

document.getElementById('music-type').addEventListener('change', (e) => {
    settings.music = e.target.value;
    if (currentMusic) {
        currentMusic.pause();
        currentMusic = null;
    }
    if (settings.music !== 'off') {
        musics[settings.music].then((audio) => {
            currentMusic = audio;
            currentMusic.loop = true;
            currentMusic.play();
        });
    }
});

document.getElementById('invert-y').addEventListener('change', (e) => {
    settings.invertY = e.target.checked;
});


let level = [];

let loading = []


const musics = {
    spooky: loadSound('spooky.mp3'),
};

let coinSound = null;
loadSound('coin.wav').then((audio) => {
    coinSound = audio;
});

let keySound = null;
loadSound('key.wav').then((audio) => {
    keySound = audio;
});

let footstepSounds = [];
for (let i = 1; i <= 3; i++) {
    loadSound(`footsteps/foot${i}.wav`).then((audio) => {
        footstepSounds.push(audio);
    });
}

function playFootstep(pitch = 1) {
    if (footstepSounds.length > 0) {
        const sound = footstepSounds[Math.floor(Math.random() * footstepSounds.length)];
        sound.preservesPitch = false;
        sound.playbackRate = pitch;
        console.log('Playing footstep sound with pitch:', pitch);
        sound.currentTime = 0;
        sound.play();
    }
}


// Cached game state for per-frame lookups
let cachedSprites = [];
let cachedExitPos = null;
let cachedKeyPos = null;
let cachedCoinCount = 0;

let wallTextureData = null;
loadTexture('wall.png').then((data) => {
    wallTextureData = data;
});

let doorTextureData = null;
loadTexture('door.png').then((data) => {
    doorTextureData = data;
});

let entranceTextureData = null;
loadTexture('entrydoor.png').then((data) => {
    entranceTextureData = data;
});

let keyTextureData = null;
let keyImage;
loadTexture('key.png', true).then(({ data, image }) => {
    keyImage = image;
    keyTextureData = data;
});

let coinTextureData = null;
let coinImage;
loadTexture('coin.png', true).then(({ data, image }) => {
    coinImage = image;
    coinTextureData = data;
});


const currentSaveVersion = 2;

setInterval(() => {
    saveData();
}, 5000);

if (localStorage.getItem('clear')) {
    localStorage.removeItem('mazeSave');
}

document.getElementById('settings-menu').addEventListener('close', () => {
    saveSettings();
});

if (!localStorage.getItem('mazeSave')) {
    location.assign(location.pathname.replace('game.html', ''));
    throw new Error('No save found, redirecting to menu');
}

loadData()
loadSettings();

document.addEventListener('visibilitychange', () => {
    if (document.hidden && !localStorage.getItem('clear')) {
        saveData();
        saveSettings();
    }
});

document.getElementById('export-settings').addEventListener('click', exportSettings);
document.getElementById('import-settings').addEventListener('click', importSettings);

function migrateOldSave(data, version) {
    /** @type {Record<string, (old: Record) => Record} */
    const migrations = {
        "0>1": (old) => {
            old.version = 1; // Nothing but a version number
            return old;
        },
        "1>2": (old) => {
            old.version = 2;
            old.settings.footstepVolume = old.settings.sfxVolume;
            return old;
        },
        "2>3": (old) => {
            old.version = 3;
            localStorage.setItem('settings', JSON.stringify(old.settings));
            old = old.filter(k => k !== 'settings');
            return old;
        }
    }
    const key = `${version}>${currentSaveVersion}`;
    if (migrations[key]) {
        return migrations[key](data);
    } else {
        // Find a path of migrations to apply
        const visited = new Set();
        function findPath(v) {
            if (v === currentSaveVersion) return [];
            if (visited.has(v)) return null;
            visited.add(v);
            for (const k in migrations) {
                const [from, to] = k.split('>').map(Number);
                if (from === v) {
                    const path = findPath(to);
                    if (path !== null) {
                        return [k, ...path];
                    }
                }
            }
            return null;
        }
        const path = findPath(version);
        if (path) {
            let migratedData = data;
            for (const step of path) {
                migratedData = migrations[step](migratedData);
            }
            return migratedData;
        } else {
            throw new Error(`Cannot migrate save from version ${version} to ${currentSaveVersion}`);
        }
    }
}

function exportSave() {
    saveData();
    const blob = new Blob([localStorage.getItem('mazeSave')], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'maze_save.potato';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function exportSettings() {
    const blob = new Blob([JSON.stringify({settings})], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'maze_settings.cfg.potato';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.settings) {
                    loadSettings(event.target.result);
                } else {
                    alert('Invalid settings file');
                }
            } catch (err) {
                alert('Error loading settings: ' + err.message);
            }
            input.remove();
        };
        reader.readAsText(file);
    };
    input.click();
    input.hidden = true;
}

function importSave() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.player && data.level) {
                    loadData(event.target.result);
                } else if (data.settings) {
                    loadSettings(event.target.result);
                } else {
                    alert('Invalid save file');
                }
            } catch (err) {
                alert('Error loading save: ' + err.message);
            }
            input.remove();
        };
        reader.readAsText(file);

    };
    input.click();
    input.hidden = true;
}

function saveSettings() {
    localStorage.setItem('settings', JSON.stringify({ settings }));
}

function saveData() {
    const save = {
        player: { ...player, observedCells: [...player.observedCells] },
        level,
        version: currentSaveVersion,
    };
    // Save into save slot
    const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
    if (saves.length > 0) {
        const currentSave = currentSaveIndex();
        if (currentSave !== null) {
            saves[currentSave].data = JSON.stringify(save);
        }
        localStorage.setItem('saves', JSON.stringify(saves));
    }
    localStorage.setItem('mazeSave', JSON.stringify(save));
}

function loadSettings(source) {
    if (!source) source = localStorage.getItem('settings');
    if (!source) return;
    try {
        const data = JSON.parse(source);
        Object.assign(settings, data.settings);
        document.getElementById('mouse-sensitivity').value = settings.mouseSensitivity;
        document.getElementById('music-type').value = settings.music;
        document.getElementById('music-volume').value = settings.musicVolume;
        document.getElementById('sfx-volume').value = settings.sfxVolume;
        document.getElementById('footstep-volume').value = settings.footstepVolume;
        document.getElementById('invert-y').checked = settings.invertY;
    } catch (err) {
        alert('Error loading settings: ' + err.message);
    }
}
function loadData(source) {
    if (source) {
        const data = JSON.parse(source);
        Object.assign(player, data.player);
        level = data.level;
        player.observedCells = new Set(player.observedCells);
        rebuildCaches();
        return;
    }
    if (!localStorage.getItem('mazeSave')) {
        return;
    }
    let save = JSON.parse(localStorage.getItem('mazeSave'));
    if (save) {
        if (save.version && save.version !== currentSaveVersion) {
            try {
                save = migrateOldSave(save, save.version);
            } catch (err) {
                if (confirm('Failed to migrate old save: ' + err.message + '\nDo you want to clear your save and start fresh?')) {
                    localStorage.setItem('clear', 'true');
                    location.reload();
                }
                return;
            }
        }
        Object.assign(player, save.player);
        level = save.level;
        player.observedCells = new Set(player.observedCells);
        rebuildCaches();
    }
}

function loadSound(src) {
    const p = new Promise((resolve, reject) => {
        const audio = new Audio(src);
        audio.oncanplaythrough = function () {
            resolve(audio);
        };
        audio.onerror = function () {
            console.error('Failed to load sound:', src);
            reject(new Error('Failed to load sound: ' + src));
        };
    });
    loading.push(p);
    return p;
}

function loadTexture(src, includeImage = false) {
    const p = new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = function () {
            const offscreen = document.createElement('canvas');
            offscreen.width = img.width;
            offscreen.height = img.height;
            const offCtx = offscreen.getContext('2d');
            offCtx.drawImage(img, 0, 0);
            if (includeImage) {
                resolve({ image: img, data: offCtx.getImageData(0, 0, img.width, img.height) });
            } else {
                resolve(offCtx.getImageData(0, 0, img.width, img.height));
            }
        };
        img.onerror = function () {
            console.error('Failed to load texture:', src);
            reject(new Error('Failed to load texture: ' + src));
        };
    });
    loading.push(p);
    return p;
}

const loaded = Promise.all(loading).then(() => {
    console.log('All textures loaded');
}).catch((err) => {
    alert('Error loading textures: ' + err.message);
});

let alerts = [];


// future feature: show alert text in the 3D view for a short duration when something important happens (like picking up a coin or key)
function showAlert(text, duration = 2000) {
    alerts.push({ text, expires: performance.now() + duration });
}

function currentLevelSize(x) {
    if (x > 5) {
        return Math.floor(Math.pow(x, 0.8) + 1) + 2
    } else {
        return Math.floor(x) + 2
    }
}


function rebuildCaches() {
    cachedSprites = [];
    cachedExitPos = null;
    cachedKeyPos = null;
    cachedCoinCount = 0;
    if (!level) return;
    for (let y = 0; y < level.length; y++) {
        for (let x = 0; x < level[y].length; x++) {
            const cell = level[y][x];
            if (cell === '*') {
                cachedSprites.push({ x: x + 0.5, y: y + 0.5, type: cell });
                cachedCoinCount++;
            } else if (cell === '.') {
                cachedSprites.push({ x: x + 0.5, y: y + 0.5, type: cell });
                cachedKeyPos = { x: x + 0.5, y: y + 0.5 };
            } else if (cell === '=') {
                cachedExitPos = { x: x + 0.5, y: y + 0.5 };
            }
        }
    }
}

function removeSpriteAt(gridX, gridY) {
    const cell = level[gridY][gridX];
    if (cell === '*') cachedCoinCount--;
    if (cell === '.') cachedKeyPos = null;
    cachedSprites = cachedSprites.filter(s => !(Math.floor(s.x) === gridX && Math.floor(s.y) === gridY));
}

function generateLevel(size = 10) {
    player.observedCells = new Set();
    console.log('Generating level with size:', size, currentLevelSize(player.level));
    const mazeBuilder = new MazeBuilder(size, size);
    mazeBuilder.placeKey();
    mazeBuilder.placeCoins(size);
    level = mazeBuilder.maze.map(row => row.map(cell => {
        if (cell[0] === "wall") {
            return '#';
        } else if (cell[0] === "door" && cell.includes("exit")) {
            return '=';
        } else if (cell[0] === "door" && cell.includes("entrance")) {
            return '+';
        } else if (cell.includes("key")) {
            return '.';
        } else if (cell.includes("coin")) {
            return '*';
        } else {
            return ' ';
        }
    }));
    levelPostProcessing();
    rebuildCaches();
    lastLevelLoad = performance.now();
}

function raycast(x, y, angle, options = {}) {
    const { maxDistance = 100, ignore = " @", check = (obj, x, y, dist) => true } = options;

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let mapX = Math.floor(x);
    let mapY = Math.floor(y);

    // Epsilon for near-zero direction detection; 1e10 acts as infinite distance for axis-parallel rays
    const deltaDistX = Math.abs(dirX) < 1e-10 ? 1e10 : Math.abs(1 / dirX);
    const deltaDistY = Math.abs(dirY) < 1e-10 ? 1e10 : Math.abs(1 / dirY);

    let stepX, stepY;
    let sideDistX, sideDistY;

    if (dirX < 0) {
        stepX = -1;
        sideDistX = (x - mapX) * deltaDistX;
    } else {
        stepX = 1;
        sideDistX = (mapX + 1 - x) * deltaDistX;
    }
    if (dirY < 0) {
        stepY = -1;
        sideDistY = (y - mapY) * deltaDistY;
    } else {
        stepY = 1;
        sideDistY = (mapY + 1 - y) * deltaDistY;
    }

    let distance = 0;
    while (distance < maxDistance) {
        if (sideDistX < sideDistY) {
            distance = sideDistX;
            sideDistX += deltaDistX;
            mapX += stepX;
        } else {
            distance = sideDistY;
            sideDistY += deltaDistY;
            mapY += stepY;
        }

        if (distance >= maxDistance) {
            return [maxDistance, null];
        }

        if (
            mapY < 0 ||
            mapY >= level.length ||
            mapX < 0 ||
            mapX >= level[mapY].length
        ) {
            return [maxDistance, null];
        }

        const cell = level[mapY][mapX];
        if (cell && check(cell, mapX + 0.5, mapY + 0.5, distance) && !ignore.includes(cell)) {
            return [distance, cell];
        }
    }

    return [maxDistance, null];
}

// Use cached sprites instead of scanning level every frame
function findSprites() {
    return cachedSprites;
}

function renderSprites(pixels, depthBuffer, playerX, playerY, playerAngle) {
    const sprites = findSprites();
    const fov = Math.PI / 3;
    const halfFov = fov / 2;

    // Calculate distance to each sprite and sort back-to-front
    sprites.forEach(s => {
        s.dist = Math.hypot(s.x - playerX, s.y - playerY);
    });
    sprites.sort((a, b) => b.dist - a.dist);

    for (const sprite of sprites) {
        // Angle from player to sprite
        const dx = sprite.x - playerX;
        const dy = sprite.y - playerY;
        const spriteAngle = Math.atan2(dy, dx);

        // Relative angle to player's view direction
        let relAngle = spriteAngle - playerAngle;
        // Normalize to [-PI, PI]
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;

        // Skip if outside FOV (with some margin for sprite width)
        if (Math.abs(relAngle) > halfFov + 0.3) continue;

        // Perpendicular distance for correct sizing
        const perpDist = sprite.dist * Math.cos(relAngle);
        if (perpDist < 0.1) continue;

        // Sprite screen height and width (square sprite)
        const spriteHeight = canvas.height / perpDist * 0.8;
        const spriteWidth = spriteHeight;

        // Screen X center of sprite
        const screenX = (relAngle / fov + 0.5) * canvas.width;

        // Screen Y center (vertically centered)
        const screenY = canvas.height / 2;

        const startX = Math.floor(screenX - spriteWidth / 2);
        const endX = Math.floor(screenX + spriteWidth / 2);
        const startY = Math.floor(screenY - spriteHeight / 2);
        const endY = Math.floor(screenY + spriteHeight / 2);

        if (sprite.type === '*') {
            var textureData = coinTextureData;
        } else {
            var textureData = keyTextureData;
        }

        const texWidth = textureData.width;
        const texHeight = textureData.height;
        const brightness = Math.max(0, 1 - sprite.dist / 10);

        for (let sx = Math.max(0, startX); sx < Math.min(canvas.width, endX); sx++) {
            // Depth test: only draw if sprite is closer than wall at this column
            if (perpDist >= depthBuffer[sx]) continue;

            const texX = Math.floor(((sx - startX) / spriteWidth) * texWidth);

            for (let sy = Math.max(0, startY); sy < Math.min(canvas.height, endY); sy++) {
                const texY = Math.floor(((sy - startY) / spriteHeight) * texHeight);

                const texIdx = (texY * texWidth + texX) * 4;
                // Skip transparent pixels
                if (textureData.data[texIdx + 3] < 128) continue;

                const pixIdx = (sy * canvas.width + sx) * 4;
                pixels[pixIdx] = textureData.data[texIdx] * brightness;
                pixels[pixIdx + 1] = textureData.data[texIdx + 1] * brightness;
                pixels[pixIdx + 2] = textureData.data[texIdx + 2] * brightness;
                pixels[pixIdx + 3] = 255;
            }
        }
    }
}

function observe(x, y) {
    player.observedCells.add(`${Math.floor(x)},${Math.floor(y)}`);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'blue';
    ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

    const playerX = player.x;
    const playerY = player.y;
    const playerAngle = player.angle;

    const raycastResults = [];
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const depthBuffer = new Float32Array(canvas.width).fill(Infinity);


    for (let x = 0; x < canvas.width; x++) {
        const rayAngle = playerAngle + ((x / canvas.width) - 0.5) * (Math.PI / 3);
        const rayX = playerX;
        const rayY = playerY;
        const [distance, object] = raycast(rayX, rayY, rayAngle, {
            ignore: " @.*", check: (obj, x, y, dist) => {
                // Mark observed cells for minimap
                observe(x, y);
                return true;
            }
        });
        raycastResults.push([rayAngle, distance, rayX, rayY]);

        // Fix fisheye distortion by using perpendicular distance
        const correctedDistance = distance * Math.cos(rayAngle - playerAngle);
        depthBuffer[x] = correctedDistance;

        const rayHitX = rayX + Math.cos(rayAngle) * distance;
        const rayHitY = rayY + Math.sin(rayAngle) * distance;

        observe(rayHitX, rayHitY);

        const wallHeight = canvas.height / (correctedDistance + 0.01) * 1.5;

        const hitGridX = Math.floor(rayHitX);
        const hitGridY = Math.floor(rayHitY);

        const fractX = rayHitX - hitGridX;
        const fractY = rayHitY - hitGridY;

        // Determine wall face by closest edge
        const distToLeft = fractX;
        const distToRight = 1 - fractX;
        const distToTop = fractY;
        const distToBottom = 1 - fractY;
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

        let wallHitOffset;
        if (minDist === distToLeft || minDist === distToRight) {
            wallHitOffset = fractY;
        } else {
            wallHitOffset = fractX;
        }

        const drawStart = Math.max(0, Math.floor((canvas.height - wallHeight) / 2));
        const drawEnd = Math.min(canvas.height - 1, Math.floor((canvas.height + wallHeight) / 2));
        // check if the hit cell is a door
        if (object === '=') {
            const texWidth = doorTextureData.width;
            const texHeight = doorTextureData.height;
            const texX = Math.floor(wallHitOffset * texWidth) % texWidth;
            const brightness = Math.max(0, 1 - distance / 10);

            for (let y = drawStart; y <= drawEnd; y++) {
                // Map screen Y to texture Y
                const wallY = (y - (canvas.height - wallHeight) / 2) / wallHeight;
                const texY = Math.floor(wallY * texHeight) % texHeight;

                const texIdx = (texY * texWidth + texX) * 4;
                const pixIdx = (y * canvas.width + x) * 4;

                pixels[pixIdx] = doorTextureData.data[texIdx] * brightness;
                pixels[pixIdx + 1] = doorTextureData.data[texIdx + 1] * brightness;
                pixels[pixIdx + 2] = doorTextureData.data[texIdx + 2] * brightness;
                pixels[pixIdx + 3] = 255;
            }
        } else if (object === '+') {
            const texWidth = entranceTextureData.width;
            const texHeight = entranceTextureData.height;
            const texX = Math.floor(wallHitOffset * texWidth) % texWidth;
            const brightness = Math.max(0, 1 - distance / 10);

            for (let y = drawStart; y <= drawEnd; y++) {
                // Map screen Y to texture Y
                const wallY = (y - (canvas.height - wallHeight) / 2) / wallHeight;
                const texY = Math.floor(wallY * texHeight) % texHeight;

                const texIdx = (texY * texWidth + texX) * 4;
                const pixIdx = (y * canvas.width + x) * 4;

                pixels[pixIdx] = entranceTextureData.data[texIdx] * brightness;
                pixels[pixIdx + 1] = entranceTextureData.data[texIdx + 1] * brightness;
                pixels[pixIdx + 2] = entranceTextureData.data[texIdx + 2] * brightness;
                pixels[pixIdx + 3] = 255;
            }

        } else if (object === '#') {
            if (wallTextureData) {
                const texWidth = wallTextureData.width;
                const texHeight = wallTextureData.height;
                const texX = Math.floor(wallHitOffset * texWidth) % texWidth;
                const brightness = Math.max(0, 1 - distance / 10);

                for (let y = drawStart; y <= drawEnd; y++) {
                    // Map screen Y to texture Y
                    const wallY = (y - (canvas.height - wallHeight) / 2) / wallHeight;
                    const texY = Math.floor(wallY * texHeight) % texHeight;

                    const texIdx = (texY * texWidth + texX) * 4;
                    const pixIdx = (y * canvas.width + x) * 4;

                    pixels[pixIdx] = wallTextureData.data[texIdx] * brightness;
                    pixels[pixIdx + 1] = wallTextureData.data[texIdx + 1] * brightness;
                    pixels[pixIdx + 2] = wallTextureData.data[texIdx + 2] * brightness;
                    pixels[pixIdx + 3] = 255;
                }
            }
        } else {
            const grey = Math.max(0, 255 - distance * 50);
            for (let y = drawStart; y <= drawEnd; y++) {
                const pixIdx = (y * canvas.width + x) * 4;
                pixels[pixIdx] = grey;
                pixels[pixIdx + 1] = grey;
                pixels[pixIdx + 2] = grey;
                pixels[pixIdx + 3] = 255;
            }
        }

    }

    renderSprites(pixels, depthBuffer, playerX, playerY, playerAngle);

    ctx.putImageData(imageData, 0, 0);

    // Vignette effect
    const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width / 2 * 0.7, canvas.width / 2, canvas.height / 2, canvas.width / 2);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (player.minimap) {
        const scale = 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let y = 0; y < level.length; y++) {
            for (let x = 0; x < level[y].length; x++) {
                if (!player.observedCells.has(`${x},${y}`)) {
                    if (player.inventory.purchases.includes('Fog Detector')) {
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                        ctx.fillRect(x * scale, y * scale, scale, scale);
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    }
                    continue;
                }
                if (level[y][x] === '#') {
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                } else if (level[y][x] === '=') {
                    ctx.fillStyle = 'rgba(50, 255, 128, 0.5)';
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                } else if (level[y][x] === '.') {
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                    ctx.beginPath();
                    ctx.ellipse(x * scale + scale / 2, y * scale + scale / 2, scale / 4, scale / 4, 0, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                } else if (level[y][x] === '*') {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
                    ctx.beginPath();
                    ctx.ellipse(x * scale + scale / 2, y * scale + scale / 2, scale / 4, scale / 4, 0, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                } else if (level[y][x] === '+') {
                    ctx.fillStyle = 'rgba(200, 255, 255, 0.5)'
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                }
            }
        }
        if (player.inventory.purchases.includes('Player Positioning')) {
            ctx.fillStyle = 'red';
            ctx.fillRect(playerX * scale - player.size * scale / 2, playerY * scale - player.size * scale / 2, player.size * scale, player.size * scale);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'red';
            if (player.inventory.purchases.includes('Compass')) {
                ctx.beginPath();
                ctx.moveTo(playerX * scale, playerY * scale);
                ctx.lineTo(playerX * scale + Math.cos(playerAngle) * scale, playerY * scale + Math.sin(playerAngle) * scale);
                ctx.stroke();
            }
        }
    }
    // compass
    if (player.inventory.purchases.includes('Compass')) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

        // Pan the compass based on player angle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(canvas.width / 2, 0, 130, 70, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.font = '16px Inter, sans-serif';
        for (let i = 0; i < directions.length; i++) {
            const angle = (i / directions.length) * 2 * Math.PI - player.angle;
            const x = canvas.width / 2 + Math.cos(angle) * 100;
            const y = Math.sin(angle) * 50;
            ctx.fillText(directions[i], x - 8, y + 5);
        }
        if (player.inventory.purchases.includes('Exit Tracker')) {
            // Use cached exit position
            if (cachedExitPos) {
                const dx = cachedExitPos.x - player.x;
                const dy = cachedExitPos.y - player.y;
                const angleToExit = Math.atan2(dy, dx) - player.angle - Math.PI / 2;

                ctx.strokeStyle = 'lime';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(canvas.width / 2 + Math.cos(angleToExit + Math.PI) * 60, Math.sin(angleToExit + Math.PI) * 30);
                ctx.lineTo(canvas.width / 2 + Math.cos(angleToExit) * 120, Math.sin(angleToExit) * 60);
                ctx.stroke();
            }
        }
        if (player.inventory.purchases.includes('Keyfinder')) {
            if (cachedKeyPos) {
                const dx = cachedKeyPos.x - player.x;
                const dy = cachedKeyPos.y - player.y;
                const angleToKey = Math.atan2(dy, dx) - player.angle - Math.PI / 2;

                ctx.strokeStyle = 'yellow';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(canvas.width / 2 + Math.cos(angleToKey + Math.PI) * 60, Math.sin(angleToKey + Math.PI) * 30);
                ctx.lineTo(canvas.width / 2 + Math.cos(angleToKey) * 120, Math.sin(angleToKey) * 60);
                ctx.stroke();
            }
        }
    }
    // inventory
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, canvas.height - 100, 150, 90);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.font = '16px Inter, sans-serif';
    ctx.drawImage(coinImage, 20, canvas.height - 90, 32, 32);
    ctx.fillText(`x ${player.inventory.coins}`, 60, canvas.height - 60);
    ctx.drawImage(keyImage, 20, canvas.height - 50, 32, 32);
    ctx.fillText(`x ${player.inventory.key}`, 60, canvas.height - 20);

    ctx.textAlign = 'right';
    if (player.inventory.purchases.includes('Coin Radar')) {
        ctx.fillText(`Coins in level: ${cachedCoinCount}`, canvas.width - 10, 26);
    }

    ctx.textAlign = 'center';
    ctx.fillText(`Level ${player.level} - ${currentLevelSize(player.level)}x${currentLevelSize(player.level)}`, canvas.width / 2, 30);

    // Draw a moving text alert when the level loads
    // fade out over 3 seconds and move up off the top of the screen
    if (performance.now() - lastLevelLoad) {
        const alertText = `Level ${player.level}`;
        const alpha = 1 - Math.pow((performance.now() - lastLevelLoad) / 3000, 3);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = `${45 - 10 * (1 - alpha)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(alertText, canvas.width / 2, canvas.height / 2 - (1 - alpha) * canvas.height / 2);
        ctx.font = `${16 - 5 * (1 - alpha)}px Inter, sans-serif`;
        ctx.fillText(`${currentLevelSize(player.level)}x${currentLevelSize(player.level)}`, canvas.width / 2, canvas.height / 2 - (1 - alpha) * canvas.height / 2 + 30);
    }

    if (player.paused !== false) {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.8, Math.pow((performance.now() - player.paused) / 1000, 0.2))})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '30px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = `rgba(255, 255, 255,0.8)`;
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText('Click to resume', canvas.width / 2, canvas.height / 2 + 30);
    }

}

function shop() {
    player.in_shop = true;
    document.exitPointerLock();
    document.getElementById('shop').showModal();
    const items = [
        { name: 'Extra Key', desc: 'Gives you an extra key', cost: 25, effect: () => player.inventory.key++ },
        { name: 'Compass', desc: 'Displays a compass at the top of the screen', count: 1, cost: 2, effect: null }, // happens in rendering
        { name: 'Keyfinder', desc: 'Shows the direction of the key', count: 1, cost: 15, effect: null, requires: ['Compass'] },
        { name: 'Coin Radar', desc: 'Shows how many coins are on the current map', count: 1, cost: 10, effect: null },
        { name: 'Exit Tracker', desc: 'Shows the direction of the exit', count: 1, cost: 20, effect: null, requires: ['Compass'] },
        { name: 'Minimap', desc: 'Shows a minimap of explored areas in the top-left corner', count: 1, cost: 35, effect: () => player.minimap = true },
        { name: 'Fog Detector', desc: 'Shows where undiscovered areas are on the minimap as red squares', count: 1, cost: 5, requires: ['Minimap'] },
        { name: 'Player Positioning', desc: 'Shows where you are on the minimap as a red square', count: 1, cost: 15, requires: ['Minimap'] },
        { name: 'Surround Scan', desc: 'Upgrades the minimap to reveal a 5x5 area around you', cost: 45, count: 1, requires: ['Minimap'] },
        { name: 'Speed Boost', desc: 'Increases your movement speed', cost: 15, count: 3, effect: () => player.speedBoost += 0.5 },
    ];
    const updateShop = () => {
        items.sort((a, b) => {
            let aScore = (player.inventory.coins >= a.cost) + (!a.requires || a.requires.every(req => player.inventory.purchases.includes(req))) + (!a.count || (player.inventory.purchases.filter(p => p === a.name).length < a.count));
            let bScore = (player.inventory.coins >= b.cost) + (!b.requires || b.requires.every(req => player.inventory.purchases.includes(req))) + (!b.count || (player.inventory.purchases.filter(p => p === b.name).length < b.count));
            return (bScore - aScore) || (a.cost - b.cost);
        });
        const coinsSpan = document.getElementById('coin-count');
        coinsSpan.textContent = player.inventory.coins;
        const shopItemsDiv = document.getElementById('shop-items');
        shopItemsDiv.innerHTML = '';
        items.filter(item => {
            if (item.requires) {
                return item.requires.every(req => player.inventory.purchases.includes(req));
            }
            return true;
        }).forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            itemDiv.innerHTML = `<div><strong>${item.name}${item?.count && player.inventory.purchases.filter(p => p === item.name).length > 0 ? ' x' + player.inventory.purchases.filter(p => p === item.name).length : ''}${player.inventory.purchases.filter(p => p === item.name).length >= item?.count ?? Infinity ? ' (Out of Stock)' : ''}</strong> <span style="opacity:0.8">${item.requires ? `Requires ${item.requires.join(', ')}` : ''}</span> ${item.desc} <span style="float:right;">${item.cost} coins</span></div> <button>Buy</button>`;
            const buyButton = itemDiv.querySelector('button')
            let disabled = player.inventory.coins < item.cost;
            if (item.requires) {
                disabled = disabled || !item.requires.every(req => player.inventory.purchases.includes(req));
            }
            if (player.inventory.purchases.includes(item.name) && item.count === 1) {
                disabled = true;
            } else if (item.count > 1) {
                const alreadyPurchased = player.inventory.purchases.filter(p => p === item.name).length;
                if (alreadyPurchased >= item.count) {
                    disabled = true;
                }
            }
            if (disabled) {
                itemDiv.classList.add('disabled');
                buyButton.disabled = true;
            } else {
                buyButton.addEventListener('click', () => {
                    if (player.inventory.coins >= item.cost) {
                        player.inventory.coins -= item.cost;
                        if (item.effect) {
                            item.effect();
                        }
                        player.inventory.purchases.push(item.name);
                        updateShop();
                    } else {
                        alert('Not enough coins!');
                    }
                });
            }
            shopItemsDiv.appendChild(itemDiv);
        })
    }

    updateShop();

    return new Promise((resolve) => {
        const leaveButton = document.getElementById('leave-shop');
        leaveButton.addEventListener('click', () => {
            resolve();
            player.in_shop = false;
            canvas.requestPointerLock();
            document.getElementById('shop').close();
        });
    });
}

loaded.then(() => {
    document.getElementById('loading').hidden = true;
    if (level.length === 0) generateLevel(currentLevelSize(player.level));
    if (player.in_shop) {
        shop().then(() => {
            if (level.length === 0) generateLevel(currentLevelSize(player.level));
        });
    }
});

let keyState = {};

document.addEventListener('keydown', (e) => {
    keyState[e.key.toLowerCase()] = true;
});
document.addEventListener('keyup', (e) => {
    keyState[e.key.toLowerCase()] = false;
});

function levelPostProcessing() {
    level.forEach((row, y) => {
        row.forEach((cell, x) => {
            if (cell === '+') {
                // scan for nearby empty spaces to put the player in
                const directions = [
                    [0, 1],
                    [1, 0],
                    [0, -1],
                    [-1, 0]
                ];
                for (let [dx, dy] of directions) {
                    const newX = x + dx;
                    const newY = y + dy;
                    if (level[newY] && level[newY][newX] && level[newY][newX] === ' ') {
                        player.x = newX + 0.5;
                        player.y = newY + 0.5;
                        return;
                    }
                }
            }
        });
    });
}

function isColliding(x, y, w, h, type = '#') {
    const halfW = w / 2;
    const halfH = h / 2;
    const left = Math.floor(x - halfW);
    const right = Math.floor(x + halfW);
    const top = Math.floor(y - halfH);
    const bottom = Math.floor(y + halfH);

    const results = [];
    for (let j = top; j <= bottom; j++) {
        for (let i = left; i <= right; i++) {
            if (level[j] && level[j][i] && level[j][i] === type) {
                results.push({ x: i, y: j, type: level[j][i] });
            }
        }
    }
    return results.length > 0 ? results : null;
}

function resolveWallCollision(x, y, w, h, count_door_as_wall = false) {
    const halfW = w / 2;
    const halfH = h / 2;

    let walls = isColliding(x, y, w, h, '#');
    const entranceCollisions = isColliding(x, y, w, h, '+');
    if (entranceCollisions) {
        if (walls) {
            walls.push(...entranceCollisions);
        } else {
            walls = entranceCollisions;
        }
    }
    if (count_door_as_wall) {
        const doorWalls = isColliding(x, y, w, h, '=');
        if (doorWalls) {
            if (walls) {
                walls.push(...doorWalls);
            } else {
                walls = doorWalls;
            }
        }
    }
    if (!walls) return { x, y };

    let newX = x;
    let newY = y;

    for (const wall of walls) {
        // Wall occupies the tile from (wall.x, wall.y) to (wall.x+1, wall.y+1)
        // Find the overlap on each axis
        const playerLeft = newX - halfW;
        const playerRight = newX + halfW;
        const playerTop = newY - halfH;
        const playerBottom = newY + halfH;

        const wallLeft = wall.x;
        const wallRight = wall.x + 1;
        const wallTop = wall.y;
        const wallBottom = wall.y + 1;

        // Check if actually overlapping
        if (playerRight <= wallLeft || playerLeft >= wallRight ||
            playerBottom <= wallTop || playerTop >= wallBottom) {
            continue;
        }

        // Calculate penetration depth on each axis
        const overlapLeft = playerRight - wallLeft;
        const overlapRight = wallRight - playerLeft;
        const overlapTop = playerBottom - wallTop;
        const overlapBottom = wallBottom - playerTop;

        // Find minimum overlap to resolve (push out along the shallowest axis)
        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);

        if (minOverlapX < minOverlapY) {
            // Push out horizontally
            if (overlapLeft < overlapRight) {
                newX = wallLeft - halfW - 0.001;
            } else {
                newX = wallRight + halfW + 0.001;
            }
        } else {
            // Push out vertically
            if (overlapTop < overlapBottom) {
                newY = wallTop - halfH - 0.001;
            } else {
                newY = wallBottom + halfH + 0.001;
            }
        }
    }

    return { x: newX, y: newY };
}

function update(deltaTime) {
    if (level.length < 1) return;
    if (player.x < 0 || player.y < 0 || player.x >= level[0].length || player.y >= level.length) {
        // Out of bounds, reset to center
        player.x = level[0].length / 2;
        player.y = level.length / 2;
    }
    if (player.in_shop) return; // disable movement while in shop
    let moveSpeed = 2.5 + player.speedBoost;
    const rotSpeed = 1.5;
    if (keyState['shift']) {
        moveSpeed *= 1.5
    }
    if (keyState['w']) {
        player.vx = moveSpeed;
    }
    if (keyState['s']) {
        player.vx = -moveSpeed;
    }
    if (keyState['a']) {
        player.vy = -moveSpeed;
    }
    if (keyState['d']) {
        player.vy = moveSpeed;
    }
    if (keyState['arrowleft']) {
        player.angle -= rotSpeed * deltaTime;
    }
    if (keyState['arrowright']) {
        player.angle += rotSpeed * deltaTime;
    }
    if (keyState['m'] && player.inventory.purchases.includes('Minimap')) {
        player.minimap = !player.minimap;
        keyState['m'] = false;
    }

    // Calculate desired new position
    const dx = (player.vx * Math.cos(player.angle) - player.vy * Math.sin(player.angle)) * deltaTime;
    const dy = (player.vx * Math.sin(player.angle) + player.vy * Math.cos(player.angle)) * deltaTime;

    // Try X movement first, then resolve
    player.x += dx;
    let resolved = resolveWallCollision(player.x, player.y, player.size, player.size, player.inventory.key <= 0);
    player.x = resolved.x;
    player.y = resolved.y;

    // Then Y movement, then resolve
    player.y += dy;
    resolved = resolveWallCollision(player.x, player.y, player.size, player.size, player.inventory.key <= 0);
    player.x = resolved.x;
    player.y = resolved.y;

    const damping = Math.pow(1 / 1.5, deltaTime * 60);
    player.vx *= damping;
    player.vy *= damping;

    // Play footstep sounds
    if ((player.vx * player.vx + player.vy * player.vy) > 0.01) {
        console.log('Moving', performance.now() - lastFootstep > 400 / (moveSpeed / 2.5));
        if (performance.now() - lastFootstep > 400 / (moveSpeed / 2.5)) {
            lastFootstep = performance.now();
            playFootstep(1);
        }
    }

    // Add 3x3 grid around player to observed cells for minimap
    if (player.inventory.purchases.includes('Surround Scan')) {
        for (let oy = -2; oy <= 2; oy++) {
            for (let ox = -2; ox <= 2; ox++) {
                observe(player.x + ox, player.y + oy);
            }
        }
    } else {
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                observe(player.x + ox, player.y + oy);
            }
        }
    }

    // Check for key pickup
    const keyHits = isColliding(player.x, player.y, player.size, player.size, '.');
    if (keyHits) {
        for (const key of keyHits) {
            removeSpriteAt(key.x, key.y);
            level[key.y][key.x] = ' ';
            player.inventory.key++;
            console.log('Key collected! Total:', player.inventory.key);
            if (keySound) {
                keySound.currentTime = 0;
                keySound.play();
            }
        }
    }

    const coinHits = isColliding(player.x, player.y, player.size, player.size, '*');
    if (coinHits) {
        for (const coin of coinHits) {
            removeSpriteAt(coin.x, coin.y);
            level[coin.y][coin.x] = ' ';
            player.inventory.coins++;
            console.log('Coin collected! Total:', player.inventory.coins);
            if (coinSound) {
                coinSound.currentTime = 0;
                coinSound.play();
            }
        }
    }

    // Check for door interaction (only if player has a key)
    const doorHits = isColliding(player.x, player.y, player.size, player.size, '=');
    if (doorHits && player.inventory.key > 0) {
        player.inventory.key -= 1;
        player.level++;
        // shop every 3 levels
        if (player.level % 3 === 0) {
            shop().then(() => {
                generateLevel(currentLevelSize(player.level));
            });
        } else {
            generateLevel(currentLevelSize(player.level));
        }
    }
}
let lastUpdate = performance.now();
const gameLoop = () => {
    const now = performance.now();
    const deltaTime = (now - lastUpdate) / 1000;
    lastUpdate = now;

    // Apply accumulated mouse input
    if (pendingMouseDelta !== 0) {
        player.angle += pendingMouseDelta * mouseSensitivityInput.value * 0.005;
        pendingMouseDelta = 0;
    }

    update(deltaTime);
    render();

    if (player.paused === false) {
        requestAnimationFrame(gameLoop);
    } else {
        // If paused, keep checking for resume
        setTimeout(gameLoop, 100);
    }
};
loaded.then(() => {
    gameLoop();
});

canvas.addEventListener('click', () => {
    try {
        canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => {
            canvas.requestPointerLock();
        });
    } catch (e) {
        canvas.requestPointerLock();
    }
});

const mouseSensitivityInput = document.getElementById('mouse-sensitivity');
let pendingMouseDelta = 0;

canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
        pendingMouseDelta += e.movementX;
    }
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
        player.paused = false;
    } else {
        player.paused = performance.now();
    }
});

document.addEventListener('lostpointercapture', () => {
    player.paused = performance.now();
});
