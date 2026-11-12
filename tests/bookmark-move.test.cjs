const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture() {
    const folders = { p: ['a', 'sub', 'b', 'c'], q: ['d'] };
    const nodes = Object.fromEntries(['p', 'q', 'sub'].map(id => [id, { id }]));
    for (const [parentId, ids] of Object.entries(folders)) {
        for (const id of ids) nodes[id] = { id, parentId, ...(id === 'sub' ? {} : { url: 'https://example.com/' + id }) };
    }
    let calls = 0;
    const api = {
        get: async id => nodes[id] ? [nodes[id]] : [],
        getChildren: async id => folders[id].map(id => nodes[id]),
        move: async (id, dest) => {
            calls++;
            const node = nodes[id], old = folders[node.parentId], oldIndex = old.indexOf(id);
            let index = dest.index;
            if (node.parentId === dest.parentId && oldIndex < index) index--;
            old.splice(oldIndex, 1);
            folders[dest.parentId].splice(index, 0, id);
            node.parentId = dest.parentId;
            return node;
        }
    };
    const context = { chrome: { bookmarks: api }, document: { addEventListener() {} } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../scripts/newtab.js'), 'utf8') + '\nglobalThis.Manager = BookmarkManager;', context);
    return { manager: Object.create(context.Manager.prototype), folders, nodes, calls: () => calls };
}
test('same-folder moves preserve child-folder positions and support both directions', async () => {
    const f = fixture();
    await f.manager.moveBookmarkTo('a', { parentId: 'p', anchorId: 'b', after: true });
    assert.deepEqual(f.folders.p, ['sub', 'b', 'a', 'c']);
    await f.manager.moveBookmarkTo('c', { parentId: 'p', anchorId: 'b', after: false });
    assert.deepEqual(f.folders.p, ['sub', 'c', 'b', 'a']);
});
test('cross-folder insertion and append change the actual parent', async () => {
    const f = fixture();
    await f.manager.moveBookmarkTo('b', { parentId: 'q', anchorId: 'd', after: false });
    assert.deepEqual(f.folders.q, ['b', 'd']);
    assert.equal(f.nodes.b.parentId, 'q');
    await f.manager.moveBookmarkTo('a', { parentId: 'q' });
    assert.deepEqual(f.folders.q, ['b', 'd', 'a']);
});
test('missing anchor and managed folders fail before writing', async () => {
    const f = fixture();
    await assert.rejects(f.manager.moveBookmarkTo('a', { parentId: 'q', anchorId: 'missing' }));
    f.nodes.q.unmodifiable = 'managed';
    await assert.rejects(f.manager.moveBookmarkTo('a', { parentId: 'q' }));
    assert.equal(f.calls(), 0);
    assert.deepEqual(f.folders.p, ['a', 'sub', 'b', 'c']);
});
