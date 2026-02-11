const companyFilter = document.getElementById('companyFilter');
const typeFilter = document.getElementById('typeFilter');
const stateFilter = document.getElementById('stateFilter');
const citySearch = document.getElementById('citySearch');
const plantsBody = document.getElementById('plantsBody');
const resultCount = document.getElementById('resultCount');
const showOnlySelected = document.getElementById('showOnlySelected');
const addressInput = document.getElementById('addressInput');
const mapAddressBtn = document.getElementById('mapAddressBtn');
const clearAddressBtn = document.getElementById('clearAddressBtn');
const addressStatus = document.getElementById('addressStatus');

const map = L.map('map').setView([34.9, -89.5], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const selectedPlantIds = new Set();
let userAddressMarker = null;
let userAddressPoint = null;
let plantMarkers = [];
let distanceLines = [];

const markerStyles = {
  'Asphalt Plant': { color: '#1d4ed8', fillColor: '#3b82f6' },
  'Sand & Gravel Pit': { color: '#92400e', fillColor: '#d97706' },
  'Limestone Quarry': { color: '#065f46', fillColor: '#10b981' },
};

function populateDropdown(select, values) {
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function initializeFilters() {
  const companies = [...new Set(plants.map((p) => p.company))].sort();
  const facilityTypes = [...new Set(plants.map((p) => p.type))].sort();
  populateDropdown(companyFilter, companies);
  populateDropdown(typeFilter, facilityTypes);
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * y;
}

function getFilteredPlants() {
  const company = companyFilter.value;
  const type = typeFilter.value;
  const state = stateFilter.value;
  const keyword = citySearch.value.trim().toLowerCase();

  return plants.filter((plant) => {
    const companyMatch = company === 'all' || plant.company === company;
    const typeMatch = type === 'all' || plant.type === type;
    const stateMatch = state === 'all' || plant.state === state;
    const searchBlob =
      `${plant.type} ${plant.city} ${plant.county} ${plant.address} ${plant.plantName}`.toLowerCase();
    const keywordMatch = !keyword || searchBlob.includes(keyword);
    return companyMatch && typeMatch && stateMatch && keywordMatch;
  });
}

function clearMapLayers() {
  plantMarkers.forEach((marker) => map.removeLayer(marker));
  distanceLines.forEach((line) => map.removeLayer(line));
  plantMarkers = [];
  distanceLines = [];
}

function drawDistanceLines(filteredPlants) {
  if (!userAddressPoint || selectedPlantIds.size === 0) {
    return;
  }

  filteredPlants
    .filter((plant) => selectedPlantIds.has(plant.id))
    .forEach((plant) => {
      const line = L.polyline(
        [
          [userAddressPoint.lat, userAddressPoint.lng],
          [plant.lat, plant.lng],
        ],
        {
          color: '#2f80ed',
          weight: 2,
          dashArray: '6 6',
        }
      ).addTo(map);
      distanceLines.push(line);
    });
}

function createFacilityMarker(plant) {
  const style = markerStyles[plant.type] || markerStyles['Asphalt Plant'];
  return L.circleMarker([plant.lat, plant.lng], {
    radius: 8,
    color: style.color,
    fillColor: style.fillColor,
    fillOpacity: 0.9,
    weight: 2,
  }).bindPopup(`
      <strong>${plant.plantName}</strong><br/>
      ${plant.type}<br/>
      ${plant.company}<br/>
      ${plant.address}<br/>
      ${plant.city}, ${plant.state}
    `);
}

function renderMap(filteredPlants) {
  clearMapLayers();

  const showSelectedOnly = showOnlySelected.checked;
  const plantsToMap = showSelectedOnly
    ? filteredPlants.filter((plant) => selectedPlantIds.has(plant.id))
    : filteredPlants;

  plantsToMap.forEach((plant) => {
    const marker = createFacilityMarker(plant).addTo(map);
    plantMarkers.push(marker);
  });

  drawDistanceLines(filteredPlants);

  const boundsPoints = plantsToMap.map((p) => [p.lat, p.lng]);
  if (userAddressPoint) {
    boundsPoints.push([userAddressPoint.lat, userAddressPoint.lng]);
  }

  if (boundsPoints.length > 0) {
    map.fitBounds(boundsPoints, { padding: [30, 30] });
  }
}

function renderTable(filteredPlants) {
  plantsBody.innerHTML = '';

  filteredPlants.forEach((plant) => {
    const tr = document.createElement('tr');
    const distance = userAddressPoint
      ? haversineMiles(userAddressPoint.lat, userAddressPoint.lng, plant.lat, plant.lng).toFixed(1)
      : '—';

    tr.innerHTML = `
      <td><input type="checkbox" data-id="${plant.id}" ${selectedPlantIds.has(plant.id) ? 'checked' : ''} /></td>
      <td>${plant.type}</td>
      <td>${plant.company}</td>
      <td>${plant.plantName}</td>
      <td>${plant.city}, ${plant.county} Co., ${plant.state}</td>
      <td>${plant.address}</td>
      <td>${distance}</td>
    `;

    plantsBody.append(tr);
  });

  resultCount.textContent = `${filteredPlants.length} facilities shown`;

  plantsBody.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const id = event.target.dataset.id;
      if (event.target.checked) {
        selectedPlantIds.add(id);
      } else {
        selectedPlantIds.delete(id);
      }
      refresh();
    });
  });
}

function refresh() {
  const filteredPlants = getFilteredPlants();
  renderTable(filteredPlants);
  renderMap(filteredPlants);
}

async function geocodeAddress(address) {
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', address);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('limit', '1');

  const response = await fetch(endpoint.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Address lookup failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.length) {
    throw new Error('No matching address found.');
  }

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    displayName: data[0].display_name,
  };
}

mapAddressBtn.addEventListener('click', async () => {
  const address = addressInput.value.trim();
  if (!address) {
    addressStatus.textContent = 'Enter an address first.';
    return;
  }

  addressStatus.textContent = 'Looking up address...';

  try {
    const point = await geocodeAddress(address);
    userAddressPoint = point;

    if (userAddressMarker) {
      map.removeLayer(userAddressMarker);
    }

    userAddressMarker = L.marker([point.lat, point.lng], {
      title: 'Your address',
    })
      .addTo(map)
      .bindPopup(`<strong>Your address</strong><br/>${point.displayName}`)
      .openPopup();

    addressStatus.textContent = `Mapped: ${point.displayName}`;
    refresh();
  } catch (error) {
    addressStatus.textContent = error.message;
  }
});

clearAddressBtn.addEventListener('click', () => {
  userAddressPoint = null;
  if (userAddressMarker) {
    map.removeLayer(userAddressMarker);
    userAddressMarker = null;
  }
  addressStatus.textContent = 'Address cleared.';
  refresh();
});

[companyFilter, typeFilter, stateFilter, citySearch, showOnlySelected].forEach((el) => {
  const eventName = el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change';
  el.addEventListener(eventName, refresh);
});

initializeFilters();
refresh();
