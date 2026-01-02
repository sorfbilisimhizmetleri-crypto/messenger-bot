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
// 🟢 BİLGİ BANKASI
// =======================
const SALES_PROMPT = `
Sen MAVİ YENGEÇ MACUNU satan profesyonel bir satış danışmanısın.
Net, ikna edici ve güven veren cevaplar ver.

ÜRÜN:
Mavi Yengeç Macunu 600 gram erkekler için cinsel performans arttırıcı bir üründür.
Performansı 12 kat artırır.
Erken boşalma, sertleşme ve isteksizlik sorunlarını çözer.
Yan etkisi yoktur.

PAKET SEÇENEKLERİ:
1. SEÇENEK: 1 Kavanoz - 699 TL
2. SEÇENEK: 2 Kavanoz + Krem + Damla - 1000 TL
3. SEÇENEK: 4 Kavanoz + Krem + Damla - 1600 TL

TESLİMAT:
Kapıda ödeme
Ücretsiz kargo

Kullanıcıyı nazikçe siparişe yönlendir.
`;

const SUPPORT_PROMPT = `
Sen MAVİ YENGEÇ MACUNU müşteri destek temsilcisisin.
Sakin, anlayışlı ve çözüm odaklı konuş.

HAZIR BİLGİLER:
FİYAT: Kargo ve hammadde maliyetleri nedeniyle sabittir.
KARGO SÜRESİ: Yoğunlukta 4-5 gün.
KULLANIM: İlişkiden 30-40 dk önce 1 tatlı kaşığı, tok karnına.
KREM: Geciktirici ve büyütücü. 
DAMLA: Bayan istek arttırıcı.
İLETİŞİM: +90 546 921 55 88
`;

// Bilgileri birleştiriyoruz
const FULL_KNOWLEDGE = SALES_PROMPT + "\n" + SUPPORT_PROMPT;

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

  // ===== İPTAL / BAŞA DÖN =====
  if (text === 'iptal' || text === 'başa dön') {
      users[userId] = { step: 'bos' };
      await sendMessage(userId, "Sipariş işlemi iptal edildi. Nasıl yardımcı olabilirim?");
      return res.sendStatus(200);
  }

  // ===== SİPARİŞ BAŞLAT =====
  if (text.includes('sipariş') && user.step === 'bos') {
    user.step = 'paket';
    return sendMessage(
      userId,
      `Hangi paketi istiyorsunuz?

1️⃣ 1 Kavanoz – 699 TL
2️⃣ 2 Kavanoz + Krem + Damla – 1000 TL
3️⃣ 4 Kavanoz + Krem + Damla – 1600 TL

Lütfen paketi seçiniz (1, 2 veya 3)`
    );
  }

  // ==========================================
  // 1. ADIM: PAKET SEÇİMİ (GÜNCELLENDİ 🔥)
  // ==========================================
  if (user.step === 'paket') {
    let selectedPackage = null;

    // A) Hızlı Kontrol: Kullanıcı direkt rakam yazdıysa
    if (text === '1' || text === '2' || text === '3') {
        selectedPackage = text;
    } 
    // B) Akıllı Kontrol: "1 kavanoz istiyorum", "ikili set" vb. dediyse
    else {
        const aiAnalysis = await analyzePackageIntent(message);
        
        if (aiAnalysis.selection) {
            selectedPackage = aiAnalysis.selection;
        } else {
            // Soru sorduysa cevabını ver ve tekrar sor
            return sendMessage(userId, aiAnalysis.reply + "\n\n(Siparişe devam etmek için lütfen 1, 2 veya 3. paketi seçtiğinizi belirtiniz.)");
        }
    }

    // Seçim yapıldıysa kaydet ve ilerle
    if (selectedPackage) {
      user.paket =
        selectedPackage === '1' ? '1 Kavanoz – 699 TL' :
        selectedPackage === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
        '4 Kavanoz + Krem + Damla – 1600 TL';
      
      user.step = 'isim';
      return sendMessage(userId, `✅ ${user.paket} seçildi.\n\nAd Soyad alabilir miyim?`);
    }
  }

  // ==========================================
  // 2. ADIM: İSİM ALMA
  // ==========================================
  if (user.step === 'isim') {
    const analysis = await analyzeInput(message, 'AD SOYAD');

    if (analysis.isValid) {
        user.isim = message;
        user.step = 'telefon';
        return sendMessage(userId, 'Telefon numaranızı yazar mısınız?');
    } else {
        return sendMessage(userId, analysis.reply + "\n\n(Siparişe devam etmek için lütfen Ad Soyad yazınız.)");
    }
  }

  // ==========================================
  // 3. ADIM: TELEFON ALMA
  // ==========================================
  if (user.step === 'telefon') {
    const analysis = await analyzeInput(message, 'TELEFON NUMARASI');

    if (analysis.isValid) {
        user.telefon = message;
        user.step = 'adres';
        return sendMessage(userId, 'Açık adresinizi yazar mısınız?');
    } else {
        return sendMessage(userId, analysis.reply + "\n\n(Siparişe devam etmek için lütfen telefon numaranızı yazınız.)");
    }
  }

  // ==========================================
  // 4. ADIM: ADRES ALMA
  // ==========================================
  if (user.step === 'adres') {
    const analysis = await analyzeInput(message, 'AÇIK ADRES');

    if (analysis.isValid) {
        user.adres = message;
        user.step = 'bitti';
        await sendToSheet(user);
        console.log('YENİ SİPARİŞ:', user);
        
        // Kullanıcıyı sıfırla
        users[userId] = { step: 'bos' }; 

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
    } else {
        return sendMessage(userId, analysis.reply + "\n\n(Siparişi tamamlamak için lütfen adresinizi yazınız.)");
    }
  }

  // ===== NORMAL SOHBET / DESTEK =====
  if (user.step === 'bos') {
    const supportKeywords = ['nasıl','kırık','eksik','kargo','fiyat','neden','iade','iletişim'];
    const isSupport = supportKeywords.some(k => text.includes(k));
    const reply = await askGPT(message, isSupport ? SUPPORT_PROMPT : SALES_PROMPT);
    await sendMessage(userId, reply);
  }
  
  res.sendStatus(200);
});

// =======================
// 🧠 1. YENİ FONKSİYON: PAKET NİYET ANALİZİ
// =======================
async function analyzePackageIntent(userMessage) {
    const PROMPT = `
${FULL_KNOWLEDGE}

GÖREV:
Kullanıcı şu an paket seçimi adımında.
Seçenekler:
1 -> 1 Kavanoz (1 adet, tek, bir tane vb.)
2 -> 2 Kavanoz (2 adet, ikili set, avantajlı vb.)
3 -> 4 Kavanoz (4 adet, süper set, 3. seçenek vb.)

Kullanıcının mesajı: "${userMessage}"

KURALLAR:
1. Eğer kullanıcı satın almak istediği miktarı ima ediyorsa veya açıkça söylüyorsa, sadece paket numarasını kod olarak döndür: [SECIM:1] veya [SECIM:2] veya [SECIM:3]
2. Eğer kullanıcı soru soruyorsa (örn: "Kargo ne kadar?", "Yan etkisi var mı?"), soruyu cevapla. Asla [SECIM:X] kodu verme.
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` }
        });

        const content = response.data.choices[0].message.content;

        if (content.includes('[SECIM:1]')) return { selection: '1', reply: null };
        if (content.includes('[SECIM:2]')) return { selection: '2', reply: null };
        if (content.includes('[SECIM:3]')) return { selection: '3', reply: null };

        return { selection: null, reply: content };

    } catch (e) {
        console.error("Paket analiz hatası:", e.message);
        return { selection: null, reply: "Anlayamadım, lütfen 1, 2 veya 3 yazınız." };
    }
}

// =======================
// 🧠 2. MEVCUT FONKSİYON: GENEL GİRDİ ANALİZİ
// =======================
async function analyzeInput(userMessage, expectedType) {
    const VALIDATION_SYSTEM_PROMPT = `
${FULL_KNOWLEDGE}

GÖREVİN:
Sen bir sipariş asistanısın. Kullanıcıdan şu bilgiyi istedin: ${expectedType}.
Kullanıcının mesajı: "${userMessage}"

1. Eğer kullanıcı sadece istenen bilgiyi (${expectedType}) verdiyse, sadece şunu yaz: [ONAY]
2. Eğer kullanıcı soru soruyorsa, soruyu nazikçe cevapla. Asla [ONAY] yazma.
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [{ role: 'system', content: VALIDATION_SYSTEM_PROMPT }]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` }
        });

        const content = response.data.choices[0].message.content;
        if (content.includes('[ONAY]')) return { isValid: true, reply: null };
        return { isValid: false, reply: content };

    } catch (error) {
        return { isValid: false, reply: "Hata oluştu." };
    }
}

// =======================
// STANDART GPT SOHBET
// =======================
async function askGPT(message, prompt) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message }
      ]
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` }
    });
    return response.data.choices[0].message.content;
  } catch (e) { return "Cevap verilemiyor."; }
}

// =======================
async function sendMessage(userId, text) {
  try {
      await axios.post(
        `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
        { recipient: { id: userId }, message: { text } }
      );
  } catch (e) { console.error("Mesaj hatası:", e.message); }
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
  } catch (err) { console.error('Sheets hatası:', err.message); }
}

// =======================
app.listen(process.env.PORT || 3000, () => {
  console.log('Bot çalışıyor 🚀');
});
