/**
 * A small in-memory stand-in for Firestore (Admin SDK shape), Firebase Auth and Storage,
 * enough for server tests of account deletion: queries (==, <, >, array-contains, dotted
 * fields), collection groups, orderBy/limit, batches, recursiveDelete, listDocuments and
 * FieldValue increment / arrayRemove / delete / serverTimestamp.
 */
export const ts = (ms) => ({ ms, toMillis: () => ms });
const val = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function fakeFirebase() {
  const docs = new Map();
  const authUsers = new Set();
  const files = new Set();
  let auto = 0;

  const FieldValue = {
    increment: (n) => ({ __op: 'inc', n }),
    arrayRemove: (...v) => ({ __op: 'arrRemove', v }),
    delete: () => ({ __op: 'del' }),
    serverTimestamp: () => ts(Date.now()),
  };
  function applyUpdate(cur, data) {
    const out = JSON.parse(JSON.stringify(cur || {}), (k, v) => v);
    // keep timestamp objects (functions are lost by JSON): copy them back
    for (const [k, v] of Object.entries(cur || {})) if (v && typeof v.toMillis === 'function') out[k] = v;
    for (const [key, v] of Object.entries(data)) {
      const parts = key.split('.');
      let o = out;
      for (const p of parts.slice(0, -1)) { o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}; o = o[p]; }
      const last = parts[parts.length - 1];
      if (v && v.__op === 'inc') o[last] = (Number(o[last]) || 0) + v.n;
      else if (v && v.__op === 'arrRemove') o[last] = (o[last] || []).filter((x) => !v.v.includes(x));
      else if (v && v.__op === 'del') delete o[last];
      else o[last] = v;
    }
    return out;
  }

  const ref = (p) => {
    const seg = p.split('/');
    return {
      path: p,
      id: seg[seg.length - 1],
      get parent() {
        const collPath = seg.slice(0, -1).join('/');
        return { id: seg[seg.length - 2], path: collPath, get parent() { return seg.length > 2 ? ref(seg.slice(0, -2).join('/')) : null; } };
      },
      async get() { const d = docs.get(p); return { exists: Boolean(d), id: seg[seg.length - 1], ref: ref(p), data: () => d }; },
      async set(data) { docs.set(p, { ...data }); },
      async update(data) { if (!docs.has(p)) throw new Error(`No document to update: ${p}`); docs.set(p, applyUpdate(docs.get(p), data)); },
      async delete() { docs.delete(p); },
      collection: (name) => query(`${p}/${name}`),
    };
  };

  const query = (collPath, { group = false, filters = [], order = null, lim = null } = {}) => ({
    where(field, op, v) { return query(collPath, { group, filters: [...filters, [field, op, v]], order, lim }); },
    orderBy(field, dir = 'asc') { return query(collPath, { group, filters, order: [field, dir], lim }); },
    limit(n) { return query(collPath, { group, filters, order, lim: n }); },
    doc: (id) => ref(`${collPath}/${id}`),
    async get() {
      let out = [...docs.entries()].filter(([p]) => {
        const seg = p.split('/');
        return group ? seg.length >= 2 && seg[seg.length - 2] === collPath : seg.slice(0, -1).join('/') === collPath;
      }).filter(([, d]) => filters.every(([f, op, v]) => {
        const a = val(get(d, f));
        const b = val(v);
        if (op === 'array-contains') return Array.isArray(a) && a.includes(b);
        if (a === undefined) return false;
        return op === '==' ? a === b : op === '>' ? a > b : op === '<' ? a < b : false;
      }));
      if (order) out.sort((x, y) => { const a = val(get(x[1], order[0])); const b = val(get(y[1], order[0])); return (a > b ? 1 : a < b ? -1 : 0) * (order[1] === 'desc' ? -1 : 1); });
      if (lim) out = out.slice(0, lim);
      const list = out.map(([p, d]) => ({ id: p.split('/').pop(), ref: ref(p), exists: true, data: () => d }));
      return { docs: list, empty: !list.length };
    },
    async add(data) { auto += 1; const p = `${collPath}/auto${auto}`; docs.set(p, { ...data }); return ref(p); },
    async listDocuments() {
      const ids = new Set();
      const depth = collPath.split('/').length;
      for (const p of docs.keys()) if (p.startsWith(`${collPath}/`)) ids.add(p.split('/')[depth]);
      return [...ids].map((id) => ref(`${collPath}/${id}`));
    },
  });

  const db = {
    doc: ref,
    collection: (name) => query(name),
    collectionGroup: (name) => query(name, { group: true }),
    async recursiveDelete(r) { for (const p of [...docs.keys()]) if (p === r.path || p.startsWith(`${r.path}/`)) docs.delete(p); },
    batch() {
      const ops = [];
      return {
        delete: (r) => ops.push(() => docs.delete(r.path)),
        update: (r, d) => ops.push(() => docs.set(r.path, applyUpdate(docs.get(r.path), d))),
        set: (r, d) => ops.push(() => docs.set(r.path, { ...d })),
        async commit() { ops.forEach((o) => o()); },
      };
    },
  };

  const auth = {
    async deleteUser(uid) { if (!authUsers.has(uid)) { const e = new Error('There is no user record'); e.code = 'auth/user-not-found'; throw e; } authUsers.delete(uid); },
    async getUsers(ids) { const notFound = ids.filter((x) => !authUsers.has(x.uid)); return { users: ids.filter((x) => authUsers.has(x.uid)), notFound }; },
  };
  const bucket = {
    file: (p) => ({ async delete() { files.delete(p); } }),
    async deleteFiles({ prefix }) { for (const f of [...files]) if (f.startsWith(prefix)) files.delete(f); },
  };
  const admin = { firestore: Object.assign(() => db, { FieldValue, Timestamp: { fromMillis: ts } }), auth: () => auth, storage: () => ({ bucket: () => bucket }) };
  return { db, docs, authUsers, files, admin, bucket, FieldValue };
}
