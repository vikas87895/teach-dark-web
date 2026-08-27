# Apna Style Study — Teach & Record Platform

Pura static website hai (HTML/CSS/JS), GitHub Pages pe directly chal jaayega — koi backend/server nahi chahiye.

## Kya-kya hai

- **index.html** — PDF/image source upload karo, apna logo upload karo, "Teach" button se lecture shuru karo
- **teach.html** — PDF ke upar pen / highlighter / rectangle / circle / line / animated text tools se likho, record karo (mic + tumhari drawing dono record hoti hai), recording chunk-by-chunk Google Drive pe upload hoti hai
- **gallery.html ("Apna Style Study")** — saari recordings yahan, upload ke baad title/description daalne ka form

Sab kuch browser me hi save hota hai (IndexedDB/localStorage) — GitHub Pages static hai isliye actual files server par store nahi ho sakti. Sirf recorded **video** Google Drive pe jaati hai.

---

## Setup — Google Drive upload ke liye (5 min, ek baar karna hai)

1. [console.cloud.google.com](https://console.cloud.google.com) par jao, naya project banao (ya purana use karo)
2. **APIs & Services → Library** → "Google Drive API" search karke **Enable** karo
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins me apna GitHub Pages URL daalo:
     `https://<tumhara-username>.github.io`
   - (local test ke liye `http://localhost:5500` bhi add kar sakte ho)
   - Save karo, jo Client ID milega use copy karo
4. **OAuth consent screen** tab me jaake app ko "Testing" mode me apni Google email ko test user ke roop me add karo (warna login pe error aayega)
5. `js/config.js` file kholo, `GOOGLE_CLIENT_ID` ki jagah apna client ID paste karo

Bas itna hi chahiye — API key ki zaroorat nahi (sirf OAuth se kaam ho jaata hai).

Teach page kholne par top-right me **"🔗 Drive Connect"** button dabao, Google login hoga, uske baad jo bhi record karoge wo seedha tumhari Drive ke "Apna Style Study Recordings" folder me chali jaayegi.

**Agar Drive connect nahi karte** to bhi recording ho jaayegi — bas wo device (browser) me hi rahegi aur record khatam hone par "Save" button se download kar paoge. Chhoti recordings ke liye ye theek hai, lambi recordings ke liye Drive connect karna better hai.

---

## GitHub Pages par deploy kaise karein

1. Naya GitHub repo banao (e.g. `apna-style-study`)
2. Is poori folder ki saari files usme push kar do
3. Repo **Settings → Pages** → Source: `main` branch, `/ (root)` → Save
4. 1-2 min baad `https://<username>.github.io/apna-style-study/` par live ho jaayega
5. Wahi URL wapas jaake Google Cloud Console ke "Authorized JavaScript origins" me daal dena (step 3 upar)

---

## Honest notes — kya solid hai, kya test karke dekhna hai

✅ **Pakka kaam karega:** source upload, PDF/image viewer, pen/highlighter/shapes/text drawing, undo/clear, logo overlay, gallery listing, title/description editing.

⚠️ **Test karke dekhna** (browser API dependent, yahan directly run karke verify nahi kar saka):
- **Chunked Drive upload** — recording ke chunks (~har 4 second) sequentially Google ke resumable-upload session ko bheje jaate hain. Google ki spec chahti hai ki har chunk (last ko chhodkar) 256 KB ka multiple ho — MediaRecorder ke time-based chunks isse thoda mismatch kar sakte hain. Agar upload beech me error de, sabse pehla fix: `teach.html` me `mediaRecorder.start(4000)` ki jagah bada number try karo (e.g. `8000` ya `15000`) taaki chunks bade bane.
- Multi-page PDF par annotation abhi per-page save nahi hoti (page badalte hi drawing clear ho jaati hai) — agar chahiye to bata dena, add kar dunga.
- Video thumbnail preview gallery me directly `<video>` tag se aata hai; Drive-uploaded videos ka preview thumbnail Drive ke link se nahi aata (sirf "▶ Open" button khulta hai Drive par).

Koi bhi cheez adjust karni ho ya extra feature chahiye ho (jaise per-page annotations save karna, multiple logos, ya recording ko YouTube par bhi seedha upload karna), bata dena — agli iteration me add kar dunga.
