/*
  ================================================================
  APNA STYLE STUDY — CONFIG
  ================================================================
  Google Drive par recordings upload karne ke liye tumhe do cheezein
  Google Cloud Console (console.cloud.google.com) se free me leni hongi:

  1. OAuth Client ID   -> "APIs & Services > Credentials > Create OAuth client ID"
                          Application type: "Web application"
                          Authorized JavaScript origins me apna GitHub Pages URL daalo
                          e.g. https://<username>.github.io

  2. API Key           -> "APIs & Services > Credentials > Create API key"
                          (Drive API ke liye restrict kar dena, safe rahega)

  Ye dono niche paste kar do. Poora setup guide README.md me hai.

  NOTE: Drive aur YouTube ke scopes ab do ALAG requests me maange jaate
  hain (do alag login popups). Google ek hi consent screen me YouTube
  ke restricted scope ko Drive ke scope ke saath maangne se deny kar
  deta hai ("scopes that cannot be requested together" error) — isliye
  ye split zaroori hai. youtube.force-ssl bhi hata diya hai kyunki
  thumbnail set karne ke liye sirf youtube.upload hi kaafi hai.
  ================================================================
*/

const CONFIG = {
  GOOGLE_CLIENT_ID: "103117215308-p6udj0ikgfboqmu7aepfnqlohgsqh87t.apps.googleusercontent.com",
  GOOGLE_API_KEY: "PASTE_YOUR_API_KEY_HERE",
  // Do alag scope groups — do alag OAuth requests me maange jaayenge
  DRIVE_SCOPES: "https://www.googleapis.com/auth/drive.file",
  YOUTUBE_SCOPES: "https://www.googleapis.com/auth/youtube.upload",
  DRIVE_FOLDER_NAME: "Apna Style Study Recordings",
  UPLOAD_CHUNK_MB: 4 // har kitne MB ka chunk record hote hi upload ho
};
