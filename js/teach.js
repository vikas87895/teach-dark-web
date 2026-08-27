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
// Google Drive sign-in
// ------------------------------------------------------------------
document.getElementById("driveSignInBtn").onclick = async () => {
  try {
    setStatus("Drive se connect ho raha hai...");
    await Drive.signIn();
    setStatus("Drive connected ✅ Ab record karke seedha upload hoga.");
    document.getElementById("driveSignInBtn").textContent = "✅ Drive Connected";
  } catch (e) {
    console.error(e);
    setStatus("Drive connect fail hua. config.js me CLIENT_ID check karo.", true);
  }
};

// ------------------------------------------------------------------
// Recording + progressive (chunked) upload
// ------------------------------------------------------------------
const recBtn = document.getElementById("recBtn");
const recLabel = document.getElementById("recLabel");
let mediaRecorder = null;
let recording = false;
let compositeStream = null;
let compositeRAF = null;
let sessionUrl = null;
let uploadOffset = 0;
let uploadQueue = [];
let uploadingChunk = false;
let localChunksFallback = []; // used if Drive isn't connected
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

recBtn.onclick = async () => { recording ? stopRecording() : startRecording(); };

async function startRecording() {
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    startCompositeLoop();
    const canvasStream = recordCanvas.captureStream(30);
    compositeStream = new MediaStream([...canvasStream.getVideoTracks(), ...mic.getAudioTracks()]);

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus" : "video/webm";
    mediaRecorder = new MediaRecorder(compositeStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });

    uploadOffset = 0; uploadQueue = []; localChunksFallback = [];
    sessionUrl = null;

    if (Drive.isSignedIn()) {
      setStatus("Drive session shuru ho rahi hai...");
      sessionUrl = await Drive.startResumableSession(`ASS_${Date.now()}.webm`, "video/webm");
    } else {
      setStatus("⚠️ Drive connected nahi hai — recording is device pe hi jama hogi (chhoti recordings ke liye theek hai).");
    }

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        if (sessionUrl) { uploadQueue.push(e.data); processQueue(false); }
        else { localChunksFallback.push(e.data); }
      }
    };
    mediaRecorder.onstop = async () => {
      stopCompositeLoop();
      mic.getTracks().forEach(t => t.stop());
      if (sessionUrl) {
        await processQueue(true); // flush + finalize with true total size
      } else if (localChunksFallback.length) {
        finishLocalRecording();
      }
    };

    mediaRecorder.start(4000); // emit a chunk every 4 seconds -> uploads progressively
    recording = true;
    recBtn.classList.add("live");
    recLabel.textContent = "Stop";
    recordStartTime = Date.now();
    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - recordStartTime) / 1000);
      setStatus(`🔴 Recording... ${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}` + (sessionUrl ? " — Drive par upload ho raha hai" : ""));
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
  clearInterval(timerInterval);
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

// Uploads chunks from uploadQueue one at a time (Drive resumable upload requires
// sequential, ordered chunks). `finalize`=true means this is the last flush after
// recording stopped — the last chunk is sent with the *known* total size.
async function processQueue(finalize) {
  if (uploadingChunk) { if (finalize) await waitForQueueDrain(); else return; }
  uploadingChunk = true;
  while (uploadQueue.length) {
    const isLast = finalize && uploadQueue.length === 1;
    const chunk = uploadQueue.shift();
    const total = isLast ? (uploadOffset + chunk.size) : "*";
    try {
      const res = await Drive.uploadChunk(sessionUrl, chunk, uploadOffset, total);
      uploadOffset += chunk.size;
      if (res.done) {
        const info = await Drive.makeShareable(res.fileId);
        saveVideoMeta({ driveFileId: res.fileId, link: info.webViewLink || "", sizeBytes: uploadOffset });
        setStatus("✅ Upload complete! Gallery me ja rahe hain...");
        setTimeout(() => location.href = `gallery.html?edit=${lastSavedVideoId}`, 900);
      }
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Upload chunk fail hua, retry ho raha hai...", true);
      uploadQueue.unshift(chunk); // retry
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  uploadingChunk = false;
  if (finalize && uploadOffset === 0) {
    // no data captured at all
    setStatus("Recording khali thi, kuch upload nahi hua.", true);
  }
}
function waitForQueueDrain() {
  return new Promise(resolve => {
    const iv = setInterval(() => { if (!uploadingChunk) { clearInterval(iv); resolve(); } }, 200);
  });
}

let lastSavedVideoId = null;
function saveVideoMeta({ driveFileId, link, blobUrl, sizeBytes }) {
  const id = DB.uid();
  lastSavedVideoId = id;
  const list = DB.getVideosMeta();
  list.unshift({
    id, title: "", description: "",
    driveFileId: driveFileId || null, link: link || "", blobUrl: blobUrl || null,
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
