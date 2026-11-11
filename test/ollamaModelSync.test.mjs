import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recordInstalledModels } = require('../src/features/common/services/ollamaModelSync');

/** In-memory stand-in for the ollama_models repository: update() only touches existing rows, like SQLite. */
function fakeRepo(initialRows = []) {
    const rows = new Map(initialRows.map(r => [r.name, { installing: 0, ...r }]));
    return {
        rows,
        upsertModel: ({ name, size, installed = false, installing = false }) => {
            rows.set(name, { name, size, installed: installed ? 1 : 0, installing: installing ? 1 : 0 });
        },
        updateInstallStatus: (name, installed, installing = false) => {
            if (!rows.has(name)) return { success: true, changes: 0 };
            Object.assign(rows.get(name), { installed: installed ? 1 : 0, installing: installing ? 1 : 0 });
            return { success: true, changes: 1 };
        },
        getInstalledModels: () => [...rows.values()].filter(r => r.installed === 1),
    };
}

describe('recordInstalledModels', () => {
    it('creates rows for models Ollama reports that the database has never seen', async () => {
        const repo = fakeRepo();
        await recordInstalledModels(repo, [{ name: 'llama3.2:3b', size: 2019393189 }, { name: 'deepseek-r1:14b', size: 8988112040 }]);
        expect(repo.getInstalledModels().map(m => m.name).sort()).toEqual(['deepseek-r1:14b', 'llama3.2:3b']);
        expect(repo.rows.get('llama3.2:3b').size).toBe(2019393189);
    });

    it('marks an existing row installed and clears installing', async () => {
        const repo = fakeRepo([{ name: 'llama3.2:3b', size: 1, installed: 0, installing: 1 }]);
        await recordInstalledModels(repo, [{ name: 'llama3.2:3b', size: 1 }]);
        expect(repo.rows.get('llama3.2:3b')).toMatchObject({ installed: 1, installing: 0 });
    });

    it('ignores entries without a name and returns the count recorded', async () => {
        const repo = fakeRepo();
        const n = await recordInstalledModels(repo, [{ size: 5 }, { name: 'gemma:2b', size: 5 }, null]);
        expect(n).toBe(1);
        expect(repo.getInstalledModels().map(m => m.name)).toEqual(['gemma:2b']);
    });

    it('does nothing for an empty list', async () => {
        const repo = fakeRepo();
        expect(await recordInstalledModels(repo, [])).toBe(0);
        expect(repo.getInstalledModels()).toEqual([]);
    });
});
