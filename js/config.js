/*
  ================================================================
  APNA STYLE STUDY — CONFIG
  ================================================================
  Google isn't letting Drive + YouTube scopes coexist even in
  separate requests when they're declared together on the SAME
  Cloud project's OAuth consent screen. So Drive aur YouTube ab
  do ALAG Google Cloud projects se aate hain — do alag Client IDs.

  DRIVE Client ID:
  1. console.cloud.google.com par apna Drive-wala project kholo
  2. APIs & Services > Credentials > OAuth client ID > Web application
  3. Authorized JavaScript origins me apna GitHub Pages URL daalo
  4. Consent screen > Data Access me SIRF drive.file scope rakho

  YOUTUBE Client ID:
  1. Ek NAYA, alag Cloud project banao
  2. YouTube Data API v3 enable karo
  3. OAuth client ID (Web application) banao, wahi GitHub Pages URL
  4. Consent screen > Data Access me SIRF youtube.upload scope rakho

  API Key -> "APIs & Services > Credentials > Create API key"
             (Drive API ke liye restrict kar dena, safe rahega)
  ================================================================
*/

const CONFIG = {
  DRIVE_CLIENT_ID: "103117215308-p6udj0ikgfboqmu7aepfnqlohgsqh87t.apps.googleusercontent.com",
  YOUTUBE_CLIENT_ID: "519454741035-jm5mltqm1ltiojmpcl23rnu8c9s9mc89.apps.googleusercontent.com",
  GOOGLE_API_KEY: "PASTE_YOUR_API_KEY_HERE",
  DRIVE_SCOPES: "https://www.googleapis.com/auth/drive.file",
  YOUTUBE_SCOPES: "https://www.googleapis.com/auth/youtube.upload",
  DRIVE_FOLDER_NAME: "Apna Style Study Recordings",
  UPLOAD_CHUNK_MB: 4 // har kitne MB ka chunk record hote hi upload ho
};
