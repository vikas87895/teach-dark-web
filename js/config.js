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
  ================================================================
*/

const CONFIG = {
  GOOGLE_CLIENT_ID: "103117215308-p6udj0ikgfboqmu7aepfnqlohgsqh87t.apps.googleusercontent.com",
  GOOGLE_API_KEY: "PASTE_YOUR_API_KEY_HERE",
  // Ek hi login me Drive + YouTube dono ki permission maang lete hain
  SCOPES: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl",
  DRIVE_FOLDER_NAME: "Apna Style Study Recordings",
  UPLOAD_CHUNK_MB: 4 // har kitne MB ka chunk record hote hi upload ho
};
