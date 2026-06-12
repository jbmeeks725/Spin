// app.js

// 1. CONFIG: fill these with your project values
const SUPABASE_URL = "https://wdgiskawukblqgapkmig.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KkcpYXwoOXi2XVv-UqIoiw_5G8q21CT";
const UPLOAD_COVER_FUNCTION_URL = "https://wdgiskawukblqgapkmig.supabase.co/functions/v1/upload-cover";
const DISCOGS_LOOKUP_FUNCTION_URL = "https://wdgiskawukblqgapkmig.supabase.co/functions/v1/discogs-lookup";

// 2. Create Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 3. State
let allRecords = [];
let wishlist = [];
let genres = [];
let subgenres = [];
let viewMode = "grid"; // "grid" | "table" | "wishlist"
let pendingWishlistCoverUrl = null;
let pendingWishlistDiscogsId = null;

const RATING_OPTIONS = [
  { value: "love", label: "Love" },
  { value: "like", label: "Like" },
  { value: "neutral", label: "Neutral" },
  { value: "dislike", label: "Dislike" },
];

// 4. Helpers
function setStatus(msg) {
  document.getElementById("statusMessage").textContent = msg;
}

function normalizeGenre(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === "R&B" || trimmed.toUpperCase() === "RB") {
    return "R&B";
  }
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseYearInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.trunc(n);
}


function renderFilters() {
  const genreSelect = document.getElementById("genreFilter");
  const subgenreSelect = document.getElementById("subgenreFilter");

  // Clear current options except first
  genreSelect.length = 1;
  subgenreSelect.length = 1;

  genres.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    genreSelect.appendChild(opt);
  });

  subgenres.forEach((sg) => {
    const opt = document.createElement("option");
    opt.value = sg.id;
    opt.textContent = sg.name;
    subgenreSelect.appendChild(opt);
  });

  // Populate datalists for the Add Record form
  const genreOptions = document.getElementById("genreOptions");
  const subgenreOptions = document.getElementById("subgenreOptions");
  genreOptions.innerHTML = "";
  subgenreOptions.innerHTML = "";

  genres.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.name;
    genreOptions.appendChild(opt);
  });

  subgenres.forEach((sg) => {
    const opt = document.createElement("option");
    opt.value = sg.name;
    subgenreOptions.appendChild(opt);
  });
}

function getFilteredRecords() {
  const searchText = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();

  const genreFilterVal = document.getElementById("genreFilter").value;
  const subgenreFilterVal = document.getElementById("subgenreFilter").value;
  const ratingFilterVal = document.getElementById("ratingFilter").value;

  let filtered = allRecords.slice();

  if (searchText) {
    filtered = filtered.filter((r) => {
      return (
        r.artist.toLowerCase().includes(searchText) ||
        r.album.toLowerCase().includes(searchText)
      );
    });
  }

  if (genreFilterVal) {
    filtered = filtered.filter((r) => r.genre_id === Number(genreFilterVal));
  }

  if (subgenreFilterVal) {
    filtered = filtered.filter(
      (r) => r.subgenre_id === Number(subgenreFilterVal)
    );
  }

  if (ratingFilterVal) {
    if (ratingFilterVal === "unrated") {
      filtered = filtered.filter((r) => !r.rating);
    } else {
      filtered = filtered.filter((r) => r.rating === ratingFilterVal);
    }
  }

  return filtered;
}

function renderTable(filtered) {
  const tbody = document.getElementById("recordsBody");
  tbody.innerHTML = "";

  filtered.forEach((r) => {
    const tr = document.createElement("tr");

    const tdArtist = document.createElement("td");
    tdArtist.textContent = r.artist;

    const tdAlbum = document.createElement("td");
    tdAlbum.textContent = r.album;

    const tdYear = document.createElement("td");
    tdYear.textContent = r.year ?? "";

    const tdGenre = document.createElement("td");
    tdGenre.textContent = r.genre_name || "";

    const tdSubgenre = document.createElement("td");
    tdSubgenre.textContent = r.subgenre_name || "";

    const tdLabel = document.createElement("td");
    tdLabel.textContent = r.label || "";

    const tdRating = document.createElement("td");
    tdRating.appendChild(buildRatingControls(r));

    tr.appendChild(tdArtist);
    tr.appendChild(tdAlbum);
    tr.appendChild(tdYear);
    tr.appendChild(tdGenre);
    tr.appendChild(tdSubgenre);
    tr.appendChild(tdLabel);
    tr.appendChild(tdRating);

    tr.classList.add("clickable-row");
    tr.addEventListener("click", () => openRecordDetailModal(r.id));

    tbody.appendChild(tr);
  });
}

function renderCards(filtered) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";

  filtered.forEach((r) => {
    const card = document.createElement("div");
    card.className = "record-card";

    // Cover wrap (image or placeholder, with vinyl disc peeking behind)
    const coverWrap = document.createElement("div");
    coverWrap.className = "cover-wrap";

    const disc = document.createElement("div");
    disc.className = "vinyl-disc";
    coverWrap.appendChild(disc);

    if (r.cover_url) {
      const img = document.createElement("img");
      img.className = "cover-img";
      img.src = r.cover_url;
      img.alt = `${r.album} cover`;
      img.loading = "lazy";
      coverWrap.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "cover-img cover-placeholder";
      placeholder.textContent = "No cover";
      coverWrap.appendChild(placeholder);
    }

    card.appendChild(coverWrap);

    // Info block
    const info = document.createElement("div");
    info.className = "record-info";

    const artistEl = document.createElement("div");
    artistEl.className = "record-artist";
    artistEl.textContent = r.artist;

    const albumEl = document.createElement("div");
    albumEl.className = "record-album";
    albumEl.textContent = r.album;

    const metaEl = document.createElement("div");
    metaEl.className = "record-meta";
    const metaParts = [];
    if (r.year) metaParts.push(r.year);
    if (r.genre_name) metaParts.push(r.genre_name);
    if (r.subgenre_name) metaParts.push(r.subgenre_name);
    metaEl.textContent = metaParts.join(" · ");

    info.appendChild(artistEl);
    info.appendChild(albumEl);
    if (metaParts.length) info.appendChild(metaEl);
    info.appendChild(buildRatingControls(r));

    card.appendChild(info);
    card.addEventListener("click", () => openRecordDetailModal(r.id));
    grid.appendChild(card);
  });
}

function render() {
  if (viewMode === "wishlist") {
    renderWishlist();
    setStatus(`${wishlist.length} item${wishlist.length === 1 ? "" : "s"} on your wishlist`);
    return;
  }

  const filtered = getFilteredRecords();

  if (viewMode === "grid") {
    renderCards(filtered);
  } else {
    renderTable(filtered);
  }

  setStatus(`Showing ${filtered.length} of ${allRecords.length} records`);
}

function setViewMode(mode) {
  viewMode = mode;

  const gridBtn = document.getElementById("gridViewBtn");
  const tableBtn = document.getElementById("tableViewBtn");
  const wishlistBtn = document.getElementById("wishlistViewBtn");
  const cardSection = document.getElementById("cardSection");
  const tableSection = document.getElementById("tableSection");
  const wishlistSection = document.getElementById("wishlistSection");
  const filterControls = document.getElementById("collectionFilters");

  const buttons = [
    { btn: gridBtn, mode: "grid" },
    { btn: tableBtn, mode: "table" },
    { btn: wishlistBtn, mode: "wishlist" },
  ];

  buttons.forEach(({ btn, mode: btnMode }) => {
    if (btnMode === mode) {
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    }
  });

  cardSection.hidden = mode !== "grid";
  tableSection.hidden = mode !== "table";
  wishlistSection.hidden = mode !== "wishlist";
  filterControls.hidden = mode === "wishlist";

  document.getElementById("addRecordBtn").hidden = mode === "wishlist";
  document.getElementById("addWishlistBtn").hidden = mode !== "wishlist";

  render();
}

async function updateRating(recordId, newRating) {
  // Optimistically update local state first
  const record = allRecords.find((r) => r.id === recordId);
  const previousRating = record ? record.rating : null;
  // Toggle off if clicking the already-active rating
  const ratingToSet = previousRating === newRating ? null : newRating;

  if (record) {
    record.rating = ratingToSet;
  }

  render();

  const { error } = await supabaseClient
    .from("records")
    .update({ rating: ratingToSet })
    .eq("id", recordId);

  if (error) {
    console.error("Failed to update rating:", error);
    setStatus("Couldn't save rating. Check console for details.");
    // Revert on failure
    if (record) {
      record.rating = previousRating;
    }
    render();
  }
}

function buildRatingControls(record) {
  const wrap = document.createElement("div");
  wrap.className = "rating-controls";

  RATING_OPTIONS.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `rating-btn rating-${opt.value}`;
    btn.textContent = opt.label;
    btn.setAttribute("aria-pressed", record.rating === opt.value ? "true" : "false");
    if (record.rating === opt.value) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateRating(record.id, opt.value);
    });
    wrap.appendChild(btn);
  });

  return wrap;
}


// ------------ Barcode scanning (shared) ------------

let pendingScannedCoverUrl = null;
let html5QrCode = null;
let activeScanConfig = null;

async function startBarcodeScan(scanConfig) {
  activeScanConfig = scanConfig;

  const scannerWrap = document.getElementById(scanConfig.wrapId);
  const scanStatus = document.getElementById(scanConfig.statusId);
  const scanBtn = document.getElementById(scanConfig.btnId);

  scanStatus.textContent = "";
  scanStatus.className = "form-status";
  scannerWrap.hidden = false;
  scanBtn.hidden = true;

  html5QrCode = new Html5Qrcode(scanConfig.videoId);

  const config = {
    fps: 10,
    qrbox: { width: 250, height: 150 },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
    ],
  };

  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        onBarcodeDetected(decodedText);
      },
      () => {
        // ignore per-frame scan failures
      }
    );
  } catch (err) {
    console.error(err);
    scanStatus.textContent = "Couldn't access camera. Check permissions.";
    scanStatus.className = "form-status form-status-error";
    stopBarcodeScan();
  }
}

async function stopBarcodeScan() {
  if (!activeScanConfig) return;

  const scannerWrap = document.getElementById(activeScanConfig.wrapId);
  const scanBtn = document.getElementById(activeScanConfig.btnId);

  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (err) {
      // ignore stop errors
    }
    html5QrCode = null;
  }

  scannerWrap.hidden = true;
  scanBtn.hidden = false;
}

async function onBarcodeDetected(barcode) {
  const scanConfig = activeScanConfig;
  const scanStatus = document.getElementById(scanConfig.statusId);

  await stopBarcodeScan();

  scanStatus.textContent = `Scanned ${barcode}. Looking up on Discogs...`;
  scanStatus.className = "form-status";

  try {
    const response = await fetch(DISCOGS_LOOKUP_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ barcode }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Lookup failed (${response.status})`);
    }

    if (!result.found) {
      scanStatus.textContent = `Scanned ${barcode}, but no Discogs match was found. You can enter details manually.`;
      scanStatus.className = "form-status";
      return;
    }

    scanConfig.onResult(result);

    scanStatus.textContent = "Found a match on Discogs. Review and adjust details below.";
    scanStatus.className = "form-status form-status-success";
  } catch (err) {
    console.error(err);
    scanStatus.textContent = "Couldn't look up barcode. Check console for details.";
    scanStatus.className = "form-status form-status-error";
  }
}

const ADD_RECORD_SCAN_CONFIG = {
  videoId: "scannerVideo",
  wrapId: "scannerWrap",
  btnId: "scanBarcodeBtn",
  cancelBtnId: "cancelScanBtn",
  statusId: "scanStatus",
  onResult: (result) => {
    if (result.artist) document.getElementById("fieldArtist").value = result.artist;
    if (result.album) document.getElementById("fieldAlbum").value = result.album;
    if (result.year) document.getElementById("fieldYear").value = result.year;
    if (result.label) document.getElementById("fieldLabel").value = result.label;
    if (result.genre) document.getElementById("fieldGenre").value = result.genre;
    if (result.style) document.getElementById("fieldSubgenre").value = result.style;
    if (result.cover_url) pendingScannedCoverUrl = result.cover_url;
  },
};

const ADD_WISHLIST_SCAN_CONFIG = {
  videoId: "wishScannerVideo",
  wrapId: "wishScannerWrap",
  btnId: "wishScanBarcodeBtn",
  cancelBtnId: "wishCancelScanBtn",
  statusId: "wishScanStatus",
  onResult: (result) => {
    if (result.artist) document.getElementById("wishArtist").value = result.artist;
    if (result.album) document.getElementById("wishAlbum").value = result.album;
    if (result.year) document.getElementById("wishYear").value = result.year;
    if (result.label) document.getElementById("wishLabel").value = result.label;
    if (result.genre) document.getElementById("wishGenre").value = result.genre;
    if (result.style) document.getElementById("wishSubgenre").value = result.style;
    if (result.discogs_release_id) pendingWishlistDiscogsId = result.discogs_release_id;
    if (result.cover_url) pendingWishlistCoverUrl = result.cover_url;
  },
};

// ------------ Add Record ------------

async function getOrCreateGenreId(genreNameRaw) {
  const name = normalizeGenre(genreNameRaw);
  if (!name) return null;

  const existing = genres.find(
    (g) => g.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;

  const { data, error } = await supabaseClient
    .from("genres")
    .insert({ name })
    .select()
    .single();

  if (error) throw error;

  genres.push(data);
  return data.id;
}

async function getOrCreateSubgenreId(subgenreNameRaw, genreId) {
  const name = normalizeGenre(subgenreNameRaw);
  if (!name) return null;

  const existing = subgenres.find(
    (sg) => sg.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;

  const { data, error } = await supabaseClient
    .from("subgenres")
    .insert({ name, genre_id: genreId })
    .select()
    .single();

  if (error) throw error;

  subgenres.push(data);
  return data.id;
}

function openAddRecordModal() {
  document.getElementById("addRecordOverlay").hidden = false;
  document.getElementById("addRecordStatus").textContent = "";
  document.getElementById("scanStatus").textContent = "";
  document.getElementById("scanStatus").className = "form-status";
  pendingScannedCoverUrl = null;
  document.getElementById("fieldArtist").focus();
}

function closeAddRecordModal() {
  document.getElementById("addRecordOverlay").hidden = true;
  stopBarcodeScan();
}

function resetAddRecordForm() {
  document.getElementById("addRecordForm").reset();
  document.getElementById("fieldQuantity").value = 1;
  document.getElementById("addRecordStatus").textContent = "";
  document.getElementById("scanStatus").textContent = "";
  document.getElementById("scanStatus").className = "form-status";
  pendingScannedCoverUrl = null;
}

async function handleAddRecordSubmit(event) {
  event.preventDefault();

  const statusEl = document.getElementById("addRecordStatus");
  const submitBtn = document.getElementById("submitAddRecordBtn");

  const artist = document.getElementById("fieldArtist").value.trim();
  const album = document.getElementById("fieldAlbum").value.trim();

  if (!artist || !album) {
    statusEl.textContent = "Artist and Album are required.";
    statusEl.className = "form-status form-status-error";
    return;
  }

  const yearVal = parseYearInput(document.getElementById("fieldYear").value);
  const quantityVal = parseYearInput(document.getElementById("fieldQuantity").value) || 1;
  const label = document.getElementById("fieldLabel").value.trim() || null;
  const genreInput = document.getElementById("fieldGenre").value.trim();
  const subgenreInput = document.getElementById("fieldSubgenre").value.trim();
  const vinylGrade = document.getElementById("fieldVinylGrade").value.trim() || null;
  const sleeveGrade = document.getElementById("fieldSleeveGrade").value.trim() || null;
  const description = document.getElementById("fieldDescription").value.trim() || null;
  const notes = document.getElementById("fieldNotes").value.trim() || null;

  submitBtn.disabled = true;
  statusEl.textContent = "Saving...";
  statusEl.className = "form-status";

  try {
    const genreId = await getOrCreateGenreId(genreInput);
    const subgenreId = subgenreInput
      ? await getOrCreateSubgenreId(subgenreInput, genreId)
      : null;

    const newRecord = {
      artist,
      album,
      year: yearVal,
      year_raw: yearVal !== null ? String(yearVal) : null,
      label,
      genre_id: genreId,
      subgenre_id: subgenreId,
      description,
      vinyl_grade: vinylGrade,
      sleeve_grade: sleeveGrade,
      notes,
      quantity: quantityVal,
      cover_url: pendingScannedCoverUrl,
    };

    const { data, error } = await supabaseClient
      .from("records")
      .insert(newRecord)
      .select(
        `
        id,
        artist,
        album,
        year,
        label,
        genre_id,
        subgenre_id,
        cover_url,
        rating,
        description,
        vinyl_grade,
        sleeve_grade,
        notes,
        quantity,
        genres ( name ),
        subgenres ( name )
      `
      )
      .single();

    if (error) throw error;

    const enriched = {
      ...data,
      genre_name: data.genres?.name ?? "",
      subgenre_name: data.subgenres?.name ?? "",
    };

    allRecords.push(enriched);
    allRecords.sort((a, b) => a.artist.localeCompare(b.artist));

    renderFilters();
    render();

    statusEl.textContent = `Added "${album}" by ${artist}.`;
    statusEl.className = "form-status form-status-success";

    resetAddRecordForm();
    setTimeout(() => {
      closeAddRecordModal();
    }, 900);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't save this record. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    submitBtn.disabled = false;
  }
}


// ------------ Wishlist ------------

const DISCOGS_PRICE_FUNCTION_URL = "https://wdgiskawukblqgapkmig.supabase.co/functions/v1/discogs-price";

function formatPrice(value, currency) {
  if (value === null || value === undefined) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(value);
  } catch {
    return `${value} ${currency || ""}`.trim();
  }
}

function renderWishlist() {
  const grid = document.getElementById("wishlistGrid");
  grid.innerHTML = "";

  if (wishlist.length === 0) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "Your wishlist is empty. Use \"+ Add to Wishlist\" to start tracking albums you want next.";
    grid.appendChild(empty);
    return;
  }

  wishlist.forEach((w) => {
    const card = document.createElement("div");
    card.className = "record-card wishlist-card";

    const coverWrap = document.createElement("div");
    coverWrap.className = "cover-wrap";

    const disc = document.createElement("div");
    disc.className = "vinyl-disc";
    coverWrap.appendChild(disc);

    if (w.cover_url) {
      const img = document.createElement("img");
      img.className = "cover-img";
      img.src = w.cover_url;
      img.alt = `${w.album} cover`;
      img.loading = "lazy";
      coverWrap.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "cover-img cover-placeholder";
      placeholder.textContent = "No cover";
      coverWrap.appendChild(placeholder);
    }

    card.appendChild(coverWrap);

    const info = document.createElement("div");
    info.className = "record-info";

    const artistEl = document.createElement("div");
    artistEl.className = "record-artist";
    artistEl.textContent = w.artist;

    const albumEl = document.createElement("div");
    albumEl.className = "record-album";
    albumEl.textContent = w.album;

    const metaEl = document.createElement("div");
    metaEl.className = "record-meta";
    const metaParts = [];
    if (w.year) metaParts.push(w.year);
    if (w.genre_name) metaParts.push(w.genre_name);
    if (w.subgenre_name) metaParts.push(w.subgenre_name);
    metaEl.textContent = metaParts.join(" · ");

    info.appendChild(artistEl);
    info.appendChild(albumEl);
    if (metaParts.length) info.appendChild(metaEl);

    // Price section
    const priceWrap = document.createElement("div");
    priceWrap.className = "price-wrap";

    if (w.price_data) {
      const priceList = document.createElement("div");
      priceList.className = "price-list";
      Object.entries(w.price_data).forEach(([grade, info]) => {
        const row = document.createElement("div");
        row.className = "price-row";
        row.textContent = `${grade}: ${formatPrice(info.value, info.currency)}`;
        priceList.appendChild(row);
      });
      priceWrap.appendChild(priceList);

      if (w.price_checked_at) {
        const checkedEl = document.createElement("div");
        checkedEl.className = "price-checked";
        checkedEl.textContent = `Checked ${new Date(w.price_checked_at).toLocaleDateString()}`;
        priceWrap.appendChild(checkedEl);
      }
    }

    const priceBtn = document.createElement("button");
    priceBtn.type = "button";
    priceBtn.className = "btn-secondary price-btn";
    priceBtn.textContent = w.discogs_release_id ? "Check price" : "No Discogs match";
    priceBtn.disabled = !w.discogs_release_id;
    priceBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      checkWishlistPrice(w.id);
    });
    priceWrap.appendChild(priceBtn);

    info.appendChild(priceWrap);

    // Actions
    const actions = document.createElement("div");
    actions.className = "wishlist-actions";

    const moveBtn = document.createElement("button");
    moveBtn.type = "button";
    moveBtn.className = "btn-primary";
    moveBtn.textContent = "Move to collection";
    moveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveWishlistItemToCollection(w.id);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeWishlistItem(w.id);
    });

    actions.appendChild(moveBtn);
    actions.appendChild(removeBtn);
    info.appendChild(actions);

    if (w.notes) {
      const notesEl = document.createElement("div");
      notesEl.className = "record-meta";
      notesEl.textContent = w.notes;
      info.appendChild(notesEl);
    }

    card.appendChild(info);
    grid.appendChild(card);
  });
}

async function checkWishlistPrice(wishlistId) {
  const item = wishlist.find((w) => w.id === wishlistId);
  if (!item || !item.discogs_release_id) return;

  setStatus("Checking price...");

  try {
    const response = await fetch(DISCOGS_PRICE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ release_id: item.discogs_release_id }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Price check failed (${response.status})`);
    }

    const updates = {
      price_data: result.price_data || null,
      price_currency: result.currency || null,
      price_checked_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient
      .from("wishlist")
      .update(updates)
      .eq("id", wishlistId);

    if (error) throw error;

    Object.assign(item, updates);
    render();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't check price. See console for details.");
  }
}

function openAddWishlistModal() {
  document.getElementById("addWishlistOverlay").hidden = false;
  document.getElementById("addWishlistStatus").textContent = "";
  document.getElementById("wishScanStatus").textContent = "";
  document.getElementById("wishScanStatus").className = "form-status";
  pendingWishlistCoverUrl = null;
  pendingWishlistDiscogsId = null;
  document.getElementById("wishArtist").focus();
}

function closeAddWishlistModal() {
  document.getElementById("addWishlistOverlay").hidden = true;
  stopBarcodeScan();
}

function resetAddWishlistForm() {
  document.getElementById("addWishlistForm").reset();
  document.getElementById("addWishlistStatus").textContent = "";
  document.getElementById("wishScanStatus").textContent = "";
  document.getElementById("wishScanStatus").className = "form-status";
  pendingWishlistCoverUrl = null;
  pendingWishlistDiscogsId = null;
}

async function handleAddWishlistSubmit(event) {
  event.preventDefault();

  const statusEl = document.getElementById("addWishlistStatus");
  const submitBtn = document.getElementById("submitAddWishlistBtn");

  const artist = document.getElementById("wishArtist").value.trim();
  const album = document.getElementById("wishAlbum").value.trim();

  if (!artist || !album) {
    statusEl.textContent = "Artist and Album are required.";
    statusEl.className = "form-status form-status-error";
    return;
  }

  const yearVal = parseYearInput(document.getElementById("wishYear").value);
  const label = document.getElementById("wishLabel").value.trim() || null;
  const genreInput = document.getElementById("wishGenre").value.trim();
  const subgenreInput = document.getElementById("wishSubgenre").value.trim();
  const notes = document.getElementById("wishNotes").value.trim() || null;

  submitBtn.disabled = true;
  statusEl.textContent = "Saving...";
  statusEl.className = "form-status";

  try {
    const genreId = await getOrCreateGenreId(genreInput);
    const subgenreId = subgenreInput
      ? await getOrCreateSubgenreId(subgenreInput, genreId)
      : null;

    const newItem = {
      artist,
      album,
      year: yearVal,
      label,
      genre_id: genreId,
      subgenre_id: subgenreId,
      notes,
      discogs_release_id: pendingWishlistDiscogsId,
      cover_url: pendingWishlistCoverUrl,
    };

    const { data, error } = await supabaseClient
      .from("wishlist")
      .insert(newItem)
      .select(
        `
        id,
        artist,
        album,
        year,
        label,
        genre_id,
        subgenre_id,
        discogs_release_id,
        cover_url,
        notes,
        added_at,
        price_data,
        price_currency,
        price_checked_at,
        genres ( name ),
        subgenres ( name )
      `
      )
      .single();

    if (error) throw error;

    const enriched = {
      ...data,
      genre_name: data.genres?.name ?? "",
      subgenre_name: data.subgenres?.name ?? "",
    };

    wishlist.unshift(enriched);

    renderFilters();
    render();

    statusEl.textContent = `Added "${album}" by ${artist} to your wishlist.`;
    statusEl.className = "form-status form-status-success";

    resetAddWishlistForm();
    setTimeout(() => {
      closeAddWishlistModal();
    }, 900);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't save this item. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    submitBtn.disabled = false;
  }
}

async function removeWishlistItem(wishlistId) {
  const item = wishlist.find((w) => w.id === wishlistId);
  const label = item ? `"${item.album}" by ${item.artist}` : "this item";

  const confirmed = window.confirm(`Remove ${label} from your wishlist?`);
  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from("wishlist")
      .delete()
      .eq("id", wishlistId);

    if (error) throw error;

    wishlist = wishlist.filter((w) => w.id !== wishlistId);
    render();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't remove item. See console for details.");
  }
}

async function moveWishlistItemToCollection(wishlistId) {
  const item = wishlist.find((w) => w.id === wishlistId);
  if (!item) return;

  const confirmed = window.confirm(
    `Move "${item.album}" by ${item.artist} to your collection?`
  );
  if (!confirmed) return;

  try {
    const newRecord = {
      artist: item.artist,
      album: item.album,
      year: item.year,
      year_raw: item.year !== null ? String(item.year) : null,
      label: item.label,
      genre_id: item.genre_id,
      subgenre_id: item.subgenre_id,
      cover_url: item.cover_url,
      notes: item.notes,
      quantity: 1,
    };

    const { data, error } = await supabaseClient
      .from("records")
      .insert(newRecord)
      .select(
        `
        id,
        artist,
        album,
        year,
        label,
        genre_id,
        subgenre_id,
        cover_url,
        rating,
        description,
        vinyl_grade,
        sleeve_grade,
        notes,
        quantity,
        genres ( name ),
        subgenres ( name )
      `
      )
      .single();

    if (error) throw error;

    const enriched = {
      ...data,
      genre_name: data.genres?.name ?? "",
      subgenre_name: data.subgenres?.name ?? "",
    };

    allRecords.push(enriched);
    allRecords.sort((a, b) => a.artist.localeCompare(b.artist));

    const { error: deleteError } = await supabaseClient
      .from("wishlist")
      .delete()
      .eq("id", wishlistId);

    if (deleteError) throw deleteError;

    wishlist = wishlist.filter((w) => w.id !== wishlistId);

    renderFilters();
    render();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't move item to collection. See console for details.");
  }
}


let activeDetailRecordId = null;
let pendingCoverUrl; // undefined = no change, null = remove, string = new URL

function resizeImageFile(file, maxDim = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create image blob"));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function setCoverPreview(url) {
  const coverImg = document.getElementById("detailCoverImg");
  const coverPlaceholder = document.getElementById("detailCoverPlaceholder");
  if (url) {
    coverImg.src = url;
    coverImg.hidden = false;
    coverPlaceholder.hidden = true;
  } else {
    coverImg.hidden = true;
    coverPlaceholder.hidden = false;
  }
}

async function handleCoverFileChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file || activeDetailRecordId === null) return;

  const statusEl = document.getElementById("coverUploadStatus");
  statusEl.textContent = "Uploading cover...";
  statusEl.className = "form-status";

  try {
    const blob = await resizeImageFile(file);

    const formData = new FormData();
    formData.append("file", blob, "cover.jpg");
    formData.append("recordId", String(activeDetailRecordId));

    const response = await fetch(UPLOAD_COVER_FUNCTION_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Upload failed (${response.status})`);
    }

    pendingCoverUrl = result.url;
    setCoverPreview(pendingCoverUrl);

    statusEl.textContent = "Cover uploaded. Click Save changes to apply.";
    statusEl.className = "form-status form-status-success";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't upload cover. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    event.target.value = "";
  }
}

function handleRemoveCover() {
  pendingCoverUrl = null;
  setCoverPreview(null);
  const statusEl = document.getElementById("coverUploadStatus");
  statusEl.textContent = "Cover will be removed. Click Save changes to apply.";
  statusEl.className = "form-status";
}


function openRecordDetailModal(recordId) {
  const record = allRecords.find((r) => r.id === recordId);
  if (!record) return;

  activeDetailRecordId = recordId;
  pendingCoverUrl = undefined;

  document.getElementById("detailArtist").value = record.artist || "";
  document.getElementById("detailAlbum").value = record.album || "";
  document.getElementById("detailYear").value = record.year ?? "";
  document.getElementById("detailQuantity").value = record.quantity ?? 1;
  document.getElementById("detailLabel").value = record.label || "";
  document.getElementById("detailGenre").value = record.genre_name || "";
  document.getElementById("detailSubgenre").value = record.subgenre_name || "";
  document.getElementById("detailVinylGrade").value = record.vinyl_grade || "";
  document.getElementById("detailSleeveGrade").value = record.sleeve_grade || "";
  document.getElementById("detailDescription").value = record.description || "";
  document.getElementById("detailNotes").value = record.notes || "";

  setCoverPreview(record.cover_url || null);

  const ratingWrap = document.getElementById("detailRatingControls");
  ratingWrap.innerHTML = "";
  ratingWrap.appendChild(buildRatingControls(record));

  document.getElementById("recordDetailStatus").textContent = "";
  document.getElementById("recordDetailStatus").className = "form-status";
  document.getElementById("coverUploadStatus").textContent = "";
  document.getElementById("coverUploadStatus").className = "form-status";

  document.getElementById("recordDetailOverlay").hidden = false;
}

function closeRecordDetailModal() {
  document.getElementById("recordDetailOverlay").hidden = true;
  activeDetailRecordId = null;
}

async function handleRecordDetailSubmit(event) {
  event.preventDefault();
  if (activeDetailRecordId === null) return;

  const statusEl = document.getElementById("recordDetailStatus");
  const saveBtn = document.getElementById("saveRecordDetailBtn");

  const artist = document.getElementById("detailArtist").value.trim();
  const album = document.getElementById("detailAlbum").value.trim();

  if (!artist || !album) {
    statusEl.textContent = "Artist and Album are required.";
    statusEl.className = "form-status form-status-error";
    return;
  }

  const yearVal = parseYearInput(document.getElementById("detailYear").value);
  const quantityVal = parseYearInput(document.getElementById("detailQuantity").value) || 1;
  const label = document.getElementById("detailLabel").value.trim() || null;
  const genreInput = document.getElementById("detailGenre").value.trim();
  const subgenreInput = document.getElementById("detailSubgenre").value.trim();
  const vinylGrade = document.getElementById("detailVinylGrade").value.trim() || null;
  const sleeveGrade = document.getElementById("detailSleeveGrade").value.trim() || null;
  const description = document.getElementById("detailDescription").value.trim() || null;
  const notes = document.getElementById("detailNotes").value.trim() || null;

  saveBtn.disabled = true;
  statusEl.textContent = "Saving...";
  statusEl.className = "form-status";

  try {
    const genreId = await getOrCreateGenreId(genreInput);
    const subgenreId = subgenreInput
      ? await getOrCreateSubgenreId(subgenreInput, genreId)
      : null;

    const updates = {
      artist,
      album,
      year: yearVal,
      year_raw: yearVal !== null ? String(yearVal) : null,
      label,
      genre_id: genreId,
      subgenre_id: subgenreId,
      description,
      vinyl_grade: vinylGrade,
      sleeve_grade: sleeveGrade,
      notes,
      quantity: quantityVal,
    };

    if (pendingCoverUrl !== undefined) {
      updates.cover_url = pendingCoverUrl;
    }

    const { error } = await supabaseClient
      .from("records")
      .update(updates)
      .eq("id", activeDetailRecordId);

    if (error) throw error;

    // Update local copy
    const record = allRecords.find((r) => r.id === activeDetailRecordId);
    if (record) {
      Object.assign(record, updates);
      const genreObj = genres.find((g) => g.id === genreId);
      const subgenreObj = subgenres.find((sg) => sg.id === subgenreId);
      record.genre_name = genreObj?.name || "";
      record.subgenre_name = subgenreObj?.name || "";
    }

    renderFilters();
    render();

    statusEl.textContent = "Saved.";
    statusEl.className = "form-status form-status-success";

    setTimeout(() => {
      closeRecordDetailModal();
    }, 700);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't save changes. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    saveBtn.disabled = false;
  }
}

async function handleDeleteRecord() {
  if (activeDetailRecordId === null) return;

  const record = allRecords.find((r) => r.id === activeDetailRecordId);
  const label = record ? `"${record.album}" by ${record.artist}` : "this record";

  const confirmed = window.confirm(
    `Delete ${label}? This cannot be undone.`
  );
  if (!confirmed) return;

  const statusEl = document.getElementById("recordDetailStatus");
  const deleteBtn = document.getElementById("deleteRecordBtn");
  deleteBtn.disabled = true;
  statusEl.textContent = "Deleting...";
  statusEl.className = "form-status";

  try {
    const { error } = await supabaseClient
      .from("records")
      .delete()
      .eq("id", activeDetailRecordId);

    if (error) throw error;

    allRecords = allRecords.filter((r) => r.id !== activeDetailRecordId);
    render();
    closeRecordDetailModal();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't delete record. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    deleteBtn.disabled = false;
  }
}


async function loadData() {
  try {
    setStatus("Loading genres...");
    const { data: genreData, error: genreError } = await supabaseClient
      .from("genres")
      .select("id, name")
      .order("name");
    if (genreError) throw genreError;
    genres = genreData || [];

    setStatus("Loading subgenres...");
    const { data: subgenreData, error: subgenreError } = await supabaseClient
      .from("subgenres")
      .select("id, name, genre_id")
      .order("name");
    if (subgenreError) throw subgenreError;
    subgenres = subgenreData || [];

    setStatus("Loading records...");
    const { data: recordsData, error: recordsError } = await supabaseClient
      .from("records")
      .select(
        `
        id,
        artist,
        album,
        year,
        label,
        genre_id,
        subgenre_id,
        cover_url,
        rating,
        description,
        vinyl_grade,
        sleeve_grade,
        notes,
        quantity,
        genres ( name ),
        subgenres ( name )
      `
      )
      .order("artist", { ascending: true })
      .limit(1000); // safe upper bound for now
    if (recordsError) throw recordsError;

    // Flatten genre/subgenre names into each record
    allRecords =
      recordsData?.map((r) => ({
        ...r,
        genre_name: r.genres?.name ?? "",
        subgenre_name: r.subgenres?.name ?? "",
      })) || [];

    setStatus("Loading wishlist...");
    const { data: wishlistData, error: wishlistError } = await supabaseClient
      .from("wishlist")
      .select(
        `
        id,
        artist,
        album,
        year,
        label,
        genre_id,
        subgenre_id,
        discogs_release_id,
        cover_url,
        notes,
        added_at,
        price_data,
        price_currency,
        price_checked_at,
        genres ( name ),
        subgenres ( name )
      `
      )
      .order("added_at", { ascending: false });
    if (wishlistError) throw wishlistError;

    wishlist =
      wishlistData?.map((w) => ({
        ...w,
        genre_name: w.genres?.name ?? "",
        subgenre_name: w.subgenres?.name ?? "",
      })) || [];

    renderFilters();
    render();
  } catch (err) {
    console.error(err);
    setStatus("Error loading data. See console for details.");
  }
}

// 6. Wire up events
function setupEvents() {
  document
    .getElementById("searchInput")
    .addEventListener("input", () => render());

  document
    .getElementById("genreFilter")
    .addEventListener("change", () => render());

  document
    .getElementById("subgenreFilter")
    .addEventListener("change", () => render());

  document
    .getElementById("ratingFilter")
    .addEventListener("change", () => render());

  document
    .getElementById("gridViewBtn")
    .addEventListener("click", () => setViewMode("grid"));

  document
    .getElementById("tableViewBtn")
    .addEventListener("click", () => setViewMode("table"));

  document
    .getElementById("wishlistViewBtn")
    .addEventListener("click", () => setViewMode("wishlist"));

  document
    .getElementById("addWishlistBtn")
    .addEventListener("click", () => openAddWishlistModal());

  document
    .getElementById("closeAddWishlistBtn")
    .addEventListener("click", () => closeAddWishlistModal());

  document
    .getElementById("cancelAddWishlistBtn")
    .addEventListener("click", () => {
      resetAddWishlistForm();
      closeAddWishlistModal();
    });

  document
    .getElementById("addWishlistForm")
    .addEventListener("submit", handleAddWishlistSubmit);

  document
    .getElementById("wishScanBarcodeBtn")
    .addEventListener("click", () => startBarcodeScan(ADD_WISHLIST_SCAN_CONFIG));

  document
    .getElementById("wishCancelScanBtn")
    .addEventListener("click", () => stopBarcodeScan());

  document
    .getElementById("addWishlistOverlay")
    .addEventListener("click", (e) => {
      if (e.target.id === "addWishlistOverlay") {
        closeAddWishlistModal();
      }
    });

  document
    .getElementById("addRecordBtn")
    .addEventListener("click", () => openAddRecordModal());

  document
    .getElementById("closeAddRecordBtn")
    .addEventListener("click", () => closeAddRecordModal());

  document
    .getElementById("cancelAddRecordBtn")
    .addEventListener("click", () => {
      resetAddRecordForm();
      closeAddRecordModal();
    });

  document
    .getElementById("addRecordForm")
    .addEventListener("submit", handleAddRecordSubmit);

  document
    .getElementById("scanBarcodeBtn")
    .addEventListener("click", () => startBarcodeScan(ADD_RECORD_SCAN_CONFIG));

  document
    .getElementById("cancelScanBtn")
    .addEventListener("click", () => stopBarcodeScan());

  document
    .getElementById("addRecordOverlay")
    .addEventListener("click", (e) => {
      if (e.target.id === "addRecordOverlay") {
        closeAddRecordModal();
      }
    });

  // Record detail / edit modal
  document
    .getElementById("closeRecordDetailBtn")
    .addEventListener("click", () => closeRecordDetailModal());

  document
    .getElementById("cancelRecordDetailBtn")
    .addEventListener("click", () => closeRecordDetailModal());

  document
    .getElementById("recordDetailForm")
    .addEventListener("submit", handleRecordDetailSubmit);

  document
    .getElementById("deleteRecordBtn")
    .addEventListener("click", () => handleDeleteRecord());

  document
    .getElementById("detailCoverFile")
    .addEventListener("change", handleCoverFileChange);

  document
    .getElementById("removeCoverBtn")
    .addEventListener("click", () => handleRemoveCover());

  document
    .getElementById("recordDetailOverlay")
    .addEventListener("click", (e) => {
      if (e.target.id === "recordDetailOverlay") {
        closeRecordDetailModal();
      }
    });
}

// 7. Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  loadData();
});
