// ============================================
// 👑 EDUPORTAL PREMIUM SYSTEM v2 (Professional)
// ============================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SITE = 'https://alicomputer76w.github.io/Matric-Notes';
const PRICE = 500;
const OLD_PRICE = 1000;

const firebaseConfig = {
  apiKey: "AIzaSyD4OjgT03bWh3oGwZ4TpLt5ndnJl2B2YWs",
  authDomain: "general-59069.firebaseapp.com",
  projectId: "general-59069",
  storageBucket: "general-59069.firebasestorage.app",
  messagingSenderId: "1025337426123",
  appId: "1:1025337426123:web:6d5d7ebfa26e64c0ae5b4e"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let selectedMethod = 'Easypaisa';

const ACCOUNTS = {
  'Easypaisa':    { number: '0345-9572281',   title: 'Sadaqat Ali', icon: '📱' },
  'JazzCash':     { number: '0308-1517640',   title: 'Sadaqat Ali', icon: '📲' },
  'Bank Alfalah': { number: '56135002206096', title: 'Sadaqat Ali', extra: 'IBAN: PK43ALFH5613005002206096', icon: '🏦' }
};

// ---------- Professional Styles ----------
const style = document.createElement('style');
style.textContent = `
.ep-hidden{display:none!important}
#epOverlay{position:fixed;inset:0;background:rgba(10,10,25,.7);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:15px}
#epModal{background:#fff;border-radius:20px;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;position:relative;box-shadow:0 25px 60px rgba(0,0,0,.35);font-family:'Poppins',sans-serif}
#epModal *{box-sizing:border-box;font-family:'Poppins',sans-serif}
.ep-close{position:absolute;top:12px;right:14px;background:rgba(255,255,255,.15);border:none;width:34px;height:34px;border-radius:50%;font-size:1.3rem;cursor:pointer;color:#fff;z-index:2}
.ep-hero{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;padding:30px 20px 24px;text-align:center;position:relative;overflow:hidden}
.ep-hero:before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(245,158,11,.15) 0%,transparent 60%)}
.ep-crown{font-size:2.6rem;filter:drop-shadow(0 0 12px rgba(245,158,11,.8))}
.ep-hero h2{margin:8px 0 2px;font-size:1.35rem;letter-spacing:2px;font-weight:700}
.ep-hero h2 span{color:#f59e0b}
.ep-hero p{margin:0;font-size:.8rem;opacity:.8;letter-spacing:1px}
.ep-price-line{margin-top:14px;display:flex;align-items:center;justify-content:center;gap:10px}
.ep-old{text-decoration:line-through;opacity:.5;font-size:.9rem}
.ep-price{font-size:2rem;font-weight:800;color:#f59e0b}
.ep-badge{background:linear-gradient(135deg,#f59e0b,#d97706);color:#1a1a2e;font-size:.62rem;font-weight:800;padding:4px 10px;border-radius:50px;letter-spacing:1px}
.ep-body{padding:22px}
.ep-label{font-size:.72rem;font-weight:700;color:#2b2d42;letter-spacing:.5px;margin:16px 0 8px;text-transform:uppercase}
.ep-features{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ep-feat{background:#f8f9fa;border:1px solid #eee;border-radius:10px;padding:10px;font-size:.73rem;font-weight:600;color:#444;display:flex;gap:8px;align-items:center}
.ep-feat span{font-size:1rem}
.ep-tabs{display:flex;background:#f0f2f5;border-radius:10px;padding:4px;gap:4px}
.ep-tab{flex:1;padding:9px 4px;border:none;background:transparent;border-radius:8px;font-weight:600;font-size:.75rem;cursor:pointer;color:#777;transition:.2s}
.ep-tab.active{background:#fff;color:#0f3460;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.ep-account{border:2px dashed #e5c76b;border-radius:12px;padding:16px;text-align:center;margin-top:10px;background:#fffdf5}
.ep-acc-head{font-size:.8rem;font-weight:700;color:#555}
.ep-account .num{font-size:1.5rem;font-weight:800;color:#1a1a2e;letter-spacing:2px;margin:6px 0 2px}
.ep-account .ttl{font-size:.75rem;color:#777}
.ep-account .ext{font-size:.65rem;color:#999;word-break:break-all;margin-top:2px}
.ep-copy{background:#1a1a2e;color:#f59e0b;border:none;padding:8px 20px;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;margin-top:10px;transition:.2s}
.ep-copy:hover{transform:translateY(-1px)}
.ep-body input{width:100%;padding:12px 14px;border:2px solid #e8e8e8;border-radius:10px;margin-bottom:10px;font-size:.88rem;background:#fafafa}
.ep-body input:focus{outline:none;border-color:#f59e0b;background:#fff}
.ep-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ep-submit{width:100%;padding:14px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#1a1a2e;border:none;border-radius:12px;font-size:1rem;font-weight:800;cursor:pointer;letter-spacing:.5px;box-shadow:0 6px 18px rgba(245,158,11,.4);transition:.2s}
.ep-submit:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(245,158,11,.5)}
.ep-trust{display:flex;justify-content:center;gap:18px;margin-top:14px;font-size:.7rem;color:#888;font-weight:600}
.ep-msg{padding:10px;border-radius:8px;font-size:.82rem;margin-bottom:10px;display:none}
.ep-msg.err{background:#fee2e2;color:#991b1b;display:block}
.ep-msg.ok{background:#d1fae5;color:#065f46;display:block}
.ep-center{text-align:center;padding:20px 5px}
.ep-center .big{font-size:3.2rem}
.ep-center h3{margin:12px 0 6px;color:#1a1a2e;font-size:1.15rem}
.ep-center p{font-size:.85rem;color:#666;line-height:1.8}
.ep-login-btn{display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#1a1a2e;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:12px}
.ep-premium-badge{background:linear-gradient(135deg,#f59e0b,#d97706)!important;color:#1a1a2e!important}
#epToast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#f59e0b;padding:12px 25px;border-radius:50px;font-size:.85rem;z-index:10000;display:none;font-family:'Poppins',sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.3)}
@media(max-width:480px){.ep-features{grid-template-columns:1fr}.ep-row{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

// ---------- Modal ----------
document.body.insertAdjacentHTML('beforeend', `
<div id="epOverlay" class="ep-hidden">
  <div id="epModal">
    <button class="ep-close" id="epClose">&times;</button>
    <div class="ep-hero">
      <div class="ep-crown">👑</div>
      <h2>EDUPORTAL <span>PREMIUM</span></h2>
      <p>Unlock Everything. Forever.</p>
      <div class="ep-price-line">
        <span class="ep-old">Rs. ${OLD_PRICE}</span>
        <span class="ep-price">Rs. ${PRICE}</span>
        <span class="ep-badge">LIFETIME</span>
      </div>
    </div>
    <div class="ep-body" id="epBody"></div>
  </div>
</div>
<div id="epToast"></div>
`);

const overlay = document.getElementById('epOverlay');
const epBody = document.getElementById('epBody');

function toast(msg) {
  const t = document.getElementById('epToast');
  t.innerText = msg; t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}
function openModal() { overlay.classList.remove('ep-hidden'); renderState(); }
function closeModal() { overlay.classList.add('ep-hidden'); }

// ---------- States ----------
async function renderState() {
  if (!currentUser) return renderLogin();
  if (currentUser.isPremium) return renderPremium();
  try {
    const q = query(collection(db, 'premiumOrders'),
      where('userId', '==', currentUser.uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    if (!snap.empty) return renderPending();
  } catch (e) { console.error(e); }
  renderPayment();
}

function renderLogin() {
  epBody.innerHTML = `
    <div class="ep-center">
      <div class="big">🔐</div>
      <h3>Login Required</h3>
      <p>Premium activate karne ke liye pehle apne<br>EduPortal account mein login karein.</p>
      <a class="ep-login-btn" href="${SITE}/index.html">Login / Signup Karein</a>
    </div>`;
}

function renderPremium() {
  epBody.innerHTML = `
    <div class="ep-center">
      <div class="big">👑</div>
      <h3>You Are Premium!</h3>
      <p>Aapko poore EduPortal ka premium content<br>lifetime ke liye available hai. Parhte rahein! 📚</p>
    </div>`;
}

function renderPending() {
  epBody.innerHTML = `
    <div class="ep-center">
      <div class="big">⏳</div>
      <h3>Order Under Review</h3>
      <p>Aapki payment submit ho chuki hai.<br>Admin 24 hours ke andar approve karega.<br>Confirmation email + WhatsApp par milegi. ✅</p>
    </div>`;
}

function renderPayment() {
  const acc = ACCOUNTS[selectedMethod];
  epBody.innerHTML = `
    <div class="ep-features">
      <div class="ep-feat"><span>🧪</span> Premium Tests & Model Papers</div>
      <div class="ep-feat"><span>📝</span> Past Papers & Guess Papers</div>
      <div class="ep-feat"><span>📚</span> Chapter-wise Notes</div>
      <div class="ep-feat"><span>💬</span> Priority Support</div>
    </div>

    <div class="ep-label">Step 1 — Payment Method</div>
    <div class="ep-tabs">
      ${Object.keys(ACCOUNTS).map(m => `<button class="ep-tab ${m === selectedMethod ? 'active' : ''}" data-method="${m}">${ACCOUNTS[m].icon} ${m}</button>`).join('')}
    </div>
    <div class="ep-account">
      <div class="ep-acc-head">${acc.icon} ${selectedMethod} — ${acc.title}</div>
      <div class="num">${acc.number}</div>
      ${acc.extra ? `<div class="ext">${acc.extra}</div>` : ''}
      <button class="ep-copy" id="epCopy">📋 Copy Number</button>
    </div>

    <div class="ep-label">Step 2 — Rs. ${PRICE} Bhej Kar TID Submit Karein</div>
    <div class="ep-msg" id="epMsg"></div>
    <form id="epForm">
      <input id="epTID" placeholder="Transaction ID (TID)" required>
      <div class="ep-row">
        <input id="epSender" placeholder="Sender Number" required>
        <input id="epWhatsapp" placeholder="Aapka WhatsApp Number" required>
      </div>
      <button type="submit" class="ep-submit">👑 ACTIVATE MY PREMIUM</button>
    </form>
    <div class="ep-trust">
      <span>🔒 Secure</span><span>⚡ 24h Activation</span><span>♾️ Lifetime Access</span>
    </div>`;
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  if (e.target.id === 'epClose' || e.target === overlay) return closeModal();
  if (e.target.id === 'epCopy') {
    navigator.clipboard.writeText(ACCOUNTS[selectedMethod].number);
    toast('📋 Number copy ho gaya!');
  }
  const tab = e.target.closest('.ep-tab');
  if (tab) { selectedMethod = tab.dataset.method; renderPayment(); }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'epForm') return;
  e.preventDefault();
  const tid = document.getElementById('epTID').value.trim();
  const sender = document.getElementById('epSender').value.trim();
  const whatsapp = document.getElementById('epWhatsapp').value.trim();
  const msg = document.getElementById('epMsg');

  if (tid.length < 6) { msg.className = 'ep-msg err'; msg.innerText = '❌ Sahi Transaction ID likhein'; return; }

  try {
    await addDoc(collection(db, 'premiumOrders'), {
      userId: currentUser.uid,
      email: currentUser.email,
      name: currentUser.name || 'Student',
      whatsapp, senderNumber: sender,
      paymentMethod: selectedMethod,
      transactionId: tid,
      amount: PRICE,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    renderPending();
    toast('✅ Order submit ho gaya!');
  } catch (err) {
    msg.className = 'ep-msg err'; msg.innerText = '❌ Error: ' + err.message;
  }
});

// ---------- Premium button interception ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('a, button');
  if (!el) return;
  const isPremiumTrigger = el.classList.contains('btn-premium') ||
    el.hasAttribute('data-premium') ||
    el.querySelector('.premium-tag, .premium-badge-sm');
  if (!isPremiumTrigger) return;

  e.preventDefault();
  if (currentUser && currentUser.isPremium) {
    const href = el.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('#')) window.location.href = href;
    else toast('👑 Aap Premium hain — content jald available hoga!');
    return;
  }
  openModal();
});

// ---------- Auth state ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      currentUser = {
        uid: user.uid,
        email: user.email,
        name: snap.exists() ? snap.data().name : 'Student',
        isPremium: snap.exists() ? !!snap.data().isPremium : false
      };
    } catch (e) {
      currentUser = { uid: user.uid, email: user.email, name: 'Student', isPremium: false };
    }
  } else {
    currentUser = null;
  }
  document.querySelectorAll('.btn-premium').forEach(b => {
    if (currentUser && currentUser.isPremium) {
      b.innerHTML = '<i class="fas fa-crown"></i> Premium';
      b.classList.add('ep-premium-badge');
    }
  });
});

console.log('👑 EduPortal Premium System v2 loaded');