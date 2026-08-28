/*
  YOUTUBE.js — YouTube Data API v3 resumable upload + thumbnail
  Same login (token) as Drive.js reuses — Drive.getAccessToken() already
  has the youtube.upload + youtube.force-ssl scopes granted together.
*/

const YouTube = (() => {

  // Starts a resumable upload session with the video's metadata already
  // attached (title/description/tags/privacy). Returns the session URL.
  async function startResumableSession({ title, description, tags, privacy }) {
    const token = Drive.getAccessToken();
    const body = {
      snippet: {
        title: title || "Apna Style Study Lecture",
        description: description || "",
        tags: tags && tags.length ? tags : undefined
      },
      status: { privacyStatus: privacy || "unlisted" }
    };
    const res = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("YouTube upload session start fail hua: " + res.status);
    return res.headers.get("Location");
  }

  // Intermediate chunk — same 256 KiB alignment rule as Drive applies here too.
  async function uploadChunk(sessionUrl, blobChunk, rangeStart) {
    const rangeEnd = rangeStart + blobChunk.size - 1;
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${rangeStart}-${rangeEnd}/*` },
      body: blobChunk
    });
    if (res.status === 308) return { done: false };
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, videoId: data.id };
    }
    throw new Error("YouTube chunk upload fail hua: " + res.status);
  }

  // Final chunk — known total size, closes the upload out.
  async function uploadFinalChunk(sessionUrl, blobChunk, rangeStart, totalSize) {
    const rangeEnd = rangeStart + blobChunk.size - 1;
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${totalSize}` },
      body: blobChunk
    });
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, videoId: data.id };
    }
    throw new Error("YouTube final chunk upload fail hua: " + res.status);
  }

  async function finalizeUpload(sessionUrl, totalSize) {
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes */${totalSize}` }
    });
    if (res.status === 200 || res.status === 201) {
      const data = await res.json();
      return { done: true, videoId: data.id };
    }
    throw new Error("YouTube finalize fail hua: " + res.status);
  }

  // Sets a custom thumbnail. Note: YouTube only allows custom thumbnails
  // on phone-verified channels — if the channel isn't verified this will
  // fail with a 403, which we surface but don't treat as a fatal error
  // (the video itself is already uploaded fine).
  async function setThumbnail(videoId, imageBlob) {
    const token = Drive.getAccessToken();
    const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": imageBlob.type || "image/jpeg"
      },
      body: imageBlob
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Thumbnail set fail hua (${res.status}). ${txt}`);
    }
    return res.json();
  }

  return { startResumableSession, uploadChunk, uploadFinalChunk, finalizeUpload, setThumbnail };
})();
