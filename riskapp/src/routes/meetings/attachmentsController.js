'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { query } = require('../../db/pool');

// ── MIME allow-list ───────────────────────────────────────────────────────────
// PDF/A shares the same MIME type as PDF; distinction is internal XMP metadata.

const ALLOWED_MIMES = new Set([
  'application/pdf',          // PDF / PDF-A
  'text/rtf',                 // Rich Text Format
  'application/rtf',          // RTF (alternate MIME some browsers send)
  'text/csv',                 // CSV
  'text/tab-separated-values',// TSV
  'application/json',         // JSON
  'text/json',                // JSON (alternate)
  'application/xml',          // XML
  'text/xml',                 // XML (alternate)
  'text/markdown',            // Markdown
  'text/x-markdown',          // Markdown (alternate)
  'text/plain',               // plain .md / .csv / .tsv when browser sends generic type
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const MIME_TO_EXTS = {
  'application/pdf':           ['.pdf'],
  'text/rtf':                  ['.rtf'],
  'application/rtf':           ['.rtf'],
  'text/csv':                  ['.csv'],
  'text/tab-separated-values': ['.tsv'],
  'application/json':          ['.json'],
  'text/json':                 ['.json'],
  'application/xml':           ['.xml'],
  'text/xml':                  ['.xml'],
  'text/markdown':             ['.md', '.markdown'],
  'text/x-markdown':           ['.md', '.markdown'],
  'text/plain':                ['.md', '.markdown', '.csv', '.tsv', '.txt'],
  'image/jpeg':                ['.jpg', '.jpeg'],
  'image/png':                 ['.png'],
  'image/gif':                 ['.gif'],
  'image/webp':                ['.webp'],
};

// ── Content verification ──────────────────────────────────────────────────────
// Binary formats: check magic bytes.
// Text formats: confirm no null bytes in the first 512 bytes (binary smuggling guard).
// JSON/XML/RTF: additionally verify the expected ASCII header.

function verifyContent(buf, mime) {
  switch (mime) {
    case 'application/pdf':
      // %PDF
      return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

    case 'image/jpeg':
      return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;

    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;

    case 'image/gif':
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;

    case 'image/webp':
      return (
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
      );

    case 'text/rtf':
    case 'application/rtf':
      // {\rtf
      return buf[0] === 0x7B && buf[1] === 0x5C && buf[2] === 0x72 && buf[3] === 0x74 && buf[4] === 0x66;

    case 'application/json':
    case 'text/json': {
      // First non-whitespace byte should be { or [
      const trimmed = buf.slice(0, 512).toString('utf8').trimStart();
      return trimmed[0] === '{' || trimmed[0] === '[';
    }

    case 'application/xml':
    case 'text/xml': {
      // Should start with < (possibly after BOM/whitespace)
      const s = buf.slice(0, 64).toString('utf8').trimStart();
      return s[0] === '<';
    }

    case 'text/csv':
    case 'text/tab-separated-values':
    case 'text/markdown':
    case 'text/x-markdown':
    case 'text/plain':
      // No null bytes in first 512 bytes
      return !buf.slice(0, 512).includes(0x00);

    default:
      return false;
  }
}

// ── Multer disk storage ───────────────────────────────────────────────────────

const UPLOADS_BASE = path.resolve(__dirname, '../../../uploads/meetings');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // req.params.id is already UUID-validated by the router (hardening H-09).
    // Re-check containment here anyway: this callback creates a directory and
    // opens a file before any handler code runs, so it must not depend on a
    // guard someone could later reorder or drop when wiring a new route.
    const dir = path.resolve(UPLOADS_BASE, req.params.id);
    if (dir !== path.join(UPLOADS_BASE, req.params.id) ||
        path.dirname(dir) !== UPLOADS_BASE) {
      return cb(Object.assign(new Error('Invalid meeting id.'), { status: 400 }));
    }
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── POST /meetings/:id/attachments ────────────────────────────────────────────

async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const { id: meetingId }    = req.params;
    const { id: userId, role } = req.user;
    const file                 = req.file;

    function cleanup() { try { fs.unlinkSync(file.path); } catch (_) {} }

    const mRes = await query(
      `SELECT id, closed_at, minutes_issued_at FROM working_group_meetings WHERE id = $1`, [meetingId]
    );
    if (!mRes.rows.length) { cleanup(); return res.status(404).json({ error: 'Meeting not found.' }); }

    const { closed_at, minutes_issued_at } = mRes.rows[0];
    if (minutes_issued_at) {
      cleanup();
      return res.status(409).json({ error: 'Cannot add attachments after minutes have been issued.' });
    }

    const isSecretary = role === 'meeting_secretary';

    // After close only secretary may attach
    if (closed_at && !isSecretary) {
      cleanup();
      return res.status(409).json({ error: 'Only the meeting secretary may attach files once the meeting is closed.' });
    }

    // Before close: attendee or privileged role
    if (!closed_at) {
      const isPrivileged = ['meeting_secretary', 'ciso', 'siro', 'admin'].includes(role);
      if (!isPrivileged) {
        const aRes = await query(
          `SELECT id FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`,
          [meetingId, userId]
        );
        if (!aRes.rows.length) {
          cleanup();
          return res.status(403).json({ error: 'Only meeting attendees may upload attachments.' });
        }
      }
    }

    // MIME allow-list
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cleanup();
      return res.status(400).json({ error: 'File type not permitted. Allowed: PDF/A, RTF, CSV, TSV, JSON, XML, Markdown, images.' });
    }

    // Extension must match MIME
    const ext = path.extname(file.originalname).toLowerCase();
    if (!(MIME_TO_EXTS[file.mimetype] ?? []).includes(ext)) {
      cleanup();
      return res.status(400).json({ error: `Extension '${ext}' does not match declared type.` });
    }

    // Content verification
    const headBuf = Buffer.alloc(512);
    const fd = fs.openSync(file.path, 'r');
    fs.readSync(fd, headBuf, 0, 512, 0);
    fs.closeSync(fd);
    if (!verifyContent(headBuf, file.mimetype)) {
      cleanup();
      return res.status(400).json({ error: 'File content does not match declared type.' });
    }

    // SHA-256 for chain-of-custody
    const sha256    = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
    const rawLabel  = req.body.label || file.originalname;
    const safeLabel = path.basename(rawLabel).replace(/[<>:"\\|?*\x00-\x1F]/g, '_').slice(0, 200);
    const itemId    = req.body.agenda_item_id || null;

    const result = await query(
      `INSERT INTO meeting_attachments
         (meeting_id, attached_to_agenda_item_id, file_path, label, mime_type,
          size_bytes, sha256, scan_status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'skipped', $8)
       RETURNING id, label, mime_type, size_bytes, sha256, scan_status, uploaded_at,
                 attached_to_agenda_item_id`,
      [meetingId, itemId, file.path, safeLabel, file.mimetype, file.size, sha256, userId]
    );

    res.status(201).json({ attachment: result.rows[0] });
  } catch (err) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    next(err);
  }
}

// ── GET /meetings/:id/attachments ─────────────────────────────────────────────

async function listAttachments(req, res, next) {
  try {
    const { id: meetingId } = req.params;
    const { item_id }       = req.query;

    const params = [meetingId];
    let clause   = '';
    if (item_id) {
      params.push(item_id);
      clause = `AND ma.attached_to_agenda_item_id = $${params.length}`;
    }

    const result = await query(`
      SELECT ma.id, ma.label, ma.mime_type, ma.size_bytes, ma.sha256,
             ma.scan_status, ma.uploaded_at, ma.attached_to_agenda_item_id,
             ma.uploaded_by,
             u.full_name AS uploaded_by_name
      FROM meeting_attachments ma
      LEFT JOIN users u ON u.id = ma.uploaded_by
      WHERE ma.meeting_id = $1 ${clause}
      ORDER BY ma.uploaded_at ASC
    `, params);

    res.json({ attachments: result.rows });
  } catch (err) { next(err); }
}

// ── GET /meetings/:id/attachments/:aid/download ───────────────────────────────

async function downloadAttachment(req, res, next) {
  try {
    const { id: meetingId, aid } = req.params;
    const { id: userId, role }   = req.user;

    const attRes = await query(
      `SELECT file_path, label, mime_type FROM meeting_attachments WHERE id = $1 AND meeting_id = $2`,
      [aid, meetingId]
    );
    if (!attRes.rows.length) return res.status(404).json({ error: 'Attachment not found.' });

    const isPrivileged = ['meeting_secretary', 'ciso', 'siro', 'admin', 'risk_analyst'].includes(role);
    if (!isPrivileged) {
      const aRes = await query(
        `SELECT id FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`,
        [meetingId, userId]
      );
      if (!aRes.rows.length) return res.status(403).json({ error: 'Access denied.' });
    }

    const { file_path, label, mime_type } = attRes.rows[0];
    if (!fs.existsSync(file_path)) return res.status(404).json({ error: 'File not found on disk.' });

    res.set('Content-Type', mime_type);
    res.download(file_path, label);
  } catch (err) { next(err); }
}

// ── DELETE /meetings/:id/attachments/:aid ─────────────────────────────────────

async function deleteAttachment(req, res, next) {
  try {
    const { id: meetingId, aid } = req.params;
    const { id: userId, role }   = req.user;

    const attRes = await query(
      `SELECT id, file_path, uploaded_by FROM meeting_attachments WHERE id = $1 AND meeting_id = $2`,
      [aid, meetingId]
    );
    if (!attRes.rows.length) return res.status(404).json({ error: 'Attachment not found.' });

    const att = attRes.rows[0];

    const mRes = await query(
      `SELECT minutes_issued_at FROM working_group_meetings WHERE id = $1`, [meetingId]
    );
    if (mRes.rows[0]?.minutes_issued_at) {
      return res.status(409).json({ error: 'Cannot delete attachments after minutes have been issued.' });
    }

    const isSecretary = role === 'meeting_secretary';
    if (!isSecretary && att.uploaded_by !== userId) {
      return res.status(403).json({ error: 'Only the uploader or meeting secretary can delete attachments.' });
    }

    await query(`DELETE FROM meeting_attachments WHERE id = $1`, [aid]);
    try { fs.unlinkSync(att.file_path); } catch (_) {}

    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = {
  uploadMiddleware: upload.single('file'),
  uploadAttachment,
  listAttachments,
  downloadAttachment,
  deleteAttachment,
};
