// Run only with disposable accounts prepared by scripts/test-key-migration.sh.
// Playwright remains an optional external test dependency, outside the app bundle.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const id=process.env.KEY_MIGRATION_RUN_ID, base=process.env.MIGRATION_TEST_BASE, origin=new URL(base).origin;
if (!id || !base) throw new Error('Disposable fixture run-id and API base required.');
const phrase=`fixture-key-passphrase-${id}`;
let stage='launch', browser, page, leaked=false;
const req=async(path,token,method='GET',body)=>{const r=await fetch(new URL(path,base),{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok);return r.json();};
try {
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true});
 context.setDefaultTimeout(12000);page=await context.newPage();
 page.on('request',r=>{if(r.url().includes('/api/')&&!r.url().includes('/auth/')){const b=r.postData()||'';if([phrase,`fixture-vault-secret-${id}`,'privJwk','privateKey'].some(s=>b.includes(s)))leaked=true;}});
 stage='fixture-browser'; await page.goto(origin+'/login');
 const fixture=await page.evaluate(async({phrase,id})=>{
  const c=await import('/src/utils/crypto.js');const pair=await c.generateExportablePair();c.setKeyPair(pair.privateKey,pair.publicKey);
  const ciphertext=await c.encryptPayload({login:'fixture',password:`fixture-vault-secret-${id}`,notes:'fixture'});
  const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x)));
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(phrase),'PBKDF2',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:200000},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const v1={format:'zk-keybundle-v1',kdf:{name:'PBKDF2',hash:'SHA-256',iterations:200000,salt:b64(salt)},enc:{name:'AES-GCM',iv:b64(iv)},pub:b64(await crypto.subtle.exportKey('spki',pair.publicKey)),createdAt:new Date().toISOString(),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,await crypto.subtle.exportKey('pkcs8',pair.privateKey)))};
  await new Promise((resolve,reject)=>{const open=indexedDB.open('gestionnaire-mdp-crypto',1);open.onupgradeneeded=()=>open.result.createObjectStore('keyring',{keyPath:'id'});open.onerror=()=>reject(new Error('fixture IDB'));open.onsuccess=()=>{const db=open.result;const tx=db.transaction('keyring','readwrite');tx.objectStore('keyring').put({id:'active',privateKey:pair.privateKey,publicKey:pair.publicKey});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(new Error('fixture IDB'));};});
  c.setKeyPair(null,null);return {ciphertext,v1};
 },{phrase,id});
 const jwt=await req('auth/jwt/create/',null,'POST',{username:`key-migration-${id}-a`,password:`fixture-login-${id}`});
 await req('passwords/',jwt.access,'POST',{title:'UI migration fixture',ciphertext:fixture.ciphertext});const original=await req('passwords/',jwt.access);
 stage='login';await page.locator('input[autocomplete=username]').fill(`key-migration-${id}-a`);await page.locator('input[autocomplete=current-password]').fill(`fixture-login-${id}`);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByText('Migration initiale :',{exact:false}).waitFor();
 const password=page.getByLabel('Mot de passe de la clé de chiffrement',{exact:true});
 stage='wrong-pass';await page.locator('input[type=file]').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.v1))});await password.fill('incorrect-fixture-password');await page.getByRole('button',{name:'Vérifier et préparer la migration',exact:true}).click();await page.getByRole('alert').waitFor();
 stage='prepare';await password.fill(phrase);await page.getByRole('button',{name:'Vérifier et préparer la migration',exact:true}).click();await page.getByText('Clé vérifiée localement.',{exact:false}).waitFor();
 const download=async()=>{const event=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger la sauvegarde chiffrée',exact:true}).click();const d=await event;return fs.readFile(await d.path());};
 const backup=await download();assert.equal(JSON.parse(backup).pub,fixture.v1.pub);await page.getByLabel('J’ai conservé cette sauvegarde',{exact:false}).check();
 let written=false,interrupted=false;await page.route('**/api/key-envelope/',async route=>{const method=route.request().method();if(method==='PUT')written=true;if(method==='GET'&&written&&!interrupted){interrupted=true;await route.abort();}else await route.continue();});
 stage='interruption';await page.getByRole('button',{name:'Enregistrer et vérifier la récupération',exact:true}).click();await page.getByRole('alert').waitFor();assert.ok(interrupted);
 const legacy=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('gestionnaire-mdp-crypto');o.onerror=()=>reject(new Error('IDB'));o.onsuccess=()=>{const db=o.result;const r=db.transaction('keyring').objectStore('keyring').get('active');r.onsuccess=()=>{db.close();resolve(!!r.result?.privateKey);};};}));assert.ok(await legacy());
 stage='resume';await page.unroute('**/api/key-envelope/');await page.reload();await page.getByRole('button',{name:'Déverrouiller',exact:true}).waitFor();assert.equal(await password.inputValue(),'');await password.fill(phrase);await page.getByRole('button',{name:'Déverrouiller',exact:true}).click();await page.getByText('UI migration fixture',{exact:true}).waitFor();assert.ok(await legacy());
 stage='finalize-lock';await page.getByRole('button',{name:'Verrouiller',exact:true}).click();await page.getByRole('button',{name:'Déverrouiller',exact:true}).waitFor();stage='finalize-select';await page.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});stage='finalize-prepare';await password.fill(phrase);await page.getByRole('button',{name:'Vérifier et préparer la migration',exact:true}).click();await page.getByText('Clé vérifiée localement.',{exact:false}).waitFor();stage='finalize-download';await download();await page.getByLabel('J’ai conservé cette sauvegarde',{exact:false}).check();stage='finalize-submit';await page.getByRole('button',{name:'Enregistrer et vérifier la récupération',exact:true}).click();stage='finalize-unlock';await page.getByText('UI migration fixture',{exact:true}).waitFor();assert.equal(await legacy(),false);
 stage='reopen';await page.reload();await page.getByRole('button',{name:'Déverrouiller',exact:true}).waitFor();assert.equal(await password.inputValue(),'');assert.equal(await page.locator('input[type=file]').inputValue(),'');await password.fill(phrase);await page.getByRole('button',{name:'Déverrouiller',exact:true}).click();await page.getByText('UI migration fixture',{exact:true}).waitFor();assert.deepEqual(await req('passwords/',jwt.access),original);assert.equal(leaked,false);
 const storageClean=await page.evaluate(({phrase,id})=>{const s=JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]);return ![phrase,`fixture-vault-secret-${id}`,'privJwk','privateKey'].some(v=>s.includes(v));},{phrase,id});assert.ok(storageClean);
 console.log('PASS UI Chromium : import v1, erreur de mot de passe, sauvegarde, interruption, reprise, nettoyage tardif IndexedDB, réouverture sans fichier, entrées inchangées, requêtes/stockages sans secrets.');
 console.log('Chromium '+browser.version());
} catch(e) {console.error('FAIL UI stage: '+stage+'; '+e.name);process.exitCode=1;} finally {await browser?.close();}
