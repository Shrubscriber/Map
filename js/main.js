function isMobile() {
  return window.matchMedia("(max-width: 991px)").matches;
}

let map = "";
const Trees = {
  layer: "",
  records: [],
  top: [],
  photos: new Map(),
  icons: {},
};

// fields to show on the info panel when selecting a tree
const displayFields = ["Address", "Date", "Donation Type", "State"];

//setup loading screen
document.addEventListener("DOMContentLoaded", function () {
  // Show the loading screen
  document.getElementById("loading-screen").style.display = "flex";
});

async function fetchTreeRecords() {
  // Fetch data from Airtable
  const baseId = "app7xb39UzCeLQWYy";
  const tableName = "tbldyu9ydFlkvxmiv";
  const mapViewId = "viwEqRbT00ab0ydQg";
  const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableName}?view=${mapViewId}`;
  const airTablePersonalAccessToken =
    "patZkvP3wp8V6LZAi.0990d7d3ad2e33270df491f35a41bcce93cd9b07109dd61ce3eeec6e84f364f8";
  let offset = "";

  const headers = {
    Authorization: `Bearer ${airTablePersonalAccessToken}`,
  };
  let response = await fetch(airtableUrl, {
    headers,
  });
  let data = await response.json();
  Trees.records = data.records;
  offset = data.offset;

  // airtable has 100 record limit per request. offset is returned until all records are fetched
  while (offset) {
    const url = airtableUrl + `&offset=${offset}`;
    let response = await fetch(url, {
      headers,
    });
    let data = await response.json();
    Trees.records = [...Trees.records, ...data.records];
    offset = data.offset;
  }

  addTreeMarkers();
}

function getTreeStyle(feature) {
  const size = feature.get("features").length;
  if (size > 0) {
    const mapIcon = feature.get("Map Icon")
      ? feature.get("Map Icon")[0]
      : { id: "default", height: 48, width: 42 };

    let text = "";
    let iconSrc = "";
    if (size > 1) {
      text = size.toString() + " trees";
      iconSrc = "img/forest1.png";
    } else if (size === 1) {
      iconSrc = "img/tree1.png";
      if (map.getView().getZoom() >= 16) {
        text = feature.get("features")[0].get("Name");
      }
    }

    return new ol.style.Style({
      image: new ol.style.Icon({
        src: iconSrc,
        //img: Trees.icons[mapIcon.id],
        anchor: [0.5, 1],
        imgSize: [mapIcon.width, mapIcon.height],
        scale: 0.65,
      }),
      text: new ol.style.Text({
        font: "12px Segoe UI,sans-serif",
        fill: new ol.style.Fill({ color: "#000" }),
        stroke: new ol.style.Stroke({
          color: "#fff",
          width: 3,
        }),
        offsetY: 5,
        text: text,
      }),
    });
  }
}

function addTreeMarkers() {
  const treeFeatures = [];
  Trees.icons.default = new Image();
  Trees.icons.default.src = "img/tree.png";

  // Add markers to the map
  Trees.records.forEach(function (record) {
    const treeFeature = new ol.Feature({
      geometry: new ol.geom.Point(
        ol.proj.fromLonLat([
          record.fields["Longitude (Map)"][0],
          record.fields["Latitude (Map)"][0],
        ])
      ),
    });
    treeFeature.setId(record.id);

    for (let propertyName in record.fields) {
      treeFeature.set(propertyName, record.fields[propertyName]);
    }

    treeFeatures.push(treeFeature);

    if ("Photo" in record.fields) {
      record.fields["Photo"].forEach(function (photoObject) {
        Trees.photos.set(photoObject.id, photoObject.url);
      });
    }
  });

  const baseTileLayer = new ol.layer.Tile({
    source: new ol.source.OSM({
      attributions: [],
    }),
  });

  const treeSource = new ol.source.Vector({
    features: treeFeatures,
  });

  const clusterSource = new ol.source.Cluster({
    distance: parseInt(0, 10),
    minDistance: parseInt(0, 10),
    source: treeSource,
  });

  Trees.layer = new ol.layer.Vector({
    source: clusterSource,
    style: getTreeStyle,
  });

  // Set up the map
  map = new ol.Map({
    target: "map",
    layers: [baseTileLayer, Trees.layer],
    view: new ol.View({
      zoom: 6,
      enableRotation: false,
      maxZoom: 19,
      minZoom: 5,
    }),
    controls: [],
  });

  resetMapPosition();
  setupMapEvents();
  scrollInfoPanelUp();
  if (isMobile()) {
    document.getElementById("basicTutorial").innerHTML =
      "Scroll up to view the map. Select a tree for more information or use the menu to:";
  }

  // hide the loading screen
  document.getElementById("loading-screen").style.display = "none";
}

function resetMapPosition() {
  // default position shows all of Alberta
  if (isMobile()) {
    map
      .getView()
      .fit([
        -12653500.201822834, 7053485.787818839, -12616155.49509524,
        7127026.133374718,
      ]);
  } else {
    map
      .getView()
      .fit([
        -12667290.997087441, 7058482.967890004, -12595222.244393982,
        7108840.631905936,
      ]);
  }
}

function setupMapEvents() {
  map.on("click", (e) => {
    Trees.layer.getFeatures(e.pixel).then((clickedFeatures) => {
      if (clickedFeatures.length) {
        // Get clustered Coordinates
        const features = clickedFeatures[0].get("features");
        if (features.length === 1) {
          const treeFeature = features[0];
          zoomToTree(treeFeature.getId());
        } else if (features.length > 1) {
          showClusteredTrees(features);
          const extent = ol.extent.boundingExtent(
            features.map((r) => r.getGeometry().getCoordinates())
          );
          map.getView().fit(extent, {
            duration: 500,
            minResolution:
              map.getView().getZoom() < 16
                ? map.getView().getResolutionForZoom(16)
                : map.getView().getResolution(),
            padding: [50, 50, 50, 50],
          });
        }
      }
    });
  });
}

function showClusteredTrees(features) {
  resetCarousel();
  const infoPanel = document.getElementById("infoPanel-content");
  infoPanel.innerHTML = `<p class="treeName"><strong>Trees</strong></p>`;
  infoPanel.style.padding = "20px";

  const searchResultsContainer = document.createElement("div");
  searchResultsContainer.classList.add("search-results-container");
  infoPanel.appendChild(searchResultsContainer);

  // Create the table element and add it to the container
  const tableElement = document.createElement("table");
  tableElement.id = "searchResultsTable";
  tableElement.classList.add("table");

  // Create the table body element and add it to the table
  const tableBodyElement = document.createElement("tbody");
  tableElement.appendChild(tableBodyElement);

  features.forEach((tree) => {
    // Create a new row element
    const rowElement = document.createElement("tr");
    rowElement.setAttribute("data-feature-id", tree.getId());

    // Create new cell elements for each field and add them to the row
    const nameCell = document.createElement("td");
    nameCell.innerText = tree.get("Name");
    rowElement.appendChild(nameCell);

    // Add the row to the table body
    tableBodyElement.appendChild(rowElement);

    // Add a click event listener to each table row
    rowElement.addEventListener("click", function (event) {
      zoomToTree(tree.getId());
      scrollInfoPanelUp();
    });
  });
  searchResultsContainer.appendChild(tableElement);
  scrollInfoPanelUp();
}

function scrollInfoPanelUp() {
  const infoPanelDiv = document.getElementById("infoPanel");
  if (isMobile()) {
    // on mobile, move the div up or down so that the top edge aligns with the top edge of the screen
    const rect = infoPanelDiv.getBoundingClientRect();
    const offset = window.scrollY;
    const top = rect.top + offset;

    window.scrollTo({
      top: top,
      behavior: "smooth",
    });
  } else {
    // on desktop, scroll to the top of the info panel
    infoPanelDiv.scrollTop = 0;
  }
}

function showTreeInfo(feature) {
  if (feature) {
    let html = "";
    const name = feature.get("Name");
    html += `<p class="treeName"><strong>${name}</strong></p>`;

    const description = feature.get("Note");
    if (description) {
      html += `<p>${description}</p>`;
    }

    displayFields.forEach(function (field) {
      const fieldValue = feature.get(field);
      if (fieldValue) {
        html += `<p><strong>${field}:</strong> ${fieldValue}</p>`;
      }
    });

    // show shrubscriber article information
    const articleUrl = feature.get("Article");
    const articleText = feature.get("Article Text");

    if (articleUrl && articleText) {
      html += `<p><strong>Donation Information </strong><a href="${articleUrl}" target="_blank">from Shrubscriber</a></p>`;
      html += `<p style="white-space: pre-line;">${articleText}</p>`;
    }

    const speciesInfo = feature.get("Plant Description");
    if (speciesInfo) {
      html += `<p><strong>Plant Description</strong></p>`;
      html += `<p style="white-space: pre-line;">${speciesInfo}</p>`;
    }

    // Update Info Panel with Tree Information
    const infoPanel = document.getElementById("infoPanel-content");
    infoPanel.style.padding = "20px";
    infoPanel.innerHTML = html;

    // Add Google Maps button to bottom of Tree Info
    const googleMapsButton = document.createElement("button");
    googleMapsButton.style.border = "none";
    googleMapsButton.style.background = "none";
    googleMapsButton.title = "Open in Google Maps";
    const googleMapsIcon =
      '<img id="googleMapsIcon" src="img/google-maps-old.svg" style="width: 48px; height: 48px">';
    googleMapsButton.innerHTML = googleMapsIcon;
    googleMapsButton.addEventListener("click", function () {
      const latitude = feature.get("Latitude (Map)");
      const longitude = feature.get("Longitude (Map)");
      let url =
        "https://www.google.com/maps/search/?api=1&query=" +
        latitude +
        "%2C" +
        longitude;
      window.open(url);
    });

    infoPanel.appendChild(googleMapsButton);

    //set up image carousel

    // reset carousel
    resetCarousel();

    const photos = feature.get("Photo");
    if (photos) {
      const carouselIndicators = document.querySelector(".carousel-indicators");
      const carouselInner = document.querySelector(".carousel-inner");

      photos.forEach((image, index) => {
        // create carousel indicator
        const indicator = document.createElement("button");
        indicator.setAttribute("data-bs-target", "#treeCarousel");
        indicator.setAttribute("data-bs-slide-to", index);
        indicator.setAttribute("aria-label", "Slide " + (index + 1));

        // create carousel item
        const item = document.createElement("div");
        item.classList.add("carousel-item");

        // create image element
        const img = document.createElement("img");
        img.classList.add("d-block", "w-100");
        img.src = image.url;

        if (index === 0) {
          indicator.classList.add("active");
          item.classList.add("active");
        }

        // add image to item and item to inner carousel
        carouselIndicators.appendChild(indicator);
        item.appendChild(img);
        carouselInner.appendChild(item);
      });

      const carouselNextBtn = document.querySelector(".carousel-control-next");
      const carouselPrevBtn = document.querySelector(".carousel-control-prev");
      if (photos.length === 1) {
        carouselIndicators.style.display = "none";
        carouselNextBtn.style.display = "none";
        carouselPrevBtn.style.display = "none";
      } else {
        carouselIndicators.style.display = "";
        carouselNextBtn.style.display = "";
        carouselPrevBtn.style.display = "";
      }

      // Click to Fullscreen images
      if (document.fullscreenEnabled) {
        const carouselImages = document.querySelectorAll(
          "#treeCarousel .carousel-item img"
        );
        carouselImages.forEach((image) => {
          image.style.cursor = "zoom-in";
          image.addEventListener("click", function () {
            if (!document.fullscreenElement) {
              if (image.requestFullscreen) {
                image.requestFullscreen();
              } else if (image.webkitRequestFullscreen) {
                image.webkitRequestFullscreen();
              } else if (image.webkitEnterFullscreen) {
                image.webkitEnterFullscreen();
              }
              image.style.cursor = "zoom-out";
            } else {
              document.exitFullscreen();
              image.style.cursor = "zoom-in";
            }
          });
        });
      }
      const carousel = new bootstrap.Carousel("#treeCarousel");
    }
  }
}

function resetCarousel() {
  const carouselIndicators = document.querySelector(".carousel-indicators");
  carouselIndicators.innerHTML = "";
  const carouselInner = document.querySelector(".carousel-inner");
  carouselInner.innerHTML = "";
}

function getTreeFeatureFromCluster(treeId) {
  let feature = null;
  Trees.layer
    .getSource()
    .getFeatures()
    .forEach((cluster) => {
      const features = cluster.get("features");
      for (const f of features) {
        if (f.getId() === treeId) {
          feature = f;
          break;
        }
      }
    });
  return feature;
}

function zoomToTree(treeId) {
  // Zoom the map to the corresponding feature and display its information
  const feature = getTreeFeatureFromCluster(treeId);
  const treeExtent = feature.getGeometry().getExtent();
  map.getView().fit(treeExtent, {
    duration: 600,
    minResolution:
      map.getView().getZoom() < 16
        ? map.getView().getResolutionForZoom(16)
        : map.getView().getResolution(),
  });
  showTreeInfo(feature);
}

// Pagination

const rowsPerPage = 10; // Set the number of photos per page

function createPaginationContainer() {
  const paginationContainer = document.createElement("div");
  paginationContainer.classList.add("mt-3");

  const nav = document.createElement("nav");
  const ul = document.createElement("ul");
  ul.className = "pagination justify-content-center flex-wrap";

  nav.appendChild(ul);
  paginationContainer.appendChild(nav);
  return paginationContainer;
}

function showPhotoGallery() {
  resetCarousel();
  //clearSelectedLocation();
  const infoPanel = document.getElementById("infoPanel-content");
  infoPanel.innerHTML = `<p class="treeName"><strong>Photo Gallery</strong></p>`;
  infoPanel.style.padding = "20px 0 0 0";

  // Create a wrapper div for the paginated content
  const paginatedContent = document.createElement("div");
  paginatedContent.id = "paginatedContent";

  const paginationTop = createPaginationContainer();
  const paginationBottom = createPaginationContainer();
  infoPanel.appendChild(paginationTop);
  infoPanel.appendChild(paginatedContent);
  infoPanel.appendChild(paginationBottom);

  function displayPhotos(startIndex) {
    paginatedContent.innerHTML = "";
    const photoLinks = Array.from(Trees.photos, ([id, url]) => url);

    for (
      let i = startIndex;
      i < startIndex + rowsPerPage && i < photoLinks.length;
      i++
    ) {
      const treePhoto = document.createElement("img");
      treePhoto.src = photoLinks[i];
      treePhoto.style.width = "100%";

      // add fullscreen on click behavior to image
      if (document.fullscreenEnabled) {
        treePhoto.style.cursor = "zoom-in";
        treePhoto.addEventListener("click", function () {
          if (!document.fullscreenElement) {
            if (treePhoto.requestFullscreen) {
              treePhoto.requestFullscreen();
            } else if (treePhoto.webkitRequestFullscreen) {
              treePhoto.webkitRequestFullscreen();
            } else if (image.webkitEnterFullscreen) {
              image.webkitEnterFullscreen();
            }
            treePhoto.style.cursor = "zoom-out";
          } else {
            document.exitFullscreen();
            treePhoto.style.cursor = "zoom-in";
          }
        });
      }
      
      paginatedContent.appendChild(treePhoto);
    }
  }

  function setupPagination() {
    const ulTop = paginationTop.querySelector("ul");
    const ulBottom = paginationBottom.querySelector("ul");
    updatePagination(ulTop);
    updatePagination(ulBottom);

    function updatePagination(ul) {
      ul.innerHTML = ""; // Clear existing pagination items
      const totalPages = Math.ceil(Trees.photos.size / rowsPerPage);

      for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement("li");
        li.className = "page-item";
        const a = document.createElement("a");
        a.className = "page-link";
        a.href = "#";
        a.textContent = i;

        a.addEventListener("click", (e) => {
          e.preventDefault();
          const page = parseInt(e.target.textContent);
          displayPhotos((page - 1) * rowsPerPage);
          setActivePage(page);
          scrollInfoPanelUp();
        });

        li.appendChild(a);
        ul.appendChild(li);
      }
    }
  }

  function setActivePage(page) {
    const pageItemsTop = paginationTop.querySelectorAll(".page-item");
    const pageItemsBottom = paginationBottom.querySelectorAll(".page-item");

    updateActivePage(pageItemsTop);
    updateActivePage(pageItemsBottom);

    function updateActivePage(pageItems) {
      pageItems.forEach((item, index) => {
        item.classList.toggle("active", index === page - 1);
      });
    }
  }

  displayPhotos(0);
  setupPagination();
  setActivePage(1);
  scrollInfoPanelUp();
}

function showSearch() {
  resetCarousel();
  //clearSelectedLocation();
  const infoPanel = document.getElementById("infoPanel-content");
  infoPanel.innerHTML = `<p class="treeName"><strong>Search</strong></p>`;
  infoPanel.style.padding = "20px";

  const searchContainer = document.createElement("div");
  searchContainer.classList.add("search-container");

  // Create the input field
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.id = "searchInput";

  // Create the search button
  const searchButton = document.createElement("button");
  searchButton.id = "searchButton";
  searchButton.classList.add("btn");
  searchButton.classList.add("btn-success");
  searchButton.textContent = "Search";

  // Add the input field and search button to search container
  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(searchButton);
  infoPanel.appendChild(searchContainer);

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const query = searchInput.value;
      const results = searchTrees(query);

      // Handle the search results (e.g., display them on the page)
      displaySearchResults(results);
    }
  });

  searchButton.addEventListener("click", () => {
    const searchInput = document.getElementById("searchInput");
    const query = searchInput.value;
    const results = searchTrees(query);

    // Handle the search results (e.g., display them on the page)
    displaySearchResults(results);
  });

  const searchResultsContainer = document.createElement("div");
  searchResultsContainer.classList.add("search-results-container");
  infoPanel.appendChild(searchResultsContainer);

  searchInput.focus();

  function displaySearchResults(results) {
    searchResultsContainer.innerHTML = "";
    // Create the table element and add it to the container
    const tableElement = document.createElement("table");
    tableElement.id = "searchResultsTable";
    tableElement.classList.add("table");

    // Create the table header element and add it to the table
    const tableHeaderElement = document.createElement("thead");
    const tableHeaderRowElement = document.createElement("tr");
    tableHeaderRowElement.style.cursor = "auto";
    const nameHeaderElement = document.createElement("th");
    nameHeaderElement.innerText = "Name";
    const addressHeaderElement = document.createElement("th");
    addressHeaderElement.innerText = "Address";
    tableHeaderRowElement.appendChild(nameHeaderElement);
    tableHeaderRowElement.appendChild(addressHeaderElement);
    tableHeaderElement.appendChild(tableHeaderRowElement);
    tableElement.appendChild(tableHeaderElement);

    // Create the table body element and add it to the table
    const tableBodyElement = document.createElement("tbody");
    tableElement.appendChild(tableBodyElement);

    if (results.length === 0) {
      searchResultsContainer.innerHTML = `<p style="margin: revert;">No Trees Found.</p>`;
      scrollInfoPanelUp();
      return;
    }

    results.forEach((tree) => {
      // Create a new row element
      const rowElement = document.createElement("tr");
      rowElement.setAttribute("data-feature-id", tree.id);

      // Create new cell elements for each field and add them to the row
      const nameCell = document.createElement("td");
      nameCell.innerText = tree.fields["Name"];
      rowElement.appendChild(nameCell);

      const addressCell = document.createElement("td");
      addressCell.innerText = tree.fields.Address;
      rowElement.appendChild(addressCell);

      // Add the row to the table body
      tableBodyElement.appendChild(rowElement);

      // Add a click event listener to each table row
      rowElement.addEventListener("click", function (event) {
        zoomToTree(tree.id);
      });
    });
    searchResultsContainer.appendChild(tableElement);
    scrollInfoPanelUp();
  }

  scrollInfoPanelUp();
}

function searchTrees(query) {
  query = query.toLowerCase();
  return Trees.records.filter((tree) => {
    const name = tree.fields["Name"] ? tree.fields["Name"].toLowerCase() : "";
    const address = tree.fields.Address
      ? tree.fields.Address[0].toLowerCase()
      : "";
    const neighbourhood =
      tree.fields["Neighbourhood Text"] && tree.fields["Neighbourhood Text"][0]
        ? tree.fields["Neighbourhood Text"][0].toLowerCase()
        : "";
    const species =
      tree.fields["Genus species Text"] && tree.fields["Genus species Text"][0]
        ? tree.fields["Genus species Text"][0].toLowerCase()
        : "";

    return (
      (name && name.includes(query)) ||
      (address && address.includes(query)) ||
      (neighbourhood && neighbourhood.includes(query)) ||
      (species && species.includes(query))
    );
  });
}

// hide carousel controls by default
const carouselNextBtn = document.querySelector(".carousel-control-next");
const carouselPrevBtn = document.querySelector(".carousel-control-prev");
carouselNextBtn.style.display = "none";
carouselPrevBtn.style.display = "none";

fetchTreeRecords();
