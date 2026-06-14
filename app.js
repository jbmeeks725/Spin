// app.js

// 1. CONFIG: fill these with your project values
const SUPABASE_URL = "https://wdgiskawukblqgapkmig.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KkcpYXwoOXi2XVv-UqIoiw_5G8q21CT";
const UPLOAD_COVER_FUNCTION_URL = "https://wdgiskawukblqgapkmig.supabase.co/functions/v1/upload-cover";
const DISCOGS_LOOKUP_FUNCTION_URL = "https://wdgiskawukblqgapkmig.supabase.co/functions/v1/discogs-lookup";
const RECOMMENDATIONS_FUNCTION_URL = "https://wdgiskawukblqgapkmig.supabase.co/functions/v1/get-recommendations";

// 2. Create Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 3. State
let allRecords = [];
let wishlist = [];
let genres = [];
let subgenres = [];
let currentPage = "home"; // "home" | "collection" | "wishlist"
let pendingWishlistCoverUrl = null;
let pendingWishlistDiscogsId = null;
let artistFilter = null;
let yearFilter = null; // { start, end }
let genreChart = null;
let artistChart = null;
let decadeChart = null;
let importRawRows = [];
let importParsedRows = [];

const IMPORT_COLUMN_ALIASES = {
  artist: ["artist"],
  album: ["album", "title"],
  year: ["year"],
  label: ["label"],
  genre: ["genre"],
  subgenre: ["subgenre", "subgenres", "style"],
  description: ["description"],
  vinylGrade: ["vinylgrade", "mediagrade", "vinyl"],
  sleeveGrade: ["sleevegrade", "jacketgrade", "covergrade", "sleeve"],
  notes: ["notes", "comments"],
  quantity: ["quantity", "qty"],
};

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

function genreNameById(id) {
  if (!id) return "";
  return genres.find((g) => g.id === id)?.name ?? "";
}

function subgenreNameById(id) {
  if (!id) return "";
  return subgenres.find((sg) => sg.id === id)?.name ?? "";
}

function normalizeHeader(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumnKey(rowKeys, aliasList) {
  for (const key of rowKeys) {
    if (aliasList.includes(normalizeHeader(key))) return key;
  }
  return null;
}

function parseYearFlexible(value) {
  if (value === null || value === undefined || value === "") {
    return { year: null, yearRaw: null };
  }
  if (typeof value === "number") {
    return { year: Math.trunc(value), yearRaw: String(value) };
  }
  const str = String(value).trim();
  if (!str) return { year: null, yearRaw: null };
  const match = str.match(/\b(\d{4})\b/);
  if (match) {
    return { year: parseInt(match[1], 10), yearRaw: str };
  }
  return { year: null, yearRaw: str };
}


function renderFilters() {
  const genreSelect = document.getElementById("genreFilter");

  // Clear current options except first
  genreSelect.length = 1;

  genres.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    genreSelect.appendChild(opt);
  });

  populateSubgenreFilterOptions();

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

  populateSubgenreOptionsForGenre(null);
}

function populateSubgenreOptionsForGenre(genreInputValue) {
  const subgenreOptions = document.getElementById("subgenreOptions");
  subgenreOptions.innerHTML = "";

  const matchedGenre = genreInputValue
    ? genres.find((g) => g.name.toLowerCase() === genreInputValue.trim().toLowerCase())
    : null;

  const relevant = matchedGenre
    ? subgenres.filter((sg) => sg.genre_id === matchedGenre.id)
    : subgenres;

  relevant.forEach((sg) => {
    const opt = document.createElement("option");
    opt.value = sg.name;
    subgenreOptions.appendChild(opt);
  });
}

function populateSubgenreFilterOptions() {
  const genreSelect = document.getElementById("genreFilter");
  const subgenreSelect = document.getElementById("subgenreFilter");

  const selectedGenreId = genreSelect.value ? Number(genreSelect.value) : null;
  const previousValue = subgenreSelect.value;

  subgenreSelect.length = 1;

  const relevant = selectedGenreId
    ? subgenres.filter((sg) => sg.genre_id === selectedGenreId)
    : subgenres;

  relevant.forEach((sg) => {
    const opt = document.createElement("option");
    opt.value = sg.id;
    opt.textContent = sg.name;
    subgenreSelect.appendChild(opt);
  });

  if (relevant.some((sg) => String(sg.id) === previousValue)) {
    subgenreSelect.value = previousValue;
  } else {
    subgenreSelect.value = "";
  }
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

  if (artistFilter) {
    filtered = filtered.filter((r) => r.artist === artistFilter);
    filtered.sort((a, b) => {
      if (a.year === null && b.year === null) return 0;
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    });
  }

  if (yearFilter) {
    filtered = filtered.filter(
      (r) => r.year && r.year >= yearFilter.start && r.year <= yearFilter.end
    );
  }

  return filtered;
}

function renderCards(filtered) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "No records match your current filters.";
    grid.appendChild(empty);
    return;
  }

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
      const placeholderImg = document.createElement("img");
      placeholderImg.src = "icon-512.png";
      placeholderImg.alt = "";
      placeholderImg.loading = "lazy";
      placeholder.appendChild(placeholderImg);
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

// ------------ Home ------------

let spotlightRecordId = null;

function buildCoverFigure(coverUrl, alt, wrapClassName) {
  const wrap = document.createElement("div");
  wrap.className = wrapClassName;

  if (coverUrl) {
    const img = document.createElement("img");
    img.src = coverUrl;
    img.alt = alt;
    img.loading = "lazy";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    wrap.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "cover-placeholder";
    placeholder.style.width = "100%";
    placeholder.style.height = "100%";
    const placeholderImg = document.createElement("img");
    placeholderImg.src = "icon-512.png";
    placeholderImg.alt = "";
    placeholder.appendChild(placeholderImg);
    wrap.appendChild(placeholder);
  }

  return wrap;
}

function buildMiniCover(coverUrl, alt) {
  return buildCoverFigure(coverUrl, alt, "mini-cover-wrap");
}

function renderStats() {
  document.getElementById("statTotalRecords").textContent = allRecords.length;

  const genreNames = new Set(allRecords.map((r) => r.genre_name).filter(Boolean));
  document.getElementById("statTotalGenres").textContent = genreNames.size;

  const years = allRecords.map((r) => r.year).filter((y) => !!y);
  if (years.length > 0) {
    const minDecade = Math.floor(Math.min(...years) / 10) * 10;
    const maxDecade = Math.floor(Math.max(...years) / 10) * 10;
    if (minDecade === maxDecade) {
      document.getElementById("statDecadeSpan").textContent = `${minDecade}s`;
    } else {
      document.getElementById("statDecadeSpan").textContent = `${minDecade}s\u2013${maxDecade}s`;
    }
  } else {
    document.getElementById("statDecadeSpan").textContent = "\u2014";
  }

  document.getElementById("statWishlistCount").textContent = wishlist.length;
}

function getSpotlightPool() {
  const favorites = allRecords.filter((r) => r.rating === "love" || r.rating === "like");
  return favorites.length > 0 ? favorites : allRecords;
}

function renderSpotlight() {
  const content = document.getElementById("spotlightContent");
  const songWrap = document.getElementById("spotlightSongWrap");
  const wikiWrap = document.getElementById("spotlightWikiWrap");
  content.innerHTML = "";
  songWrap.innerHTML = "";
  wikiWrap.innerHTML = "";

  if (allRecords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Add some records to see a spotlight here.";
    content.appendChild(empty);
    return;
  }

  const pool = getSpotlightPool();

  if (spotlightRecordId === null || !pool.some((r) => r.id === spotlightRecordId)) {
    spotlightRecordId = pool[Math.floor(Math.random() * pool.length)].id;
  }

  const record = pool.find((r) => r.id === spotlightRecordId);

  const coverWrap = buildCoverFigure(record.cover_url, `${record.album} cover`, "spotlight-cover-wrap");

  const info = document.createElement("div");
  info.className = "spotlight-info";

  const artistEl = document.createElement("div");
  artistEl.className = "spotlight-artist";
  artistEl.textContent = record.artist;

  const albumEl = document.createElement("div");
  albumEl.className = "spotlight-album";
  albumEl.textContent = record.album;

  const metaEl = document.createElement("div");
  metaEl.className = "spotlight-meta";
  const metaParts = [];
  if (record.year) metaParts.push(record.year);
  if (record.genre_name) metaParts.push(record.genre_name);
  if (record.subgenre_name) metaParts.push(record.subgenre_name);
  metaEl.textContent = metaParts.join(" · ");

  info.appendChild(artistEl);
  info.appendChild(albumEl);
  if (metaParts.length) info.appendChild(metaEl);
  info.appendChild(buildRatingControls(record));

  if (record.description) {
    const descEl = document.createElement("div");
    descEl.className = "spotlight-description";
    descEl.textContent = record.description;
    info.appendChild(descEl);
  }

  content.appendChild(coverWrap);
  content.appendChild(info);
  content.style.cursor = "pointer";
  content.onclick = (e) => {
    if (e.target.closest("a, button")) return;
    openRecordDetailModal(record.id);
  };

  const findSongBtn = document.createElement("button");
  findSongBtn.type = "button";
  findSongBtn.className = "btn-secondary";
  findSongBtn.textContent = "Find a notable track";
  findSongBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    findSpotlightSong(record, songWrap, findSongBtn);
  });
  songWrap.appendChild(findSongBtn);

  const wikiBtn = document.createElement("button");
  wikiBtn.type = "button";
  wikiBtn.className = "btn-secondary";
  wikiBtn.textContent = "Look up on Wikipedia";
  wikiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    findSpotlightWiki(record, wikiWrap, wikiBtn);
  });
  wikiWrap.appendChild(wikiBtn);
}

async function fetchNotableSong(artist, album) {
  const response = await fetch(RECOMMENDATIONS_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ mode: "song", artist, album }),
  });

  const result = await response.json();
  console.log("Notable song lookup debug:", result);

  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }

  if (!result.song) {
    throw new Error("No song returned");
  }

  return result.song;
}

function buildSongLink(artist, song, className = "spotlight-song-link") {
  const link = document.createElement("a");
  link.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${song} official`)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = className;
  link.textContent = `\u25B6 "${song}" on YouTube`;
  link.addEventListener("click", (e) => e.stopPropagation());
  return link;
}

async function findSpotlightSong(record, wrap, btn) {
  btn.disabled = true;
  btn.textContent = "Looking up...";

  try {
    const song = await fetchNotableSong(record.artist, record.album);
    wrap.innerHTML = "";
    wrap.appendChild(buildSongLink(record.artist, song));
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Find a notable track";
    const errEl = document.createElement("p");
    errEl.className = "spotlight-error";
    errEl.textContent = `Couldn't find a track suggestion (${err.message || err}).`;
    wrap.appendChild(errEl);
  }
}

async function findSpotlightWiki(record, wrap, btn) {
  btn.disabled = true;
  btn.textContent = "Looking up...";

  try {
    const query = `${record.album} ${record.artist} album`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`;

    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) throw new Error(`Wikipedia search failed (${searchResp.status})`);
    const searchData = await searchResp.json();
    const results = searchData?.query?.search || [];

    if (results.length === 0) {
      throw new Error("No Wikipedia article found");
    }

    const title = results[0].title;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryResp = await fetch(summaryUrl);
    if (!summaryResp.ok) throw new Error(`Wikipedia summary failed (${summaryResp.status})`);
    const summaryData = await summaryResp.json();

    if (!summaryData.extract) {
      throw new Error("No summary available");
    }

    wrap.innerHTML = "";

    const resultBox = document.createElement("div");
    resultBox.className = "spotlight-wiki-result";

    const extractEl = document.createElement("p");
    extractEl.textContent = summaryData.extract;
    resultBox.appendChild(extractEl);

    const pageUrl = summaryData.content_urls?.desktop?.page;

    const actions = document.createElement("div");
    actions.className = "spotlight-wiki-actions";

    if (pageUrl) {
      const link = document.createElement("a");
      link.href = pageUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `Read more: ${summaryData.title} ↗`;
      link.addEventListener("click", (e) => e.stopPropagation());
      actions.appendChild(link);
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-secondary";
    saveBtn.textContent = "Save as description";
    saveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        const { error } = await supabaseClient
          .from("records")
          .update({ description: summaryData.extract })
          .eq("id", record.id);
        if (error) throw error;
        record.description = summaryData.extract;
        saveBtn.textContent = "Saved \u2713";
        renderSpotlight();
      } catch (err) {
        console.error(err);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save as description";
      }
    });
    actions.appendChild(saveBtn);

    resultBox.appendChild(actions);
    wrap.appendChild(resultBox);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Look up on Wikipedia";
    const errEl = document.createElement("p");
    errEl.className = "spotlight-error";
    errEl.textContent = `Couldn't find a Wikipedia summary (${err.message || err}).`;
    wrap.appendChild(errEl);
  }
}

function renderRecentlyAdded() {
  const list = document.getElementById("recentList");
  list.innerHTML = "";

  if (allRecords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Nothing added yet.";
    list.appendChild(empty);
    return;
  }

  const recent = [...allRecords].sort((a, b) => b.id - a.id).slice(0, 5);

  recent.forEach((r) => {
    const item = document.createElement("div");
    item.className = "mini-list-item";
    item.appendChild(buildMiniCover(r.cover_url, `${r.album} cover`));

    const info = document.createElement("div");
    info.className = "mini-info";

    const artistEl = document.createElement("div");
    artistEl.className = "mini-artist";
    artistEl.textContent = r.artist;

    const albumEl = document.createElement("div");
    albumEl.className = "mini-album";
    albumEl.textContent = r.album;

    info.appendChild(artistEl);
    info.appendChild(albumEl);
    item.appendChild(info);

    item.addEventListener("click", () => openRecordDetailModal(r.id));
    list.appendChild(item);
  });
}

function renderWishlistHighlights() {
  const list = document.getElementById("wishlistHighlightList");
  list.innerHTML = "";

  if (wishlist.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Your wishlist is empty.";
    list.appendChild(empty);
    return;
  }

  wishlist.slice(0, 5).forEach((w) => {
    const item = document.createElement("div");
    item.className = "mini-list-item";
    item.appendChild(buildMiniCover(w.cover_url, `${w.album} cover`));

    const info = document.createElement("div");
    info.className = "mini-info";

    const artistEl = document.createElement("div");
    artistEl.className = "mini-artist";
    artistEl.textContent = w.artist;

    const albumEl = document.createElement("div");
    albumEl.className = "mini-album";
    albumEl.textContent = w.album;

    info.appendChild(artistEl);
    info.appendChild(albumEl);
    item.appendChild(info);

    item.addEventListener("click", () => setPage("wishlist"));
    list.appendChild(item);
  });
}

function renderHome() {
  renderStats();
  renderSpotlight();
  renderRecentlyAdded();
  renderWishlistHighlights();
}

function renderProfile() {
  document.getElementById("profileEmail").textContent = currentUser?.email || "";

  const memberSinceEl = document.getElementById("profileMemberSince");
  if (currentUser?.created_at) {
    const date = new Date(currentUser.created_at);
    const formatted = date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    memberSinceEl.textContent = `Member since ${formatted}`;
  } else {
    memberSinceEl.textContent = "";
  }

  document.getElementById("profileStatRecords").textContent = allRecords.length;
  document.getElementById("profileStatWishlist").textContent = wishlist.length;
}

function resetSessionUiState() {
  // Clear any transient UI left over from a previous account/session
  spotlightRecordId = null;
  artistFilter = null;
  yearFilter = null;

  const recommendationsList = document.getElementById("recommendationsList");
  const recommendationsStatus = document.getElementById("recommendationsStatus");
  if (recommendationsList) recommendationsList.innerHTML = "";
  if (recommendationsStatus) {
    recommendationsStatus.textContent = "";
    recommendationsStatus.className = "form-status";
  }

  const searchInput = document.getElementById("searchInput");
  const genreFilter = document.getElementById("genreFilter");
  const subgenreFilter = document.getElementById("subgenreFilter");
  const ratingFilter = document.getElementById("ratingFilter");
  if (searchInput) searchInput.value = "";
  if (genreFilter) genreFilter.value = "";
  if (subgenreFilter) subgenreFilter.value = "";
  if (ratingFilter) ratingFilter.value = "";
}

function goToChart(canvasId) {
  setPage("collection");
  requestAnimationFrame(() => {
    const canvas = document.getElementById(canvasId);
    const card = canvas ? canvas.closest(".chart-card") : null;
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("highlight");
    setTimeout(() => card.classList.remove("highlight"), 1200);
  });
}

// ------------ AI Recommendations ------------

function buildTasteProfile() {
  const loved = allRecords
    .filter((r) => r.rating === "love")
    .map((r) => ({ artist: r.artist, album: r.album, genre: r.genre_name, subgenre: r.subgenre_name }));

  const liked = allRecords
    .filter((r) => r.rating === "like")
    .map((r) => ({ artist: r.artist, album: r.album, genre: r.genre_name, subgenre: r.subgenre_name }));

  const ownedArtists = Array.from(new Set(allRecords.map((r) => r.artist)));

  const genreCounts = {};
  allRecords.forEach((r) => {
    if (r.genre_name) genreCounts[r.genre_name] = (genreCounts[r.genre_name] || 0) + 1;
  });
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return { loved, liked, ownedArtists, topGenres };
}

async function handleGetRecommendations() {
  const btn = document.getElementById("getRecommendationsBtn");
  const statusEl = document.getElementById("recommendationsStatus");
  const list = document.getElementById("recommendationsList");

  const profile = buildTasteProfile();

  if (profile.loved.length === 0 && profile.liked.length === 0) {
    statusEl.textContent = 'Rate some albums "Love" or "Like" first so we have something to base suggestions on.';
    statusEl.className = "form-status form-status-error";
    return;
  }

  btn.disabled = true;
  statusEl.textContent = "Thinking about what you might enjoy...";
  statusEl.className = "form-status";
  list.innerHTML = "";

  try {
    const response = await fetch(RECOMMENDATIONS_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(profile),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }

    const suggestions = result.suggestions || [];

    if (suggestions.length === 0) {
      statusEl.textContent = "No suggestions came back. Try again in a moment.";
      statusEl.className = "form-status";
      return;
    }

    statusEl.textContent = "";

    suggestions.forEach((s) => {
      const card = document.createElement("div");
      card.className = "recommendation-card";

      const artistEl = document.createElement("div");
      artistEl.className = "recommendation-artist";
      artistEl.textContent = s.artist;

      const albumEl = document.createElement("div");
      albumEl.className = "recommendation-album";
      albumEl.textContent = s.album;

      const reasonEl = document.createElement("div");
      reasonEl.className = "recommendation-reason";
      reasonEl.textContent = s.reason || "";

      const actions = document.createElement("div");
      actions.className = "recommendation-actions";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn-secondary";
      addBtn.textContent = "Add to Wishlist";
      addBtn.addEventListener("click", () => addRecommendationToWishlist(s.artist, s.album, addBtn));

      const songBtn = document.createElement("button");
      songBtn.type = "button";
      songBtn.className = "btn-secondary";
      songBtn.textContent = "Find a notable track";

      const songWrap = document.createElement("div");
      songWrap.className = "recommendation-song-wrap";

      songBtn.addEventListener("click", () => findRecommendationSong(s, songWrap, songBtn));

      actions.appendChild(addBtn);
      actions.appendChild(songBtn);

      card.appendChild(artistEl);
      card.appendChild(albumEl);
      card.appendChild(reasonEl);
      card.appendChild(actions);
      card.appendChild(songWrap);
      list.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't get recommendations. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    btn.disabled = false;
  }
}

async function findRecommendationSong(suggestion, wrap, btn) {
  btn.disabled = true;
  btn.textContent = "Looking up...";

  try {
    const song = await fetchNotableSong(suggestion.artist, suggestion.album);
    wrap.innerHTML = "";
    wrap.appendChild(buildSongLink(suggestion.artist, song, "spotlight-song-link recommendation-song-link"));
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Find a notable track";
    const errEl = document.createElement("p");
    errEl.className = "spotlight-error";
    errEl.textContent = `Couldn't find a track suggestion (${err.message || err}).`;
    wrap.appendChild(errEl);
  }
}

async function addRecommendationToWishlist(artist, album, btn) {
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const { data, error } = await supabaseClient
      .from("wishlist")
      .insert({
        artist,
        album,
        year: null,
        label: null,
        genre_id: null,
        subgenre_id: null,
        notes: "Suggested by Spin Vinyl",
        cover_url: null,
        discogs_release_id: null,
      })
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
        price_checked_at
      `
      )
      .single();

    if (error) throw error;

    const enriched = { ...data, genre_name: "", subgenre_name: "" };
    wishlist.unshift(enriched);

    btn.textContent = "Added \u2713";

    // Try to find a Discogs match/cover in the background
    findWishlistDiscogsMatch(data.id).then(() => {
      if (currentPage === "wishlist") render();
      if (currentPage === "home") renderWishlistHighlights();
    });

    if (currentPage === "home") renderWishlistHighlights();
  } catch (err) {
    console.error(err);
    btn.textContent = "Error";
    btn.disabled = false;
  }
}



function computeGenreCounts() {
  const counts = {};
  allRecords.forEach((r) => {
    const name = r.genre_name || "Unspecified";
    counts[name] = (counts[name] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function computeArtistCounts() {
  const counts = {};
  allRecords.forEach((r) => {
    counts[r.artist] = (counts[r.artist] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function computeDecadeCounts() {
  const counts = {};
  allRecords.forEach((r) => {
    if (!r.year) return;
    const decade = Math.floor(r.year / 10) * 10;
    counts[decade] = (counts[decade] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([d, c]) => [Number(d), c])
    .sort((a, b) => a[0] - b[0]);
}

function upsertBarChart(instance, canvasId, labels, data, onBarClick) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return instance;

  if (instance) {
    instance.data.labels = labels;
    instance.data.datasets[0].data = data;
    instance.update();
    return instance;
  }

  return new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: "#caa15a",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#9ca3af", autoSkip: true, maxRotation: 45, minRotation: 0 },
          grid: { display: false },
        },
        y: {
          ticks: { color: "#9ca3af", precision: 0 },
          grid: { color: "#1f2937" },
          beginAtZero: true,
        },
      },
      onClick: (evt, elements, chart) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const label = chart.data.labels[idx];
        onBarClick(label);
      },
    },
  });
}

const RATING_LABELS = Object.fromEntries(RATING_OPTIONS.map((o) => [o.value, o.label]));
RATING_LABELS.unrated = "Unrated";

function clearAllFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("genreFilter").value = "";
  populateSubgenreFilterOptions();
  document.getElementById("ratingFilter").value = "";
  artistFilter = null;
  yearFilter = null;
  render();
}

function renderActiveFilters() {
  const bar = document.getElementById("activeFiltersBar");
  bar.innerHTML = "";

  if (currentPage !== "collection") {
    bar.hidden = true;
    return;
  }

  const chips = [];

  const searchVal = document.getElementById("searchInput").value.trim();
  if (searchVal) {
    chips.push({
      label: `Search: "${searchVal}"`,
      onClear: () => {
        document.getElementById("searchInput").value = "";
        render();
      },
    });
  }

  const genreVal = document.getElementById("genreFilter").value;
  if (genreVal) {
    chips.push({
      label: `Genre: ${genreNameById(Number(genreVal))}`,
      onClear: () => {
        document.getElementById("genreFilter").value = "";
        populateSubgenreFilterOptions();
        render();
      },
    });
  }

  const subgenreVal = document.getElementById("subgenreFilter").value;
  if (subgenreVal) {
    chips.push({
      label: `Subgenre: ${subgenreNameById(Number(subgenreVal))}`,
      onClear: () => {
        document.getElementById("subgenreFilter").value = "";
        render();
      },
    });
  }

  const ratingVal = document.getElementById("ratingFilter").value;
  if (ratingVal) {
    chips.push({
      label: `Rating: ${RATING_LABELS[ratingVal] || ratingVal}`,
      onClear: () => {
        document.getElementById("ratingFilter").value = "";
        render();
      },
    });
  }

  if (artistFilter) {
    chips.push({
      label: `Artist: ${artistFilter}`,
      onClear: () => {
        artistFilter = null;
        render();
      },
    });
  }

  if (yearFilter) {
    chips.push({
      label: `Decade: ${yearFilter.start}s`,
      onClear: () => {
        yearFilter = null;
        render();
      },
    });
  }

  if (chips.length === 0) {
    bar.hidden = true;
    return;
  }

  chips.forEach((chip) => {
    const el = document.createElement("span");
    el.className = "filter-chip";

    const text = document.createElement("span");
    text.textContent = chip.label;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "✕";
    btn.setAttribute("aria-label", `Clear ${chip.label}`);
    btn.addEventListener("click", chip.onClear);

    el.appendChild(text);
    el.appendChild(btn);
    bar.appendChild(el);
  });

  if (chips.length > 1) {
    const clearAllBtn = document.createElement("button");
    clearAllBtn.type = "button";
    clearAllBtn.className = "filter-chip clear-all";
    clearAllBtn.textContent = "Clear all";
    clearAllBtn.addEventListener("click", clearAllFilters);
    bar.appendChild(clearAllBtn);
  }

  bar.hidden = false;
}

function renderCharts() {
  if (typeof Chart === "undefined") return;

  const genreData = computeGenreCounts();
  const artistData = computeArtistCounts();
  const decadeData = computeDecadeCounts();

  genreChart = upsertBarChart(
    genreChart,
    "genreChart",
    genreData.map(([k]) => k),
    genreData.map(([, v]) => v),
    (label) => {
      const g = genres.find((g) => g.name === label);
      if (!g) return;
      document.getElementById("genreFilter").value = String(g.id);
      populateSubgenreFilterOptions();
      render();
    }
  );

  artistChart = upsertBarChart(
    artistChart,
    "artistChart",
    artistData.map(([k]) => k),
    artistData.map(([, v]) => v),
    (label) => {
      artistFilter = artistFilter === label ? null : label;
      yearFilter = null;
      render();
    }
  );

  decadeChart = upsertBarChart(
    decadeChart,
    "decadeChart",
    decadeData.map(([d]) => `${d}s`),
    decadeData.map(([, v]) => v),
    (label) => {
      const start = Number(label.replace("s", ""));
      if (yearFilter && yearFilter.start === start) {
        yearFilter = null;
      } else {
        yearFilter = { start, end: start + 9 };
      }
      artistFilter = null;
      render();
    }
  );
}

// ------------ Render / page switching ------------

function render() {
  if (currentPage === "home") {
    renderHome();
    return;
  }

  if (currentPage === "wishlist") {
    renderWishlist();
    document.getElementById("activeFiltersBar").hidden = true;
    setStatus(`${wishlist.length} item${wishlist.length === 1 ? "" : "s"} on your wishlist`);
    return;
  }

  const filtered = getFilteredRecords();
  renderCards(filtered);
  renderCharts();
  renderActiveFilters();

  setStatus(`Showing ${filtered.length} of ${allRecords.length} records`);
}

function setPage(page) {
  currentPage = page;

  const homeBtn = document.getElementById("homePageBtn");
  const collectionBtn = document.getElementById("collectionPageBtn");
  const wishlistBtn = document.getElementById("wishlistPageBtn");

  const homeSection = document.getElementById("homeSection");
  const profileSection = document.getElementById("profileSection");
  const atAGlanceSection = document.getElementById("atAGlanceSection");
  const cardSection = document.getElementById("cardSection");
  const wishlistSection = document.getElementById("wishlistSection");
  const filterControls = document.getElementById("collectionFilters");
  const statusSection = document.getElementById("status");
  const gridDensity = document.getElementById("gridDensityControl");
  const pageNav = document.getElementById("pageNav");

  const isHome = page === "home";
  const isCollection = page === "collection";
  const isWishlist = page === "wishlist";
  const isProfile = page === "profile";

  [
    [homeBtn, isHome],
    [collectionBtn, isCollection],
    [wishlistBtn, isWishlist],
  ].forEach(([btn, active]) => {
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  homeSection.hidden = !isHome;
  profileSection.hidden = !isProfile;
  atAGlanceSection.hidden = !isCollection;
  cardSection.hidden = !isCollection;
  wishlistSection.hidden = !isWishlist;
  filterControls.hidden = !isCollection;
  statusSection.hidden = isHome || isProfile;
  gridDensity.hidden = isHome || isProfile;
  pageNav.hidden = isProfile;

  document.getElementById("addRecordBtn").hidden = !isCollection;
  document.getElementById("addWishlistBtn").hidden = !isWishlist;
  document.getElementById("findAllDiscogsBtn").hidden = !isWishlist;
  document.getElementById("importBtn").hidden = isHome || isProfile;

  if (isProfile) {
    renderProfile();
    return;
  }

  render();
}

// ------------ Grid density ------------

function applyGridCols(value) {
  const root = document.documentElement.style;
  if (value === "auto") {
    root.setProperty("--grid-cols", "auto-fill");
    root.setProperty("--grid-min", "150px");
  } else {
    root.setProperty("--grid-cols", value);
    root.setProperty("--grid-min", "0px");
  }
  try {
    localStorage.setItem("spin-grid-cols", value);
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
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
    if (result.genre) populateSubgenreOptionsForGenre(result.genre);
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
    if (result.genre) populateSubgenreOptionsForGenre(result.genre);
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
  populateSubgenreOptionsForGenre(document.getElementById("fieldGenre").value);
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
  populateSubgenreOptionsForGenre(null);
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
      const placeholderImg = document.createElement("img");
      placeholderImg.src = "icon-512.png";
      placeholderImg.alt = "";
      placeholderImg.loading = "lazy";
      placeholder.appendChild(placeholderImg);
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

    if (w.discogs_release_id) {
      const priceBtn = document.createElement("button");
      priceBtn.type = "button";
      priceBtn.className = "btn-secondary price-btn";
      priceBtn.textContent = "Check price";
      priceBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        checkWishlistPrice(w.id);
      });
      priceWrap.appendChild(priceBtn);
    } else {
      const findBtn = document.createElement("button");
      findBtn.type = "button";
      findBtn.className = "btn-secondary price-btn";
      findBtn.textContent = "Find on Discogs";
      findBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        findWishlistDiscogsMatch(w.id);
      });
      priceWrap.appendChild(findBtn);
    }

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

async function lookupDiscogsByArtistAlbum(artist, album) {
  const response = await fetch(DISCOGS_LOOKUP_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ artist, album }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Lookup failed (${response.status})`);
  }

  return result;
}

async function findWishlistDiscogsMatch(wishlistId) {
  const item = wishlist.find((w) => w.id === wishlistId);
  if (!item) return;

  setStatus(`Searching Discogs for "${item.album}" by ${item.artist}...`);

  try {
    const result = await lookupDiscogsByArtistAlbum(item.artist, item.album);
    console.log("Discogs lookup debug:", result.debug, result);

    if (!result.found) {
      setStatus(`No Discogs match found for "${item.album}" by ${item.artist}.`);
      return;
    }

    const updates = {
      discogs_release_id: result.discogs_release_id || null,
      cover_url: item.cover_url || result.cover_url || null,
    };

    const { error } = await supabaseClient
      .from("wishlist")
      .update(updates)
      .eq("id", wishlistId);

    if (error) throw error;

    Object.assign(item, updates);
    render();
    setStatus(`Found a Discogs match for "${item.album}" by ${item.artist}.`);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't search Discogs. See console for details.");
  }
}

async function findAllWishlistDiscogsMatches() {
  const targets = wishlist.filter((w) => !w.discogs_release_id);

  if (targets.length === 0) {
    setStatus("Every wishlist item already has a Discogs match.");
    return;
  }

  const btn = document.getElementById("findAllDiscogsBtn");
  if (btn) btn.disabled = true;

  let found = 0;
  let notFound = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    setStatus(`Checking Discogs ${i + 1} of ${targets.length}: "${item.album}" by ${item.artist}...`);

    try {
      const result = await lookupDiscogsByArtistAlbum(item.artist, item.album);

      if (result.found) {
        const updates = {
          discogs_release_id: result.discogs_release_id || null,
          cover_url: item.cover_url || result.cover_url || null,
        };

        const { error } = await supabaseClient
          .from("wishlist")
          .update(updates)
          .eq("id", item.id);

        if (!error) {
          Object.assign(item, updates);
          found++;
        }
      } else {
        notFound++;
      }
    } catch (err) {
      console.error(err);
      notFound++;
    }

    render();

    // Discogs allows ~60 authenticated requests/minute
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  if (btn) btn.disabled = false;
  setStatus(`Done. Matched ${found}, no match for ${notFound}.`);
}

function openAddWishlistModal() {
  document.getElementById("addWishlistOverlay").hidden = false;
  document.getElementById("addWishlistStatus").textContent = "";
  document.getElementById("wishScanStatus").textContent = "";
  document.getElementById("wishScanStatus").className = "form-status";
  pendingWishlistCoverUrl = null;
  pendingWishlistDiscogsId = null;
  populateSubgenreOptionsForGenre(document.getElementById("wishGenre").value);
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
  populateSubgenreOptionsForGenre(null);
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
        price_checked_at
      `
      )
      .single();

    if (error) throw error;

    const enriched = {
      ...data,
      genre_name: genreNameById(data.genre_id),
      subgenre_name: subgenreNameById(data.subgenre_id),
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


// ------------ Bulk Import ------------

function buildImportPreview() {
  const preview = document.getElementById("importPreview");
  const summary = document.getElementById("importSummary");
  const colMap = document.getElementById("importColumnMap");
  const confirmBtn = document.getElementById("confirmImportBtn");

  if (!importRawRows || importRawRows.length === 0) {
    preview.hidden = true;
    confirmBtn.disabled = true;
    importParsedRows = [];
    return;
  }

  const target = document.getElementById("importTarget").value;
  const rowKeys = Object.keys(importRawRows[0]);

  const colKeys = {};
  Object.keys(IMPORT_COLUMN_ALIASES).forEach((field) => {
    colKeys[field] = findColumnKey(rowKeys, IMPORT_COLUMN_ALIASES[field]);
  });

  const relevantFields =
    target === "records"
      ? ["artist", "album", "year", "label", "genre", "subgenre", "description", "vinylGrade", "sleeveGrade", "notes", "quantity"]
      : ["artist", "album", "year", "label", "genre", "subgenre", "notes"];

  const parsed = [];
  let skipped = 0;

  importRawRows.forEach((row) => {
    const artistRaw = colKeys.artist ? row[colKeys.artist] : null;
    const albumRaw = colKeys.album ? row[colKeys.album] : null;

    const artistStr = artistRaw != null ? String(artistRaw).trim() : "";
    const albumStr = albumRaw != null ? String(albumRaw).trim() : "";

    if (!artistStr || !albumStr) {
      skipped++;
      return;
    }

    const { year, yearRaw } = colKeys.year
      ? parseYearFlexible(row[colKeys.year])
      : { year: null, yearRaw: null };

    const genreRaw = colKeys.genre ? row[colKeys.genre] : null;
    const subgenreRaw = colKeys.subgenre ? row[colKeys.subgenre] : null;

    const item = {
      artist: artistStr,
      album: albumStr,
      year,
      year_raw: yearRaw,
      label: colKeys.label && row[colKeys.label] != null ? String(row[colKeys.label]).trim() || null : null,
      _genreNorm: normalizeGenre(genreRaw != null ? String(genreRaw) : null),
      _subgenreNorm: normalizeGenre(subgenreRaw != null ? String(subgenreRaw) : null),
      notes: colKeys.notes && row[colKeys.notes] != null ? String(row[colKeys.notes]).trim() || null : null,
    };

    if (target === "records") {
      item.description =
        colKeys.description && row[colKeys.description] != null
          ? String(row[colKeys.description]).trim() || null
          : null;
      item.vinyl_grade =
        colKeys.vinylGrade && row[colKeys.vinylGrade] != null
          ? String(row[colKeys.vinylGrade]).trim() || null
          : null;
      item.sleeve_grade =
        colKeys.sleeveGrade && row[colKeys.sleeveGrade] != null
          ? String(row[colKeys.sleeveGrade]).trim() || null
          : null;

      let qty = 1;
      if (colKeys.quantity && row[colKeys.quantity] != null) {
        const n = parseYearInput(row[colKeys.quantity]);
        qty = n && n > 0 ? n : 1;
      }
      item.quantity = qty;
    }

    parsed.push(item);
  });

  importParsedRows = parsed;

  const existingGenreNames = new Set(genres.map((g) => g.name.toLowerCase()));
  const existingSubgenreNames = new Set(subgenres.map((sg) => sg.name.toLowerCase()));
  const newGenres = new Set();
  const newSubgenres = new Set();

  parsed.forEach((r) => {
    if (r._genreNorm && !existingGenreNames.has(r._genreNorm.toLowerCase())) {
      newGenres.add(r._genreNorm);
    }
    if (r._subgenreNorm && !existingSubgenreNames.has(r._subgenreNorm.toLowerCase())) {
      newSubgenres.add(r._subgenreNorm);
    }
  });

  summary.textContent =
    `${parsed.length} row${parsed.length === 1 ? "" : "s"} ready to import` +
    (skipped ? ` (${skipped} skipped — missing artist or album)` : "") +
    `. ${newGenres.size} new genre${newGenres.size === 1 ? "" : "s"} and ` +
    `${newSubgenres.size} new subgenre${newSubgenres.size === 1 ? "" : "s"} will be created.`;

  colMap.innerHTML = "";
  relevantFields.forEach((field) => {
    const span = document.createElement("span");
    const key = colKeys[field];
    span.className = key ? "mapped" : "unmapped";
    span.textContent = `${field}: ${key ? `"${key}"` : "not found"}`;
    colMap.appendChild(span);
  });

  preview.hidden = false;
  confirmBtn.disabled = parsed.length === 0;
}

async function handleImportFileChange(event) {
  const file = event.target.files && event.target.files[0];
  const statusEl = document.getElementById("importStatus");
  statusEl.textContent = "";
  statusEl.className = "form-status";

  if (!file) {
    importRawRows = [];
    buildImportPreview();
    return;
  }

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    importRawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    buildImportPreview();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't read this file. Check console for details.";
    statusEl.className = "form-status form-status-error";
    importRawRows = [];
    buildImportPreview();
  }
}

async function ensureGenresAndSubgenres(rows) {
  const existingGenreNames = new Set(genres.map((g) => g.name.toLowerCase()));
  const newGenreNames = new Set();

  rows.forEach((r) => {
    if (r._genreNorm && !existingGenreNames.has(r._genreNorm.toLowerCase())) {
      newGenreNames.add(r._genreNorm);
    }
  });

  if (newGenreNames.size > 0) {
    const insertRows = Array.from(newGenreNames).map((name) => ({ name }));
    const { data, error } = await supabaseClient.from("genres").insert(insertRows).select();
    if (error) throw error;
    genres.push(...data);
  }

  const genreIdByName = {};
  genres.forEach((g) => {
    genreIdByName[g.name.toLowerCase()] = g.id;
  });

  const existingSubgenreNames = new Set(subgenres.map((sg) => sg.name.toLowerCase()));
  const newSubgenres = new Map();

  rows.forEach((r) => {
    if (!r._subgenreNorm) return;
    const key = r._subgenreNorm.toLowerCase();
    if (existingSubgenreNames.has(key) || newSubgenres.has(key)) return;
    const genreId = r._genreNorm ? genreIdByName[r._genreNorm.toLowerCase()] ?? null : null;
    newSubgenres.set(key, { name: r._subgenreNorm, genre_id: genreId });
  });

  if (newSubgenres.size > 0) {
    const insertRows = Array.from(newSubgenres.values());
    const { data, error } = await supabaseClient.from("subgenres").insert(insertRows).select();
    if (error) throw error;
    subgenres.push(...data);
  }

  const subgenreIdByName = {};
  subgenres.forEach((sg) => {
    subgenreIdByName[sg.name.toLowerCase()] = sg.id;
  });

  rows.forEach((r) => {
    r.genre_id = r._genreNorm ? genreIdByName[r._genreNorm.toLowerCase()] ?? null : null;
    r.subgenre_id = r._subgenreNorm ? subgenreIdByName[r._subgenreNorm.toLowerCase()] ?? null : null;
  });
}

async function handleConfirmImport() {
  const statusEl = document.getElementById("importStatus");
  const confirmBtn = document.getElementById("confirmImportBtn");
  const target = document.getElementById("importTarget").value;

  if (!importParsedRows || importParsedRows.length === 0) return;

  confirmBtn.disabled = true;
  statusEl.className = "form-status";
  statusEl.textContent = "Preparing genres and subgenres...";

  try {
    await ensureGenresAndSubgenres(importParsedRows);

    const rows = importParsedRows.map((r) => {
      const base = {
        artist: r.artist,
        album: r.album,
        year: r.year,
        label: r.label,
        genre_id: r.genre_id,
        subgenre_id: r.subgenre_id,
        notes: r.notes,
        cover_url: null,
      };

      if (target === "records") {
        return {
          ...base,
          year_raw: r.year_raw,
          description: r.description,
          vinyl_grade: r.vinyl_grade,
          sleeve_grade: r.sleeve_grade,
          quantity: r.quantity,
        };
      }

      return {
        ...base,
        discogs_release_id: null,
      };
    });

    const BATCH_SIZE = 100;
    let inserted = 0;

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const chunk = rows.slice(start, start + BATCH_SIZE);
      statusEl.textContent = `Importing ${start + 1}–${Math.min(start + BATCH_SIZE, rows.length)} of ${rows.length}...`;
      const { error } = await supabaseClient.from(target).insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    statusEl.textContent = `Imported ${inserted} item${inserted === 1 ? "" : "s"}. Refreshing...`;
    statusEl.className = "form-status form-status-success";

    await loadData();

    statusEl.textContent = `Imported ${inserted} item${inserted === 1 ? "" : "s"} successfully.`;

    setTimeout(() => {
      closeImportModal();
    }, 1200);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Import failed. Check console for details.";
    statusEl.className = "form-status form-status-error";
  } finally {
    confirmBtn.disabled = importParsedRows.length === 0;
  }
}

function openImportModal() {
  document.getElementById("importOverlay").hidden = false;
  document.getElementById("importTarget").value = currentPage === "wishlist" ? "wishlist" : "records";
  document.getElementById("importStatus").textContent = "";
  document.getElementById("importStatus").className = "form-status";
  document.getElementById("importPreview").hidden = true;
  document.getElementById("confirmImportBtn").disabled = true;
  document.getElementById("importFile").value = "";
  importRawRows = [];
  importParsedRows = [];
}

function closeImportModal() {
  document.getElementById("importOverlay").hidden = true;
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
  populateSubgenreOptionsForGenre(record.genre_name || "");
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
        price_checked_at
      `
      )
      .order("added_at", { ascending: false });
    if (wishlistError) throw wishlistError;

    wishlist =
      wishlistData?.map((w) => ({
        ...w,
        genre_name: genreNameById(w.genre_id),
        subgenre_name: subgenreNameById(w.subgenre_id),
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

  // Make the subgenre suggestions in Add Record / Add Wishlist / Edit forms
  // depend on whatever genre name has been typed in that same form.
  ["fieldGenre", "wishGenre", "detailGenre"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (e) => {
      populateSubgenreOptionsForGenre(e.target.value);
    });
    document.getElementById(id).addEventListener("focus", (e) => {
      populateSubgenreOptionsForGenre(e.target.value);
    });
  });

  document
    .getElementById("genreFilter")
    .addEventListener("change", () => {
      populateSubgenreFilterOptions();
      render();
    });

  document
    .getElementById("subgenreFilter")
    .addEventListener("change", () => render());

  document
    .getElementById("ratingFilter")
    .addEventListener("change", () => render());

  document
    .getElementById("homePageBtn")
    .addEventListener("click", () => setPage("home"));

  function makeKeyboardClickable(el) {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  }

  const statRecordsBox = document.getElementById("statRecordsBox");
  const statGenresBox = document.getElementById("statGenresBox");
  const statDecadeBox = document.getElementById("statDecadeBox");
  const statWishlistBox = document.getElementById("statWishlistBox");

  statRecordsBox.addEventListener("click", () => setPage("collection"));
  statGenresBox.addEventListener("click", () => goToChart("genreChart"));
  statDecadeBox.addEventListener("click", () => goToChart("decadeChart"));
  statWishlistBox.addEventListener("click", () => setPage("wishlist"));

  [statRecordsBox, statGenresBox, statDecadeBox, statWishlistBox].forEach(makeKeyboardClickable);

  document
    .getElementById("collectionPageBtn")
    .addEventListener("click", () => setPage("collection"));

  document
    .getElementById("wishlistPageBtn")
    .addEventListener("click", () => setPage("wishlist"));

  document
    .getElementById("spotlightShuffleBtn")
    .addEventListener("click", () => {
      spotlightRecordId = null;
      renderSpotlight();
    });

  document
    .getElementById("getRecommendationsBtn")
    .addEventListener("click", () => handleGetRecommendations());

  const gridColsSelect = document.getElementById("gridColsSelect");
  let savedCols = "auto";
  try {
    savedCols = localStorage.getItem("spin-grid-cols") || "auto";
  } catch {
    // ignore storage errors
  }
  gridColsSelect.value = savedCols;
  applyGridCols(savedCols);
  gridColsSelect.addEventListener("change", (e) => applyGridCols(e.target.value));

  document
    .getElementById("importBtn")
    .addEventListener("click", () => openImportModal());

  document
    .getElementById("closeImportBtn")
    .addEventListener("click", () => closeImportModal());

  document
    .getElementById("cancelImportBtn")
    .addEventListener("click", () => closeImportModal());

  document
    .getElementById("importFile")
    .addEventListener("change", handleImportFileChange);

  document
    .getElementById("importTarget")
    .addEventListener("change", () => buildImportPreview());

  document
    .getElementById("confirmImportBtn")
    .addEventListener("click", () => handleConfirmImport());

  document
    .getElementById("importOverlay")
    .addEventListener("click", (e) => {
      if (e.target.id === "importOverlay") {
        closeImportModal();
      }
    });


  document
    .getElementById("addWishlistBtn")
    .addEventListener("click", () => openAddWishlistModal());

  document
    .getElementById("findAllDiscogsBtn")
    .addEventListener("click", () => findAllWishlistDiscogsMatches());

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

// ------------ Auth ------------

let currentUser = null;
let authMode = "signin"; // "signin" | "signup"

function showAuthOverlay(show) {
  const overlay = document.getElementById("authOverlay");
  overlay.hidden = !show;
}

function resetPasswordVisibility() {
  const input = document.getElementById("authPassword");
  const btn = document.getElementById("authPasswordToggle");
  input.type = "password";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", "Show password");
  btn.innerHTML = '<i class="ti ti-eye" aria-hidden="true"></i>';
}

function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById("authTitle");
  const submitBtn = document.getElementById("authSubmitBtn");
  const toggleLabel = document.getElementById("authToggleLabel");
  const toggleBtn = document.getElementById("authToggleBtn");
  const statusEl = document.getElementById("authStatus");

  statusEl.textContent = "";
  statusEl.className = "form-status";
  resetPasswordVisibility();

  if (mode === "signup") {
    title.textContent = "Create your Spin Vinyl account";
    submitBtn.textContent = "Create account";
    toggleLabel.textContent = "Already have an account?";
    toggleBtn.textContent = "Sign in";
  } else {
    title.textContent = "Sign in to Spin Vinyl";
    submitBtn.textContent = "Sign in";
    toggleLabel.textContent = "Don't have an account?";
    toggleBtn.textContent = "Create one";
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const submitBtn = document.getElementById("authSubmitBtn");
  const statusEl = document.getElementById("authStatus");

  submitBtn.disabled = true;
  statusEl.textContent = authMode === "signup" ? "Creating account..." : "Signing in...";
  statusEl.className = "form-status";

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;

      if (data.session) {
        // Email confirmation not required - signed in immediately
        statusEl.textContent = "Account created!";
        statusEl.className = "form-status form-status-success";
      } else {
        statusEl.textContent = "Check your email to confirm your account, then sign in.";
        statusEl.className = "form-status form-status-success";
        setAuthMode("signin");
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      statusEl.textContent = "";
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.message || "Something went wrong. Please try again.";
    statusEl.className = "form-status form-status-error";
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleSignOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (err) {
    console.error(err);
  }
}

async function onSignedIn(user) {
  currentUser = user;

  document.getElementById("accountEmail").textContent = user.email || "";
  document.getElementById("accountSection").hidden = false;
  showAuthOverlay(false);

  resetSessionUiState();
  await loadData();
  maybeShowOnboarding();
}

function onSignedOut() {
  currentUser = null;

  document.getElementById("accountSection").hidden = true;
  document.getElementById("authForm").reset();
  setAuthMode("signin");
  document.getElementById("onboardingScreen").hidden = true;
  resetSessionUiState();
  allRecords = [];
  wishlist = [];
  setPage("home");
  showAuthOverlay(true);
}

function setupAuth() {
  document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);

  document.getElementById("authPasswordToggle").addEventListener("click", () => {
    const input = document.getElementById("authPassword");
    const btn = document.getElementById("authPasswordToggle");
    const isVisible = input.type === "text";

    input.type = isVisible ? "password" : "text";
    btn.setAttribute("aria-pressed", String(!isVisible));
    btn.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
    btn.innerHTML = isVisible
      ? '<i class="ti ti-eye" aria-hidden="true"></i>'
      : '<i class="ti ti-eye-off" aria-hidden="true"></i>';
  });

  document.getElementById("authToggleBtn").addEventListener("click", () => {
    setAuthMode(authMode === "signup" ? "signin" : "signup");
  });

  document.getElementById("accountBtn").addEventListener("click", () => setPage("profile"));

  document.getElementById("profileBackBtn").addEventListener("click", () => setPage("home"));

  document.getElementById("profileSignOutBtn").addEventListener("click", () => handleSignOut());

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      onSignedIn(session.user);
    } else {
      onSignedOut();
    }
  });
}

// ------------ Onboarding ------------

function maybeShowOnboarding() {
  const screen = document.getElementById("onboardingScreen");
  console.log("maybeShowOnboarding:", {
    screenFound: !!screen,
    allRecordsLength: allRecords.length,
    wishlistLength: wishlist.length,
  });

  if (allRecords.length === 0 && wishlist.length === 0) {
    screen.hidden = false;
    console.log("Onboarding screen shown, hidden =", screen.hidden);
  } else {
    screen.hidden = true;
  }
}

function dismissOnboarding() {
  document.getElementById("onboardingScreen").hidden = true;
}

function setupOnboarding() {
  document.getElementById("onboardImportBtn").addEventListener("click", () => {
    dismissOnboarding();
    setPage("collection");
    openImportModal();
  });

  document.getElementById("onboardAddBtn").addEventListener("click", () => {
    dismissOnboarding();
    setPage("collection");
    openAddRecordModal();
  });

  document.getElementById("onboardExploreBtn").addEventListener("click", () => {
    dismissOnboarding();
    setPage("home");
  });
}



function setupSplashScreen() {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  let dismissed = false;

  const dismiss = (skip) => {
    if (dismissed) return;
    dismissed = true;
    if (skip) {
      splash.classList.add("splash-skip");
    }
  };

  splash.addEventListener("click", () => dismiss(true));
  splash.addEventListener("animationend", (e) => {
    if (e.target === splash) {
      splash.hidden = true;
    }
  });

  // Safety net in case the animationend event doesn't fire for some reason
  setTimeout(() => {
    splash.hidden = true;
  }, 4000);
}

// 7. Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupSplashScreen();
  setupEvents();
  setupOnboarding();
  setupAuth();
});
