// Isolated browser contract test: every /api response is mocked, no real account.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/mdp-playwright/node_modules/playwright/index.mjs');
const origin = process.env.VAULT_TEST_ORIGIN || 'http://127.0.0.1:5174';
if (!/^http:\/\/(localhost|127\.0\.0\.1):5174$/.test(origin)) throw new Error('Development origin required');
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const keyPass = 'fictitious vault key passphrase';
const secret = 'fictitious vault plaintext';
const jwt = id => `header.${Buffer.from(JSON.stringify({user_id:id, exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')}.signature`;
const tokens = {access:jwt(1),refresh:jwt(1)};
let envelope, ciphertext;
let rejectSession = false;
let networkFailure = false;
let delayedVerification;
const requests = [];
await context.addInitScript(tokens => {
  if (location.origin === 'null') return;
  if (!localStorage.getItem('mdp.jwt')) {localStorage.setItem('mdp.jwt',JSON.stringify(tokens));localStorage.setItem('token',tokens.access);}
  window.testClockOffset=0;
  const wall=Date.now.bind(Date), mono=performance.now.bind(performance);
  Date.now=()=>wall()+window.testClockOffset;
  performance.now=()=>mono()+window.testClockOffset;
},tokens);
await context.route('**/api/**',async route=>{
  const request=route.request();requests.push({url:request.url(),body:request.postData()});
  const path=new URL(request.url()).pathname;
  if (networkFailure) return route.abort();
  if (path.endsWith('auth/jwt/verify/')) {
    if(delayedVerification) await delayedVerification;
    return route.fulfill({status:rejectSession?400:200,json:rejectSession?{detail:'fixture revoked'}:{}});
  }
  if(path.endsWith('whoami/')) return route.fulfill({json:{id:1,username:'fixture'}});
  if(path.endsWith('key-envelope/')) return route.fulfill({json:{envelope,revision:1}});
  if(path.endsWith('passwords/')) return route.fulfill({json:[{id:1,title:'Fixture entry',url:'',ciphertext}]});
  if(path.endsWith('categories/') || path.endsWith('secrets/')) return route.fulfill({json:[]});
  throw new Error('Unexpected fixture API path');
});
const page=await context.newPage();
const consoleMessages=[];page.on('console',message=>consoleMessages.push(message.text()));
const errors=[];page.on('pageerror', e=>errors.push(e.message));
try {
  await page.goto(origin+'/login');
  ({envelope,ciphertext}=await page.evaluate(async ({keyPass,secret})=>{
    const c=await import('/src/utils/crypto.js');
    const pair=await c.generateExportablePair();c.setKeyPair(pair.privateKey,pair.publicKey,false);
    const ciphertext=await c.encryptPayload({login:'fixture-login',password:secret,notes:'fixture-notes'});
    const envelope=await c.exportKeyBundle(keyPass);c.setKeyPair(null,null);
    return {envelope,ciphertext};
  },{keyPass,secret}));
  await page.goto(origin+'/vault');
  async function unlock(p=page) {
    await p.bringToFront();
    await p.getByRole('button',{name:'Récupérer l’enveloppe du compte',exact:true}).click();
    await p.getByRole('button',{name:'Déverrouiller',exact:true}).waitFor();
    await p.getByLabel('Mot de passe de la clé de chiffrement',{exact:true}).fill(keyPass);
    await p.getByRole('button',{name:'Déverrouiller',exact:true}).click();
    await p.getByRole('heading',{name:'Voûte',exact:true}).waitFor();
  }
  async function state(p=page) {return p.evaluate(async()=> (await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).isVaultUnlocked());}
  async function tick(ms,p=page) {await p.evaluate(ms=>{window.testClockOffset+=ms;},ms);}
  await unlock();
  const other=await context.newPage();await other.goto(origin+'/vault');
  assert.equal(await state(other),false,'new tab remains locked');
  // Background time never expires the in-memory unlock while auth remains valid.
  for(let i=0;i<3;i++) {
    await other.bringToFront();await tick(120000);await page.bringToFront();
    await page.evaluate(async()=>await (await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).resumeVault());
    assert.equal(await state(),true, JSON.stringify(await page.evaluate(()=>({wall:Date.now(),mono:performance.now(),visibility:document.visibilityState,dataset:{...document.documentElement.dataset}}))));
  }
  await page.getByRole('link',{name:'Catégories',exact:true}).click();
  await page.getByRole('link',{name:'Accueil Gestionnaire MDP'}).click();
  assert.equal(await state(),true,'React navigation preserves unlock');
  // Activity and elapsed time do not control locking.
  await tick(14*60000);await page.getByPlaceholder('ex: banque, perso, notes: VPN').fill('Fixture');
  await tick(120000);assert.equal(await state(),true,'trusted input renews');
  await unlock(other);await tick(14*60000);
  await other.getByRole('button',{name:'Rafraîchir',exact:true}).click();
  await tick(60000);assert.equal(await state(),true,'elapsed inactivity does not lock');
  assert.equal(await state(other),true,'tabs retain independent in-memory unlocks');
  await page.getByRole('button',{name:'Verrouiller',exact:true}).click();
  await other.waitForFunction(()=>document.documentElement.dataset.vaultLocked==='true');
  assert.equal(await state(other),false,'manual lock propagates');
  await unlock();
  await page.reload();assert.equal(await state(),false,'reload locks');await unlock();
  await page.goto('about:blank');await page.goBack();
  // A destroyed page starts locked; a browser-preserved BFCache page may retain
  // its in-memory unlock because lifecycle events no longer force a lock.
  if (!(await state())) await unlock();
  // Pending account validation must conceal cached content before any async reply.
  let finish;delayedVerification=new Promise(r=>{finish=r;});
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const resume=page.evaluate(async()=>await (await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).resumeVault());
  await page.waitForFunction(()=>document.documentElement.dataset.vaultSuspended==='true');
  assert.equal(await page.evaluate(async()=>{try{(await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).assertVaultAccess();return true;}catch{return false;}}),false);
  await page.evaluate(async()=>{(await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).lockVault();});finish();await resume;delayedVerification=null;
  assert.equal(await state(),false,'late validation cannot restore unlock');
  await unlock();rejectSession=true;await page.evaluate(async()=>await (await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).resumeVault());
  assert.equal(await state(),false,'revoked refresh detected');rejectSession=false;await page.reload();
  await unlock();networkFailure=true;await page.evaluate(async()=>await (await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/utils/vaultSession.js'))?.name || '/src/utils/vaultSession.js')).resumeVault());
  assert.equal(await state(),false,'network uncertainty locks');networkFailure=false;
  await unlock();await page.evaluate(()=>{document.dispatchEvent(new Event('freeze'));});await tick(16*60000);
  await page.evaluate(()=>document.dispatchEvent(new Event('resume')));assert.equal(await state(),true,'sleep alone does not lock');
  await page.getByRole('button',{name:'Révéler',exact:true}).click();
  await page.waitForFunction(secret=>document.querySelectorAll('.modal input')[1]?.value===secret,secret);
  await page.evaluate(()=>{
    window.fixtureCopies=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.fixtureCopies.push(text);}}});
  });
  await page.locator('.modal').getByRole('button',{name:'Copier',exact:true}).nth(1).click();
  assert.deepEqual(await page.evaluate(()=>window.fixtureCopies),[secret]);
  // Long inactivity alone does not disable an otherwise valid unlocked session.
  await page.evaluate(()=>{window.fixtureCopies=[];window.testClockOffset+=15*60000;document.querySelectorAll('.modal button')[2].click();});
  assert.deepEqual(await page.evaluate(()=>window.fixtureCopies),[secret]);
  assert.equal(await state(),true,'elapsed inactivity does not lock');
  await other.evaluate(jwt=>{localStorage.setItem('mdp.jwt',JSON.stringify({access:jwt,refresh:jwt}));},jwt(2));
  await page.getByRole('heading',{name:'Déverrouiller la voûte',exact:true}).waitFor();
  assert.equal(await state(),false,'account switch propagates');
  const stored=await page.evaluate(async()=>{
    const databases=[];
    for(const info of await indexedDB.databases()) {
      const db=await new Promise((resolve,reject)=>{const open=indexedDB.open(info.name);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
      const stores={};
      for(const name of db.objectStoreNames) stores[name]=await new Promise((resolve,reject)=>{const read=db.transaction(name).objectStore(name).getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);});
      db.close();databases.push({name:info.name,stores});
    }
    return {local:{...localStorage},session:{...sessionStorage},databases};
  });
  for(const text of [JSON.stringify(stored),JSON.stringify(requests),JSON.stringify(errors),JSON.stringify(consoleMessages)]) {
    assert(!text.includes(keyPass));assert(!text.includes(secret));assert(!text.includes('privateKey'));assert(!text.includes('privJwk'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: browser unlock lifecycle, trusted activity, React navigation, tab isolation/signals, reload/navigation, stale validation, revocation/network, simulated sleep and storage/request checks.');
} finally {await context.close();await browser.close();}
