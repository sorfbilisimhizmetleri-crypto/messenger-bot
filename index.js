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

  if (!users[userId]) users[userId] = { step: 'bos' };
  const user = users[userId];

  // ===== İPTAL / BAŞA DÖN =====
  if (['iptal', 'başa dön', 'reset'].includes(text)) {
      users[userId] = { step: 'bos' };
      await sendMessage(userId, "Sipariş işlemi iptal edildi. Nasıl yardımcı olabilirim?");
      return res.sendStatus(200);
  }

  // ===== SİPARİŞ BAŞLATMA TETİĞİ =====
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

  // 🔥🔥🔥 YENİ EKLENEN KISIM: TOPLU BİLGİ ANALİZİ 🔥🔥🔥
  // Eğer kullanıcı sipariş sürecindeyse (paket, isim, telefon, adres adımlarındaysa)
  // Gelen mesajı analiz et: İçinde isim, tel veya adres var mı?
  if (['paket', 'isim', 'telefon', 'adres'].includes(user.step)) {
      
      // AI ile mesajın içindeki gizli bilgileri çek
      const extracted = await extractOrderDetails(message);
      
      // Eğer AI bir şeyler bulduysa hafızaya kaydet
      if (extracted.isim) user.isim = extracted.isim;
      if (extracted.telefon) user.telefon = extracted.telefon;
      if (extracted.adres) user.adres = extracted.adres;
      if (extracted.paket) {
          // Paketi de metinden yakaladıysa (örn: "1 kavanoz istiyorum adım ahmet...")
           user.paket = extracted.paket === '1' ? '1 Kavanoz – 699 TL' :
                        extracted.paket === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
                        '4 Kavanoz + Krem + Damla – 1600 TL';
      }

      // ŞİMDİ HANGİ ADIMDA OLDUĞUMUZU GÜNCELLEYELİM
      // Bilgiler doldukça bot otomatik olarak sonraki adıma atlayacak.
      if (!user.paket) user.step = 'paket';
      else if (!user.isim) user.step = 'isim';
      else if (!user.telefon) user.step = 'telefon';
      else if (!user.adres) user.step = 'adres';
      else user.step = 'bitti_onay'; // Her şey tamsa bitişe yönlendir
  }
  // 🔥🔥🔥 BİTİŞ 🔥🔥🔥


  // ==========================================
  // ADIM 1: PAKET SEÇİMİ
  // ==========================================
  if (user.step === 'paket') {
    // Yukarıdaki analiz paketi bulamadıysa buradan devam eder
    let selectedPackage = null;
    if (text === '1' || text === '2' || text === '3') selectedPackage = text;
    else {
        const aiAnalysis = await analyzePackageIntent(message);
        if (aiAnalysis.selection) selectedPackage = aiAnalysis.selection;
        else return sendMessage(userId, aiAnalysis.reply + "\n\n(Lütfen 1, 2 veya 3 seçeneğini belirtiniz.)");
    }

    if (selectedPackage) {
      user.paket = selectedPackage === '1' ? '1 Kavanoz – 699 TL' :
                   selectedPackage === '2' ? '2 Kavanoz + Krem + Damla – 1000 TL' :
                   '4 Kavanoz + Krem + Damla – 1600 TL';
      user.step = 'isim'; // Sonraki adıma geç
      return sendMessage(userId, `✅ ${user.paket} seçildi.\n\nAd Soyad alabilir miyim?`);
    }
  }

  // ==========================================
  // ADIM 2: İSİM ALMA
  // ==========================================
  if (user.step === 'isim') {
    // Eğer üstteki "Toplu Analiz" zaten ismi bulduysa bu if çalışmaz, direkt sonraki adıma geçer.
    // Bulamadıysa burası çalışır:
    const analysis = await analyzeInput(message, 'AD SOYAD');
    if (analysis.isValid) {
        user.isim = message;
        user.step = 'telefon';
        return sendMessage(userId, 'Telefon numaranızı yazar mısınız?');
    } else return sendMessage(userId, analysis.reply);
  }

  // ==========================================
  // ADIM 3: TELEFON ALMA
  // ==========================================
  if (user.step === 'telefon') {
    if (user.telefon) { // Zaten bulunduysa direkt geç
         user.step = 'adres';
         return sendMessage(userId, 'Açık adresinizi yazar mısınız?');
    }

    const analysis = await analyzeInput(message, 'TELEFON NUMARASI');
    if (analysis.isValid) {
        user.telefon = message;
        user.step = 'adres';
        return sendMessage(userId, 'Açık adresinizi yazar mısınız?');
    } else return sendMessage(userId, analysis.reply);
  }

  // ==========================================
  // ADIM 4: ADRES ALMA
  // ==========================================
  if (user.step === 'adres') {
     if (user.adres) { // Zaten bulunduysa direkt bitirelim
         user.step = 'bitti_onay';
     } else {
        const analysis = await analyzeInput(message, 'AÇIK ADRES');
        if (analysis.isValid) {
            user.adres = message;
            user.step = 'bitti_onay';
        } else return sendMessage(userId, analysis.reply);
     }
  }

  // ==========================================
  // SONUÇ: SİPARİŞ TAMAMLANDI
  // ==========================================
  if (user.step === 'bitti_onay') {
      await sendToSheet(user);
      console.log('SİPARİŞ TAMAM:', user);

      await sendMessage(
        userId,
        `✅ Siparişiniz alınmıştır!

📦 ${user.paket}
👤 ${user.isim}
📞 ${user.telefon}
📍 ${user.adres}

🚚 Ücretsiz kargo ile yola çıkacaktır.`
      );
      
      users[userId] = { step: 'bos' }; // Resetle
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
// 🧠 SİHİRLİ FONKSİYON: TOPLU BİLGİ AYIKLAMA
// =======================
async function extractOrderDetails(userMessage) {
    // Bu prompt, mesajın içindeki parçaları JSON formatında çekip alır.
    const PROMPT = `
GÖREV: Aşağıdaki mesajı analiz et ve sipariş bilgilerini çıkar.
MESAJ: "${userMessage}"

ÇIKARILACAK BİLGİLER:
1. isim: Kişi adı ve soyadı (Yoksa null)
2. telefon: Telefon numarası (Yoksa null)
3. adres: Mahalle, sokak, il, ilçe içeren adres metni (Yoksa null)
4. paket: Eğer "1 kavanoz", "2 adet" gibi miktar belirtilmişse 1, 2 veya 3 olarak kodla (Yoksa null).

CEVAP FORMATI (Sadece JSON):
{"isim": "...", "telefon": "...", "adres": "...", "paket": "..."}

Eğer bilgi yoksa o alan null olsun.
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [{ role: 'system', content: PROMPT }]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` }
        });

        let content = response.data.choices[0].message.content;
        // JSON temizliği (bazen markdown içine alır)
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(content);
    } catch (e) {
        console.error("Extract hatası:", e.message);
        return { isim: null, telefon: null, adres: null, paket: null };
    }
}

// =======================
// MEVCUT FONKSİYONLAR (Aynen korundu)
// =======================
async function analyzePackageIntent(userMessage) {
    // ... (Önceki kodundaki aynı fonksiyon)
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
        return { selection: null, reply: c };
    } catch (e) { return { selection: null, reply: "Hata." }; }
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
    } catch (e) { return { isValid: false, reply: "Hata." }; }
}

async function askGPT(message, prompt) {
    // ... (Standart sohbet fonksiyonun)
    try {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini', messages: [{role:'system',content:prompt},{role:'user',content:message}]
        }, { headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}` } });
        return r.data.choices[0].message.content;
    } catch(e) { return "Hata."; }
}

async function sendMessage(userId, text) {
  try {
      await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_TOKEN}`,
        { recipient: { id: userId }, message: { text } }
      );
  } catch (e) { console.error("Mesaj hatası:", e.message); }
}

async function sendToSheet(order) {
    // ... (Sheets fonksiyonun)
    try { await axios.post('https://script.google.com/macros/s/AKfycbxFM_LfxPHyWo1fI5g_nGZckMUOtKWqsOftIsvcjLmVSLfp9TEc_6aErUoyevuPVfIa/exec', 
    { name: order.isim, phone: order.telefon, address: order.adres, package: order.paket }); } 
    catch (e) { console.error(e); }
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Bot çalışıyor 🚀');
});
