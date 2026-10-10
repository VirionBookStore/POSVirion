/**
 * Static contract checks for the staged multi-branch candidate.
 * These checks do NOT simulate Apps Script, authorize deployment, or test spreadsheet effects.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');

const source = fs.readFileSync('backend/Code_POS_MultiCabang_Candidate.js', 'utf8');

function hasFunction(name) {
  assert.match(source, new RegExp('function\\s+' + name + '\\s*\\('), 'Missing function: ' + name);
}

assert.match(source, /id:\s*'PV001',\s*name:\s*'Pam MIM'/, 'PV001 branch definition missing');
assert.match(source, /id:\s*'TV002',\s*name:\s*'Toko Miko'/, 'TV002 branch definition missing');
assert.match(source, /id:\s*'PV002',\s*name:\s*'Pam Miko'/, 'PV002 branch definition missing');
assert.match(source, /MIGRASI_STOK_LAMA_KE_TV002/, 'Explicit migration confirmation missing');

[
  'mcResolveActor_', 'mcAssertBranch_', 'mcPreviewLegacyStockMigration',
  'mcBackupSheets_', 'mcRunLegacyStockMigration', 'mcApplyStockDelta_',
  'mcCreateTransfer', 'mcSendTransfer', 'mcReceiveTransfer',
  'mcIssueSession_', 'mcVerifySession_', 'mcRequireSessionBranch_',
  'mcGetStockCabangSecure_', 'mcAdjustStockSecure_',
  'mcCreateTransferSecure_', 'mcSendTransferSecure_',
  'mcReceiveTransferSecure_', 'mcCandidateSecureDispatch'
].forEach(hasFunction);

assert.match(source, /function mcCandidateSecureDispatch\s*\(functionName, args, sessionToken\)/,
  'Secure dispatcher must accept a session token separately from user arguments');
assert.match(source, /function mcVerifySession_\s*\(token\)/,
  'Session verification entry point missing');
assert.match(source, /function mcRunLegacyStockMigration\s*\(confirmation\)/,
  'Migration must require an explicit confirmation argument');

console.log('PASS: staged multi-branch static contract checks');
console.log('LIMIT: no Apps Script runtime, spreadsheet, endpoint, or production behavior was exercised');
