const sqliteRepository = require('./sqlite.repository');
const authService = require('../../common/services/authService');

const uid = () => authService.getCurrentUserId();

const askRepositoryAdapter = {
    addAiMessage: ({ sessionId, role, content, model }) =>
        sqliteRepository.addAiMessage({ uid: uid(), sessionId, role, content, model }),
    getAllAiMessagesBySessionId: (sessionId) => sqliteRepository.getAllAiMessagesBySessionId(sessionId),
};

module.exports = askRepositoryAdapter;
