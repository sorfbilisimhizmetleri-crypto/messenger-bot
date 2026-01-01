require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const SYSTEM_PROMPT = `
Sen bir satış danışmanısın.
Kısa, net ve ikna edici cevaplar ver.
Ürün tanıtımı yap.
Kullanıcıyı siparişe yönlendir.
Sipariş almak için ad, telefon, adres iste.
`;

// Facebook doğrulama
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Mesaj alma
app.post('/webhook', async (req, res) => {
  const event = req.body.entry[0].messaging[0];
  const userId = event.sender.id;
  const userMessage = event.message?.text;

  if (!userMessage) return res.sendStatus(200);

  const reply = await askGPT(userMessage);
  await sendMessage(userId, reply);

  res.sendStatus(200);
});

// ChatGPT
async function askGPT(message) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_KEY}`
      }
    }
  );

  return response.data.choices[0].message.content;
}

// Messenger’a cevap gönder
async function sendMessage(userId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
    {
      recipient: { id: userId },
      message: { text }
    }
  );
}

app.listen(3000, () => console.log('Bot çalışıyor 🚀'));
