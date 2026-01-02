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
const processedMessages = new Set(); // Çift mesaj önleyici hafıza

// =======================
// 🟢 BİLGİ BANKASI
// =======================
const SALES_PROMPT = `
Sen MAVİ YENGEÇ MACUNU satan profesyonel bir satış danışmanısın.
Net, ikna edici ve güven veren cevaplar ver.
Konuşurken güler yüzlü ol.
Cümlelerin sonunda veya uygun yerlerde
1–2 adet sade emoji kullan.
profesyonel ve samimi kal.
Tercih edilen emojiler: 😊 👍 📦 ✅ 📞

ÜRÜN:
Mavi Yengeç Macunu 600 gram erkekler için cinsel performans arttırıcı bir üründür.
Performansı 12 kat artırır.
Erken boşalma, sertleşme ve isteksizlik sorunlarını çözer.
Yan etkisi yoktur.

PAKET SEÇENEKLERİ:
1. SEÇENEK: 1 Kavanoz 600 GRAM - 699 TL
2. SEÇENEK: 2 Kavanoz 600 GRAM + Krem + Damla HEDİYE - 1000 TL
3. SEÇENEK: 4 Kavanoz 600 GRAM + Krem + Damla -HEDİYE  1600 TL

TESLİMAT: Kapıda ödeme, Ücretsiz kargo.
PTT VE ARAS KARGO ŞUBELERİNE TESLİM EDİLEBİLİR
SADECE PTT VE ARAS KARGO İLE ÇALISIYORUZ
KAPIDA NAKİT VE KAPIDA KREDİ KARTI İLE ÖDEME YAPILIR
PTT İLE KAPIDA SADECE NAKİT ÖDEMESİ YAPILIR KREDİ KARTI İLE ÖDEME YOK
`;

const SUPPORT_PROMPT = `
HAZIR BİLGİLER:
FİYAT: Sabittir.
KARGO SÜRESİ: 4-5 gün.
KULLANIM: İlişkiden 30-40 dk önce 1 tatlı kaşığı.
İLETİŞİM: +90 546 921 55 88
TELEFON NUMARASI: +90 546 921 55 88
WHATSAPP NUMARASI: +90 546 921 55 88
Müşteriyle empati kur.
hakaret ve uygunsuz kelimeler ederse onu nazikce uyar ve sohbeti sonlandır 
Nazik ve sakin bir dil kullan.
Uygun yerlerde 1–2 adet emoji ekle.
Sorun yaşayan müşteriler için
anlayış gösteren emojiler kullan: 🙏 😔 ✅
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
  
  // 1. Olay yoksa veya mesaj metni yoksa çık
  if (!event || !event.message) return res.sendStatus(200);

  // 🛑 2. KRİTİK KORUMA: KENDİ MESAJINI YOKSAY (is_echo)
  // Bu satır olmazsa bot kendi kendine konuşur ve sürekli sipariş girer!
  if (event.message.is_echo) {
      return res.sendStatus(200);
  }

  // 🛑 3. KORUMA: ÇİFT MESAJ ENGELLEME (Facebook Retry)
  const messageId = event.message.mid;
  if (messageId && processedMessages.has(messageId)) {
      return res.sendStatus(200); 
  }
  if (messageId) {
      processedMessages.add(messageId);
      if (processedMessages.size > 1000) { // Hafıza temizliği
          const iterator = processedMessages.values();
          for(let i=0; i<500; i++) processedMessages.delete(iterator.next().value);
      }
  }

  const userId = event.sender.id;
  
  // Sadece metin mesajlarını işleyelim (Resim vs. gelirse patlamasın)
  const message = event.message.text;
  if (!message) return res.sendStatus(200);
  
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

1️⃣ 1 Kavanoz –600 GRAM - 699 TL
2️⃣ 2 Kavanoz -600 GRAM + Krem + Damla- HEDİYELİ – 1000 TL
3️⃣ 4 Kavanoz -600 GRAM + Krem + Damla –HEDİYELİ - 1600 TL

Lütfen paketi seçiniz (1, 2 veya 3)`
    );
    return res.sendStatus(200);
  }

  // 🔥🔥🔥 AKILLI VERİ YÖNETİCİSİ 🔥🔥🔥
  if (['paket', 'isim', 'telefon', 'adres'].includes(user.step)) {
      
      const extracted = await extractOrderDetails(message);
      
      if (extracted.isim) user.isim = extracted.isim;
      if (extracted.telefon) user.telefon = extracted.telefon;
      if (extracted.adres) user.adres = extracted.adres;
      if (extracted.paket) {
           user.paket = extracted.paket === '1' ? '1 Kavanoz –600 GRAM - 699 TL' :
                        extracted.paket === '2' ? '2 Kavanoz -600 GRAM + Krem + Damla- HEDİYELİ – 1000 TL' :
                        '4 Kavanoz -600 GRAM + Krem + Damla –HEDİYELİ - 1600 TL';
      }

      if (user.step === 'paket' && ['1', '2', '3'].includes(text)) {
           user.paket = text === '1' ? '1 Kavanoz –600 GRAM - 699 TL' :
                        text === '2' ? '2 Kavanoz -600 GRAM + Krem + Damla- HEDİYELİ – 1000 TL' :
                        '4 Kavanoz -600 GRAM + Krem + Damla –HEDİYELİ - 1600 TL';
      }

      // EKSİK BİLGİ KONTROLÜ
      if (!user.paket) {
          user.step = 'paket';
          if (!extracted.paket && user.step === 'paket') {
              const aiResponse = await analyzePackageIntent(message);
              if (aiResponse.reply && !aiResponse.reply.includes('[ONAY]')) {
                  await sendMessage(userId, aiResponse.reply);
                  return res.sendStatus(200);
              }
          }
          return res.sendStatus(200);
      }

      if (!user.isim) {
          if (user.step !== 'isim') {
             user.step = 'isim';
             await sendMessage(userId, `✅ ${user.paket} seçildi.\n\nSiparişe devam etmek için Ad Soyad alabilir miyim?`);
             return res.sendStatus(200); 
          }
          const analysis = await analyzeInput(message, 'AD SOYAD');
          if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
              await sendMessage(userId, analysis.reply);
          }
          return res.sendStatus(200);
      }

      if (!user.telefon) {
          if (user.step !== 'telefon') {
             user.step = 'telefon';
             await sendMessage(userId, `Teşekkürler ${user.isim}.\n\nİletişim için Telefon numaranızı yazar mısınız?`);
             return res.sendStatus(200);
          }
           const analysis = await analyzeInput(message, 'TELEFON NUMARASI');
           if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
              await sendMessage(userId, analysis.reply);
          }
          return res.sendStatus(200);
      }

      if (!user.adres) {
          if (user.step !== 'adres') {
             user.step = 'adres';
             await sendMessage(userId, 'Son olarak kargonun geleceği açık adresinizi yazar mısınız?');
             return res.sendStatus(200);
          }
           const analysis = await analyzeInput(message, 'AÇIK ADRES');
           if (analysis.reply && !analysis.reply.includes('[ONAY]')) {
              await sendMessage(userId, analysis.reply);
          }
          return res.sendStatus(200);
      }

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
    const supportKeywords = ['kırık','bozuk','eksik','kargo','iade','şikayet','dolandırıcı','sahtekar','pahalı','yalan','iletişim'];
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
