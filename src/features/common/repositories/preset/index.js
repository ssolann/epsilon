const sqliteRepository = require('./sqlite.repository');
const authService = require('../../services/authService');

const uid = () => authService.getCurrentUserId();

const presetRepositoryAdapter = {
    getPresets: () => sqliteRepository.getPresets(uid()),
    getPresetTemplates: () => sqliteRepository.getPresetTemplates(),
    create: (options) => sqliteRepository.create({ uid: uid(), ...options }),
    update: (id, options) => sqliteRepository.update(id, options, uid()),
    delete: (id) => sqliteRepository.delete(id, uid()),
};

module.exports = presetRepositoryAdapter;
