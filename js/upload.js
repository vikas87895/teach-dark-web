const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const sourcesGrid = document.getElementById("sourcesGrid");
const emptyState = document.getElementById("emptyState");
const logoInput = document.getElementById("logoInput");
const logoBtn = document.getElementById("logoBtn");
const logoRemoveBtn = document.getElementById("logoRemoveBtn");
const logoPreview = document.getElementById("logoPreview");

dropzone.addEventListener("click", () => fileInput.click());
["dragover", "dragenter"].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("drag"); })
);
dropzone.addEventListener("drop", e => {
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  const id = DB.uid();
  await DB.saveSourceFile(id, file);
  const meta = DB.getSourcesMeta();
  meta.unshift({
    id, name: file.name, type: file.type, size: file.size, addedAt: Date.now()
  });
  DB.setSourcesMeta(meta);
  render();
}

async function deleteSource(id) {
  if (!confirm("Ye source delete kar du?")) return;
  await DB.deleteSourceFile(id);
  DB.setSourcesMeta(DB.getSourcesMeta().filter(s => s.id !== id));
  render();
}

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function render() {
  const list = DB.getSourcesMeta();
  sourcesGrid.innerHTML = "";
  emptyState.style.display = list.length ? "none" : "block";
  list.forEach(s => {
    const card = document.createElement("div");
    card.className = "card";
    const icon = s.type === "application/pdf" ? "📕" : "🖼️";
    card.innerHTML = `
      <div class="thumb">${icon}</div>
      <div class="name">${s.name}</div>
      <div class="meta">${fmtSize(s.size)} &middot; ${new Date(s.addedAt).toLocaleDateString()}</div>
      <div class="row">
        <button class="btn solid small teachBtn">▶ Teach</button>
        <button class="btn small danger delBtn">Delete</button>
      </div>
    `;
    card.querySelector(".teachBtn").onclick = () => {
      window.location.href = `teach.html?source=${s.id}`;
    };
    card.querySelector(".delBtn").onclick = () => deleteSource(s.id);
    sourcesGrid.appendChild(card);
  });
}

// ---- logo ----
function renderLogo() {
  const logo = DB.getLogo();
  if (logo) {
    logoPreview.innerHTML = `<img src="${logo}" style="width:100%;height:100%;object-fit:contain;">`;
    logoRemoveBtn.style.display = "inline-flex";
  } else {
    logoPreview.innerHTML = "NONE";
    logoRemoveBtn.style.display = "none";
  }
}
logoBtn.onclick = () => logoInput.click();
logoInput.onchange = () => {
  const f = logoInput.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { DB.setLogo(reader.result); renderLogo(); };
  reader.readAsDataURL(f);
};
logoRemoveBtn.onclick = () => { localStorage.removeItem("ass_logo"); renderLogo(); };

render();
renderLogo();
