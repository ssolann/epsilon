const sqliteRepository = require('./sqlite.repository');

let authService = null;

function setAuthService(service) {
    authService = service;
}

function uid() {
    return authService ? authService.getCurrentUserId() : 'default_user';
}

// Adapter that injects the local user id into SQLite calls.
const sessionRepositoryAdapter = {
    setAuthService,

    getById: (id) => sqliteRepository.getById(id),
    create: (type = 'ask') => sqliteRepository.create(uid(), type),
    getAllByUserId: () => sqliteRepository.getAllByUserId(uid()),
    updateTitle: (id, title) => sqliteRepository.updateTitle(id, title),
    deleteWithRelatedData: (id) => sqliteRepository.deleteWithRelatedData(id),
    end: (id) => sqliteRepository.end(id),
    updateType: (id, type) => sqliteRepository.updateType(id, type),
    touch: (id) => sqliteRepository.touch(id),
    getOrCreateActive: (requestedType = 'ask') => sqliteRepository.getOrCreateActive(uid(), requestedType),
    endAllActiveSessions: () => sqliteRepository.endAllActiveSessions(uid()),
};

module.exports = sessionRepositoryAdapter;
