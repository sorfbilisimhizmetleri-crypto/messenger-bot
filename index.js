require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// =======================
// 🧠 KULLANICI HAFIZASI
// =======================
const users = {};

// =======================
// 📚 ÜRÜN BİLGİ HAVUZU
// 👉 YENİ BİLGİ EKLEMEK İÇİN SADECE BURAYI DÜZENLE
// =======================
const PRODUCT_KNOWLEDGE = `
ÜRÜN ADI:
Mavi Yengeç Macunu

ÜRETİM:
Çanakkale’de üretilmektedir.
%100 gerçek mavi yengeçten üretilir.
Sahte değildir.

RESMİ DURUM:
Tarım ve Orman Bakanlığı onaylıdır.
Türk Patent ve Marka Kurumu’nda tescillidir.

ETKİLER:
- Erkek cinsel performansını 12 kat artırır
- Erken boşalmayı önler
- Sertleşme problemlerini çözer
- İsteksizlik sorununu giderir
- Etkisi yaklaşık 12 saat sürer

KULLANIM:
- İlişkiden 30–40 dakika önce
- 1 tatlı kaşığı
- Tok karnına kullanılır

YANINDA GELEN ÜRÜNLER:
Krem:
- Boşalma süresini 30–35 dakika uzatır
- Peniste yaklaşık 2 cm büyüme sağlar

Damla:
- Bayan azdırıcıdır
- 1–2 damla içeceğe eklenir

TESLİMAT:
- Ücretsiz kargo
- Kapıda ödeme

NOTLAR:
- Yan etkisi yoktur
- %90 müşteri memnuniyeti vardır
`;

// =======================
// 🟢 SATIŞ PROMPT (AYNI)
// =======================
const SALES_PROMPT = `
Sen MAVİ YENGEÇ MACUNU satan profesyonel bir satış danışmanısın.
Net, ikna edici ve güven veren cevaplar ver.
Kullanıcıyı nazikçe siparişe yönlendir.
Konuşurken güler yüzlü ol.
Cümlelerin sonunda veya uygun yerlerde
1–2 adet sade emoji kullan.
Abartma, profesyonel ve samimi kal.
Tercih edilen emojiler: 😊 👍 📦 ✅ 📞
`;

// =======================
// 🔵 DESTEK PROMPT (AYNI)
// =======================
const SUPPORT_PROMPT = `
Sen MAVİ YENGEÇ MACUNU müşteri destek temsilcisisin.
Sakin, anlayışlı ve çözüm odaklı konuş.
Müşteriyle empati kur.
Nazik ve sakin bir dil kullan.
Uygun yerlerde 1–2 adet emoji ekle.
Sorun yaşayan müşteriler için
anlayış gösteren emojiler kullan: 🙏 😔 ✅
`;

// =======================
app.get('/', (req, res) => {
  res.send('BOT ÇALIŞIYOR 🚀');
});

// =======================
// FACEBOOK DOĞRULAMA
// =======================
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

// =======================
// YARDIMCI FONKSİYONLAR
// =======================
function detectPackage(text) {
  const t = text.toLowerCase();
  if (t.includes('1') || t.includes('bir') || t.includes('tek')) return '1 Kavanoz – 699 TL';
  if (t.includes('2') || t.includes('iki')) return '2 Kavanoz + Krem + Damla – 1000 TL';
  if (t.includes('3') || t.includes('4') || t.includes('dört')) return '4 Kavanoz + Krem + Damla – 1600 TL';
  return null;
}

async function saveOrderToSheet(order) {
  try {
    await axios.post(
      'https://script.google.com/macros/s/AKfycbxFM_LfxPHyWo1fI5g_nGZckMUOtKWqsOftIsvcjLmVSLfp9TEc_6aErUoyevuPVfIa/exec',
      order
    );
  } catch (e) {
    console.log('Sheet kayıt hatası:', e.message);
  }
}

// =======================
// MESAJ ALMA
// =======================
app.post('/webhook', async (req, res) => {
  const event = req.body.entry?.[0]?.messaging?.[0];
  if (!event || !event.message?.text) return res.sendStatus(200);

  const userId = event.sender.id;
  const message = event.message.text.trim();
  const text = message.toLowerCase();

  if (!users[userId]) users[userId] = { step: 'bos', ordered: false };
  const user = users[userId];

  // ===== DAHA ÖNCE SİPARİŞ =====
  if (user.ordered && text.includes('sipariş')) {
    return sendMessage(
      userId,
      `📦 Daha önce ${user.orderDate} tarihinde siparişiniz alınmıştı.
Yeni bir sipariş için "yeni sipariş" yazabilirsiniz.`
    );
  }

  // ===== SİPARİŞ BAŞLAT =====
  if ((text.includes('sipariş') || text.includes('satın al')) && !user.ordered) {
    user.step = 'paket';
    return sendMessage(
      userId,
      `Hangi paketi istiyorsunuz?

1️⃣ 1 Kavanoz – 699 TL
2️⃣ 2 Kavanoz + Krem + Damla – 1000 TL
3️⃣ 4 Kavanoz + Krem + Damla – 1600 TL

1 / 2 / 3 ya da "1 kavanoz" şeklinde yazabilirsiniz.`
    );
  }

  // ===== PAKET =====
  if (user.step === 'paket') {
    const paket = detectPackage(message);
    if (!paket) {
      return sendMessage(userId, 'Lütfen 1, 2 veya 3 şeklinde paket seçiniz.');
    }
    user.paket = paket;
    user.step = 'isim';
    return sendMessage(userId, '👤 Ad Soyad alabilir miyim?');
  }

  // ===== İSİM =====
  if (user.step === 'isim') {
    if (message.split(' ').length < 2) {
      return sendMessage(userId, 'Lütfen ad ve soyadınızı birlikte yazınız.');
    }
    user.isim = message;
    user.step = 'telefon';
    return sendMessage(userId, '📞 Telefon numaranızı yazar mısınız?');
  }

  // ===== TELEFON =====
  if (user.step === 'telefon') {
    if (!message.match(/[0-9]{10,}/)) {
      return sendMessage(userId, 'Geçerli bir telefon numarası giriniz.');
    }
    user.telefon = message;
    user.step = 'adres';
    return sendMessage(userId, '📍 Adresinizi yazar mısınız?');
  }

  // ===== ADRES + BİTİR =====
  if (user.step === 'adres') {
    if (message.length < 10) {
      return sendMessage(userId, 'Lütfen açık adresinizi yazınız.');
    }

    user.adres = message;
    user.step = 'bitti';
    user.ordered = true;
    user.orderDate = new Date().toLocaleDateString('tr-TR');

    await saveOrderToSheet({
      isim: user.isim,
      telefon: user.telefon,
      adres: user.adres,
      paket: user.paket,
      userId,
      tarih: user.orderDate
    });

    return sendMessage(
      userId,
      `✅ Siparişiniz alınmıştır

📦 ${user.paket}
👤 ${user.isim}
📞 ${user.telefon}
📍 ${user.adres}

🚚 Ücretsiz kargo
💵 Kapıda ödeme`
    );
  }

  // ===== DESTEK / SATIŞ GPT =====
  const supportKeywords = [
    'kırık','eksik','iade','şikayet','kargo','gelmedi',
    'fiyat','sahte','yan etki','kullanım'
  ];

  const isSupport = supportKeywords.some(k => text.includes(k));

  const reply = await askGPT(
    message,
    isSupport ? SUPPORT_PROMPT : SALES_PROMPT
  );

  await sendMessage(userId, reply);
  res.sendStatus(200);
});

// =======================
// GPT (ÜRÜN BİLGİLERİ DAHİL)
// =======================
async function askGPT(message, prompt) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `
${prompt}

Aşağıdaki ürün bilgilerini KESİN REFERANS AL.
Bu bilgilerle çelişen hiçbir cevap verme.

ÜRÜN BİLGİLERİ:
${PRODUCT_KNOWLEDGE}
`
        },
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

  return response.data.choices[0].message.content;
}

// =======================
// FB MESAJ GÖNDER
// =======================
async function sendMessage(userId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
    {
      recipient: { id: userId },
      message: { text }
    }
  );
}

// =======================
app.listen(process.env.PORT || 3000, () => {
  console.log('Bot çalışıyor 🚀');
});
