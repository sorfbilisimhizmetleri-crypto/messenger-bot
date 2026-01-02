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

  sendTypingOn(userId);

  if (!users[userId]) users[userId] = { step: 'bos' };
  const user = users[userId];

  // ===== İPTAL / RESET =====
  if (['iptal', 'başa dön', 'reset'].includes(text)) {
      users[userId] = { step: 'bos' };
      await sendMessage(userId, "Sipariş işlemi iptal edildi. Nasıl yardımcı olabilirim?");
      return res.sendStatus(200);
  }

  // ===== SİPARİŞ BAŞLATMA =====
  if (text.includes('sipariş') && user.step === 'bos') {
    user.step = 'paket';
    await sendMessage(
      userId,
      `Hangi paketi istiyorsunuz?

1️⃣ 1 Kavanoz – 699 TL
2️⃣ 2 Kavanoz + Krem + Damla – 1000 TL
3️⃣ 4 Kavanoz + Krem + Damla – 1600 TL

Lütfen paketi seçiniz (1, 2 veya 3)`
    );
    return res.sendStatus(200);
  }

  // ==========================================
  // 🔥🔥🔥 AKILLI VERİ YÖNETİCİSİ (HATA DÜZELTİCİ) 🔥🔥🔥
  // ==========================================
  if (['paket', 'isim', 'telefon', 'adres'].includes(user.step)) {
      
      // 1. Önce mesajın içindeki bilgileri çekelim
      const extracted = await extractOrderDetails(message);
      
      // Bulunanları kaydet
      if (extracted.isim) user.isim = extracted.isim;
      if (extracted.telefon) user.telefon = extracted.telefon;
      if (extracted.adres) user.adres = extracted.adres;
      if (extracted.paket) {
           user.paket = extracted.paket === '1' ? '1 Kavanoz – 699 TL' :
                        extracted.paket === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
                        '4 Kavanoz + Krem + Damla – 1600 TL';
      }

      // 2. ÖZEL DURUM: Manuel Paket Seçimi (Rakamla yazdıysa)
      if (user.step === 'paket' && ['1', '2', '3'].includes(text)) {
           user.paket = text === '1' ? '1 Kavanoz – 699 TL' :
                        text === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
                        '4 Kavanoz + Krem + Damla – 1600 TL';
      }

      // 3. EKSİK BİLGİ KONTROLÜ VE YÖNLENDİRME (Zincirleme Reaksiyon Engelleyici)
      // Burada "return" kullanarak kodun aşağıya akmasını engelliyoruz.
      
      // --- PAKET EKSİKSE ---
      if (!user.paket) {
          user.step = 'paket';
          // Eğer AI paketi anlayamadıysa ve kullanıcı soru sormuyorsa tekrar sor
          if (!extracted.paket && user.step === 'paket') {
              const aiResponse = await analyzePackageIntent(message);
              if (aiResponse.reply && !aiResponse.reply.includes('[ONAY]')) {
                  await sendMessage(userId, aiResponse.reply);
                  return res.sendStatus(200);
              }
          }
          // Paket seçilmediyse bekle
          return res.sendStatus(200);
      }

      // --- İSİM EKSİKSE ---
      if (!user.isim) {
          // Paketi yeni seçtiyse veya isim hala yoksa
          if (user.step !== 'isim') {
             user.step = 'isim';
             await sendMessage(userId, `✅ ${user.paket} seçildi.\n\nSiparişe devam etmek için Ad Soyad alabilir miyim?`);
             return res.sendStatus(200); // DUR
          }
          // Zaten isim adımındaysa ve AI isim bulamadıysa (veya soru sorduysa)
          const analysis = await analyzeInput(message, 'AD SOYAD');
          if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
              await sendMessage(userId, analysis.reply);
          }
          return res.sendStatus(200); // DUR
      }

      // --- TELEFON EKSİKSE ---
      if (!user.telefon) {
          // İsmi yeni aldıysa ve telefonu yoksa
          if (user.step !== 'telefon') {
             user.step = 'telefon';
             await sendMessage(userId, `Teşekkürler ${user.isim}.\n\nİletişim için Telefon numaranızı yazar mısınız?`);
             return res.sendStatus(200); // DUR (Burada durmadığı için "kemal aslan"ı telefon sanıyordu)
          }
          // Zaten telefon adımındaysa ve AI telefon bulamadıysa
           const analysis = await analyzeInput(message, 'TELEFON NUMARASI');
           if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
              await sendMessage(userId, analysis.reply);
          }
          return res.sendStatus(200);
      }

      // --- ADRES EKSİKSE ---
      if (!user.adres) {
          if (user.step !== 'adres') {
             user.step = 'adres';
             await sendMessage(userId, 'Son olarak kargonun geleceği açık adresinizi yazar mısınız?');
             return res.sendStatus(200); // DUR
          }
           const analysis = await analyzeInput(message, 'AÇIK ADRES');
           if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
              await sendMessage(userId, analysis.reply);
          }
          return res.sendStatus(200);
      }

      // --- HEPSİ TAMAMSA ---
      user.step = 'bitti_onay';
  }

  // ==========================================
  // SONUÇ: SİPARİŞ TAMAMLANDI
  // ==========================================
  if (user.step === 'bitti_onay') {
      
      if (user.paket && user.isim && user.telefon && user.adres) {
          sendToSheet(user); 

          await sendMessage(
            userId,
            `✅ Siparişiniz başarıyla alındı!

📦 ${user.paket}
👤 ${user.isim}
📞 ${user.telefon}
📍 ${user.adres}

🚚 Ücretsiz kargo ile en kısa sürede gönderilecektir.`
          );
          
          users[userId] = { step: 'bos' }; 
      }
      return res.sendStatus(200);
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
// YARDIMCI FONKSİYONLAR
// =======================

async function extractOrderDetails(userMessage) {
    const PROMPT = `
GÖREV: Mesajdan sipariş bilgilerini JSON olarak çıkar.
MESAJ: "${userMessage}"
ÇIKTI FORMATI: {"isim": "...", "telefon": "...", "adres": "...", "paket": "..."}
Paket: Miktar belirtilmişse 1, 2 veya 3.
İsim: Yoksa null.
Telefon: Yoksa null.
Adres: Yoksa null.
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

async function analyzePackageIntent(userMessage) {
    const PROMPT = `${FULL_KNOWLEDGE}\n Kullanıcı paket seçiyor. Mesaj: "${userMessage}"\n Paket (1,2,3) ise [SECIM:X], soruysa cevapla.`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        const c = response.data.choices[0].message.content;
        if (c.includes('[SECIM:1]')) return { selection: '1', reply: null };
        if (c.includes('[SECIM:2]')) return { selection: '2', reply: null };
        if (c.includes('[SECIM:3]')) return { selection: '3', reply: null };
        if (c.includes('[ONAY]')) return { selection: null, reply: null };
        return { selection: null, reply: c };
    } catch (e) { return { selection: null, reply: "Lütfen 1, 2 veya 3 yazınız." }; }
}

async function analyzeInput(userMessage, expectedType) {
    const PROMPT = `${FULL_KNOWLEDGE}\n İstenen: ${expectedType}. Mesaj: "${userMessage}"\n Geçerliyse [ONAY], değilse cevapla.`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        const c = response.data.choices[0].message.content;
        if (c.includes('[ONAY]')) return { isValid: true, reply: null };
        return { isValid: false, reply: c };
    } catch (e) { return { isValid: true, reply: null }; }
}

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

async function sendToSheet(order) {
    try { axios.post('https://script.google.com/macros/s/AKfycbxFM_LfxPHyWo1fI5g_nGZckMUOtKWqsOftIsvcjLmVSLfp9TEc_6aErUoyevuPVfIa/exec', 
    { name: order.isim, phone: order.telefon, address: order.adres, package: order.paket }); } 
    catch (e) { console.error(e); }
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Bot çalışıyor 🚀');
});
