export function currentSaveIndex() {
    let currentSave = localStorage.getItem('currentSaveIndex') ?? null;
    if (currentSave !== null) {
        currentSave = parseInt(currentSave);
        if (isNaN(currentSave)) {
            currentSave = null;
        }
        if (JSON.parse(localStorage.getItem('saves') ?? '[]')[currentSave] == undefined) {
            currentSave = null;
        }
        if (currentSave == null) {
            localStorage.removeItem('currentSaveIndex');
        }
    }
    return currentSave;
}