// ============================================
// 👑 EDUPORTAL PREMIUM SYSTEM (Student Side)
// ============================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SITE = 'https://alicomputer76w.github.io/Matric-Notes';
const PRICE = 500;

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
  'Easypaisa':   { number: '0345-9572281',  title: 'Sadaqat Ali' },
  'JazzCash':    { number: '0308-1517640',  title: 'Sadaqat Ali' },
  'Bank Alfalah':{ number: '56135002206096', title: 'Sadaqat Ali', extra: 'IBAN: PK43ALFH5613005002206096' }
};

// ---------- Styles inject ----------
const style = document.createElement('style');
style.textContent = `
.ep-hidden{display:none!important}
#epOverlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:15px}
#epModal{background:#fff;border-radius:16px;max-width:480px;width:100%;max-height:92vh;overflow-y:auto;position:relative;font-family:'Poppins',sans-serif}
#epModal *{box-sizing:border-box;font-family:'Poppins',sans-serif}
.ep-close{position:absolute;top:10px;right:14px;background:none;border:none;font-size:1.6rem;cursor:pointer;color:#999;z-index:2}
.ep-header{background:linear-gradient(135deg,#f72585,#7209b7);color:#fff;padding:25px 20px;text-align:center;border-radius:16px 16px 0 0}
.ep-header .crown{font-size:2.2rem}
.ep-header h2{margin:5px 0 2px;font-size:1.4rem}
.ep-header p{margin:0;font-size:.85rem;opacity:.95}
.ep-body{padding:20px}
.ep-perks{background:#fff0f3;border-radius:10px;padding:12px 15px;font-size:.85rem;color:#9f1239;margin-bottom:15px;line-height:1.8}
.ep-tabs{display:flex;gap:6px;margin-bottom:12px}
.ep-tab{flex:1;padding:9px 5px;border:2px solid #eee;background:#fff;border-radius:8px;font-weight:600;font-size:.78rem;cursor:pointer;color:#666}
.ep-tab.active{border-color:#f72585;color:#f72585;background:#fff0f3}
.ep-account{background:#f8f9fa;border:2px dashed #ddd;border-radius:10px;padding:15px;text-align:center;margin-bottom:12px}
.ep-account .num{font-size:1.3rem;font-weight:700;color:#2b2d42;letter-spacing:1px;margin:4px 0}
.ep-account .ttl{font-size:.8rem;color:#666}
.ep-account .ext{font-size:.7rem;color:#888;word-break:break-all}
.ep-copy{background:#4361ee;color:#fff;border:none;padding:7px 18px;border-radius:50px;font-size:.78rem;font-weight:600;cursor:pointer;margin-top:8px}
.ep-steps{font-size:.8rem;color:#555;margin:0 0 15px 18px;line-height:1.9}
.ep-body input{width:100%;padding:11px;border:2px solid #e0e0e0;border-radius:8px;margin-bottom:10px;font-size:.9rem}
.ep-body input:focus{outline:none;border-color:#f72585}
.ep-submit{width:100%;padding:13px;background:linear-gradient(135deg,#f72585,#7209b7);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer}
.ep-msg{padding:10px;border-radius:8px;font-size:.85rem;margin-bottom:12px;display:none}
.ep-msg.err{background:#fee2e2;color:#991b1b;display:block}
.ep-msg.ok{background:#d1fae5;color:#065f46;display:block}
.ep-center{text-align:center;padding:15px 5px}
.ep-center .big{font-size:3rem}
.ep-center h3{margin:10px 0 5px;color:#2b2d42}
.ep-center p{font-size:.85rem;color:#666;line-height:1.7}
.ep-login-btn{display:inline-block;background:#4361ee;color:#fff;padding:11px 25px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:10px}
.ep-premium-badge{background:linear-gradient(135deg,#f72585,#7209b7)!important;color:#fff!important}
#epToast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);background:#2b2d42;color:#fff;padding:12px 25px;border-radius:50px;font-size:.85rem;z-index:10000;display:none;font-family:'Poppins',sans-serif}
`;
document.head.appendChild(style);

// ---------- Modal inject ----------
document.body.insertAdjacentHTML('beforeend', `
<div id="epOverlay" class="ep-hidden">
  <div id="epModal">
    <button class="ep-close" id="epClose">&times;</button>
    <div class="ep-header">
      <div class="crown">👑</div>
      <h2>EduPortal Premium</h2>
      <p>Lifetime Access — Sirf Rs. ${PRICE} (ek baar)</p>
    </div>
    <div class="ep-body" id="epBody"></div>
  </div>
</div>
<div id="epToast"></div>
`);

const overlay = document.getElementById('epOverlay');
const epBody = document.getElementById('epBody');

// ---------- Helpers ----------
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
  // pending order check
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
      <h3>Login Zaroori Hai</h3>
      <p>Premium khareedne ke liye pehle apne EduPortal account mein login karein.</p>
      <a class="ep-login-btn" href="${SITE}/index.html">Login / Signup Karein</a>
    </div>`;
}

function renderPremium() {
  epBody.innerHTML = `
    <div class="ep-center">
      <div class="big">👑</div>
      <h3>Aap Premium Member Hain!</h3>
      <p>Aapko poore site ka premium content access hai.<br>Khush rahein, parhte rahein! 📚</p>
    </div>`;
}

function renderPending() {
  epBody.innerHTML = `
    <div class="ep-center">
      <div class="big">⏳</div>
      <h3>Order Review Mein Hai</h3>
      <p>Aapki payment submit ho chuki hai.<br>Admin 24 hours ke andar approve karega.<br>Confirmation email + WhatsApp par milegi.</p>
    </div>`;
}

function renderPayment() {
  const acc = ACCOUNTS[selectedMethod];
  epBody.innerHTML = `
    <div class="ep-perks">
      👑 <strong>Premium mein shaamil:</strong><br>
      ✅ Tamam Premium Tests & Model Papers<br>
      ✅ Chapter-wise Notes<br>
      ✅ Past Papers & Guess Papers<br>
      ✅ Lifetime access — ek baar payment
    </div>
    <div class="ep-tabs">
      ${Object.keys(ACCOUNTS).map(m => `<button class="ep-tab ${m === selectedMethod ? 'active' : ''}" data-method="${m}">${m}</button>`).join('')}
    </div>
    <div class="ep-account">
      <div class="ttl">${selectedMethod} — Account Title: ${acc.title}</div>
      <div class="num">${acc.number}</div>
      ${acc.extra ? `<div class="ext">${acc.extra}</div>` : ''}
      <button class="ep-copy" id="epCopy">📋 Copy Number</button>
    </div>
    <ol class="ep-steps">
      <li>Upar wale number par <strong>Rs. ${PRICE}</strong> bhejein</li>
      <li>Transaction ID (TID) copy kar lein</li>
      <li>Neeche form mein TID submit karein</li>
      <li>Admin approval ke baad Premium activate ✅</li>
    </ol>
    <div class="ep-msg" id="epMsg"></div>
    <form id="epForm">
      <input id="epTID" placeholder="Transaction ID (TID)" required>
      <input id="epSender" placeholder="Sender Number (jis number se bheje)" required>
      <input id="epWhatsapp" placeholder="Aapka WhatsApp Number" required>
      <button type="submit" class="ep-submit">✅ Payment Submit Karein</button>
    </form>`;
}

// ---------- Events (delegation) ----------
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
  // Navbar update
  document.querySelectorAll('.btn-premium').forEach(b => {
    if (currentUser && currentUser.isPremium) {
      b.innerHTML = '<i class="fas fa-crown"></i> Premium';
      b.classList.add('ep-premium-badge');
    }
  });
});

console.log('👑 EduPortal Premium System loaded');