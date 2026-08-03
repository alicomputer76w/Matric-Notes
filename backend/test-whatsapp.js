const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(express.json());

console.log('🔥 TEST SERVER STARTING...');
console.log('🔍 Token exists:', !!process.env.WHATSAPP_TOKEN);
console.log('🔍 Phone ID:', process.env.WHATSAPP_PHONE_ID);

// Helper function
async function sendWhatsAppMessage(to, text) {
  const response = await fetch(`https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    })
  });
  return await response.json();
}

// GET webhook (verification)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'eduportal123') {
    console.log('✅ WEBHOOK VERIFIED!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST webhook (receive & reply)
app.post('/webhook', async (req, res) => {
  console.log('🔥🔥🔥 NAYA CODE CHAL RAHA HAI! 🔥🔥🔥');
  
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  if (value?.messages?.length) {
    const msg = value.messages[0];
    const from = msg.from;
    const text = msg.text?.body || '';
    
    console.log(`📩 Message from ${from}: ${text}`);
    
    // Send welcome message
    const result = await sendWhatsAppMessage(from, 'Hello! Yeh TEST auto-reply hai! 🎉');
    console.log('✅ Reply sent:', result);
  }
  
  res.sendStatus(200);
});

app.listen(5000, () => {
  console.log('🚀 Test server running on port 5000');
});