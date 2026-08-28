/*
  DRIVE.js — Google Identity Services (OAuth) + Drive v3 resumable upload
  Chunk-by-chunk upload hota hai taaki recording ke saath-saath video
  Drive par jaati rahe aur device ka storage bharke na rakhe.

  IMPORTANT: Drive aur YouTube ab do ALAG OAuth token clients use karte
  hain (do alag consent popups, ek ke baad ek). Google ek hi request me
  YouTube ka restricted scope aur Drive ka scope saath maangne se
  reject kar deta hai. signIn() / trySilentSignIn() dono ab andar hi
  andar dono logins kar lete hain — bahar ka interface (teach.js) same
  hi rehta hai, kuch change karne ki zaroorat nahi.
*/

const Drive = (() => {
  let driveTokenClient = null;
  let youtubeTokenClient = null;
  let accessToken = null;      // Drive token
  let youtubeAccessToken = null;
  let folderId = null;

  function ready() {
    return !!(window.google && google.accounts && google.accounts.oauth2);
  }

  function requestToken(client, scope, prompt) {
    return new Promise((resolve, reject) => {
      client.callback = (resp) => {
        if (resp.error) return reject(resp);
        resolve(resp.access_token);
      };
      client.requestAccessToken({ prompt });
    });
  }

  function getOrCreateDriveClient() {
    if (!driveTokenClient) {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.DRIVE_CLIENT_ID,
        scope: CONFIG.DRIVE_SCOPES,
        callback: () => {}
      });
    }
    return driveTokenClient;
  }

  function getOrCreateYouTubeClient() {
    if (!youtubeTokenClient) {
      youtubeTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.YOUTUBE_CLIENT_ID,
        scope: CONFIG.YOUTUBE_SCOPES,
        callback: () => {}
      });
    }
    return youtubeTokenClient;
  }

  // Sirf Drive connect karta hai — is button click se seedha popup khulta
  // hai (koi chaining nahi), isliye browser ka popup blocker ise kabhi
  // rokta nahi.
  async function signIn() {
    if (!ready()) throw new Error("Google script load nahi hua. Internet check karo.");
    accessToken = await requestToken(getOrCreateDriveClient(), CONFIG.DRIVE_SCOPES, accessToken ? "" : "consent");
    localStorage.setItem("ass_drive_connected", "1");
    return accessToken;
  }

  // Alag button se call hota hai — apna khud ka fresh click-triggered
  // popup, isliye pichle Drive login ke chained call ki tarah blocked
  // nahi hota.
  async function signInYouTube() {
    if (!ready()) throw new Error("Google script load nahi hua. Internet check karo.");
    youtubeAccessToken = await requestToken(getOrCreateYouTubeClient(), CONFIG.YOUTUBE_SCOPES, youtubeAccessToken ? "" : "consent");
    localStorage.setItem("ass_youtube_connected", "1");
    return youtubeAccessToken;
  }

  // Called automatically on page load. If the person connected before
  // (flag in localStorage) and their Google browser session is still
  // active, this gets fresh tokens silently — no click, no popup.
  async function trySilentSignIn() {
    if (!ready() || localStorage.getItem("ass_drive_connected") !== "1") {
      throw new Error("no-prior-connection");
    }
    accessToken = await requestToken(getOrCreateDriveClient(), CONFIG.DRIVE_SCOPES, "");

    if (localStorage.getItem("ass_youtube_connected") === "1") {
      try {
        youtubeAccessToken = await requestToken(getOrCreateYouTubeClient(), CONFIG.YOUTUBE_SCOPES, "");
      } catch (e) {
        console.warn("YouTube silent reconnect fail hua:", e);
      }
    }
    return accessToken;
  }

  function isSignedIn() {
    return !!accessToken;
  }

  function getAccessToken() {
    return accessToken;
  }

  function getYouTubeAccessToken() {
    return youtubeAccessToken;
  }

  function disconnect() {
    accessToken = null;
    youtubeAccessToken = null;
    localStorage.removeItem("ass_drive_connected");
    localStorage.removeItem("ass_youtube_connected");
  }

  async function ensureFolder() {
    if (folderId) return folderId;
    const q = encodeURIComponent(`name='${CONFIG.DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.files && data.files.length) {
      folderId = data.files[0].id;
      return folderId;
    }
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: CONFIG.DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" })
    });
    const created = await createRes.json();
    folderId = created.id;
    return folderId;
  }

  // Starts a resumable upload session, returns the session URL to PUT chunks to
  async function startResumableSession(filename, mimeType) {
    const fid = await ensureFolder();
    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({ name: filename, parents: [fid], mimeType })
    });
    if (!res.ok) throw new Error("Resumable session start fail hua: " + res.status);
    return res.headers.get("Location");
  }

  // Uploads an INTERMEDIATE chunk (recording still going, total size unknown).
  // IMPORTANT: per Google's resumable-upload rules, size must be a multiple
  // of 256 KiB (262144 bytes) for every chunk except the very last one.
  async function uploadChunk(sessionUrl, blobChunk, rangeStart) {
    const rangeEnd = rangeStart + blobChunk.size - 1;
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${rangeStart}-${rangeEnd}/*` },
      body: blobChunk
    });
    if (res.status === 308) return { done: false }; // expected: more data coming
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, fileId: data.id };
    }
    throw new Error("Chunk upload fail hua: " + res.status);
  }

  // Uploads the FINAL chunk once the recorder has stopped — this one can be
  // any size (no 256 KiB alignment needed) because we now tell Drive the
  // real total size, which finalizes the file in this same call.
  async function uploadFinalChunk(sessionUrl, blobChunk, rangeStart, totalSize) {
    const rangeEnd = rangeStart + blobChunk.size - 1;
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalSize}` },
      body: blobChunk
    });
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, fileId: data.id };
    }
    throw new Error("Final chunk upload fail hua: " + res.status);
  }

  // Edge case: recording stopped exactly on a 256 KiB boundary, so there's
  // no leftover data to send — this just tells Drive "that's the total,
  // you already have it all" and closes the file out.
  async function finalizeUpload(sessionUrl, totalSize) {
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes */${totalSize}` }
    });
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, fileId: data.id };
    }
    throw new Error("Upload finalize fail hua: " + res.status);
  }

  async function makeShareable(fileId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" })
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,webContentLink`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.json();
  }

  return {
    signIn, signInYouTube, trySilentSignIn, isSignedIn, getAccessToken, getYouTubeAccessToken,
    disconnect, startResumableSession, uploadChunk, uploadFinalChunk,
    finalizeUpload, makeShareable
  };
})();
