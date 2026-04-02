const documents = {
    '/index.html': ["{menu}", "{menu_head}"],
    '/game.html': ["{game}", "{game_head}"]
};
const checksums = null//{checksums};
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
async function decompressAndDecode(data, checksum, onProgress) {
    const compressedData = Uint8Array.fromBase64(data);
    // Verify checksum if available
    if (checksum && checksums) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', compressedData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashHex !== checksum) {
            throw new Error(`Checksum mismatch: expected ${checksum}, got ${hashHex}`);
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
    const [expectedContentChecksum, expectedHeadChecksum] = checksums?.[hash] ?? [null, null];
    if (!content || !head) {
        console.error(`No content found for hash: ${hash}`);
        document.getElementById('content').innerHTML = '<h1>404 Not Found</h1><p>The requested page could not be found.</p><a href="#/index.html" style="color:#48f">Go back to menu</a>';
        document.getElementById('head-content').innerHTML = '';
        loader.style.display = 'none';
        loaderBg.style.display = 'none';
        return;
    }
    let headProgress = 0;
    let contentProgress = 0;
    const loading = [
        decompressAndDecode(head, expectedHeadChecksum, progress => {
            headProgress = progress;
        }).then(decompressedHead => {
            document.getElementById('head-content').innerHTML = decompressedHead;
            executeScripts(document.getElementById('head-content'));
        }),
        decompressAndDecode(content, expectedContentChecksum, progress => {
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
                confirm('Corrupted content detected.')
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