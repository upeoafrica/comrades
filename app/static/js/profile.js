// USER PROFILE FEEDS

const reservationsFeed = document.getElementById("reservations-feed");
const hostedFeed = document.getElementById("hosted-feed");
const noReservations = document.getElementById("no-reservations");
const noHosted = document.getElementById("no-hosted");
const cardTemplate = document.getElementById("event-card-template");

function renderEventCard(event, type) {
    const card = cardTemplate.content.cloneNode(true);
    card.querySelector("img").src = event.image_url || "/static/default-event.jpg";
    card.querySelector("h2").textContent = event.title;
    card.querySelector("span").textContent = new Date(event.start_time).toLocaleDateString();
    card.querySelector("p").textContent = event.description;
    card.querySelector("span.text-[11px]").textContent = event.campus || "Unknown";

    // Conditionally show actions
    if (type === "reservation") {
        const btn = card.querySelector(".cancel-reservation");
        btn.classList.remove("hidden");
        btn.addEventListener("click", async () => {
            try {
                await apiFetch(`/api/user/optins/${event.id}`, { method: "DELETE" });
                showToast("Reservation cancelled");
                card.firstElementChild.remove();
            } catch {
                showToast("Failed to cancel", "error");
            }
        });
    }

    if (type === "hosted") {
        const btn = card.querySelector(".delete-event");
        btn.classList.remove("hidden");
        btn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to delete this event?")) return;
            try {
                await apiFetch(`/api/events/${event.id}`, { method: "DELETE" });
                showToast("Event deleted");
                card.firstElementChild.remove();
            } catch {
                showToast("Failed to delete", "error");
            }
        });
    }

    return card;
}

async function loadProfileData() {
    try {
       // Show loaders
        document.getElementById("reservations-loader").classList.remove("hidden");
        document.getElementById("hosted-loader").classList.remove("hidden");

        // Reservations
        const optins = await apiFetch(`/api/user/optins?email=${encodeURIComponent(CURRENT_USER_EMAIL)}`);
        document.getElementById("reservations-loader").classList.add("hidden");
        document.getElementById("reservations-feed").classList.remove("hidden");
        if (optins.events?.length) {
            optins.events.forEach(e => reservationsFeed.appendChild(renderEventCard(e, "reservation")));
        } else {
            noReservations.classList.remove("hidden");
        }

        // Hosted events
        const events = await apiFetch(`/api/events?owner_email=${encodeURIComponent(CURRENT_USER_EMAIL)}`);
        document.getElementById("hosted-loader").classList.add("hidden");
        document.getElementById("hosted-feed").classList.remove("hidden");
        if (events.length) {
            events.forEach(e => hostedFeed.appendChild(renderEventCard(e, "hosted")));
        } else {
            noHosted.classList.remove("hidden");
        }

    } catch (err) {
        console.error("Profile load error:", err);
        showToast("Error loading profile", "error");

        // Hide loaders in case of error
        document.getElementById("reservations-loader").classList.add("hidden");
        document.getElementById("hosted-loader").classList.add("hidden");
    }
}

document.addEventListener("DOMContentLoaded", loadProfileData);

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
