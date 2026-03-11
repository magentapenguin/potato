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
        const level = JSON.parse(save.data ?? '{}')['player']?.['level'] ?? 'Unknown';
        const levelSpan = document.createElement('span');
        levelSpan.className = 'save-level';
        levelSpan.textContent = `Level ${level}`;
        if (level !== 'Unknown') saveName.appendChild(levelSpan);
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
