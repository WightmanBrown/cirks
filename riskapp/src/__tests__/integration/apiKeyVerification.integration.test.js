'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The API-key hash comparison happens inside the database (v132, H-17 part 2).
//
// The app role holds EXECUTE on verify_api_key and no longer reads
// api_keys.key_hash. The rules — revoked, expired — are enforced by the function,
// so they hold for any caller, not just the one that remembers to check.

const { query } = require('./helpers');
const crypto = require('crypto');
const { createApiKey } = require('../../auth/apiKeys');

const verify = async (key) => (await query('SELECT * FROM verify_api_key($1)', [key])).rows;

const ADMIN = '11111111-0000-0000-0000-000000000001';
let key, record;

beforeAll(async () => {
  const made = await createApiKey({ label: 'VERIFY test key', createdBy: ADMIN });
  key = made.key; record = made.record;
});

afterAll(async () => { await query('DELETE FROM api_keys WHERE id = $1', [record.id]); });

describe('verify_api_key', () => {
  it('resolves a live key to its row, without the caller hashing anything', async () => {
    const rows = await verify(key);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: record.id, label: 'VERIFY test key', role: 'soc_integration' });
  });

  // The DB and the app must agree byte for byte, or every key stops working at
  // once. Asserted rather than assumed.
  it('hashes exactly as the application does', async () => {
    const { rows } = await query(`SELECT encode(digest($1, 'sha256'), 'hex') AS h`, [key]);
    expect(rows[0].h).toBe(crypto.createHash('sha256').update(key, 'utf8').digest('hex'));
  });

  it('gives nothing for a key that was never minted', async () => {
    expect(await verify('cirks_sk_not-a-real-key')).toEqual([]);
    expect(await verify('')).toEqual([]);
  });

  it('refuses a revoked key, in the database rather than in the caller', async () => {
    await query('UPDATE api_keys SET revoked_at = now() WHERE id = $1', [record.id]);
    expect(await verify(key)).toEqual([]);
    await query('UPDATE api_keys SET revoked_at = NULL WHERE id = $1', [record.id]);
  });

  it('refuses an expired key the same way', async () => {
    await query(`UPDATE api_keys SET expires_at = now() - interval '1 day' WHERE id = $1`, [record.id]);
    expect(await verify(key)).toEqual([]);
    await query('UPDATE api_keys SET expires_at = NULL WHERE id = $1', [record.id]);
  });

  it('is SECURITY DEFINER, which is what lets the privilege be withdrawn', async () => {
    const { rows } = await query(
      `SELECT prosecdef FROM pg_proc WHERE proname = 'verify_api_key'`);
    expect(rows[0].prosecdef).toBe(true);
  });
});
