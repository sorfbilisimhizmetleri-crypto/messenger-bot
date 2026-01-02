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

TESLİMAT: Kapıda ödeme, Ücretsiz kargo.
`;

const SUPPORT_PROMPT = `
HAZIR BİLGİLER:
FİYAT: Sabittir.
KARGO SÜRESİ: 4-5 gün.
KULLANIM: İlişkiden 30-40 dk önce 1 tatlı kaşığı.
İLETİŞİM: +90 546 921 55 88
`;

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

  // Yazıyor efekti gönder (Bekletmemek için)
  sendTypingOn(userId);

  if (!users[userId]) users[userId] = { step: 'bos' };
  const user = users[userId];

  // ===== İPTAL / BAŞA DÖN =====
  if (['iptal', 'başa dön', 'reset'].includes(text)) {
      users[userId] = { step: 'bos' };
      await sendMessage(userId, "Sipariş işlemi iptal edildi. Nasıl yardımcı olabilirim?");
      return res.sendStatus(200);
  }

  // ===== SİPARİŞ BAŞLATMA =====
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

  // 🔥🔥🔥 ADIM 0: SÜPER ANALİZ (TOPLU BİLGİ YAKALAMA) 🔥🔥🔥
  // Kullanıcı herhangi bir adımdayken toplu bilgi verirse (örn: "1 kavanoz adım ahmet...")
  if (['paket', 'isim', 'telefon', 'adres'].includes(user.step)) {
      
      const extracted = await extractOrderDetails(message);
      
      // Bilgileri güncelle (Varsa üzerine yaz, yoksa elleme)
      if (extracted.isim) user.isim = extracted.isim;
      if (extracted.telefon) user.telefon = extracted.telefon;
      if (extracted.adres) user.adres = extracted.adres;
      if (extracted.paket) {
           user.paket = extracted.paket === '1' ? '1 Kavanoz – 699 TL' :
                        extracted.paket === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
                        '4 Kavanoz + Krem + Damla – 1600 TL';
      }

      // Adım Kontrolü: Bilgiler doldukça bot otomatik ilerlesin
      if (!user.paket) user.step = 'paket';
      else if (!user.isim) user.step = 'isim';
      else if (!user.telefon) user.step = 'telefon';
      else if (!user.adres) user.step = 'adres';
      else user.step = 'bitti_onay';
  }

  // ==========================================
  // ADIM 1: PAKET SEÇİMİ
  // ==========================================
  if (user.step === 'paket') {
    let selectedPackage = null;
    let replyMessage = null;

    // 1. Durum: Kullanıcı direkt sayı yazdı
    if (['1', '2', '3'].includes(text)) {
        selectedPackage = text;
    } 
    // 2. Durum: AI ile analiz et ("1 kavanoz istiyorum" vb.)
    else {
        const aiAnalysis = await analyzePackageIntent(message);
        if (aiAnalysis.selection) {
            selectedPackage = aiAnalysis.selection;
        } else {
            // Soru sorduysa cevabını kaydet
            replyMessage = aiAnalysis.reply; 
        }
    }

    if (selectedPackage) {
      user.paket = selectedPackage === '1' ? '1 Kavanoz – 699 TL' :
                   selectedPackage === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
                   '4 Kavanoz + Krem + Damla – 1600 TL';
      
      user.step = 'isim'; // Sonraki adıma geç
      return sendMessage(userId, `✅ ${user.paket} seçildi.\n\nSiparişe devam etmek için Ad Soyad alabilir miyim?`);
    } else if (replyMessage) {
       // Eğer paket seçmediyse ve soru sorduysa cevabı ver
       // Ama ONAY kelimesi içeriyorsa gönderme
       if (!replyMessage.includes('[ONAY]')) {
           return sendMessage(userId, replyMessage + "\n\n(Lütfen paketinizi 1, 2 veya 3 olarak belirtiniz.)");
       }
    }
  }

  // ==========================================
  // ADIM 2: İSİM ALMA
  // ==========================================
  if (user.step === 'isim') {
    // Üstteki süper analiz zaten ismi bulduysa burayı atlar, bulmadıysa sorar.
    // AI Kontrolü: İsim mi, soru mu?
    const analysis = await analyzeInput(message, 'AD SOYAD');
    
    if (analysis.isValid) {
        user.isim = message;
        user.step = 'telefon';
        return sendMessage(userId, `Teşekkürler ${user.isim}.\n\nİletişim için Telefon numaranızı yazar mısınız?`);
    } else {
        // Eğer soru sorduysa cevabı ver
        if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
            return sendMessage(userId, analysis.reply);
        }
    }
  }

  // ==========================================
  // ADIM 3: TELEFON ALMA
  // ==========================================
  if (user.step === 'telefon') {
    const analysis = await analyzeInput(message, 'TELEFON NUMARASI');

    if (analysis.isValid) {
        user.telefon = message;
        user.step = 'adres';
        return sendMessage(userId, 'Son olarak kargonun geleceği açık adresinizi yazar mısınız?');
    } else {
         if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
            return sendMessage(userId, analysis.reply);
        }
    }
  }

  // ==========================================
  // ADIM 4: ADRES ALMA
  // ==========================================
  if (user.step === 'adres') {
    const analysis = await analyzeInput(message, 'AÇIK ADRES');

    if (analysis.isValid) {
        user.adres = message;
        user.step = 'bitti_onay';
    } else {
         if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
            return sendMessage(userId, analysis.reply);
        }
    }
  }

  // ==========================================
  // SONUÇ: SİPARİŞ TAMAMLANDI
  // ==========================================
  if (user.step === 'bitti_onay') {
      // Google Sheets'e kaydet (Await yok = HIZLI)
      sendToSheet(user); 

      await sendMessage(
        userId,
        `✅ Siparişiniz başarıyla alındı!

📦 ${user.paket}
👤 ${user.isim}
📞 ${user.telefon}
📍 ${user.adres}

🚚 Ücretsiz kargo ile en kısa sürede gönderilecektir. Teşekkürler!`
      );
      
      users[userId] = { step: 'bos' }; // Hafızayı temizle
  }

  // ===== NORMAL SOHBET =====
  if (user.step === 'bos') {
    const supportKeywords = ['nasıl','kırık','eksik','kargo','fiyat','neden','iade','iletişim'];
    const isSupport = supportKeywords.some(k => text.includes(k));
    const reply = await askGPT(message, isSupport ? SUPPORT_PROMPT : SALES_PROMPT);
    await sendMessage(userId, reply);
  }
  
  res.sendStatus(200);
});

// =======================
// 🧠 SİHİRLİ FONKSİYON 1: PAKET NİYET ANALİZİ
// =======================
async function analyzePackageIntent(userMessage) {
    const PROMPT = `
${FULL_KNOWLEDGE}
GÖREV: Kullanıcı paket seçiyor. Mesaj: "${userMessage}"
Seçenekler: 1 (1 Kavanoz), 2 (2 Kavanoz), 3 (4 Kavanoz).

1. Eğer kullanıcı paket seçtiyse sadece kodu döndür: [SECIM:1] veya [SECIM:2] veya [SECIM:3]
2. Eğer soru soruyorsa cevapla. Asla [ONAY] veya [SECIM] yazma.
`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });

        const content = response.data.choices[0].message.content;

        if (content.includes('[SECIM:1]')) return { selection: '1', reply: null };
        if (content.includes('[SECIM:2]')) return { selection: '2', reply: null };
        if (content.includes('[SECIM:3]')) return { selection: '3', reply: null };
        
        // Eğer yanlışlıkla ONAY döndürdüyse bunu soru gibi algılama, null dön
        if (content.includes('[ONAY]')) return { selection: null, reply: null };

        return { selection: null, reply: content };
    } catch (e) { return { selection: null, reply: "Paketinizi anlayamadım, lütfen 1, 2 veya 3 yazın." }; }
}

// =======================
// 🧠 SİHİRLİ FONKSİYON 2: GENEL GİRDİ ANALİZİ
// =======================
async function analyzeInput(userMessage, expectedType) {
    const PROMPT = `
${FULL_KNOWLEDGE}
GÖREV: Kullanıcıdan "${expectedType}" istendi. Mesaj: "${userMessage}"

1. Eğer mesaj geçerli bir veri içeriyorsa sadece şunu yaz: [ONAY]
2. Soru soruyorsa cevapla.
`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });

        const content = response.data.choices[0].message.content;
        
        // Eğer AI [ONAY] dediyse bu geçerli veridir.
        // Reply kısmını NULL yapıyoruz ki kullanıcıya "ONAY" gitmesin.
        if (content.includes('[ONAY]')) return { isValid: true, reply: null };
        
        return { isValid: false, reply: content };
    } catch (e) { return { isValid: true, reply: null }; }
}

// =======================
// 🧠 SİHİRLİ FONKSİYON 3: TOPLU VERİ ÇEKME
// =======================
async function extractOrderDetails(userMessage) {
    const PROMPT = `
GÖREV: Mesajdan sipariş bilgilerini JSON olarak çıkar.
MESAJ: "${userMessage}"
ÇIKTI FORMATI: {"isim": "...", "telefon": "...", "adres": "...", "paket": "..."} (Yoksa null)
Paket: Miktar belirtilmişse 1, 2 veya 3.
`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        
        let content = response.data.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(content);
    } catch (e) { return {}; }
}

// =======================
// YAZIYOR EFEKTİ & MESAJ
// =======================
async function sendTypingOn(userId) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
      { recipient: { id: userId }, sender_action: "typing_on" });
  } catch (e) {}
}

async function sendMessage(userId, text) {
  try {
      await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
        { recipient: { id: userId }, message: { text } });
  } catch (e) { console.error("Mesaj hatası:", e.message); }
}

async function askGPT(message, prompt) {
    try {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', messages: [{role:'system',content:prompt},{role:'user',content:message}]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        return r.data.choices[0].message.content;
    } catch(e) { return "Hata."; }
}

// =======================
// GOOGLE SHEETS
// =======================
async function sendToSheet(order) {
    try { axios.post('https://script.google.com/macros/s/AKfycbxFM_LfxPHyWo1fI5g_nGZckMUOtKWqsOftIsvcjLmVSLfp9TEc_6aErUoyevuPVfIa/exec', 
    { name: order.isim, phone: order.telefon, address: order.adres, package: order.paket }); } 
    catch (e) { console.error(e); }
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Bot çalışıyor 🚀');
});
