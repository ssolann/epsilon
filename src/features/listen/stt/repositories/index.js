const sqliteRepository = require('./sqlite.repository');
const authService = require('../../../common/services/authService');

const uid = () => authService.getCurrentUserId();

const sttRepositoryAdapter = {
    addTranscript: ({ sessionId, speaker, text }) =>
        sqliteRepository.addTranscript({ uid: uid(), sessionId, speaker, text }),
    getAllTranscriptsBySessionId: (sessionId) => sqliteRepository.getAllTranscriptsBySessionId(sessionId),
};

module.exports = sttRepositoryAdapter;
