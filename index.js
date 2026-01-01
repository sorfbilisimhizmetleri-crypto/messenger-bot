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
bu sitedeki bilgileri isteyebilirsin: https://form.jotform.com/253606614494966
güler yüzlü ve anlayışlı ol
ürünümüzün adı mavi yengeç macunu 
ürün tanımı : mavi yengeç macunu bir erkek performans macunudur performansı 12 kat arttırır erken boşalma sertleşme problemlerini çözer isteksizlik problemlerini ortadan kaldırır.
ürün fiyatları: 1 KAVANOZ MAVİ YENGEÇ MACUNU (600GR) 699TL, 2 KAVANOZ MAVİ YENGEÇ MACUNU (1200GR) + KREM + DAMLA 1000TL, 4 KAVANOZ MAVİ YENGEÇ MACUNU (2400GR) + KREM + DAMLA 1600TL
whatsapp numaramız: 05469215588
telefon numaramız: 05469215588
ürünümüz tarım ve orman bakanlığı tarafından tüm onayları testleri yapılmış bir üründür.
ürünümüz yan etkisi yoktur %90 olumlu dönüş alıyoruz üründen alanların %90 ı memnun
ürünümüz sahte değildir çanakkalede üretilmektedir %100 mavi yengeçten üretilmektedir.
ürünümüz orjinaldir yalan veya sahte değildir
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
