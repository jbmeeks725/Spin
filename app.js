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

function renderTable() {
  const tbody = document.getElementById("recordsBody");
  tbody.innerHTML = "";

  const searchText = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();

  const genreFilterVal = document.getElementById("genreFilter").value;
  const subgenreFilterVal = document.getElementById("subgenreFilter").value;

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

    tr.appendChild(tdArtist);
    tr.appendChild(tdAlbum);
    tr.appendChild(tdYear);
    tr.appendChild(tdGenre);
    tr.appendChild(tdSubgenre);
    tr.appendChild(tdLabel);

    tbody.appendChild(tr);
  });

  setStatus(`Showing ${filtered.length} of ${allRecords.length} records`);
}

// 5. Load data from Supabase
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
    renderTable();
  } catch (err) {
    console.error(err);
    setStatus("Error loading data. See console for details.");
  }
}

// 6. Wire up events
function setupEvents() {
  document
    .getElementById("searchInput")
    .addEventListener("input", () => renderTable());

  document
    .getElementById("genreFilter")
    .addEventListener("change", () => renderTable());

  document
    .getElementById("subgenreFilter")
    .addEventListener("change", () => renderTable());
}

// 7. Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  loadData();
});