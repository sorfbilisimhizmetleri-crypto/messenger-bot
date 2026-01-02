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
const processedMessages = new Set(); // Çift mesaj önleyici

// =======================
// 🟢 BİLGİ BANKASI (GÜNCELLENDİ: Sprey ve Jel eklendi)
// =======================
const SALES_PROMPT = `
Sen MAVİ YENGEÇ MACUNU satan profesyonel bir satış danışmanısın.
Net, ikna edici ve güven veren cevaplar ver.

ÜRÜN BİLGİLERİ:
Mavi Yengeç Macunu: Performansı 12 kat artırır. Erken boşalma, sertleşme sorunlarını çözer.
MAVİ JEL (Kavanoz içinde): Bu özel karışımdır, macunun etkisini hızlandırır.
SPREY: Geciktirici spreydir. İlişkiden 15 dk önce 3 fıs sıkılır, uyuşukluk yapmaz.

PAKETLER:
1. SEÇENEK: 1 Kavanoz 600 GR - 699 TL
2. SEÇENEK: 2 Kavanoz + Krem + Damla HEDİYE - 1000 TL
3. SEÇENEK: 4 Kavanoz + Krem + Damla HEDİYE - 1600 TL

TESLİMAT: PTT ve Aras Kargo. Kapıda nakit veya kart.
İLETİŞİM: +90 546 921 55 88
`;

const SUPPORT_PROMPT = `
HAZIR BİLGİLER:
FİYAT: Sabittir.
KARGO: 4-5 gün.
KULLANIM: İlişkiden 30-40 dk önce 1 tatlı kaşığı.
SPREY NEDİR: Hediye gönderilen geciktirici spreydir.
MAVİ JEL NEDİR: Macunun içindeki özel formüldür, şifa kaynağıdır.
İLETİŞİM: +90 546 921 55 88
Müşteri şikayet ederse alttan al, çözüm odaklı ol.
`;

const FULL_KNOWLEDGE = SALES_PROMPT + "\n" + SUPPORT_PROMPT;

// =======================
app.get('/', (req, res) => { res.send('BOT ÇALIŞIYOR 🚀'); });

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

// =======================
// MESAJ ALMA
// =======================
app.post('/webhook', async (req, res) => {
  const event = req.body.entry?.[0]?.messaging?.[0];
  if (!event || !event.message) return res.sendStatus(200);

  // 1. KENDİ MESAJINI ENGELLE
  if (event.message.is_echo) return res.sendStatus(200);

  // 2. ÇİFT MESAJ ENGELLE
  const messageId = event.message.mid;
  if (messageId && processedMessages.has(messageId)) return res.sendStatus(200);
  if (messageId) {
      processedMessages.add(messageId);
      if (processedMessages.size > 1000) {
          const iterator = processedMessages.values();
          for(let i=0; i<500; i++) processedMessages.delete(iterator.next().value);
      }
  }

  const userId = event.sender.id;
  const message = event.message.text;
  if (!message) return res.sendStatus(200);
  const text = message.toLowerCase();

  sendTypingOn(userId);

  if (!users[userId]) users[userId] = { step: 'bos' };
  const user = users[userId];

  // ===== İPTAL / RESET =====
  if (['iptal', 'başa dön', 'reset'].includes(text)) {
      users[userId] = { step: 'bos' };
      await sendMessage(userId, "İşlem iptal edildi. Nasıl yardımcı olabilirim? 😊");
      return res.sendStatus(200);
  }

  // ===== SİPARİŞ BAŞLATMA (GÜNCELLENDİ: AKILLI KONTROL) =====
  // Eğer kullanıcı "sipariş" kelimesini kullandıysa hemen atlama!
  // Önce niyeti kontrol et: Soru mu soruyor, yoksa almak mı istiyor?
  if (text.includes('sipariş') && user.step === 'bos') {
      
      const intent = await analyzeOrderIntent(message);
      
      // Eğer müşteri sadece soru soruyorsa (Örn: "Siparişim nerede?", "Sipariş verdim ama...")
      // Bu bloğa girme, aşağıya normal sohbete düşsün.
      if (intent === 'SORU') {
          console.log("Sipariş kelimesi geçti ama bu bir soru.");
          // Aşağıdaki normal sohbet akışına devam etsin diye bir şey yapmıyoruz.
      } 
      else {
          // Gerçekten sipariş vermek istiyor
          user.step = 'paket';
          await sendMessage(
            userId,
            `Hangi paketi istiyorsunuz?

1️⃣ 1 Kavanoz 600 GR – 699 TL
2️⃣ 2 Kavanoz + Krem + Damla (HEDİYELİ) – 1000 TL
3️⃣ 4 Kavanoz + Krem + Damla (HEDİYELİ) – 1600 TL

Lütfen paketi seçiniz (1, 2 veya 3)`
          );
          return res.sendStatus(200);
      }
  }

  // 🔥🔥🔥 AKILLI VERİ YÖNETİCİSİ 🔥🔥🔥
  if (['paket', 'isim', 'telefon', 'adres'].includes(user.step)) {
      
      const extracted = await extractOrderDetails(message);
      
      if (extracted.isim) user.isim = extracted.isim;
      if (extracted.telefon) user.telefon = extracted.telefon;
      if (extracted.adres) user.adres = extracted.adres;
      if (extracted.paket) {
           user.paket = extracted.paket === '1' ? '1 Kavanoz – 699 TL' :
                        extracted.paket === '2' ? '2 Kavanoz Set – 1000 TL' :
                        '4 Kavanoz Set – 1600 TL';
      }

      // Manuel Paket Seçimi (Rakamla)
      if (user.step === 'paket' && ['1', '2', '3'].includes(text)) {
           user.paket = text === '1' ? '1 Kavanoz – 699 TL' :
                        text === '2' ? '2 Kavanoz Set – 1000 TL' :
                        '4 Kavanoz Set – 1600 TL';
      }

      // EKSİK BİLGİ KONTROLÜ
      if (!user.paket) {
          user.step = 'paket';
          if (!extracted.paket && user.step === 'paket') {
              // Eğer müşteri paket aşamasında alakasız soru sorarsa cevapla
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
  // Müşteri "Siparişim geldi sprey nedir?" derse buraya düşecek.
  if (user.step === 'bos') {
    // Destek kelimeleri varsa Support modunda cevapla
    const supportKeywords = ['kırık','bozuk','eksik','kargo','iade','sprey','jel','geldi','aldım','sorun','nedir'];
    const isSupport = supportKeywords.some(k => text.includes(k));
    
    const reply = await askGPT(message, isSupport ? SUPPORT_PROMPT : SALES_PROMPT);
    await sendMessage(userId, reply);
  }
  
  res.sendStatus(200);
});

// =======================
// 🧠 YENİ: SİPARİŞ NİYET ANALİZİ (ÇÖZÜM BU)
// =======================
async function analyzeOrderIntent(userMessage) {
    const PROMPT = `
GÖREV: Kullanıcının mesajını analiz et.
MESAJ: "${userMessage}"

1. Kullanıcı YENİ BİR SİPARİŞ VERMEK istiyorsa (Örn: "Sipariş vericem", "1 kavanoz alıcam", "sipariş oluştur"): [YENI_SIPARIS] döndür.
2. Kullanıcı VAR OLAN SİPARİŞİ hakkında konuşuyorsa, soru soruyorsa veya şikayet ediyorsa (Örn: "Siparişim geldi", "Siparişim nerede", "Siparişin içinden sprey çıktı"): [SORU] döndür.

Sadece kodu döndür: [YENI_SIPARIS] veya [SORU]
`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        
        const content = response.data.choices[0].message.content;
        if (content.includes('[SORU]')) return 'SORU';
        return 'YENI_SIPARIS';
    } catch (e) { return 'YENI_SIPARIS'; }
}

// =======================
// DİĞER YARDIMCI FONKSİYONLAR
// =======================
async function extractOrderDetails(userMessage) {
    const PROMPT = `
GÖREV: Mesajdan sipariş bilgilerini JSON olarak çıkar.
MESAJ: "${userMessage}"
ÇIKTI FORMATI: {"isim": "...", "telefon": "...", "adres": "...", "paket": "..."}
Paket: Miktar belirtilmişse 1, 2 veya 3.
`;
    try {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        let c = r.data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(c);
    } catch (e) { return {}; }
}

async function analyzePackageIntent(userMessage) {
    const PROMPT = `${FULL_KNOWLEDGE}\n Kullanıcı paket seçiyor. Mesaj: "${userMessage}"\n Paket (1,2,3) ise [SECIM:X], soruysa cevapla.`;
    try {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        const c = r.data.choices[0].message.content;
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
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        const c = r.data.choices[0].message.content;
        if (c.includes('[ONAY]')) return { isValid: true, reply: null };
        return { isValid: false, reply: c };
    } catch (e) { return { isValid: true, reply: null }; }
}

async function sendTypingOn(userId) {
  try { axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, { recipient: { id: userId }, sender_action: "typing_on" }); } catch (e) {}
}

async function sendMessage(userId, text) {
  try { axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`, { recipient: { id: userId }, message: { text } }); } catch (e) {}
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

app.listen(process.env.PORT || 3000, () => { console.log('Bot çalışıyor 🚀'); });
