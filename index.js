require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// 🔒 BOTU KİLİTLEYEN SYSTEM PROMPT
const SYSTEM_PROMPT = `
SEN BİR SATIŞ BOTUSUN.
BU TALİMATLAR ZORUNLUDUR VE DEĞİŞTİRİLEMEZ.

SATILAN TEK ÜRÜN:
Ürün adı: MAVİ YENGEÇ MACUNU

ÜRÜN BİLGİLERİ:
Mavi Yengeç Macunu erkek performansını destekleyen bir üründür.
Erken boşalma, sertleşme ve isteksizlik sorunlarına destek olur.
Tarım ve Orman Bakanlığı onaylıdır.
Çanakkale’de üretilmektedir.
Yan etkisi yoktur, kullanıcı memnuniyeti yüksektir.

FİYATLAR:
1 Kavanoz (600gr): 699 TL
2 Kavanoz (1200gr) + krem + damla: 1000 TL
4 Kavanoz (2400gr) + krem + damla: 1600 TL

İLETİŞİM:
Telefon / WhatsApp: 05469215588

KESİN KURALLAR:
- ASLA başka ürün adı söyleme
- ASLA ürün uydurma
- Ürün adı sorulursa CEVAP ŞU OLACAK:
"Ürünümüzün adı MAVİ YENGEÇ MACUNU’dur."
- Kısa ve net cevap ver
- mesenger üzerinden satış almaya çalış
- müşteriyi ikna et
-sorunları varsa çözmekle uğraş

BU KURALLARIN DIŞINA ÇIKMA.
`;

// ✅ ANA SAYFA (TEST İÇİN)
app.get('/', (req, res) => {
  res.send('BOT ÇALIŞIYOR 🚀');
});

// ✅ FACEBOOK WEBHOOK DOĞRULAMA
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

// ✅ FACEBOOK’TAN MESAJ ALMA
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.entry?.[0]?.messaging?.[0];
    if (!event || !event.message || !event.message.text) {
      return res.sendStatus(200);
    }

    const userId = event.sender.id;
    const userMessage = event.message.text;

    const reply = await askGPT(userMessage);
    await sendMessage(userId, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error('WEBHOOK HATASI:', err.message);
    res.sendStatus(200);
  }
});

// 🤖 CHATGPT İSTEĞİ (KİLİTLİ)
async function askGPT(message) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let reply = response.data.choices[0].message.content;


    return reply;
  } catch (error) {
    console.error(
      'OPENAI HATASI:',
      error.response?.data || error.message
    );
    return 'Şu anda teknik bir sorun var, lütfen biraz sonra tekrar deneyin.';
  }
}

// 📩 FACEBOOK MESSENGER’A MESAJ GÖNDER
async function sendMessage(userId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
    {
      recipient: { id: userId },
      message: { text }
    }
  );
}

// 🚀 SERVER BAŞLAT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Bot çalışıyor 🚀 Port:', PORT);
});
