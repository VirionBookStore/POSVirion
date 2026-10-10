/**
 * POS Virion — kandidat migrasi multi-cabang Google Apps Script.
 * STAGING ONLY: jangan deploy atau hubungkan ke doGet/doPost sebelum audit/test.
 * Migrasi lama ke TV002 tidak mengubah kolom stok sumber pada sheet Barang.
 */
var MC_BRANCHES = [
  {id:'PV001', name:'Pam MIM'},
  {id:'TV002', name:'Toko Miko'},
  {id:'PV002', name:'Pam Miko'}
];
var MC_MIGRATION_CONFIRM = 'MIGRASI_STOK_LAMA_KE_TV002';

function mcSheet_(name, headers) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
  } else {
    var h=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(function(x){return String(x||'').trim().toLowerCase();});
    headers.forEach(function(x){if(h.indexOf(x.toLowerCase())<0){h.push(x.toLowerCase());sh.getRange(1,h.length).setValue(x).setFontWeight('bold');}});
  }
  return sh;
}
function mcHeaders_(sh) {
  var o={}; sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].forEach(function(x,i){o[String(x||'').trim().toLowerCase()]=i;}); return o;
}
function mcEnsureSchema_() {
  mcSheet_('Stok_Cabang',['id_cabang','id_barang','stok','updated_at','updated_by']);
  mcSheet_('Mutasi_Stok_Cabang',['id_event','tanggal','id_cabang','id_barang','delta','stok_sebelum','stok_sesudah','jenis','referensi','aktor_email','status']);
  mcSheet_('Transfer_Cabang',['id_transfer','tanggal_buat','cabang_asal','cabang_tujuan','status','items_json','dibuat_oleh','dikirim_pada','diterima_pada','diterima_oleh','catatan']);
  mcSheet_('Migrasi_Cabang_Log',['id_migrasi','waktu','jenis','status','jumlah_produk','total_stok_lama','total_stok_tv002','catatan']);
  return {ok:true};
}
function mcResolveActor_(email) {
  var e=String(email||'').trim().toLowerCase(); if(!e) throw Error('Email aktor wajib diisi.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), u=ss.getSheetByName('User'), c=ss.getSheetByName('Cabang');
  if(!u||u.getLastRow()<2) throw Error('Data User belum tersedia.');
  var h=mcHeaders_(u); if(h.email===undefined||h.role===undefined||h.id_cabang===undefined) throw Error('Header User tidak lengkap.');
  var rows=u.getRange(2,1,u.getLastRow()-1,u.getLastColumn()).getValues();
  var m=rows.filter(function(r){return String(r[h.email]||'').trim().toLowerCase()===e;});
  if(m.length!==1) throw Error('Pengguna tidak ditemukan atau email duplikat; akses ditolak.');
  var role=String(m[0][h.role]||'').trim().toUpperCase(), branch=String(m[0][h.id_cabang]||'').trim().toUpperCase();
  if(role!=='OWNER'&&!branch) throw Error('Akun non-OWNER tanpa id_cabang ditolak.');
  var known={};
  if(c&&c.getLastRow()>1){var ch=mcHeaders_(c);c.getRange(2,1,c.getLastRow()-1,c.getLastColumn()).getValues().forEach(function(r){known[String(r[ch.id_cabang]||'').trim().toUpperCase()]=String(r[ch.status]||'Aktif').trim().toLowerCase();});}
  if(role!=='OWNER'&&(!known[branch]||known[branch]!=='aktif')) throw Error('Cabang tidak valid/tidak aktif.');
  return {email:e,role:role,id_cabang:branch,allBranches:role==='OWNER'&&!branch};
}
function mcAssertBranch_(actor, branchId) {
  var id=String(branchId||'').trim().toUpperCase();
  if(!MC_BRANCHES.some(function(b){return b.id===id;})) throw Error('Cabang tidak dikenal: '+id);
  if(!actor.allBranches&&actor.id_cabang!==id) throw Error('Akses cabang ditolak: '+id);
  return id;
}
function mcPreviewLegacyStockMigration() {
  mcEnsureSchema_();
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName('Barang');
  if(!sh||sh.getLastRow()<1) throw Error('Sheet Barang belum ada.');
  var h=mcHeaders_(sh); if(h.id_barang===undefined||h.stok===undefined) throw Error('Header Barang harus memiliki id_barang dan stok.');
  var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[];
  var ids={}, dup=[], invalid=[], total=0, count=0;
  rows.forEach(function(r,i){var id=String(r[h.id_barang]||'').trim();if(!id)return;count++;if(ids[id])dup.push(id);ids[id]=true;var q=Number(r[h.stok]);if(!isFinite(q)||q<0)invalid.push({row:i+2,id_barang:id,value:String(r[h.stok])});else total+=q;});
  var st=ss.getSheetByName('Stok_Cabang'), n=st&&st.getLastRow()>1?st.getLastRow()-1:0, log=ss.getSheetByName('Migrasi_Cabang_Log'), done=false;
  if(log&&log.getLastRow()>1){var lh=mcHeaders_(log);done=log.getRange(2,1,log.getLastRow()-1,log.getLastColumn()).getValues().some(function(r){return r[lh.jenis]==='LEGACY_STOCK_TO_TV002'&&r[lh.status]==='SELESAI';});}
  return {status:dup.length||invalid.length?'PERLU_PERBAIKAN':done?'SUDAH_DIMIGRASI':n?'STOK_CABANG_SUDAH_BERISI':'SIAP_DITINJAU',cabang_tujuan:'TV002',jumlah_produk:count,total_stok_lama:total,jumlah_id_duplikat:dup.length,contoh_id_duplikat:dup.slice(0,20),jumlah_stok_tidak_valid:invalid.length,contoh_stok_tidak_valid:invalid.slice(0,20),baris_stok_cabang_saat_ini:n,migrasi_sebelumnya_selesai:done,catatan:'Preview tidak memindahkan atau mengurangi stok di Barang. Pembuatan header/tabel kosong adalah satu-satunya perubahan awal.'};
}
function mcBackupSheets_(names) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss'), out=[];
  names.forEach(function(name){var s=ss.getSheetByName(name);if(!s)return;var bn=('BK_'+stamp+'_'+name).substring(0,99);if(ss.getSheetByName(bn))throw Error('Backup sudah ada: '+bn);s.copyTo(ss).setName(bn);out.push({source:name,backup:bn,rows:s.getLastRow(),cols:s.getLastColumn()});});
  return out;
}
function mcRunLegacyStockMigration(confirmation) {
  if(String(confirmation||'')!==MC_MIGRATION_CONFIRM) throw Error('Dibatalkan. Frasa konfirmasi harus persis: '+MC_MIGRATION_CONFIRM);
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var p=mcPreviewLegacyStockMigration();
    if(p.status!=='SIAP_DITINJAU') throw Error('Migrasi ditolak; status preview='+p.status+'. Jangan lanjutkan sebelum rekonsiliasi.');
    var ss=SpreadsheetApp.getActiveSpreadsheet(), backups=mcBackupSheets_(['Barang','Penjualan','Detail_Penjualan','Stok_Masuk','Retur_Barang','User','Cabang']);
    var sh=ss.getSheetByName('Barang'), h=mcHeaders_(sh), rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[], writes=[];
    rows.forEach(function(r){var id=String(r[h.id_barang]||'').trim();if(!id)return;var q=Number(r[h.stok]);if(!isFinite(q)||q<0)throw Error('Stok tidak valid untuk '+id);writes.push(['TV002',id,q,new Date(),'MIGRASI_LEGACY']);});
    var stock=ss.getSheetByName('Stok_Cabang');if(writes.length)stock.getRange(stock.getLastRow()+1,1,writes.length,5).setValues(writes);
    var after=writes.reduce(function(a,r){return a+Number(r[2]);},0);
    if(writes.length!==p.jumlah_produk||after!==p.total_stok_lama)throw Error('Verifikasi gagal. Hentikan penggunaan cabang dan rekonsiliasi dengan backup.');
    ss.getSheetByName('Migrasi_Cabang_Log').appendRow(['MIG-'+Date.now(),new Date(),'LEGACY_STOCK_TO_TV002','SELESAI',writes.length,p.total_stok_lama,after,JSON.stringify({backups:backups})]);
    return {status:'success',jumlah_produk:writes.length,total_stok_lama:p.total_stok_lama,total_stok_tv002:after,backup:backups,peringatan:'Stok master tidak dihapus. Ini belum membuat operasi POS memakai Stok_Cabang; jangan gunakan/deploy sebelum seluruh fungsi baca/tulis terintegrasi dan diuji.'};
  } finally {lock.releaseLock();}
}
function mcCandidateSelfTest() {
  return {status:'STATIC_CHECK_ONLY',branches:MC_BRANCHES.map(function(b){return b.id;}),migration_confirmation_required:true,production_deployment:false};
}