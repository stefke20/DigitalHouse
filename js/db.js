// Small IndexedDB wrapper: projects (JSON), docs (blobs), symbols (user-defined icons)
let dbp;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('housevault', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('docs', { keyPath: 'id' }).createIndex('projectId', 'projectId');
      d.createObjectStore('symbols', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function run(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
export const put = (store, obj) => run(store, 'readwrite', s => s.put(obj));
export const get = (store, id) => run(store, 'readonly', s => s.get(id));
export const getAll = store => run(store, 'readonly', s => s.getAll());
export const del = (store, id) => run(store, 'readwrite', s => s.delete(id));
export async function docsOfProject(pid) {
  const all = await getAll('docs');
  return all.filter(d => d.projectId === pid);
}
export async function deleteProject(pid) {
  for (const d of await docsOfProject(pid)) await del('docs', d.id);
  await del('projects', pid);
}
