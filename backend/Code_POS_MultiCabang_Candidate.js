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

/*
 * Fungsi stok/transfer berikut hanya kandidat staging.
 * Jangan masukkan ke allowlist API sebelum setiap request memakai token sesi
 * bertanda tangan server-side; email dari browser bukan bukti identitas.
 */
function mcFindStockRow_(sheet, branchId, itemId) {
  var h=mcHeaders_(sheet), last=sheet.getLastRow();
  if(last<2)return {row:0,headers:h};
  var rows=sheet.getRange(2,1,last-1,sheet.getLastColumn()).getValues(), found=0;
  for(var i=0;i<rows.length;i++){
    if(String(rows[i][h.id_cabang]||'').trim().toUpperCase()===branchId &&
       String(rows[i][h.id_barang]||'').trim()===itemId){
      if(found)throw Error('Duplikasi stok cabang untuk '+branchId+'/'+itemId);
      found=i+2;
    }
  }
  return {row:found,headers:h};
}
function mcApplyStockDeltaUnlocked_(branchId, itemId, delta, eventId, kind, reference, actorEmail) {
  var actor=mcResolveActor_(actorEmail), branch=mcAssertBranch_(actor,branchId);
  var id=String(itemId||'').trim(), ev=String(eventId||'').trim(), d=Number(delta);
  if(!id||!ev||!isFinite(d)||d===0)throw Error('ID barang, ID event, dan perubahan stok valid wajib diisi.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), stock=ss.getSheetByName('Stok_Cabang'), log=ss.getSheetByName('Mutasi_Stok_Cabang');
  var lh=mcHeaders_(log), existing=0, logRows=log.getLastRow()>1?log.getRange(2,1,log.getLastRow()-1,log.getLastColumn()).getValues():[];
  for(var i=0;i<logRows.length;i++)if(String(logRows[i][lh.id_event]||'')===ev){existing=i+2;break;}
  var sh=mcFindStockRow_(stock,branch,id), current=sh.row?Number(stock.getRange(sh.row,sh.headers.stok+1).getValue())||0:0;
  if(existing){
    var saved=log.getRange(existing,1,1,log.getLastColumn()).getValues()[0];
    var before=Number(saved[lh.stok_sebelum])||0, after=Number(saved[lh.stok_sesudah])||0, status=String(saved[lh.status]||'');
    if(status==='APPLIED')return {status:'success',duplicate:true,stok:after,event_id:ev};
    if(status!=='PENDING')throw Error('Event mutasi ada dengan status tidak dikenal: '+status);
    if(current===before){
      if(!sh.row){stock.appendRow([branch,id,after,new Date(),actor.email]);}
      else {stock.getRange(sh.row,sh.headers.stok+1).setValue(after);stock.getRange(sh.row,sh.headers.updated_at+1).setValue(new Date());stock.getRange(sh.row,sh.headers.updated_by+1).setValue(actor.email);}
    } else if(current!==after) throw Error('Pemulihan mutasi berhenti: stok sekarang berbeda dari nilai sebelum/sesudah yang tercatat.');
    log.getRange(existing,lh.status+1).setValue('APPLIED');
    return {status:'success',duplicate:true,recovered:true,stok:after,event_id:ev};
  }
  var next=current+d;
  if(next<0)throw Error('Stok cabang '+branch+' tidak cukup untuk barang '+id+'. Tersedia '+current+', dibutuhkan '+Math.abs(d)+'.');
  var logRow=new Array(log.getLastColumn()).fill('');
  logRow[lh.id_event]=ev;logRow[lh.tanggal]=new Date();logRow[lh.id_cabang]=branch;logRow[lh.id_barang]=id;
  logRow[lh.delta]=d;logRow[lh.stok_sebelum]=current;logRow[lh.stok_sesudah]=next;logRow[lh.jenis]=kind||'KOREKSI';
  logRow[lh.referensi]=reference||'';logRow[lh.aktor_email]=actor.email;logRow[lh.status]='PENDING';
  log.appendRow(logRow);
  if(!sh.row)stock.appendRow([branch,id,next,new Date(),actor.email]);
  else {stock.getRange(sh.row,sh.headers.stok+1).setValue(next);stock.getRange(sh.row,sh.headers.updated_at+1).setValue(new Date());stock.getRange(sh.row,sh.headers.updated_by+1).setValue(actor.email);}
  log.getRange(log.getLastRow(),lh.status+1).setValue('APPLIED');
  return {status:'success',duplicate:false,stok:next,event_id:ev};
}
function mcCreateTransfer(actorEmail, sourceBranch, destinationBranch, items, note) {
  var actor=mcResolveActor_(actorEmail), src=mcAssertBranch_(actor,sourceBranch), dst=String(destinationBranch||'').trim().toUpperCase();
  if(actor.role!=='OWNER'&&actor.role!=='ADMIN')throw Error('Hanya OWNER/ADMIN yang boleh membuat transfer.');
  if(!MC_BRANCHES.some(function(b){return b.id===dst;}))throw Error('Cabang tujuan tidak dikenal.');
  if(src===dst)throw Error('Cabang asal dan tujuan tidak boleh sama.');
  if(!Array.isArray(items)||!items.length)throw Error('Transfer harus berisi minimal satu barang.');
  var seenItems={};var clean=items.map(function(x){var id=String(x.id_barang||'').trim(),q=Number(x.qty);if(!id||!isFinite(q)||q<=0)throw Error('Setiap item transfer harus memiliki id_barang dan qty positif.');if(seenItems[id])throw Error('ID barang duplikat pada transfer: '+id+'. Gabungkan jumlah menjadi satu baris.');seenItems[id]=true;return {id_barang:id,qty:q};});
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName('Transfer_Cabang'), id='TRF-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  sh.appendRow([id,new Date(),src,dst,'DRAFT',JSON.stringify(clean),actor.email,'','','',String(note||'')]);
  return {status:'success',id_transfer:id,status_transfer:'DRAFT',items:clean,cabang_asal:src,cabang_tujuan:dst};
}
function mcTransferStep_(actorEmail, transferId, action) {
  var actor=mcResolveActor_(actorEmail), ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName('Transfer_Cabang');
  var h=mcHeaders_(sh), last=sh.getLastRow(), rowNo=0, row=[];
  if(last<2)throw Error('Transfer tidak ditemukan.');
  var data=sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  for(var i=0;i<data.length;i++)if(String(data[i][h.id_transfer]||'')===String(transferId||'')){rowNo=i+2;row=data[i];break;}
  if(!rowNo)throw Error('Transfer tidak ditemukan: '+transferId);
  var src=String(row[h.cabang_asal]||'').trim().toUpperCase(), dst=String(row[h.cabang_tujuan]||'').trim().toUpperCase(), status=String(row[h.status]||''), items;
  if(actor.role!=='OWNER'&&actor.role!=='ADMIN')throw Error('Hanya OWNER/ADMIN yang boleh memproses transfer.');
  mcAssertBranch_(actor,action==='TERIMA'?dst:src);
  try{items=JSON.parse(row[h.items_json]||'[]');}catch(e){throw Error('Daftar item transfer rusak.');}
  if(action==='KIRIM'){
    if(status==='SENT'||status==='RECEIVED')return {status:'success',duplicate:true,id_transfer:transferId,status_transfer:status};
    if(status!=='DRAFT'&&status!=='SENDING')throw Error('Transfer tidak dapat dikirim dari status '+status);
    sh.getRange(rowNo,h.status+1).setValue('SENDING');
    items.forEach(function(x){mcApplyStockDelta_(src,x.id_barang,-Number(x.qty),'TRFSEND:'+transferId+':'+x.id_barang,'TRANSFER_KELUAR',transferId,actor.email);});
    sh.getRange(rowNo,h.status+1).setValue('SENT');sh.getRange(rowNo,h.dikirim_pada+1).setValue(new Date());
  } else if(action==='TERIMA'){
    if(status==='RECEIVED')return {status:'success',duplicate:true,id_transfer:transferId,status_transfer:status};
    if(status!=='SENT'&&status!=='RECEIVING')throw Error('Transfer belum dikirim atau status tidak valid: '+status);
    sh.getRange(rowNo,h.status+1).setValue('RECEIVING');
    items.forEach(function(x){mcApplyStockDelta_(dst,x.id_barang,Number(x.qty),'TRFRECV:'+transferId+':'+x.id_barang,'TRANSFER_MASUK',transferId,actor.email);});
    sh.getRange(rowNo,h.status+1).setValue('RECEIVED');sh.getRange(rowNo,h.diterima_pada+1).setValue(new Date());sh.getRange(rowNo,h.diterima_oleh+1).setValue(actor.email);
  } else throw Error('Aksi transfer tidak dikenal.');
  return {status:'success',id_transfer:transferId,status_transfer:sh.getRange(rowNo,h.status+1).getValue()};
}
function mcSendTransfer(actorEmail, transferId) { return mcTransferStep_(actorEmail,transferId,'KIRIM'); }
function mcReceiveTransfer(actorEmail, transferId) { return mcTransferStep_(actorEmail,transferId,'TERIMA'); }

function mcApplyStockDelta_(branchId, itemId, delta, eventId, kind, reference, actorEmail) {
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try { return mcApplyStockDeltaUnlocked_(branchId,itemId,delta,eventId,kind,reference,actorEmail); }
  finally { lock.releaseLock(); }
}


/* ---------- Sesi bertanda tangan (kandidat; perlu dihubungkan ke login/bridge) ---------- */
var MC_SESSION_TTL_SECONDS = 8 * 60 * 60;
function mcEnsureSessionSecret_() {
  var props=PropertiesService.getScriptProperties(), key='MC_SESSION_HMAC_SECRET_V1', secret=props.getProperty(key);
  if(!secret) {
    secret=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid();
    props.setProperty(key,secret);
  }
  return secret;
}
function mcB64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function mcSignSessionPayload_(payloadText) {
  var sig=Utilities.computeHmacSha256Signature(payloadText,mcEnsureSessionSecret_());
  return mcB64Url_(sig);
}
function mcIssueSession_(user) {
  if(!user||!user.email)throw Error('Identitas pengguna hasil login tidak valid.');
  // Re-load role and branch from server-side User sheet; never sign client-supplied claims.
  var actor=mcResolveActor_(user.email), now=Math.floor(Date.now()/1000);
  var payload={v:1,sub:actor.email,role:actor.role,branch:actor.id_cabang,all:actor.allBranches,iat:now,exp:now+MC_SESSION_TTL_SECONDS,nonce:Utilities.getUuid()};
  var body=mcB64Url_(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  return body+'.'+mcSignSessionPayload_(body);
}
function mcVerifySession_(token) {
  var parts=String(token||'').split('.');
  if(parts.length!==2||!parts[0]||!parts[1])throw Error('Sesi tidak valid. Silakan login ulang.');
  var expected=mcSignSessionPayload_(parts[0]);
  // Constant-time-ish comparison avoids returning which part failed.
  var a=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,parts[1]);
  var b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,expected);
  if(a.length!==b.length)throw Error('Sesi tidak valid. Silakan login ulang.');
  var diff=0;for(var i=0;i<a.length;i++)diff|=(a[i]^b[i]);
  if(diff!==0)throw Error('Sesi tidak valid. Silakan login ulang.');
  var payload;
  try{payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));}catch(e){throw Error('Sesi tidak valid. Silakan login ulang.');}
  var now=Math.floor(Date.now()/1000);
  if(payload.v!==1||!payload.sub||!payload.exp||now>=Number(payload.exp)||Number(payload.iat)>now+60)throw Error('Sesi kedaluwarsa/tidak valid. Silakan login ulang.');
  // Revalidate user against current server-side role and branch assignment, so disabled/moved users lose access.
  var actor=mcResolveActor_(payload.sub);
  if(actor.role!==payload.role||actor.id_cabang!==payload.branch||actor.allBranches!==payload.all)throw Error('Hak akses pengguna berubah. Silakan login ulang.');
  return actor;
}
function mcLoginAndIssueSession_(email,password) {
  var result=prosesLogin(email,password);
  if(!result||result.status!=='success'||!result.user)throw Error((result&&result.message)||'Login gagal.');
  var token=mcIssueSession_(result.user);
  return {status:'success',user:result.user,session_token:token,expires_in:MC_SESSION_TTL_SECONDS};
}
function mcRequireSessionBranch_(token,branchId) {
  var actor=mcVerifySession_(token);
  mcAssertBranch_(actor,branchId);
  return actor;
}
function mcSessionSelfTest() {
  var secret=mcEnsureSessionSecret_();
  return {status:secret?'READY':'ERROR',ttl_seconds:MC_SESSION_TTL_SECONDS,secret_configured:true,warning:'Jangan tampilkan nilai rahasia; fungsi ini tidak mengembalikannya.'};
}


/* ---------- API cabang terproteksi untuk integrasi bertahap ---------- */
function mcGetStockCabangSecure_(token, branchId) {
  var actor=mcRequireSessionBranch_(token,branchId), branch=mcAssertBranch_(actor,branchId);
  var ss=SpreadsheetApp.getActiveSpreadsheet(), stock=ss.getSheetByName('Stok_Cabang'), barang=ss.getSheetByName('Barang');
  var sh=mcHeaders_(stock), bh=mcHeaders_(barang), map={}, result=[];
  if(barang.getLastRow()>1)barang.getRange(2,1,barang.getLastRow()-1,barang.getLastColumn()).getValues().forEach(function(r){var id=String(r[bh.id_barang]||'').trim();if(id)map[id]={id_barang:id,nama_barang:r[bh.nama_barang],gambar:r[bh.gambar],supplier:r[bh.supplier],harga_beli:r[bh.harga_beli],harga_jual:r[bh.harga_jual],lokasi_rak:r[bh.lokasi_rak],kategori:r[bh.kategori],status:r[bh.status]};});
  if(stock.getLastRow()>1)stock.getRange(2,1,stock.getLastRow()-1,stock.getLastColumn()).getValues().forEach(function(r){
    if(String(r[sh.id_cabang]||'').trim().toUpperCase()!==branch)return;
    var id=String(r[sh.id_barang]||'').trim();if(!map[id])return;
    result.push(Object.assign({},map[id],{id_cabang:branch,stok:Number(r[sh.stok])||0}));
  });
  return {id_cabang:branch,items:result,total:result.length};
}
function mcAdjustStockSecure_(token, branchId, itemId, delta, eventId, kind, reference) {
  var actor=mcRequireSessionBranch_(token,branchId);
  return mcApplyStockDelta_(branchId,itemId,delta,eventId,kind,reference,actor.email);
}
function mcCreateTransferSecure_(token, sourceBranch, destinationBranch, items, note) {
  var actor=mcVerifySession_(token);
  return mcCreateTransfer(actor.email,sourceBranch,destinationBranch,items,note);
}
function mcSendTransferSecure_(token, transferId) {
  var actor=mcVerifySession_(token);
  return mcTransferStep_(actor.email,transferId,'KIRIM');
}
function mcReceiveTransferSecure_(token, transferId) {
  var actor=mcVerifySession_(token);
  return mcTransferStep_(actor.email,transferId,'TERIMA');
}
function mcCandidateSecureDispatch(functionName, args, sessionToken) {
  args=Array.isArray(args)?args:[];
  var token=String(sessionToken||'');
  var handlers={
    mcGetStockCabang: function(){return mcGetStockCabangSecure_(token,args[0]);},
    mcAdjustStockCabang: function(){return mcAdjustStockSecure_(token,args[0],args[1],args[2],args[3],args[4],args[5]);},
    mcCreateTransfer: function(){return mcCreateTransferSecure_(token,args[0],args[1],args[2],args[3]);},
    mcSendTransfer: function(){return mcSendTransferSecure_(token,args[0]);},
    mcReceiveTransfer: function(){return mcReceiveTransferSecure_(token,args[0]);}
  };
  if(!handlers[functionName])throw Error('Fungsi kandidat tidak diizinkan: '+functionName);
  return handlers[functionName]();
}
