// app.js

// 1. CONFIG: fill these with your project values
const SUPABASE_URL = "https://wdgiskawukblqgapkmig.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KkcpYXwoOXi2XVv-UqIoiw_5G8q21CT";

// 2. Create Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 3. State
let allRecords = [];
let genres = [];
let subgenres = [];
let viewMode = "grid"; // "grid" | "table"

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
    grid.appendChild(card);
  });
}

function render() {
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
  const cardSection = document.getElementById("cardSection");
  const tableSection = document.getElementById("tableSection");

  if (mode === "grid") {
    cardSection.hidden = false;
    tableSection.hidden = true;
    gridBtn.classList.add("active");
    gridBtn.setAttribute("aria-pressed", "true");
    tableBtn.classList.remove("active");
    tableBtn.setAttribute("aria-pressed", "false");
  } else {
    cardSection.hidden = true;
    tableSection.hidden = false;
    tableBtn.classList.add("active");
    tableBtn.setAttribute("aria-pressed", "true");
    gridBtn.classList.remove("active");
    gridBtn.setAttribute("aria-pressed", "false");
  }

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
    btn.addEventListener("click", () => updateRating(record.id, opt.value));
    wrap.appendChild(btn);
  });

  return wrap;
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
}

// 7. Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  loadData();
});
