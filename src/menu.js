import { currentSaveIndex } from "./currentSave.js";

const saveList = document.getElementById('save-list');

if (currentSaveIndex() == null && localStorage.getItem('mazeSave')) {
    let saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
    saves.push({ name: 'Auto Save', data: localStorage.getItem('mazeSave') });
    localStorage.setItem('saves', JSON.stringify(saves));
    localStorage.setItem('currentSaveIndex', saves.length - 1);
    localStorage.removeItem('mazeSave');
}

if ("launchQueue" in window) {
    window.launchQueue.setConsumer((launchParams) => {
        if (launchParams.files.length > 0) {
            console.log('File launch received:', launchParams.files);
            launchParams.files[0].getFile().then(() => {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const data = reader.result;
                        const parsedData = JSON.parse(data);
                        if (!parsedData.save.player || !parsedData.save.level) {
                            throw new Error('Invalid save file');
                        }
                        const saveName = prompt('Enter a name for your save:', parsedData.name ?? 'Imported Save');
                        if (saveName) {
                            const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
                            saves.push({ name: saveName, data: JSON.stringify(parsedData.save) });
                            localStorage.setItem('saves', JSON.stringify(saves));
                            updateSaveList();
                        }
                    } catch (e) {
                        console.error(e);
                        alert('Failed to import save: ' + e.message);
                    }
                }
                reader.readAsText(file);
            });
        }
    });
} else if (window.__TAURI__) {
    window.__TAURI__.event.listen('file-opened', (event) => {
        const file = event.payload;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = reader.result;
                const parsedData = JSON.parse(data);
                if (!parsedData.save.player || !parsedData.save.level) {
                    throw new Error('Invalid save file');
                }
                const saveName = prompt('Enter a name for your save:', parsedData.name ?? 'Imported Save');
                if (saveName) {
                    const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
                    saves.push({ name: saveName, data: JSON.stringify(parsedData.save) });
                    localStorage.setItem('saves', JSON.stringify(saves));
                    updateSaveList();
                }
            } catch (e) {
                console.error(e);
                alert('Failed to import save: ' + e.message);
            }
        }
        reader.readAsText(file);
    });
}

function updateSaveList() {
    saveList.innerHTML = '';
    const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
    saves.forEach((save, index) => {
        const saveItem = document.createElement('div');
        saveItem.className = 'save-item';
        saveItem.classList.toggle('current-save', index == currentSaveIndex());
        const saveName = document.createElement('span');
        saveName.className = 'save-name';
        saveName.textContent = save.name;
        const saveRenameButton = document.createElement('button');
        saveRenameButton.className = 'rename-button reset-button';
        saveRenameButton.innerHTML = '<span class="sr-only">Rename</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" style="width:1em;height:1em;fill:currentColor;vertical-align:-0.125em;"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M416.9 85.2L372 130.1L509.9 268L554.8 223.1C568.4 209.6 576 191.2 576 172C576 152.8 568.4 134.4 554.8 120.9L519.1 85.2C505.6 71.6 487.2 64 468 64C448.8 64 430.4 71.6 416.9 85.2zM338.1 164L122.9 379.1C112.2 389.8 104.4 403.2 100.3 417.8L64.9 545.6C62.6 553.9 64.9 562.9 71.1 569C77.3 575.1 86.2 577.5 94.5 575.2L222.3 539.7C236.9 535.6 250.2 527.9 261 517.1L476 301.9L338.1 164z"/></svg>';
        saveRenameButton.addEventListener('click', () => {
            const newName = prompt('Enter a new name for your save:', save.name);
            if (newName) {
                const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
                saves[index].name = newName;
                localStorage.setItem('saves', JSON.stringify(saves));
                updateSaveList();
            }
        });
        saveName.appendChild(saveRenameButton);
        const saveData = JSON.parse(save.data ?? '{}');
        const saveInfo = document.createElement('span');
        saveInfo.className = 'save-info';
        if (saveData['player']?.['level']) {
            saveInfo.textContent = `Level ${saveData['player']['level']}`;
        }
        if (saveData['player']?.['in_shop']) {
            saveInfo.textContent += ' (In Shop)';
        }
        saveName.appendChild(saveInfo);
        const saveButtons = document.createElement('div');
        saveButtons.className = 'save-buttons';
        const loadButton = document.createElement('button');
        loadButton.className = 'load-button button';
        loadButton.textContent = 'Load';
        loadButton.addEventListener('click', () => {
            localStorage.setItem('currentSaveIndex', index);
            localStorage.setItem('mazeSave', save.data);
            open('game.html', '_self');
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this save? This cannot be undone.')) {
                const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
                saves.splice(index, 1);
                localStorage.setItem('saves', JSON.stringify(saves));
                if (currentSaveIndex == index) {
                    localStorage.removeItem('currentSaveIndex');
                }
                updateSaveList();
            }
        });
        const exportButton = document.createElement('button');
        exportButton.className = 'export-button button';
        exportButton.textContent = 'Export';
        exportButton.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({
                save: JSON.parse(save.data ?? '{}'),
                name: save.name,
            })], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${save.name}.potato`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        saveButtons.appendChild(loadButton);
        saveButtons.appendChild(deleteButton);
        saveButtons.appendChild(exportButton);
        saveItem.appendChild(saveName);
        saveItem.appendChild(saveButtons);
        saveList.appendChild(saveItem);
    })
}

updateSaveList();

document.getElementById('create-save').addEventListener('click', () => {
    const saveName = prompt('Enter a name for your save:');
    if (saveName) {
        const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
        saves.push({ name: saveName, data: null });
        localStorage.setItem('saves', JSON.stringify(saves));
        updateSaveList();
    }
});

document.getElementById('import-save').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.potato';
    input.addEventListener('change', () => {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = reader.result;
                const parsedData = JSON.parse(data);
                if (!parsedData.save.player || !parsedData.save.level) {
                    throw new Error('Invalid save file');
                }
                const saveName = prompt('Enter a name for your save:', parsedData.name ?? 'Imported Save');
                if (saveName) {
                    const saves = JSON.parse(localStorage.getItem('saves') ?? '[]');
                    saves.push({ name: saveName, data: JSON.stringify(parsedData.save) });
                    localStorage.setItem('saves', JSON.stringify(saves));
                    updateSaveList();
                }
            } catch (e) {
                console.error(e);
                alert('Failed to import save: ' + e.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
});
