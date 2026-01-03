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
const processedMessages = new Set(); 

// =======================
// 🟢 BİLGİ BANKASI (PROMPTLAR)
// =======================
const SALES_PROMPT = `
Sen MAVİ YENGEÇ MACUNU satan profesyonel bir satış danışmanısın.
Net, ikna edici ve güven veren cevaplar ver.
KENDİ TELEFON NUMARAN ve whatsapp numaran VAR ve SORULDUĞUNDA MUTLAKA PAYLAŞIRSIN.
Telefon numaranı ASLA kendiliğinden paylaşma.
Telefon numarası SADECE şu durumlarda verilir:
- Müşteri açıkça telefon numarasını isterse
- Sipariş tamamlandıktan sonra
- Müşteri aramak veya iletişime geçmek istediğini belirtirse
Bunun dışında telefon numarası yazma.
Telefon numaran ve whatsapp numaran +90 546 921 55 88

ÖNEMLİ KONUŞMA KURALI:
Her cevabına "Merhaba", "Selam" veya "Sayın müşterimiz" diyerek BAŞLAMA.
Sanki sohbet zaten devam ediyormuş gibi DİREKT cevabı ver.
Sadece kullanıcı sana "Merhaba" derse selam ver.
Sürekli selamlaşan bir robot gibi görünme, samimi ve akıcı ol.

Konuşurken güler yüzlü ol.
Cümlelerin sonunda veya uygun yerlerde 1–2 adet sade emoji kullan.
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
SEN BİR MÜŞTERİ DESTEK ASİSTANISIN.
AŞAĞIDAKİ İKİ DURUMA GÖRE FARKLI HAREKET ETMEK ZORUNDASIN.

⚠️ DURUM 1: EĞER MÜŞTERİ BİR SORUN, ŞİKAYET VEYA KARGO GECİKMESİ BELİRTİYORSA:
(Örnekler: "Kargom gelmedi", "Sipariş nerede", "Ürün kırık", "Eksik çıktı", "Ulaşmadı", "Dolandırıcı mısınız", "Cevap verin")

HAREKET PLANI:
1. ASLA "Ben kontrol edeyim" deme.
2. ASLA "Sipariş numaranız nedir" diye sorma.
3. ASLA "Kargo süresi 4-5 gündür" gibi bilgi verme.
4. YAPMAN GEREKEN TEK ŞEY: Nazikçe özür dile ve hemen WHATSAPP DESTEK HATTINA yönlendir.

ÖRNEK CEVAP (ŞİKAYET İÇİN):
"Yaşadığınız gecikme/sorun için çok üzgünüz 🙏 Kargo ve teslimat sorunlarıyla ilgili destek ekibimiz WhatsApp üzerinden anlık işlem yapmaktadır. Beklemeden çözüm almak için lütfen hemen yazınız:
📞 WhatsApp: +90 546 921 55 88"

---------------------------------------------------

✅ DURUM 2: EĞER MÜŞTERİ SADECE BİLGİ SORMUŞSA (SORUN YOKSA):
(Örnekler: "Nasıl kullanılır?", "Fiyat nedir?", "Yan etkisi var mı?", "Ne işe yarar?", "Kargo ne zaman gelir")

HAREKET PLANI:
Aşağıdaki bilgileri kullanarak net cevap ver:
- FİYAT: Sabittir.
- KARGO SÜRESİ: "Sipariş verirseniz 4-5 günde gelir" (Sadece yeni sipariş sorana söyle).
- KULLANIM: İlişkiden 30-40 dk önce 1 tatlı kaşığı.
- ÜRÜN BİLGİSİ: Erkeklere özel macun.
- İLETİŞİM: +90 546 921 55 88

GENEL KONUŞMA KURALLARI:
- Her lafa "Merhaba" diyerek başlama. Direkt cevabı ver.
- Müşteriyle senli benli olma ama samimi ol.
`;

const FULL_KNOWLEDGE = SALES_PROMPT + "\n" + SUPPORT_PROMPT;

// =======================
// ROUTE AYARLARI
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
// 📩 MESAJ ALMA VE İŞLEME (ANA BEYİN)
// =======================
app.post('/webhook', async (req, res) => {
  const event = req.body.entry?.[0]?.messaging?.[0];
  
  if (!event || !event.message) return res.sendStatus(200);

  // Kendi mesajını yoksay
  if (event.message.is_echo) return res.sendStatus(200);

  // Çift mesaj engelleme
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
      const history = user.history || {}; // Hafızayı koru
      users[userId] = { step: 'bos', history: history };
      await sendMessage(userId, "İşlem iptal edildi. Nasıl yardımcı olabilirim?");
      return res.sendStatus(200);
  }

  // ==========================================
  // AKILLI KARAR MEKANİZMASI (SİPARİŞ + SOHBET + DESTEK)
  // ==========================================
  if (user.step === 'bos') {
      
      // 1. Önce Yapay Zekaya "Bu adam ne istiyor?" diye soruyoruz
      const niyet = await detectUserIntent(text);
      console.log(`Kullanıcı Niyeti: ${niyet}`);

      // --- SENARYO A: SATIŞ / SİPARİŞ İSTİYOR ---
      if (niyet === 'SATIS') {
          // Eğer adam net sipariş cümlesi kurduysa (örn: "2 tane yolla", "alcam")
          const netSiparis = ['alcam', 'istiyorum', 'sipariş', 'yolla', 'gönder', 'kavanoz', 'fiyat', 'alabilirim', 'kapıda öde'].some(k => text.includes(k));
          
          if (netSiparis) {
               user.step = 'paket';
               await sendMessage(userId, `Hangi paketi istiyorsunuz?\n\n1️⃣ 1 Kavanoz – 699 TL\n2️⃣ 2 Kavanoz + Hediye – 1000 TL\n3️⃣ 4 Kavanoz + Hediye – 1600 TL\n\nLütfen paketi seçiniz (1, 2 veya 3)`);
               return res.sendStatus(200);
          } else {
              // Sadece bilgi sormuştur -> SALES_PROMPT cevaplasın
              const reply = await askGPT(message, SALES_PROMPT);
              await sendMessage(userId, reply);
              return res.sendStatus(200);
          }
      }

      // --- SENARYO B: SORUNU VAR / DESTEK İSTİYOR ---
      if (niyet === 'DESTEK') {
          // Direkt WhatsApp'a yönlendiren prompt devreye girsin
          const reply = await askGPT(message, SUPPORT_PROMPT);
          await sendMessage(userId, reply);
          return res.sendStatus(200);
      }

      // --- SENARYO C: SOHBET ---
      if (niyet === 'SOHBET') {
          await sendMessage(userId, "Merhaba! 😊 Mavi Yengeç Macunu hakkında size nasıl yardımcı olabilirim?");
          return res.sendStatus(200);
      }
      
      // --- DİĞER: HAFIZA KONTROLLÜ CEVAP ---
      let customerContext = "";
      if (user.history && user.history.onceSiparisVerdi) {
          customerContext = `(HATIRLATMA: Bu kullanıcı ESKİ MÜŞTERİN. Daha önce aldığı ürün: ${user.history.sonAldigiPaket}. Ona göre samimi konuş.)`;
      }
      
      const reply = await askGPT(message, SALES_PROMPT + "\n" + customerContext);
      await sendMessage(userId, reply);
  }

  // ==========================================
  // 📝 SİPARİŞ BİLGİLERİNİ TOPLAMA ADIMLARI
  // ==========================================
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
  // ✅ SONUÇ: SİPARİŞ TAMAMLANDI
  // ==========================================
  if (user.step === 'bitti_onay') {
      
      if (user.paket && user.isim && user.telefon && user.adres) {
          sendToSheet(user); 

          // 🔥 MÜŞTERİYİ HAFIZAYA KAYDET
          if (!user.history) user.history = {};
          user.history.onceSiparisVerdi = true;
          user.history.sonAldigiPaket = user.paket;

          await sendMessage(
            userId,
            `✅ Siparişiniz başarıyla alındı!

📦 ${user.paket}
👤 ${user.isim}
📞 ${user.telefon}
📍 ${user.adres}

🚚 Ücretsiz kargo ile en kısa sürede gönderilecektir.`
          );
          
          // Step'i sıfırla ama hafızayı koru
          const gecmisBilgi = user.history;
          users[userId] = { step: 'bos', history: gecmisBilgi }; 
      }
      return res.sendStatus(200);
  }
  
  res.sendStatus(200);
});

// =======================
// YARDIMCI FONKSİYONLAR
// =======================

// 🔥 YENİ EKLENEN AKILLI BEYİN
async function detectUserIntent(message) {
    const PROMPT = `
    GÖREVİN: Gelen mesajın "NİYETİNİ" (INTENT) analiz et ve sadece aşağıdaki etiketlerden birini döndür.
    
    1. [SATIS]: Kullanıcı ürün almak istiyor, fiyat soruyor veya sipariş vermek istiyor. (Örn: "Almak istiyorum", "Fiyat ne", "Sipariş vercem", "2 tane yolla", "Kapıda ödeme var mı", "Kavanoz")
    2. [DESTEK]: Kullanıcı zaten almış, kargosu gelmemiş, ürün bozuk veya bir şikayeti var. (Örn: "Sipariş verdim gelmedi", "Kargom nerede", "Ürün kırık", "İade etmek istiyorum", "Dolandırıcı mısınız", "Numara ver", "Ulaşmadı")
    3. [SOHBET]: Selamlaşma veya boş sohbet. (Örn: "Selam", "Naber", "Merhaba", "Orda mısın")
    4. [DIGER]: Anlamsız veya konu dışı.

    MESAJ: "${message}"
    
    SADECE TEK KELİME CEVAP VER: SATIS veya DESTEK veya SOHBET veya DIGER
    `;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', 
            temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        
        let content = response.data.choices[0].message.content.toUpperCase();
        if (content.includes('SATIS')) return 'SATIS';
        if (content.includes('DESTEK')) return 'DESTEK';
        if (content.includes('SOHBET')) return 'SOHBET';
        return 'SATIS'; // Emin olamazsan satış varsay
    } catch (e) { return 'SATIS'; }
}

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
