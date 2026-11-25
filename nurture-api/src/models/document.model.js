const { httpError } = require('../utils/httpErrors');
const { parseId } = require('../utils/ids');
const missing = () => httpError(404, 'not_found', 'Document, recipient, or care circle not found.');

module.exports = function documentModel(db) {
  return {
    // Membership stays locked for the operation, including private file access.
    async withCircle(circleId, user, work) {
      if (!user) throw httpError(401, 'unauthorized', 'Authentication required.');
      if (!parseId(circleId) || !parseId(String(user.id))) throw missing();
      return db.transaction(async tx => {
        const membership = (await tx.query('SELECT role FROM circle_members WHERE circle_id=$1 AND user_id=$2 FOR SHARE', [circleId, user.id])).rows[0];
        if (!membership) throw missing();
        const owner = membership.role === 'owner';
        const manage = row => owner || String(row.uploaded_by) === String(user.id);
        const projection = `d.id, d.version, d.recipient_id, d.title, d.category, d.file_name, d.mime_type, d.size_bytes, d.uploaded_by, d.uploaded_at, d.sharing_mode, ARRAY(SELECT user_id::text FROM document_grants g WHERE g.document_id=d.id ORDER BY user_id) AS member_ids`;
        const visible = `(d.uploaded_by=$2 OR $3 OR d.sharing_mode='circle' OR EXISTS (SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND g.user_id=$2))`;
        const wire = row => ({ id: String(row.id), version: row.version, recipientId: String(row.recipient_id), title: row.title, category: row.category,
          fileName: row.file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes,
          uploadedBy: row.uploaded_by === null ? null : String(row.uploaded_by), uploadedAt: row.uploaded_at.toISOString(),
          sharing: { mode: row.sharing_mode, memberIds: row.member_ids }, canManage: manage(row) });
        async function find(id, manager = false) {
          if (!parseId(String(id))) throw missing();
          const row = (await tx.query(`SELECT ${projection} FROM care_documents d WHERE d.circle_id=$1 AND ${visible} AND d.id=$4 FOR UPDATE OF d`, [circleId, user.id, owner, id])).rows[0];
          if (!row) throw missing();
          if (manager && !manage(row)) throw httpError(403, 'document_manager_only', 'Only the uploader or a circle owner can manage this document.');
          return row;
        }
        async function recipient(id) {
          if (!(await tx.query('SELECT id FROM recipients WHERE circle_id=$1 AND id=$2 FOR KEY SHARE', [circleId, id])).rowCount) throw missing();
        }
        async function checkSharing(sharing) {
          if (!sharing || !sharing.memberIds.length) return;
          const members = await tx.query('SELECT user_id FROM circle_members WHERE circle_id=$1 AND user_id=ANY($2::int[]) ORDER BY user_id FOR SHARE', [circleId, sharing.memberIds]);
          if (members.rowCount !== sharing.memberIds.length) throw missing();
        }
        async function grants(id, sharing) {
          await tx.query('DELETE FROM document_grants WHERE document_id=$1', [id]);
          if (sharing.memberIds.length) await tx.query('INSERT INTO document_grants(circle_id,document_id,user_id) SELECT $1,$2,unnest($3::int[])', [circleId, id, sharing.memberIds]);
        }
        return work({
          wire, find, recipient, checkSharing,
          // Called only after find has authorized and locked the document.
          async bytes(row) {
            return (await tx.query('SELECT file_bytes FROM care_documents WHERE id=$1', [row.id])).rows[0].file_bytes;
          },
          async list(query) {
            if (query.recipientId) await recipient(query.recipientId);
            return (await tx.query(`SELECT ${projection} FROM care_documents d WHERE d.circle_id=$1 AND ${visible}
              AND ($4::int IS NULL OR d.recipient_id=$4) AND ($5::text IS NULL OR d.category=$5)
              AND ($6::text IS NULL OR strpos(lower(d.title),lower($6))>0 OR strpos(lower(d.file_name),lower($6))>0)
              ORDER BY d.uploaded_at DESC,d.id`, [circleId, user.id, owner, query.recipientId ?? null, query.category ?? null, query.search ?? null])).rows.map(wire);
          },
          async create(body, file) {
            const row = (await tx.query(`INSERT INTO care_documents(circle_id,recipient_id,title,category,file_name,mime_type,size_bytes,file_bytes,uploaded_by,sharing_mode)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [circleId, body.recipientId, body.title, body.category, file.originalname, file.mimetype, file.size, file.buffer, user.id, body.sharing.mode])).rows[0];
            await grants(row.id, body.sharing);
            return wire(await find(row.id));
          },
          async update(row, body) {
            if (body.version !== row.version) throw httpError(409, 'document_conflict', 'This document changed. Cancel editing, refresh the list, and reopen it before saving.');
            await checkSharing(body.sharing);
            await tx.query('UPDATE care_documents SET version=version+1,title=$2,category=$3,sharing_mode=$4 WHERE id=$1', [row.id, body.title ?? row.title, body.category ?? row.category, body.sharing?.mode ?? row.sharing_mode]);
            if (body.sharing) await grants(row.id, body.sharing);
            return wire(await find(row.id));
          },
          async remove(row) { await tx.query('DELETE FROM care_documents WHERE id=$1', [row.id]); },
        });
      });
    },
  };
};
