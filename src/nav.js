const documents = {
    '/index.html': ["{menu}", "{menu_head}"],
    '/game.html': ["{game}", "{game_head}"]
};
const checksums = null//{checksums};
const BUILD_TIME = "{build_time}";
if (localStorage.getItem('latestUpdateTime') && new Date(localStorage.getItem('latestUpdateTime')) > new Date(BUILD_TIME)) {
    alert('A newer version of the game is available!');
}
const COMPRESSION_ENABLED = false//{compression_enabled};
if (!COMPRESSION_ENABLED) {
    console.warn('No compression, will not auto-update');
}
function executeScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        // Copy all attributes
        for (const attr of oldScript.attributes) {
            newScript.setAttribute(attr.name, attr.value);
        }
        if (oldScript.src) {
            newScript.src = oldScript.src;
        } else {
            newScript.textContent = oldScript.textContent;
        }
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}
let storedUpdate = false;
const AUTO_UPDATE_URL = "{auto_update_url}";
async function checkForUpdates() {
    const indexResponse = await fetch(AUTO_UPDATE_URL, {
        headers: {
            "Accept": "application/octet-stream"
        },
        // Allow redirects in case the asset URL is a redirect (e.g. GitHub's CDN)
        redirect: "follow",
        cors: "cors"
    });
    if (!indexResponse.ok) {
        throw new Error(`Failed to download update: ${indexResponse.status} ${indexResponse.statusText}`);
    }
    const updatedContent = await indexResponse.text();
    const match = /<script>\s*(let|const) documents = {\s*'\/index\.html':\s*\["(.*?)", "(.*?)"\],\s*'\/game\.html':\s*\["(.*?)", "(.*?)"\]/gm.exec(updatedContent);
    if (match) {
        const [_, __, newMenu, newMenuHead, newGame, newGameHead] = match;
        if (newMenu && newMenuHead && newGame && newGameHead) {
            if (
                newMenu !== documents['/index.html'][0] || newGame !== documents['/game.html'][0] ||
                newMenuHead !== documents['/index.html'][1] || newGameHead !== documents['/game.html'][1]
            ) {
                storedUpdate = true;
                console.log('%cUpdate available!', 'color: #48f; font-size: 16px; font-weight: bold;');
                eventListeners['update-available']?.forEach(callback => callback());
                return true;
            } else {
                storedUpdate = false;
                return false;
            }
        } else {
            throw new Error('Failed to parse updated content: documents variable not found');
        }
    } else {
        throw new Error('Failed to parse updated content: documents variable not found');
    }
}
async function installUpdate(force = false) {
    if (!COMPRESSION_ENABLED && !force) return false;
    if (!storedUpdate && !force) {
        console.warn('No update downloaded yet');
        return false;
    }
    // Download the new 
    localStorage.setItem('latestUpdateTime', new Date().toISOString());
    const a = document.createElement('a');
    a.href = AUTO_UPDATE_URL;
    a.download = 'game.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
}
async function decompressAndDecode(data, checksum, onProgress) {
    const compressedData = Uint8Array.fromBase64(data);
    // Verify checksum if available
    if (checksum && checksums) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', compressedData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashHex !== checksums[checksum]) {
            throw new Error(`Checksum mismatch for ${checksum}: expected ${checksums[checksum]}, got ${hashHex}`);
        }
    }
    if (!COMPRESSION_ENABLED) {
        return new TextDecoder().decode(compressedData);
    }
    const total = compressedData.length;
    let loaded = 0;
    const counter = new TransformStream({
        transform(chunk, controller) {
            loaded += chunk.byteLength;
            onProgress?.(loaded / total);
            controller.enqueue(chunk);
        }
    });
    const blob = new Blob([compressedData], { type: 'application/gzip' });
    const ds = new DecompressionStream("gzip");
    const decompressedStream = blob.stream().pipeThrough(counter).pipeThrough(ds);
    return await new Response(decompressedStream).text();
}
function onHashChange() {
    loader.style.display = 'block';
    loader.textContent = 'Loading...';
    loaderBg.style.display = 'block';
    const hash = window.location.hash.substring(1);
    if (!hash) {
        window.location.hash = '/index.html';
        return;
    }
    const [content, head] = documents[hash] ?? [null, null];
    if (!content || !head) {
        console.error(`No content found for hash: ${hash}`);
        document.getElementById('content').innerHTML = '<h1>404 Not Found</h1><p>The requested page could not be found.</p><a href="#/index.html" style="color:#48f">Go back to menu</a>';
        document.getElementById('head-content').innerHTML = '';
        loader.style.display = 'none';
        loaderBg.style.display = 'none';
        return;
    }
    let progress = 0;
    let headProgress = 0;
    let contentProgress = 0;
    const loading = [
        decompressAndDecode(head, progress => {
            headProgress = progress;
        }).then(decompressedHead => {
            document.getElementById('head-content').innerHTML = decompressedHead;
            executeScripts(document.getElementById('head-content'));
        }),
        decompressAndDecode(content, progress => {
            contentProgress = progress;
        }).then(decompressedContent => {
            document.getElementById('content').innerHTML = decompressedContent;
            executeScripts(document.getElementById('content'));
        }),
        new Promise(resolve => {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.name === 'first-contentful-paint') {
                        resolve();
                        observer.disconnect();
                    }
                });
            });
            observer.observe({ type: "paint", buffered: true });
        }),
        new Promise(resolve => {
            const interval = setInterval(() => {
                const overallProgress = (headProgress + contentProgress) / 2;
                loader.textContent = `Loading... ${Math.floor(overallProgress * 100)}%`;
                if (overallProgress >= 1) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        }),
    ];
    Promise.all(loading).then(() => {
        console.log(`Loaded content for ${hash || '/index.html'}`);
        loader.style.display = 'none';
        loaderBg.style.display = 'none';
    }).catch((err) => {
        console.error('Error loading content:', err);
        if (err instanceof Error) {
            if (err.message.includes('Checksum mismatch')) {
                confirm('Corrupted content detected. This may be due to a failed update download. Would you like to try downloading the update again?') && installUpdate(true);
                return;
            }
        }
        alert('An error occurred while loading the page. Please try refreshing or check the console for details.');
    });
}
window.addEventListener('hashchange', location.reload.bind(location));
window.addEventListener('load', onHashChange);
const loader = document.createElement('div');
const loaderBg = document.createElement('div');
loaderBg.style.position = 'fixed';
loaderBg.style.inset = '0';
loaderBg.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
loaderBg.style.zIndex = '9998';
loaderBg.style.backdropFilter = 'blur(5px)';
loader.style.position = 'fixed';
loader.style.top = '50%';
loader.style.left = '50%';
loader.style.transform = 'translate(-50%, -50%)';
loader.style.fontSize = '24px';
loader.textContent = 'Loading...';
loader.style.color = '#eee';
loader.style.zIndex = '9999';
loader.style.padding = '20px';
document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(loader);
    document.body.appendChild(loaderBg);
});
let eventListeners = {
    'update-available': [],
};
class UpdateNotification extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            .update-notification {
                position: fixed;
                bottom: 20px;
                left: 50%;
                width: max-content;
                transform: translateX(-50%);
                background-color: #111;
                border: 1px #222 solid;
                color: #eee;
                padding: 10px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                flex-direction: column;
                gap: 5px;
                font: 18px sans-serif;
                z-index: 10000;
            }
            .update-notification button {
                display: inline-block;
                padding: 5px 10px;
                background-color: #0a635444;
                border: none;
                color: #5fa;
                border-radius: 5px;
                cursor: pointer;
                font: inherit;
                font-size: 16px;
                width: 100%;
            }
            .update-notification button:hover {
                background-color: #0b7e7066;
            }
        `;
        this.shadowRoot.appendChild(style);
        this.container = document.createElement('div');
        this.container.className = 'update-notification';
        this.container.innerHTML = `
            <span>A new update is available!</span>
            <button id="update-button">Update Now</button>
        `;
        this.shadowRoot.appendChild(this.container);
        this.container.querySelector('#update-button').addEventListener('click', () => {
            installUpdate();
        });
    }
}
customElements.define('update-notification', UpdateNotification);
window.updateManager = {
    checkForUpdates,
    installUpdate,
    showUpdateNotification() {
        if (!document.querySelector('update-notification')) {
            const notification = document.createElement('update-notification');
            document.body.appendChild(notification);
        }
    },
    get updateAvailable() {
        return storedUpdate;
    },
    on(event, callback) {
        if (!eventListeners[event]) throw new Error(`Unsupported event: ${event}`);
        eventListeners[event].push(callback);
    },
};
