// USER PROFILE FEEDS

const reservationsFeed = document.getElementById("reservations-feed");
const hostedFeed = document.getElementById("hosted-feed");
const noReservations = document.getElementById("no-reservations");
const noHosted = document.getElementById("no-hosted");
const cardTemplate = document.getElementById("event-card-template");

function renderEventCard(event, type) {
    const wrapper = document.createElement("div");
    const card = cardTemplate.content.cloneNode(true);
    wrapper.appendChild(card);

    const img = wrapper.querySelector("img");
    const title = wrapper.querySelector("h2");
    const date = wrapper.querySelector(".event-date");
    const desc = wrapper.querySelector("p");
    const campus = wrapper.querySelector(".event-campus");

    img.src = event.image_url || "/static/default-event.jpg";
    title.textContent = event.title;
    date.textContent = new Date(event.start_time).toLocaleDateString();
    desc.textContent = event.description;
    campus.textContent = event.location || "Location Error";

    if (type === "reservation") {
        const btn = wrapper.querySelector(".cancel-reservation");
        btn.classList.remove("hidden");
        btn.addEventListener("click", async () => {
            try {
                await apiFetch(`/api/user/optins/${event.id}`, { method: "DELETE" });
                showToast("Reservation cancelled");
                wrapper.remove(); // ✅ remove the whole card
            } catch {
                showToast("Failed to cancel", "error");
            }
        });
    }

    if (type === "hosted") {
        const btn = wrapper.querySelector(".delete-event");
        btn.classList.remove("hidden");
        btn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to delete this event?")) return;
            try {
                await apiFetch(`/api/events/${event.id}`, { method: "DELETE" });
                showToast("Event deleted");
                wrapper.remove(); // ✅ remove the whole card
            } catch {
                showToast("Failed to delete", "error");
            }
        });
    }

    return wrapper;
}


async function loadProfileData() {
    try {
       // Show loaders
        document.getElementById("reservations-loader").classList.remove("hidden");
        document.getElementById("hosted-loader").classList.remove("hidden");

        // Reservations
        const optins = await apiFetch(`/api/user/optins`);
        document.getElementById("reservations-loader").classList.add("hidden");
        document.getElementById("reservations-feed").classList.remove("hidden");
        if (optins.events?.length) {
            optins.events.forEach(e => reservationsFeed.appendChild(renderEventCard(e, "reservation")));
        } else {
            noReservations.classList.remove("hidden");
        }

       // Hosted events (no email exposed)
        const events = await apiFetch(`/api/events?hosted=1`);
        document.getElementById("hosted-loader").classList.add("hidden");
        document.getElementById("hosted-feed").classList.remove("hidden");
        if (events.length) {
            events.forEach(e => hostedFeed.appendChild(renderEventCard(e, "hosted")));
        } else {
            noHosted.classList.remove("hidden");
        }

    } catch (err) {
        console.error("Profile load error:", err);
        showToast(err.message, "error");

        // Hide loaders in case of error
        document.getElementById("reservations-loader").classList.add("hidden");
        document.getElementById("hosted-loader").classList.add("hidden");
    }
}

document.addEventListener("DOMContentLoaded", loadProfileData);

// Global fetch wrapper with rate-limit + error handling
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        credentials: "include", // 👈 important for session cookies
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }

    if (!res.ok) {
        showToast(data?.error || "Request failed", "error");
        throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data;
}

    


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
