document.addEventListener("DOMContentLoaded", () => {
  const feed = document.getElementById("lifestyle-feed");
  const template = document.getElementById("event-card-template");
  const searchInput = document.getElementById("search-events");

  // Modal elements
  const eventModal = document.getElementById("event-modal");
  const uploadModal = document.getElementById("upload-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalImage = document.getElementById("modal-image");
  const modalDescription = document.getElementById("modal-description");
  const modalCampus = document.getElementById("modal-campus");
  const modalDate = document.getElementById("modal-date");
  const modalPrice = document.getElementById("modal-price");
  const modalCancel = document.getElementById("modal-cancel");
  const modalPay = document.getElementById("modal-pay");

  const uploadBtn = document.getElementById("upload-event-btn");
  const uploadCancel = document.getElementById("upload-cancel");
  const uploadForm = document.getElementById("upload-form");

  const feedMessage = document.getElementById("feed-message");

  let debounceTimer;

// Global fetch wrapper with rate-limit + error handling
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const err = await res.json();
      showToast(err.message || "Too many requests. Please slow down.", "error");
      throw new Error("Rate limited");
    }

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("API fetch failed:", err);
    if (err.message !== "Rate limited") {
      showToast("Something went wrong. Please try again.", "error");
    }
    throw err; // rethrow so caller can handle
  }
}


function showToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.className = `
    fixed bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-white z-50
    ${type === "error" ? "bg-red-600" : "bg-green-600"}
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}


// --- Geolocation ---
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      console.log(`User location: ${latitude}, ${longitude}, accuracy: ${accuracy}m`);

      // If accuracy is poor, skip to fallback
      if (accuracy > 2000) {
        feed.innerHTML = `
          <p class="col-span-4 text-center text-gray-500 text-sm py-4">
            Your location is not precise enough (±${Math.round(accuracy)}m).
            Showing latest events instead...
          </p>
        `;
        showFallbackEvents("your area");
        return;
      }

      apiFetch(`/api/universities/nearest_many?lat=${latitude}&lng=${longitude}&limit=3`)
        .then(unis => {
            if (!unis || unis.length === 0) {
                showFallbackEvents("your location");
                return;
                }

                // Build event fetch promises for each university
                const promises = unis.map(uni =>
                fetch(`/api/events?campus=${encodeURIComponent(uni.name)}`)
                    .then(r => r.json())
                    .then(events => ({ uni, events }))
                );

            Promise.all(promises).then(results => {
                // Flatten all event arrays
                const combinedEvents = results.flatMap(r => r.events);

                if (combinedEvents.length > 0) {
                    // Build message with all university names
                    const uniNames = results.map(r => r.uni.name).join(", ");
                    feedMessage.innerHTML = `
                    Showing events in <b>${uniNames}</b>.
                    `;
                    renderEvents(combinedEvents);
                } else {
                    // No events in any → fallback
                    const uniNames = results.map(r => r.uni.name).join(", ");
                    showFallbackEvents(uniNames);
                }
            });
        });

    },
    (error) => {
      console.error("Geolocation error:", error);
      showFallbackEvents("your location");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
} else {
  console.error("Geolocation not supported.");
  showFallbackEvents("your location");
}


  // --- Build card helper ---
  function buildEventCard(event) {
    const card = template.content.cloneNode(true);

    card.querySelector("img").src = event.image_url || "https://via.placeholder.com/400x200";
    card.querySelector("h2").textContent = event.title;
    card.querySelector("span.bg-indigo-50").textContent = event.start_time
      ? new Date(event.start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "TBA";
    card.querySelector("p").textContent = event.description;
    card.querySelector("div.flex span.text-green-600").textContent = event.location || "Location TBA";

    // Modal
    const ticketBtn = card.querySelector("button");
    if (ticketBtn) {
      ticketBtn.addEventListener("click", () => {
        modalTitle.textContent = event.title;
        modalImage.src = event.image_url || "https://via.placeholder.com/400x200";
        modalDescription.textContent = event.description;
        modalCampus.textContent = event.location || "Location TBA";
        modalDate.textContent = event.start_time
          ? new Date(event.start_time).toLocaleString()
          : "Date TBA";
        modalPrice.textContent = event.ticket_price > 0
          ? `Price: KES ${event.ticket_price}`
          : "Free Event";

        modalPay.onclick = () => {
          fetch(`/api/events/${event._id}/ticket`, { method: "POST" })
            .then(r => r.json())
            .then(resp => {
              alert(resp.message || "Ticket reserved!");
              eventModal.classList.add("hidden");
            })
            .catch(() => alert("Error processing ticket"));
        };

        eventModal.classList.remove("hidden");
      });
    }

    return card;
  }

  // --- Render list of events ---
  function renderEvents(events) {
    feed.innerHTML = ""; // clear only event grid
    events.forEach(event => feed.appendChild(buildEventCard(event)));
  }

  // --- Fetch events (search/campus) ---
  const fetchEvents = (search = "", campus = "") => {
    let url = `/api/events?search=${encodeURIComponent(search)}`;
    if (campus) url += `&campus=${encodeURIComponent(campus)}`;

    apiFetch(url)
    .then(events => {
      if (events.length === 0) {
        feedMessage.innerHTML = `No events found.`;
        return;
      }
      renderEvents(events);
    })
    .catch(err => {
      if (err.message !== "Rate limited") {
        feedMessage.innerHTML = `
          <p class="col-span-4 text-center text-red-500 text-sm py-4">
            Error loading events.
          </p>
        `;
      }
    });
};

  // --- Fallback latest events (after 3s delay) ---
function showFallbackEvents(uniName) {
    feedMessage.innerHTML = `
        You are closest to <b>${uniName}</b>, but we found <b>no</b> events near you. Loading latest events…
    `;

    setTimeout(() => {
      apiFetch(`/api/events?limit=8&sort=latest`)
        .then(events => {
          feed.innerHTML = ""; // clear message
          if (!events || events.length === 0) {
            feed.innerHTML = `
              <p class="col-span-4 text-center text-gray-500 text-sm py-4">
                No events available at all.
              </p>
            `;
          } else {
            renderEvents(events);
          }
        })
        .catch(() => {
          feed.innerHTML = `
            <p class="col-span-4 text-center text-red-500 text-sm py-4">
              Could not load fallback events.
            </p>
          `;
        });
    }, 3000);
  }

  // --- Search debounce ---
  searchInput.addEventListener("input", e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchEvents(e.target.value.trim()), 300);
  });

  // --- Modal controls ---
  modalCancel.addEventListener("click", () => eventModal.classList.add("hidden"));
  uploadCancel.addEventListener("click", () => uploadModal.classList.add("hidden"));
  uploadBtn.addEventListener("click", () => uploadModal.classList.remove("hidden"));

  // --- Upload form ---
  uploadForm.addEventListener("submit", e => {
    e.preventDefault();
    const formData = new FormData(uploadForm);
    let data = Object.fromEntries(formData);

    if (data.campus) {
      data.location = data.campus;
    }
    delete data.campus;

    fetch("/api/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(r => r.json())
      .then(resp => {
        if (resp.error) {
          alert("Error: " + resp.error);
        } else {
          alert("✅ Event uploaded!");
          uploadModal.classList.add("hidden");
          fetchEvents();
        }
      })
      .catch(() => alert("⚠️ Error uploading event"));
  });

  // --- University autocomplete ---
  const campusSearch = document.getElementById("campus-search");
  const campusResults = document.getElementById("campus-results");
  const campusHidden = document.getElementById("campus-hidden");
  let uniDebounce;

  campusSearch.addEventListener("input", e => {
    clearTimeout(uniDebounce);
    const query = e.target.value.trim();
    if (!query) {
      campusResults.classList.add("hidden");
      campusResults.innerHTML = "";
      return;
    }

    uniDebounce = setTimeout(() => {
      fetch(`/api/universities?search=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(unis => {
          campusResults.innerHTML = "";

          if (unis.length > 0) {
            unis.forEach(u => {
              const li = document.createElement("li");
              li.textContent = `${u.name} (${u.type})`;
              li.className = "px-2 py-1 hover:bg-indigo-100 cursor-pointer text-sm";
              li.addEventListener("click", () => {
                campusSearch.value = u.name;
                campusHidden.value = u.name;
                document.getElementById("campus-custom").value = "false";
                campusResults.classList.add("hidden");
              });
              campusResults.appendChild(li);
            });
          } else {
            const customLi = document.createElement("li");
            customLi.textContent = `➕ Use "${query}" as custom location`;
            customLi.className = "px-2 py-1 text-indigo-600 hover:bg-indigo-100 cursor-pointer text-sm";
            customLi.addEventListener("click", () => {
              campusSearch.value = query;
              campusHidden.value = query;
              document.getElementById("campus-custom").value = "true";
              campusResults.classList.add("hidden");
            });
            campusResults.appendChild(customLi);
          }

          campusResults.classList.remove("hidden");
        });
    }, 300);
  });

  // --- Ticket price toggle ---
  const ticketPriceInput = document.getElementById("ticket-price");
  const isFreeCheckbox = document.getElementById("is-free");

  isFreeCheckbox.addEventListener("change", () => {
    if (isFreeCheckbox.checked) {
      ticketPriceInput.value = "";
      ticketPriceInput.disabled = true;
    } else {
      ticketPriceInput.disabled = false;
    }
  });
});
