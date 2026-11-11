const sqliteRepository = require('./sqlite.repository');
const authService = require('../../../common/services/authService');

const uid = () => authService.getCurrentUserId();

const summaryRepositoryAdapter = {
    saveSummary: ({ sessionId, tldr, text, bullet_json, action_json, model }) =>
        sqliteRepository.saveSummary({ uid: uid(), sessionId, tldr, text, bullet_json, action_json, model }),
    getSummaryBySessionId: (sessionId) => sqliteRepository.getSummaryBySessionId(sessionId),
};

module.exports = summaryRepositoryAdapter;
