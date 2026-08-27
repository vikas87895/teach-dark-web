/*
  DRIVE.js — Google Identity Services (OAuth) + Drive v3 resumable upload
  Chunk-by-chunk upload hota hai taaki recording ke saath-saath video
  Drive par jaati rahe aur device ka storage bharke na rakhe.
*/

const Drive = (() => {
  let tokenClient = null;
  let accessToken = null;
  let folderId = null;

  function ready() {
    return !!(window.google && google.accounts && google.accounts.oauth2);
  }

  function signIn() {
    return new Promise((resolve, reject) => {
      if (!ready()) return reject(new Error("Google script load nahi hua. Internet check karo."));
      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          scope: CONFIG.DRIVE_SCOPE,
          callback: (resp) => {
            if (resp.error) return reject(resp);
            accessToken = resp.access_token;
            resolve(accessToken);
          }
        });
      }
      tokenClient.callback = (resp) => {
        if (resp.error) return reject(resp);
        accessToken = resp.access_token;
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
    });
  }

  function isSignedIn() {
    return !!accessToken;
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

  // Uploads one chunk. Total size is always sent as "*" (unknown) during
  // recording — we never guess which chunk is "the last one" here, which
  // removes the race condition that used to leave uploads unfinished.
  async function uploadChunk(sessionUrl, blobChunk, rangeStart) {
    const rangeEnd = rangeStart + blobChunk.size - 1;
    const contentRange = `bytes ${rangeStart}-${rangeEnd}/*`;
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Length": blobChunk.size,
        "Content-Range": contentRange
      },
      body: blobChunk
    });
    if (res.status === 308) return { done: false }; // expected: more data coming
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, fileId: data.id }; // rare but handle it just in case
    }
    throw new Error("Chunk upload fail hua: " + res.status);
  }

  // Call this ONCE, only after the recorder has fully stopped AND every
  // queued chunk has finished uploading. Tells Drive "that's everything,
  // total size was X" so it finalizes the file properly.
  async function finalizeUpload(sessionUrl, totalSize) {
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Length": "0",
        "Content-Range": `bytes */${totalSize}`
      }
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

  return { signIn, isSignedIn, startResumableSession, uploadChunk, finalizeUpload, makeShareable };
})();
