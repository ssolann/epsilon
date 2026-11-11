const sqliteRepository = require('./sqlite.repository');

let authService = null;

function getAuthService() {
    if (!authService) {
        authService = require('../../services/authService');
    }
    return authService;
}

const uid = () => getAuthService().getCurrentUserId();

const userRepositoryAdapter = {
    findOrCreate: (user) => sqliteRepository.findOrCreate(user),
    getById: () => sqliteRepository.getById(uid()),
    update: (updateData) => sqliteRepository.update({ uid: uid(), ...updateData }),
    deleteById: () => sqliteRepository.deleteById(uid()),
};

module.exports = {
    ...userRepositoryAdapter,
};
