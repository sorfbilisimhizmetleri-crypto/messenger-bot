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
// 🟢 SATIŞ PROMPT
// =======================
const SALES_PROMPT = `
Sen MAVİ YENGEÇ MACUNU satan profesyonel bir satış danışmanısın.
Net, ikna edici ve güven veren cevaplar ver.

ÜRÜN:
Mavi Yengeç Macunu 600 gram erkekler için cinsel performans arttırıcı bir üründür.
Performansı 12 kat artırır.
Erken boşalma, sertleşme ve isteksizlik sorunlarını çözer.
Yan etkisi yoktur.

FİYATLAR SABİTTİR (İNDİRİM YOKTUR):
1 Kavanoz: 699 TL
2 Kavanoz + Krem + Damla: 1000 TL
4 Kavanoz + Krem + Damla: 1600 TL

TESLİMAT:
Kapıda ödeme
Ücretsiz kargo

Kullanıcıyı nazikçe siparişe yönlendir.
`;

// =======================
// 🔵 DESTEK + İKNA PROMPT
// =======================
const SUPPORT_PROMPT = `
Sen MAVİ YENGEÇ MACUNU müşteri destek temsilcisisin.
Sakin, anlayışlı ve çözüm odaklı konuş.

HAZIR BİLGİLER:

FİYAT NEDEN YÜKSEK:
Kargo maliyetleri %50 zamlandı.
Cam şişe ambalaj %35 zamlandı.
Ham madde %17 zamlandı.
Personel maliyetleri %28 arttı.
Reklam maliyetleri çok yüksek.
Buna rağmen fiyatlar olabildiğince uygun tutulmaktadır.

WHATSAPP / TELEFON ULAŞILAMIYORSA:
Cumartesi, pazar ve resmi tatillerde ekip çalışmıyor.
Mesai saatlerinde yoğunluk varsa mutlaka geri dönüş yapılır.

KIRIK / EKSİK ÜRÜN:
Özür dile.
Şu bilgileri iste:
- Ad Soyad
- Telefon
- Kaç adet alındı
- Kaç adet geldi / ne eksik

KARGO GELMEDİYSE:
Yoğunlukta teslimat 4–5 gün sürebilir.
Bu süre aşılırsa:
- Ad Soyad
- Telefon
- Sipariş tarihi
iste ve ekibe ileteceğini söyle.

İADE:
İade için şu bilgileri iste:
- Ad Soyad
- Telefon
- İade sebebi
- IBAN

KULLANIM TALİMATI:
İlişkiden 30–40 dakika önce
1 tatlı kaşığı
Tok karnına kullanılır.

KREM & DAMLA:
Krem: Boşalma süresini 30–35 dakika uzatır, 2 cm büyüme sağlar.
Damla: Bayan azdırıcıdır, 1–2 damla içeceğe eklenir.

SAHTE Mİ:
Ürün sahte değildir.
Tarım ve Orman Bakanlığı onaylıdır.
Türk Patent ve Marka Kurumu tarafından tescillidir.

İŞE YARIYOR MU:
%100 etkilidir.
12 saat etki sağlar.
30 dakikada etki gösterir.

İNDİRİM:
İndirim yoktur, fiyatlar sabittir.

İLETİŞİM:
WhatsApp / Telefon: +90 546 921 55 88
Web: https://form.jotform.com/253606614494966
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
// MESAJ ALMA
// =======================
app.post('/webhook', async (req, res) => {
  const event = req.body.entry?.[0]?.messaging?.[0];
  if (!event || !event.message?.text) return res.sendStatus(200);

  const userId = event.sender.id;
  const message = event.message.text;
  const text = message.toLowerCase();

  if (!users[userId]) users[userId] = { step: 'bos' };
  const user = users[userId];

  // ===== SİPARİŞ BAŞLAT =====
  if (text.includes('sipariş')) {
    user.step = 'paket';
    return sendMessage(
      userId,
      `Hangi paketi istiyorsunuz?

1️⃣ 1 Kavanoz – 699 TL
2️⃣ 2 Kavanoz + Krem + Damla – 1000 TL
3️⃣ 4 Kavanoz + Krem + Damla – 1600 TL

Lütfen 1 / 2 / 3 yazınız`
    );
  }

  if (user.step === 'paket') {
    if (['1', '2', '3'].includes(text)) {
      user.paket =
        text === '1'
          ? '1 Kavanoz – 699 TL'
          : text === '2'
          ? '2 Kavanoz + Krem + Damla – 1000 TL'
          : '4 Kavanoz + Krem + Damla – 1600 TL';
      user.step = 'isim';
      return sendMessage(userId, 'Ad Soyad alabilir miyim?');
    }
    return sendMessage(userId, 'Lütfen 1, 2 veya 3 yazınız.');
  }

  if (user.step === 'isim') {
    user.isim = message;
    user.step = 'telefon';
    return sendMessage(userId, 'Telefon numaranızı yazar mısınız?');
  }

  if (user.step === 'telefon') {
    user.telefon = message;
    user.step = 'adres';
    return sendMessage(userId, 'Adresinizi yazar mısınız?');
  }

  if (user.step === 'adres') {
    user.adres = message;
    user.step = 'bitti';
    await sendToSheet(user);
    console.log('YENİ SİPARİŞ:', user);
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

  // ===== DESTEK Mİ? =====
  const supportKeywords = [
    'kırık','eksik','bozuk','şikayet','iade','geri',
    'kargo','gelmedi','gecikti','fiyat','yüksek',
    'sahte','işe yarıyor','yan etki','ulaşamıyorum'
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
async function askGPT(message, prompt) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: prompt },
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
// 📊 GOOGLE E-TABLOLAR
// =======================
async function sendToSheet(order) {
  try {
    await axios.post(
      'https://script.google.com/macros/s/AKfycbxFM_LfxPHyWo1fI5g_nGZckMUOtKWqsOftIsvcjLmVSLfp9TEc_6aErUoyevuPVfIa/exec',
      {
        name: order.isim,
        phone: order.telefon,
        address: order.adres,
        package: order.paket
      }
    );
  } catch (err) {
    console.error('Sheets gönderme hatası:', err.message);
  }
}

// =======================
app.listen(process.env.PORT || 3000, () => {
  console.log('Bot çalışıyor 🚀');
});
