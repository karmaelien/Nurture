const express = require('express');
const multer = require('multer');
const documentModel = require('../models/document.model');
const { httpError } = require('../utils/httpErrors');
const { createSchema, updateSchema, querySchema, fileQuerySchema, parse, validateFile, safeName } = require('../validators/documents.validators');

// Mount after authenticate. Identity is supplied exclusively by req.user.
module.exports = function createDocumentRouter({ db = require('../config/db') } = {}) {
  const router = express.Router({ mergeParams: true });
  const model = documentModel(db);
  const within = (req, work) => model.withCircle(req.params.circleId, req.user, work);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10485760, files: 1, fields: 1, parts: 2, fieldSize: 65536 } }).single('file');
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    await within(req, async () => {});
    next();
  });
  router.get('/', async (req, res) => {
    const documents = await within(req, scope => scope.list(parse(querySchema, req.query)));
    res.json({ documents });
  });
  router.post('/', (req, res, next) => upload(req, res, error => {
    if (!error) return next();
    next(error.code === 'LIMIT_FILE_SIZE' ? httpError(413, 'file_too_large', 'Files must be at most 10 MiB.') : httpError(400, 'validation_error', 'Upload one file and one metadata field.'));
  }), async (req, res) => {
    validateFile(req.file);
    let metadata;
    try { metadata = JSON.parse(req.body.metadata); } catch { throw httpError(400, 'validation_error', 'Metadata must be valid JSON.'); }
    if (Object.keys(req.body).some(key => key !== 'metadata')) throw httpError(400, 'validation_error', 'Unexpected upload field.');
    const body = parse(createSchema, metadata);
    req.file.originalname = safeName(req.file.originalname);
    const document = await within(req, async scope => {
      await scope.recipient(body.recipientId);
      await scope.checkSharing(body.sharing);
      return scope.create(body, req.file);
    });
    res.status(201).json({ document });
  });
  router.get('/:documentId', async (req, res) => {
    const document = await within(req, async scope => scope.wire(await scope.find(req.params.documentId)));
    res.json({ document });
  });
  router.get('/:documentId/file', async (req, res) => {
    const result = await within(req, async scope => {
      const row = await scope.find(req.params.documentId);
      const { disposition } = parse(fileQuerySchema, req.query);
      return { row, disposition, bytes: await scope.bytes(row) };
    });
    res.set({ 'Content-Type': result.row.mime_type, 'Content-Disposition': `${result.disposition}; filename="document"; filename*=UTF-8''${encodeURIComponent(result.row.file_name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox" });
    res.send(result.bytes);
  });
  router.patch('/:documentId', async (req, res) => {
    const document = await within(req, async scope => {
      const row = await scope.find(req.params.documentId, true);
      return scope.update(row, parse(updateSchema, req.body));
    });
    res.json({ document });
  });
  router.delete('/:documentId', async (req, res) => {
    await within(req, async scope => {
      const row = await scope.find(req.params.documentId, true);
      await scope.remove(row);
    });
    res.status(204).end();
  });
  return router;
};
