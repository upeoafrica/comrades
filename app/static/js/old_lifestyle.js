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

  let debounceTimer;

  // Fetch events
  const fetchEvents = (search = "") => {
    fetch(`/api/events?search=${encodeURIComponent(search)}`)
      .then(res => res.json())
      .then(events => {
        feed.innerHTML = "";

        if (events.length === 0) {
          feed.innerHTML = '<p class="col-span-4 text-center text-gray-500 text-sm py-4">No events found</p>';
          return;
        }

        events.forEach(event => {
          const card = template.content.cloneNode(true);

          card.querySelector("img").src = event.image_url || "https://via.placeholder.com/400x200";
          card.querySelector("h2").textContent = event.title;
          card.querySelector("span.bg-indigo-50").textContent = event.start_time
            ? new Date(event.start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            : "TBA";
          card.querySelector("p").textContent = event.description;
          card.querySelector("div.flex span.text-green-600").textContent = event.location || "Location TBA";

          // Show modal on ticket button
          card.querySelector("button").addEventListener("click", () => {
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

          feed.appendChild(card);
        });
      });
  };

  // Search debounce
  searchInput.addEventListener("input", e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchEvents(e.target.value.trim()), 300);
  });

  // Cancel modal
  modalCancel.addEventListener("click", () => eventModal.classList.add("hidden"));
  uploadCancel.addEventListener("click", () => uploadModal.classList.add("hidden"));

  // Open upload modal
  uploadBtn.addEventListener("click", () => uploadModal.classList.remove("hidden"));



uploadForm.addEventListener("submit", e => {
  e.preventDefault();
  const formData = new FormData(uploadForm);
  let data = Object.fromEntries(formData);

  // Decide final location
  if (data.campus) {
    data.location = data.campus;   // use campus name as location
  } 
  // else location stays as typed in (custom)

  delete data.campus;  // ✅ remove campus field, only keep location

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
      fetchEvents(); // refresh list
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

            // If universities found
            // If universities found
            if (unis.length > 0) {
                unis.forEach(u => {
                    const li = document.createElement("li");
                    li.textContent = `${u.name} (${u.type})`;
                    li.className = "px-2 py-1 hover:bg-indigo-100 cursor-pointer text-sm";
                    li.addEventListener("click", () => {
                    campusSearch.value = u.name;
                    campusHidden.value = u.name;
                    document.getElementById("campus-custom").value = "false"; // ✅ not custom
                    campusResults.classList.add("hidden");
                    });
                    campusResults.appendChild(li);
                });
            } else {
                // No matches -> allow custom location
                const customLi = document.createElement("li");
                customLi.textContent = `➕ Use "${query}" as custom location`;
                customLi.className = "px-2 py-1 text-indigo-600 hover:bg-indigo-100 cursor-pointer text-sm";
                customLi.addEventListener("click", () => {
                    campusSearch.value = query;
                    campusHidden.value = query;
                    document.getElementById("campus-custom").value = "true"; // ✅ mark as custom
                    campusResults.classList.add("hidden");
                });
                campusResults.appendChild(customLi);
            }


            campusResults.classList.remove("hidden");
            });
        }, 300);

  });

    const ticketPriceInput = document.getElementById("ticket-price");
    const isFreeCheckbox = document.getElementById("is-free");

    isFreeCheckbox.addEventListener("change", () => {
    if (isFreeCheckbox.checked) {
        ticketPriceInput.value = "";
        ticketPriceInput.disabled = true; // ✅ prevent editing
    } else {
        ticketPriceInput.disabled = false;
    }
    });


  // Initial fetch
  fetchEvents();
});
