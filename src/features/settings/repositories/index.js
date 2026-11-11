const sqliteRepository = require('./sqlite.repository');
const authService = require('../../common/services/authService');

const uid = () => authService.getCurrentUserId();

const settingsRepositoryAdapter = {
    getPresets: () => sqliteRepository.getPresets(uid()),
    getPresetTemplates: () => sqliteRepository.getPresetTemplates(),
    createPreset: (options) => sqliteRepository.createPreset({ uid: uid(), ...options }),
    updatePreset: (id, options) => sqliteRepository.updatePreset(id, options, uid()),
    deletePreset: (id) => sqliteRepository.deletePreset(id, uid()),
    getAutoUpdate: () => sqliteRepository.getAutoUpdate(uid()),
    setAutoUpdate: (isEnabled) => sqliteRepository.setAutoUpdate(uid(), isEnabled),
};

module.exports = settingsRepositoryAdapter;
