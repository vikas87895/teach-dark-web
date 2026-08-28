const videoGrid = document.getElementById("videoGrid");
const emptyState = document.getElementById("emptyState");
const editModal = document.getElementById("editModal");
const titleInput = document.getElementById("titleInput");
const descInput = document.getElementById("descInput");
let editingId = null;

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function render() {
  const list = DB.getVideosMeta();
  videoGrid.innerHTML = "";
  emptyState.style.display = list.length ? "none" : "block";
  list.forEach(v => {
    const card = document.createElement("div");
    card.className = "card";
    const thumbHtml = v.blobUrl
      ? `<video src="${v.blobUrl}" muted></video>`
      : `🎬`;
    const badge = v.platform === "youtube" ? '<span class="badge" style="border-color:#a83232;color:#ff5c5c;">YouTube</span>'
      : v.driveFileId ? '<span class="badge">Drive</span>'
      : '<span class="badge amber">Local only</span>';
    card.innerHTML = `
      <div class="thumb">${thumbHtml}</div>
      <div class="name">${v.title || "(Untitled recording)"}</div>
      <div class="meta">${new Date(v.createdAt).toLocaleString()} ${v.sizeBytes ? "&middot; " + fmtSize(v.sizeBytes) : ""}</div>
      <div class="meta">${badge}</div>
      <div class="row">
        ${v.link ? `<a class="btn small" href="${v.link}" target="_blank">▶ Open</a>` : v.blobUrl ? `<a class="btn small" href="${v.blobUrl}" download>⬇ Save</a>` : ""}
        <button class="btn small editBtn">Edit Info</button>
      </div>
    `;
    card.querySelector(".editBtn").onclick = () => openEdit(v.id);
    videoGrid.appendChild(card);
  });
}

function openEdit(id) {
  const list = DB.getVideosMeta();
  const v = list.find(x => x.id === id);
  if (!v) return;
  editingId = id;
  titleInput.value = v.title || "";
  descInput.value = v.description || "";
  editModal.style.display = "flex";
  titleInput.focus();
}

document.getElementById("cancelEdit").onclick = () => editModal.style.display = "none";
document.getElementById("saveEdit").onclick = () => {
  const list = DB.getVideosMeta();
  const idx = list.findIndex(x => x.id === editingId);
  if (idx > -1) {
    list[idx].title = titleInput.value.trim();
    list[idx].description = descInput.value.trim();
    DB.setVideosMeta(list);
  }
  editModal.style.display = "none";
  render();
};

render();

// if we just came from teach.html after a fresh recording, open the edit modal automatically
const params = new URLSearchParams(location.search);
const editId = params.get("edit");
if (editId) openEdit(editId);
