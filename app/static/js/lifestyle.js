document.addEventListener("DOMContentLoaded", async () => {

    // Get tomorrow's date at midnight
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // Convert to datetime-local format (YYYY-MM-DDTHH:MM)
    const isoString = tomorrow.toISOString().slice(0, 16);

    // Set min attribute for both start and end date fields
    const startInput = document.querySelector('input[name="start_time"]');
    const endInput = document.querySelector('input[name="end_time"]');

    // Enforce tomorrow onwards for both fields
    startInput.setAttribute("min", isoString);
    endInput.setAttribute("min", isoString);

    // Whenever start time changes, update end time constraints
    startInput.addEventListener("change", () => {
      if (startInput.value) {
        endInput.min = startInput.value;

        // If end time is before new start time, reset it
        if (endInput.value && endInput.value < startInput.value) {
          endInput.value = startInput.value;
        }
      }
    });

    let CURRENT_USER_EMAIL = null;
    let CURRENT_USER_UNIVERSITY = null;
    let CURRENT_USER_NAME = null;
    let DEFAULT_UNI_LAT = null;
    let DEFAULT_UNI_LNG = null;

    await fetchUserSession();

    if (!CURRENT_USER_EMAIL) {
        // showToast("Please log in to continue", "error");
        window.location.href = "/auth/login";
    }
    // Fetch user session details   

    async function fetchUserSession() {
        try {
            const res = await fetch("/auth/session");

            const data = await res.json();
            if (data && data.email) {
                CURRENT_USER_EMAIL = data.email;
                CURRENT_USER_UNIVERSITY = data.university;
                CURRENT_USER_NAME = data.name;
                DEFAULT_UNI_LAT = data.latitude;
                DEFAULT_UNI_LNG = data.longitude;
                picture = data.picture;
                // console.log("[lifestyle] Logged in as:", CURRENT_USER_EMAIL);
            } else {
                // console.warn("[lifestyle] No active session. Redirecting to login...");
                CURRENT_USER_EMAIL = null;
            }
        } catch (err) {
            console.error("[lifestyle] Failed to fetch session:", err);
            CURRENT_USER_EMAIL = null;
        }
    }

    const profileBtn = document.getElementById("profile-btn");
    const profilePopup = document.getElementById("profile-popup");

    if (profileBtn) {
        profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        profilePopup.classList.toggle("hidden");
        });
    }

    // Close popup when clicking outside
    document.addEventListener("click", (e) => {
        if (!profilePopup.contains(e.target) && e.target !== profileBtn) {
        profilePopup.classList.add("hidden");
        }
    });


    let userOptIns = [];
    let customEvents = [];      // holds custom events shown in the custom section
    const CUSTOM_SURCHARGE_PERCENT = 0.10; // 10%
    const MIN_CUSTOM_SERVICE_FEE = 50;     // KES 50 minimum

    window.addEventListener("error", (e) => {
        console.error("[lifestyle] Uncaught JS error:", e.message, e.filename, e.lineno);
        });

    // --- surcharge UI (show when custom location selected) ---
    const campusCustomInput = document.getElementById("campus-custom");
    const ticketPriceInput = document.getElementById("ticket-price");
    const isFreeCheckbox = document.getElementById("is-free");

    // create note element (hidden by default)
    let surchargeNote = document.getElementById("surcharge-note");
    if (!surchargeNote) {
        surchargeNote = document.createElement("div");
        surchargeNote.id = "surcharge-note";
        surchargeNote.className = "text-xs text-gray-500 mt-1";
        surchargeNote.style.display = "none";
        // insert after ticket price input
        if (ticketPriceInput && ticketPriceInput.parentNode) {
            ticketPriceInput.parentNode.insertBefore(surchargeNote, ticketPriceInput.nextSibling);
        } else {
            // fallback: append to upload form
            uploadForm.appendChild(surchargeNote);
        }
    }

    function computeAndShowSurcharge() {
        const isCustom = campusCustomInput && campusCustomInput.value === "true";
        if (!isCustom) {
            surchargeNote.style.display = "none";
            return 0;
        }

        const price = isFreeCheckbox && isFreeCheckbox.checked ? 0 : parseFloat(ticketPriceInput.value || 0);
        const fee = Math.max(MIN_CUSTOM_SERVICE_FEE, Math.round(price * CUSTOM_SURCHARGE_PERCENT));
        surchargeNote.innerHTML = `Custom location surcharge: <b>KES ${fee}</b>${price ? ` — total KES ${price + fee}` : ""}`;
        surchargeNote.style.display = "";
        return fee;
        }

        // update surcharge whenever relevant inputs change
        if (ticketPriceInput) on(ticketPriceInput, "input", computeAndShowSurcharge);
        if (isFreeCheckbox) on(isFreeCheckbox, "change", computeAndShowSurcharge);
        if (campusCustomInput) {
        // hidden input may be changed by autocomplete code; watch for input events.
        on(campusCustomInput, "input", computeAndShowSurcharge);
        }


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

    //   const feedMessage = document.getElementById("feed-message");

    let debounceTimer;

  // Safe element getter
    function $(id, required = false) {
        const el = document.getElementById(id);
        if (!el && required) {
            console.error(`[lifestyle] Missing required element: #${id}`);
        }
        return el;
        }

    // Safe addEventListener
    function on(el, evt, handler) {
    if (el) el.addEventListener(evt, handler);
    else console.warn("[lifestyle] Tried to bind", evt, "to null element");
    }

    // Ensure a message bar exists
    let feedMessage = document.getElementById("feed-message");
    if (!feedMessage) {
    feedMessage = document.createElement("div");
    feedMessage.id = "feed-message";
    feedMessage.className = "max-w-7xl mx-auto px-3 py-2 text-center text-sm text-gray-600";
    const host = document.querySelector("section") || document.body;
    host.prepend(feedMessage);
    }

    // Local state for filtering
    let allEvents = [];
    let activeUniNames = "";

    const escapeHtml = (s = "") =>
        s.replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[ch]));

    function setEvents(events, contextLabel = "") {
        allEvents = Array.isArray(events) ? events : [];
        activeUniNames = contextLabel;
        renderEvents(allEvents);
        }

    function filterLocalEvents(query) {
        const q = (query || "").toLowerCase();

        if (!allEvents.length) {
            feedMessage.innerHTML = `Loading events near you…`;
            return;
            }

        if (!q) {
            feedMessage.innerHTML = activeUniNames ? `Showing events in <b>${escapeHtml(activeUniNames)}</b>.` : "";
                renderEvents(allEvents);
                return;
            }

        const tokens = q.split(/\s+/).filter(Boolean);
        const filtered = allEvents.filter((e) => {
        const hay = `${e.title || ""} ${e.description || ""} ${e.location || ""}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
        });

        if (!filtered.length) {
        feed.innerHTML = "";
        feedMessage.innerHTML = `No matches for "<b>${escapeHtml(query)}</b>" in ${
            activeUniNames ? `<b>${escapeHtml(activeUniNames)}</b>` : "these events"
        }.`;
        return;
        }

        feedMessage.innerHTML = `Results for "<b>${escapeHtml(query)}</b>" in ${
        activeUniNames ? `<b>${escapeHtml(activeUniNames)}</b>` : "these events"
        }.`;
        renderEvents(filtered);
    }

    // Global fetch wrapper with rate-limit + error handling
    async function apiFetch(url, options = {}) {
        const res = await fetch(url, options);
            if (!res.ok) {
                const err = await res.json();
                showToast(err.message, "error");
            }
            // Success → return JSON
            return await res.json();
       }

    // Toast notification
    function showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `
            fixed bottom-6 left-1/2 transform -translate-x-1/2
            px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium z-50
            transition-all duration-500 opacity-0 translate-y-6
            ${type === "error" ? "bg-red-600" : "bg-indigo-600"}
        `;
        toast.textContent = message;

        document.body.appendChild(toast);

        // Trigger slide-up animation
        requestAnimationFrame(() => {
            toast.classList.remove("opacity-0", "translate-y-6");
            toast.classList.add("opacity-100", "translate-y-0");
        });

        // Auto-dismiss
        setTimeout(() => {
            toast.classList.remove("opacity-100", "translate-y-0");
            toast.classList.add("opacity-0", "translate-y-6");
            setTimeout(() => toast.remove(), 500);
        }, 3500);
        }


    // --- Geolocation ---
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
        (position) => {
            let { latitude, longitude, accuracy } = position.coords;
            
            // 🔄 Show loader at start
            feedMessage.textContent = "";
            document.getElementById("feed-loader").classList.remove("hidden");
            document.getElementById("lifestyle-feed").classList.add("hidden");

            // If accuracy too poor (>1000m), fallback to session university
            if (accuracy > 1000) {
                // console.warn("[lifestyle] GPS accuracy too low. Using session university.");
                // return CURRENT_USER_UNIVERSITY;
                latitude = DEFAULT_UNI_LAT;
                longitude = DEFAULT_UNI_LNG;
            }

            // Fetch user opt-ins once
           apiFetch("/api/user/optins")
            .then(data => {
                userOptIns = data.events || [];
            })
            .catch(() => {
                userOptIns = [];
            });

            apiFetch(`/api/universities/nearest_with_events?lat=${latitude}&lng=${longitude}&limit=3`)
            .then(results => {
                if (!results || results.length === 0) {
                    feedMessage.textContent = "No events nearby. Showing fallback events.";
                    showFallbackEvents(CURRENT_USER_UNIVERSITY);
                } else {
                    const combinedEvents = results.flatMap(r => 
                        (r.events || []).map(ev => ({
                            ...ev,
                            university: r.university.name
                        }))
                    );
                    const uniNames = results.map(r => r.university.name).join(", ");

                    if (combinedEvents.length > 0) {
                        feedMessage.innerHTML = `Showing latest events in <b>${escapeHtml(uniNames)}</b>.`;
                        setEvents(combinedEvents, uniNames);
                        } else {
                        feedMessage.textContent = "No events nearby. Showing fallback events.";
                        showFallbackEvents(uniNames);
                    }
                }

                // ✅ Always fetch & render latest custom events
                apiFetch(`/api/events?is_custom=1&limit=16&sort=latest`)
                    .then(customs => {
                        customEvents = Array.isArray(customs) ? customs : [];
                        renderCustomEvents(customEvents);
                        document.getElementById("feed-loader").classList.add("hidden");
                        document.getElementById("lifestyle-feed").classList.remove("hidden");

                    })
                    .catch(() => {}); //ignore silently

                    // ✅ Hide loader, show feed
                    document.getElementById("feed-loader").classList.add("hidden");
                    document.getElementById("lifestyle-feed").classList.remove("hidden");
            })
            .catch(err => {
                console.error("Error fetching nearest_with_events:", err);
                showFallbackEvents(CURRENT_USER_UNIVERSITY);
                document.getElementById("feed-loader").classList.add("hidden");
                document.getElementById("lifestyle-feed").classList.remove("hidden");


                // ✅ Still load custom events even on error
                apiFetch(`/api/events?is_custom=1&limit=16&sort=latest`)
                    .then(customs => {
                        customEvents = Array.isArray(customs) ? customs : [];
                        renderCustomEvents(customEvents);
                    });

                    // ✅ Hide loader, show feed
                    document.getElementById("feed-loader").classList.add("hidden");
                    document.getElementById("lifestyle-feed").classList.remove("hidden");
            });
        },
       (error) => {
            // console.error("Geolocation error:", error);
            feedMessage.textContent = "Location unavailable. Showing fallback events.";
            if (DEFAULT_UNI_LAT && DEFAULT_UNI_LNG) {
                apiFetch(`/api/universities/nearest_with_events?lat=${DEFAULT_UNI_LAT}&lng=${DEFAULT_UNI_LNG}&limit=3`)
                    .then(showEvents)
                    .catch(() => showFallbackEvents(CURRENT_USER_UNIVERSITY));
            } else {
                showFallbackEvents(CURRENT_USER_UNIVERSITY);
            }

            // ✅ Hide loader, show feed
            document.getElementById("feed-loader").classList.add("hidden");
            document.getElementById("lifestyle-feed").classList.remove("hidden");
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
        }
        );

    } else {
        feedMessage.textContent = "Geolocation not supported. Showing fallback events.";
        // console.error("Geolocation not supported.");
        showFallbackEvents(CURRENT_USER_UNIVERSITY);

        // ✅ Hide loader, show feed
        document.getElementById("feed-loader").classList.add("hidden");
        document.getElementById("lifestyle-feed").classList.remove("hidden");
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
        card.querySelector("div.flex span.text-green-400").textContent = event.location || event.university || "Location TBA";

        const ticketBtn = card.querySelector("button");
        if (ticketBtn) {
        ticketBtn.textContent = "Details & Ticket"; // card always shows "Ticket"

        ticketBtn.addEventListener("click", () => {
            // Fill modal
            modalTitle.textContent = event.title;
            modalImage.src = event.image_url || "https://via.placeholder.com/400x200";
            modalDescription.textContent = event.description;
            modalCampus.textContent = event.location || event.university || "Location TBA";
            modalDate.textContent = event.start_time
                ? new Date(event.start_time).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    })
                : "Date TBA";

            if (event.tickets_sold !== undefined) {
            modalPrice.textContent = `Tickets reserved: ${event.tickets_sold}`;
            } else {
            modalPrice.textContent = event.ticket_price > 0
                ? `Price: KES ${event.ticket_price}`
                : "Free Event";
            }

            // Configure modal action button
            if (userOptIns.includes(event._id)) {
            modalPay.textContent = "Reserved";
            modalPay.disabled = true;
            modalPay.classList.add("bg-gray-400", "cursor-not-allowed");
            } else {
            modalPay.textContent = "I’m in";
            modalPay.disabled = false;
            modalPay.classList.remove("bg-gray-400", "cursor-not-allowed");

            modalPay.onclick = () => {
                fetch(`/api/events/${event._id}/reserve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: CURRENT_USER_EMAIL })
                })
                .then(r => r.json())
                .then(resp => {
                    if (resp.error) {
                    showToast("⚠️ " + resp.error, "error");
                    } else {
                    showToast("✅ Reservation confirmed!", "success");

                    // Update state
                    userOptIns.push(event._id);

                    // Update modal button
                    modalPay.textContent = "Reserved";
                    modalPay.disabled = true;
                    modalPay.classList.add("bg-gray-400", "cursor-not-allowed");

                    // Optionally update tickets count shown
                    if (!isNaN(parseInt(event.tickets_sold))) {
                        event.tickets_sold += 1;
                        modalPrice.textContent = `Tickets reserved: ${event.tickets_sold}`;
                    }

                    // Keep modal open (not hidden), since user might want to view details
                    }
                })
                .catch(() => showToast("⚠️ Error reserving seat", "error"));
            };
            }

            eventModal.classList.remove("hidden");
        });
        }

        return card;
    }

  // --- Render list of events ---
  function renderEvents(events) {
    feed.innerHTML = "";
    events.forEach(event => feed.appendChild(buildEventCard(event)));
  }

  function renderCustomEvents(events) {
    // ensure wrapper exists
    let section = document.getElementById("custom-events-section");
    if (!section) {
        section = document.createElement("section");
        section.id = "custom-events-section";
        section.className = "max-w-7xl mx-auto p-3 mt-3";
        // HR + heading
        const hr = document.createElement("hr");
        hr.className = "my-3";
        const heading = document.createElement("h3");
        heading.className = "text-center text-xs font-semibold text-cyan-400 mb-2";
        heading.textContent = "University Events with Custom Location";
        section.appendChild(hr);
        section.appendChild(heading);

        // grid container
        const grid = document.createElement("div");
        grid.id = "custom-events-grid";
        grid.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10";
        section.appendChild(grid);

        // insert after main feed's container
        const feedContainer = document.getElementById("lifestyle-feed");
        if (feedContainer && feedContainer.parentNode) {
        feedContainer.parentNode.insertBefore(section, feedContainer.nextSibling);
        } else {
        document.body.appendChild(section);
        }
    }

    const grid = document.getElementById("custom-events-grid");
    grid.innerHTML = "";
    events.forEach(ev => {
        const card = buildEventCard(ev); // returns a fragment
        grid.appendChild(card);
    });
    }


  // --- Fallback latest events (after 3s delay) ---
  function showFallbackEvents(uniName) {
    feedMessage.innerHTML = `
        Something broke, falling back to events around <b>${uniName}</b>
    `;

    setTimeout(() => {
      apiFetch(`/api/events?limit=8&sort=latest`)
        .then(events => {
          setEvents(events, "Latest");
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

  // 
    on(searchInput, "input", e => {
    clearTimeout(debounceTimer);
    const q = e.target.value;
    debounceTimer = setTimeout(() => filterLocalEvents(q), 250);
    });

    on(modalCancel, "click", () => eventModal.classList.add("hidden"));
    on(uploadCancel, "click", () => uploadModal.classList.add("hidden"));
    on(uploadBtn, "click", () => uploadModal.classList.remove("hidden"));

    // --- Upload form ---
    on(uploadForm, "submit", e => {
        e.preventDefault();
        const formData = new FormData(uploadForm);
        let data = Object.fromEntries(formData);

        if (data.campus) {
            data.location = data.campus;
        }
        delete data.campus;

        const isCustom = (document.getElementById("campus-custom") || {}).value === "true";
        data.is_custom_location = isCustom;

        // compute service fee server-side (but include it so user sees it)
        let computedFee = 0;
        if (isCustom) {
            const price = data.is_free === "on" || data.is_free === true ? 0 : parseFloat(data.ticket_price || 0);
            computedFee = Math.max(MIN_CUSTOM_SERVICE_FEE, Math.round((price || 0) * CUSTOM_SURCHARGE_PERCENT));
            data.service_fee = computedFee;
        } else {
            data.service_fee = 0;
        }

         // send
        fetch("/api/events/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
            .then(r => r.json())
            .then(resp => {
            if (resp.error) {
                showToast("⚠️ " + resp.error, "error");
            } else {
                showToast("✅ Event uploaded!", "success");
                uploadModal.classList.add("hidden");

                const newEvent = resp.event;

                // If it's a custom event — add to custom section
                if (newEvent.is_custom_location) {
                // keep the most recent at top
                customEvents.unshift(newEvent);
                renderCustomEvents(customEvents.slice(0, 16));
                } else {
                // If it matches the current geofenced universities (activeUniNames),
                // add it to the active feed (so user sees it in the current context)
                if (activeUniNames && newEvent.location &&
                    activeUniNames.toLowerCase().includes((newEvent.location || "").toLowerCase())) {
                    allEvents.unshift(newEvent); // show newest first
                    renderEvents(allEvents);
                    feedMessage.innerHTML = `Showing events in <b>${escapeHtml(activeUniNames)}</b>.`;
                } else {
                    // Otherwise it isn't part of the current geofence: optionally leave feed alone
                    // and/or refresh latest fallback section:
                    apiFetch(`/api/events?limit=8&sort=latest`).then(events => setEvents(events, "Latest"));
                }
                }
            }
            })
            .catch(() => showToast("⚠️ Error uploading event", "error"));
    });


  // --- University autocomplete ---
  const campusSearch = document.getElementById("campus-search");
  const campusResults = document.getElementById("campus-results");
  const campusHidden = document.getElementById("campus-hidden");
  let uniDebounce;

  on(campusSearch, "input", e =>  {
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
                computeAndShowSurcharge(); // 👈 Will hide the note automatically since not custom
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
              computeAndShowSurcharge()
            });
            campusResults.appendChild(customLi);
          }

          campusResults.classList.remove("hidden");
        });
    }, 300);
  });

  

  on(isFreeCheckbox, "change", () => {
    if (isFreeCheckbox.checked) {
      ticketPriceInput.value = "";
      ticketPriceInput.disabled = true;
    } else {
      ticketPriceInput.disabled = false;
    }
  });
});
