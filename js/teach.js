pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const params = new URLSearchParams(location.search);
const sourceId = params.get("source");

const stage = document.getElementById("stage");
const pdfCanvas = document.getElementById("pdfCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const pdfCtx = pdfCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");
const statusLine = document.getElementById("status-line");
const logoImg = document.getElementById("logoImg");

let pdfDoc = null, currentPage = 1, totalPages = 1;
let isImageSource = false;

// ------------------------------------------------------------------
// Load source (PDF or image) from IndexedDB
// ------------------------------------------------------------------
async function loadSource() {
  if (!sourceId) { setStatus("Koi source select nahi hua. index.html se ek source choose karo.", true); return; }
  const blob = await DB.getSourceFile(sourceId);
  if (!blob) { setStatus("Source file nahi mili (delete ho chuki ho sakti hai).", true); return; }

  if (blob.type === "application/pdf") {
    isImageSource = false;
    const buf = await blob.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    totalPages = pdfDoc.numPages;
    document.getElementById("pageNav").style.display = totalPages > 1 ? "flex" : "none";
    await renderPage(1);
  } else {
    isImageSource = true;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      setStageSize(img.naturalWidth, img.naturalHeight);
      pdfCtx.drawImage(img, 0, 0, pdfCanvas.width, pdfCanvas.height);
    };
    img.src = url;
  }
}

function setStageSize(w, h) {
  // cap width so it fits nicely on screen
  const maxW = Math.min(window.innerWidth - 60, 1100);
  const scale = w > maxW ? maxW / w : 1;
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  [pdfCanvas, drawCanvas].forEach(c => { c.width = cw; c.height = ch; });
  stage.style.width = cw + "px";
  stage.style.height = ch + "px";
}

async function renderPage(num) {
  const page = await pdfDoc.getPage(num);
  const viewport0 = page.getViewport({ scale: 1 });
  const maxW = Math.min(window.innerWidth - 60, 1100);
  const scale = maxW / viewport0.width;
  const viewport = page.getViewport({ scale });
  setStageSize(viewport.width, viewport.height);
  await page.render({ canvasContext: pdfCtx, viewport }).promise;
  currentPage = num;
  document.getElementById("pageLabel").textContent = `${currentPage} / ${totalPages}`;
  clearDraw(); // fresh page = fresh annotation layer
}

document.getElementById("prevPage").onclick = () => { if (currentPage > 1) renderPage(currentPage - 1); };
document.getElementById("nextPage").onclick = () => { if (currentPage < totalPages) renderPage(currentPage + 1); };

// ------------------------------------------------------------------
// Drawing tools
// ------------------------------------------------------------------
let tool = "pen";
let color = "#00ff9d";
let brushSize = 4;
let drawing = false;
let startX = 0, startY = 0;
let snapshotBeforeStroke = null;
const undoStack = [];

function setStatus(msg, isError) {
  statusLine.textContent = msg;
  statusLine.classList.toggle("live", !isError);
}

document.querySelectorAll(".tool-btn").forEach(btn => {
  if (!btn.id.startsWith("tool")) return;
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tool = btn.id.replace("tool", "").toLowerCase();
  });
});
document.querySelectorAll(".swatch").forEach(sw => {
  sw.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
    sw.classList.add("active");
    color = sw.dataset.c;
  });
});
document.getElementById("brushSize").addEventListener("input", e => brushSize = +e.target.value);

function pushUndo() {
  undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  if (undoStack.length > 30) undoStack.shift();
}
document.getElementById("undoBtn").onclick = () => {
  if (!undoStack.length) return;
  drawCtx.putImageData(undoStack.pop(), 0, 0);
};
document.getElementById("clearBtn").onclick = () => { pushUndo(); clearDraw(); };
function clearDraw() { drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); }

function getPos(e) {
  const r = drawCanvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
  return { x: cx * (drawCanvas.width / r.width), y: cy * (drawCanvas.height / r.height) };
}

drawCanvas.addEventListener("pointerdown", e => {
  const p = getPos(e);
  startX = p.x; startY = p.y;
  if (tool === "text") { addAnimatedText(p.x, p.y); return; }
  drawing = true;
  pushUndo();
  snapshotBeforeStroke = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
    drawCtx.beginPath();
    drawCtx.moveTo(p.x, p.y);
  }
});

drawCanvas.addEventListener("pointermove", e => {
  if (!drawing) return;
  const p = getPos(e);
  if (tool === "pen") {
    strokeTo(p, color, brushSize, 1, "source-over");
  } else if (tool === "highlighter") {
    strokeTo(p, color, brushSize * 3, 0.35, "source-over");
  } else if (tool === "eraser") {
    strokeTo(p, "#000", brushSize * 3, 1, "destination-out");
  } else if (["rect", "circle", "line"].includes(tool)) {
    drawCtx.putImageData(snapshotBeforeStroke, 0, 0);
    drawShapePreview(startX, startY, p.x, p.y);
  }
});

["pointerup", "pointerleave"].forEach(ev => drawCanvas.addEventListener(ev, () => { drawing = false; }));

function strokeTo(p, strokeColor, size, alpha, mode) {
  drawCtx.globalCompositeOperation = mode;
  drawCtx.globalAlpha = alpha;
  drawCtx.strokeStyle = strokeColor;
  drawCtx.lineWidth = size;
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.lineTo(p.x, p.y);
  drawCtx.stroke();
  drawCtx.globalAlpha = 1;
  drawCtx.globalCompositeOperation = "source-over";
}

function drawShapePreview(x1, y1, x2, y2) {
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = brushSize;
  drawCtx.beginPath();
  if (tool === "rect") {
    drawCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (tool === "circle") {
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    drawCtx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, rx, ry, 0, 0, Math.PI * 2);
    drawCtx.stroke();
  } else if (tool === "line") {
    drawCtx.moveTo(x1, y1);
    drawCtx.lineTo(x2, y2);
    drawCtx.stroke();
  }
}

// Animated text: fades + slides in over ~600ms, drawn straight onto the canvas
// so it is captured live while recording.
function addAnimatedText(x, y) {
  const txt = prompt("Text likho:");
  if (!txt) return;
  pushUndo();
  const start = performance.now();
  const dur = 550;
  function frame(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    drawCtx.save();
    drawCtx.globalAlpha = eased;
    drawCtx.fillStyle = color;
    drawCtx.font = `${18 + brushSize}px 'JetBrains Mono', monospace`;
    drawCtx.fillText(txt, x, y + (1 - eased) * 14);
    drawCtx.restore();
    if (p < 1) {
      // clear only this frame's text approx area isn't trivial on shared canvas,
      // so we just let final frame remain (earlier partial frames are faint & fine)
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------
// Logo overlay (draggable)
// ------------------------------------------------------------------
const logo = DB.getLogo();
if (logo) logoImg.src = logo;
let logoVisible = false;
document.getElementById("logoToggle").onclick = () => {
  if (!logo) { alert("Pehle index.html page se apna logo upload karo."); return; }
  logoVisible = !logoVisible;
  logoImg.style.display = logoVisible ? "block" : "none";
  if (logoVisible) { logoImg.style.right = "14px"; logoImg.style.top = "14px"; logoImg.style.left = "auto"; }
};
(function makeDraggable(el) {
  let dragging = false, offX = 0, offY = 0;
  el.addEventListener("pointerdown", e => {
    dragging = true;
    const r = el.getBoundingClientRect();
    offX = e.clientX - r.left; offY = e.clientY - r.top;
  });
  window.addEventListener("pointermove", e => {
    if (!dragging) return;
    const stageRect = stage.getBoundingClientRect();
    el.style.left = (e.clientX - stageRect.left - offX) + "px";
    el.style.top = (e.clientY - stageRect.top - offY) + "px";
    el.style.right = "auto";
  });
  window.addEventListener("pointerup", () => dragging = false);
})(logoImg);

// ------------------------------------------------------------------
// Google Drive/YouTube sign-in (persists across refresh once connected)
// ------------------------------------------------------------------
const driveSignInBtn = document.getElementById("driveSignInBtn");
const youtubeSignInBtn = document.getElementById("youtubeSignInBtn");

// Drive connect: seedha click se popup khulta hai. Kaamyaab hote hi
// YouTube Connect button reveal ho jaata hai — usko dabana ek naya,
// alag click hai isliye uska popup kabhi block nahi hota.
async function connectGoogle(showConsentIfNeeded) {
  try {
    setStatus("Google Drive se connect ho raha hai...");
    await Drive.signIn();
    setStatus("Drive Connected ✅ — ab 'YouTube Connect' bhi dabao (YouTube upload ke liye zaroori hai, Drive-only recording ke liye zaroori nahi).");
    driveSignInBtn.textContent = "✅ Drive Connected";
    youtubeSignInBtn.style.display = "inline-block";
  } catch (e) {
    console.error(e);
    if (showConsentIfNeeded) setStatus("Drive connect fail hua. config.js me CLIENT_ID check karo, ya popup blocker check karo.", true);
  }
}
driveSignInBtn.onclick = () => connectGoogle(true);

// YouTube connect: apna khud ka fresh click, Drive login se poori tarah
// alag — isliye browser ka popup blocker ise kabhi nahi rokta.
async function connectYouTube() {
  try {
    setStatus("YouTube se connect ho raha hai...");
    await Drive.signInYouTube();
    setStatus("YouTube Connected ✅ — ab YouTube target select karke record kar sakte ho.");
    youtubeSignInBtn.textContent = "✅ YouTube Connected";
  } catch (e) {
    console.error(e);
    setStatus("YouTube connect fail/deny hua. Drive upload phir bhi kaam karega.", true);
  }
}
youtubeSignInBtn.onclick = connectYouTube;

// Auto-attempt on every page load: if we connected before and the Google
// browser session is still active, this reconnects silently — no click,
// no popup (silent token refresh, so chaining both here is safe).
(async function attemptAutoReconnect() {
  // give the Google script a moment to finish loading
  for (let i = 0; i < 20 && !ready_gsi(); i++) await new Promise(r => setTimeout(r, 150));
  function ready_gsi() { return !!(window.google && google.accounts && google.accounts.oauth2); }
  try {
    await Drive.trySilentSignIn();
    setStatus("Connected ✅ (auto-reconnect) — record karke seedha upload hoga.");
    driveSignInBtn.textContent = "✅ Drive Connected";
    if (Drive.getYouTubeAccessToken()) {
      youtubeSignInBtn.textContent = "✅ YouTube Connected";
      youtubeSignInBtn.style.display = "inline-block";
    } else {
      youtubeSignInBtn.style.display = "inline-block";
    }
  } catch (e) {
    // silent attempt failed (never connected before, or session expired) — that's fine, button stays clickable
  }
})();

// ------------------------------------------------------------------
// Upload target: Drive vs YouTube
// ------------------------------------------------------------------
let uploadTarget = "drive";
const targetDriveBtn = document.getElementById("targetDrive");
const targetYoutubeBtn = document.getElementById("targetYoutube");
targetDriveBtn.onclick = () => { uploadTarget = "drive"; targetDriveBtn.classList.add("active"); targetYoutubeBtn.classList.remove("active"); };
targetYoutubeBtn.onclick = () => { uploadTarget = "youtube"; targetYoutubeBtn.classList.add("active"); targetDriveBtn.classList.remove("active"); };

// ------------------------------------------------------------------
// Keyboard: Left/Right arrows move between slides
// ------------------------------------------------------------------
document.addEventListener("keydown", e => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return; // don't hijack typing
  if (!pdfDoc || totalPages <= 1) return;
  if (e.key === "ArrowRight") { if (currentPage < totalPages) renderPage(currentPage + 1); }
  else if (e.key === "ArrowLeft") { if (currentPage > 1) renderPage(currentPage - 1); }
});

// ------------------------------------------------------------------
// Recording + progressive (chunked) upload
// ------------------------------------------------------------------
const recBtn = document.getElementById("recBtn");
const recLabel = document.getElementById("recLabel");
const ytModal = document.getElementById("ytModal");
const ytThumbInput = document.getElementById("ytThumbInput");
const thumbPreview = document.getElementById("thumbPreview");
let ytThumbBlob = null;

ytThumbInput.onchange = () => {
  const f = ytThumbInput.files[0];
  if (!f) return;
  ytThumbBlob = f;
  thumbPreview.src = URL.createObjectURL(f);
  thumbPreview.style.display = "block";
};
document.getElementById("ytCancel").onclick = () => { ytModal.style.display = "none"; };
document.getElementById("ytConfirm").onclick = () => {
  const title = document.getElementById("ytTitle").value.trim();
  if (!title) { alert("Title daalna zaroori hai."); return; }
  ytModal.style.display = "none";
  const meta = {
    title,
    description: document.getElementById("ytDesc").value.trim(),
    tags: document.getElementById("ytTags").value.split(",").map(t => t.trim()).filter(Boolean),
    privacy: document.getElementById("ytPrivacy").value,
    thumbnail: ytThumbBlob
  };
  startRecording(meta);
};

let mediaRecorder = null;
let recording = false;
let compositeStream = null;
let compositeRAF = null;
let sessionUrl = null;
let uploadOffset = 0;       // bytes already confirmed uploaded to Drive
let pendingBuffer = [];     // Blob pieces recorded but not yet sent
let pendingBytes = 0;
let uploadingChunk = false;
let recorderStopped = false;
let localChunksFallback = []; // used if Drive isn't connected
let currentYtMeta = null;
const CHUNK_ALIGN = 262144 * 4; // 1 MiB — must be a multiple of 256 KiB per Drive's API rules
let recordStartTime = 0;
let timerInterval = null;

// offscreen canvas that composites pdf + drawings live, every frame,
// this is what actually gets recorded (so PDF + pen + highlighter + shapes + text all show)
const recordCanvas = document.createElement("canvas");
const recordCtx = recordCanvas.getContext("2d");

function startCompositeLoop() {
  recordCanvas.width = pdfCanvas.width;
  recordCanvas.height = pdfCanvas.height;
  function loop() {
    recordCtx.drawImage(pdfCanvas, 0, 0);
    recordCtx.drawImage(drawCanvas, 0, 0);
    if (logoVisible) {
      const r = logoImg.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const scaleX = recordCanvas.width / sr.width, scaleY = recordCanvas.height / sr.height;
      recordCtx.drawImage(logoImg, (r.left - sr.left) * scaleX, (r.top - sr.top) * scaleY, r.width * scaleX, r.height * scaleY);
    }
    compositeRAF = requestAnimationFrame(loop);
  }
  loop();
}
function stopCompositeLoop() { if (compositeRAF) cancelAnimationFrame(compositeRAF); }

recBtn.onclick = async () => {
  if (recording) { stopRecording(); return; }
  if (uploadTarget === "youtube") {
    if (!Drive.isSignedIn()) { alert("Pehle Google Connect karo."); return; }
    if (!Drive.getYouTubeAccessToken()) { alert("YouTube login connect nahi hua. 'Connect' button dobara dabao aur dono popups allow karo."); return; }
    ytModal.style.display = "flex";
    document.getElementById("ytTitle").focus();
  } else {
    startRecording(null);
  }
};

async function startRecording(ytMeta) {
  currentYtMeta = ytMeta;
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    startCompositeLoop();
    const canvasStream = recordCanvas.captureStream(30);
    compositeStream = new MediaStream([...canvasStream.getVideoTracks(), ...mic.getAudioTracks()]);

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus" : "video/webm";
    mediaRecorder = new MediaRecorder(compositeStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });

    uploadOffset = 0; pendingBuffer = []; pendingBytes = 0; localChunksFallback = [];
    sessionUrl = null; recorderStopped = false;

    if (ytMeta) {
      setStatus("YouTube upload session shuru ho rahi hai...");
      sessionUrl = await YouTube.startResumableSession(ytMeta);
    } else if (Drive.isSignedIn()) {
      setStatus("Drive session shuru ho rahi hai...");
      sessionUrl = await Drive.startResumableSession(`ASS_${Date.now()}.webm`, "video/webm");
    } else {
      setStatus("⚠️ Drive connected nahi hai — recording is device pe hi jama hogi (chhoti recordings ke liye theek hai).");
    }

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        if (sessionUrl) { pendingBuffer.push(e.data); pendingBytes += e.data.size; runUploadWorker(); }
        else { localChunksFallback.push(e.data); }
      }
    };
    mediaRecorder.onstop = async () => {
      stopCompositeLoop();
      mic.getTracks().forEach(t => t.stop());
      recorderStopped = true;
      try {
        if (sessionUrl) {
          await runUploadWorker(); // will drain remaining buffer, then finalize
        } else if (localChunksFallback.length) {
          finishLocalRecording();
        } else {
          setStatus("Recording khali thi, kuch record nahi hua.", true);
        }
      } catch (err) {
        console.error(err);
        setStatus("⚠️ Upload me error aayi: " + err.message + " — F12 se console check karo.", true);
      } finally {
        recBtn.disabled = false;
      }
    };

    mediaRecorder.start(4000); // emit a chunk every 4 seconds -> uploads progressively
    recording = true;
    recBtn.classList.add("live");
    recLabel.textContent = "Stop";
    recordStartTime = Date.now();
    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - recordStartTime) / 1000);
      const label = sessionUrl ? (ytMeta ? " — YouTube par upload ho raha hai" : " — Drive par upload ho raha hai") : "";
      setStatus(`🔴 Recording... ${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}` + label);
    }, 500);
  } catch (e) {
    console.error(e);
    setStatus("Recording start nahi ho payi. Mic permission diya kya?", true);
  }
}

function stopRecording() {
  recording = false;
  recBtn.classList.remove("live");
  recLabel.textContent = "Record";
  recBtn.disabled = true;
  clearInterval(timerInterval);
  setStatus("⏳ Recording ruk gayi, upload finish ho raha hai... (page band mat karo)");
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

// Slices exactly `size` bytes off the front of pendingBuffer, leaving the
// remainder behind for next time. Needed because MediaRecorder's chunks
// almost never land on a 256 KiB boundary by themselves.
function takeFromBuffer(size) {
  const merged = new Blob(pendingBuffer);
  const piece = merged.slice(0, size);
  const rest = merged.slice(size);
  pendingBuffer = rest.size > 0 ? [rest] : [];
  pendingBytes = rest.size;
  return piece;
}

async function completeUpload(id) {
  if (currentYtMeta) {
    let thumbWarning = "";
    if (currentYtMeta.thumbnail) {
      try { await YouTube.setThumbnail(id, currentYtMeta.thumbnail); }
      catch (err) { console.error(err); thumbWarning = " (thumbnail set nahi ho paya — video phone-verified channel chahiye custom thumbnail ke liye)"; }
    }
    const link = `https://youtu.be/${id}`;
    saveVideoMeta({ youtubeId: id, link, title: currentYtMeta.title, description: currentYtMeta.description, sizeBytes: uploadOffset, platform: "youtube" });
    setStatus("✅ YouTube par upload complete!" + thumbWarning + " Gallery me ja rahe hain...");
  } else {
    const info = await Drive.makeShareable(id);
    saveVideoMeta({ driveFileId: id, link: info.webViewLink || "", sizeBytes: uploadOffset, platform: "drive" });
    setStatus("✅ Upload complete! Gallery me ja rahe hain...");
  }
  setTimeout(() => location.href = `gallery.html?edit=${lastSavedVideoId}`, 900);
}

// Single worker: while recording, only sends data in clean 1 MiB-aligned
// chunks (Drive/YouTube both require multiples of 256 KiB for every chunk
// except the last). Once the recorder has fully stopped, it sends whatever
// remains as the final chunk with the now-known total size, which closes
// the upload out properly in one call — no more guessing which chunk is
// "the last one". Works against whichever service (Drive or YouTube) the
// current recording targeted.
async function runUploadWorker() {
  if (uploadingChunk) return;
  uploadingChunk = true;
  const Svc = currentYtMeta ? YouTube : Drive;
  const targetLabel = currentYtMeta ? "YouTube" : "Drive";
  try {
    while (true) {
      if (!recorderStopped) {
        if (pendingBytes < CHUNK_ALIGN) break; // not enough buffered yet, wait for more
        const sendSize = Math.floor(pendingBytes / CHUNK_ALIGN) * CHUNK_ALIGN;
        const piece = takeFromBuffer(sendSize);
        try {
          await Svc.uploadChunk(sessionUrl, piece, uploadOffset);
          uploadOffset += piece.size;
          setStatus(`🔴 Recording... ${targetLabel} par upload ho raha hai (${(uploadOffset / 1024 / 1024).toFixed(1)} MB)`);
        } catch (err) {
          console.error(err);
          pendingBuffer.unshift(piece); pendingBytes += piece.size; // put it back
          setStatus("⚠️ Upload chunk fail hua, retry ho raha hai...", true);
          await new Promise(r => setTimeout(r, 2500));
        }
      } else {
        if (pendingBytes > 0) {
          const piece = takeFromBuffer(pendingBytes);
          const total = uploadOffset + piece.size;
          try {
            setStatus(`Final chunk upload ho raha hai... (${(total / 1024 / 1024).toFixed(1)} MB)`);
            const res = await Svc.uploadFinalChunk(sessionUrl, piece, uploadOffset, total);
            uploadOffset += piece.size;
            await completeUpload(currentYtMeta ? res.videoId : res.fileId);
          } catch (err) {
            console.error(err);
            pendingBuffer.unshift(piece); pendingBytes += piece.size;
            setStatus("⚠️ Final upload fail hua, retry ho raha hai...", true);
            await new Promise(r => setTimeout(r, 2500));
            continue;
          }
        } else if (uploadOffset > 0) {
          try {
            const res = await Svc.finalizeUpload(sessionUrl, uploadOffset);
            await completeUpload(currentYtMeta ? res.videoId : res.fileId);
          } catch (err) {
            console.error(err);
            setStatus("⚠️ Finalize fail hua, retry ho raha hai...", true);
            await new Promise(r => setTimeout(r, 2500));
            continue;
          }
        } else {
          setStatus("Recording khali thi, kuch upload nahi hua.", true);
        }
        break;
      }
    }
  } finally {
    uploadingChunk = false;
  }
}

let lastSavedVideoId = null;
function saveVideoMeta({ driveFileId, youtubeId, link, blobUrl, sizeBytes, title, description, platform }) {
  const id = DB.uid();
  lastSavedVideoId = id;
  const list = DB.getVideosMeta();
  list.unshift({
    id, title: title || "", description: description || "",
    driveFileId: driveFileId || null, youtubeId: youtubeId || null,
    link: link || "", blobUrl: blobUrl || null, platform: platform || (blobUrl ? "local" : "drive"),
    sizeBytes: sizeBytes || 0, createdAt: Date.now()
  });
  DB.setVideosMeta(list);
}

function finishLocalRecording() {
  const blob = new Blob(localChunksFallback, { type: "video/webm" });
  const url = URL.createObjectURL(blob);
  saveVideoMeta({ blobUrl: url, sizeBytes: blob.size });
  setStatus("✅ Recording ho gayi (device pe saved). Gallery me ja rahe hain...");
  setTimeout(() => location.href = `gallery.html?edit=${lastSavedVideoId}`, 900);
}

loadSource();
