class UpdateNotification extends HTMLElement {
    constructor() {
        super();
        this.update = null;
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
                animation: slideIn 0.5s ease-out;
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
            .update-notification button:disabled {
                filter: grayscale(100%) opacity(50%);
                cursor: not-allowed;
            }
            .update-notification button:hover {
                background-color: #0b7e7066;
            }
            @keyframes slideIn {
                from {
                    transform: translate(-50%, 100%);
                    opacity: 0;
                }
                to {
                    transform: translate(-50%, 0);
                    opacity: 1;
                }         
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
        this.container.querySelector('#update-button').addEventListener('click', async () => {
            if (!this.update) {
                this.style.display = 'none';
                return console.error('No update available');
            }
            let downloaded = 0;
            let contentLength = 0;
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                  case 'Started':
                    contentLength = event.data.contentLength;
                    this.container.querySelector('span').textContent = `Downloading update... (0/${contentLength} bytes)`;
                    this.container.querySelector('#update-button').disabled = true;
                    this.container.querySelector('#update-button').textContent = '0%';
                    break;
                  case 'Progress':
                    downloaded += event.data.chunkLength;
                    this.container.querySelector('span').textContent = `Downloading update... (${downloaded}/${contentLength} bytes)`;
                    this.container.querySelector('#update-button').textContent = `${Math.round((downloaded / contentLength) * 100)}%`;
                    break;
                  case 'Finished':
                    this.container.querySelector('span').textContent = 'Update downloaded! Installing...';
                    break;
                }
            });
            this.container.querySelector('#update-button').textContent = 'Installing...';
            await window.__TAURI__.process.relaunch();
        });
        this.checkForUpdate();
    }
    async checkForUpdate() {
        const update = await window.__TAURI__.updater.check();
        if (update) {
            this.update = update;
            console.log('Update available:', update);
            this.style.display = 'block';
        } else {
            this.style.display = 'none';
        }
    }
}
customElements.define('tauri-update-notification', UpdateNotification);