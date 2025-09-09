document.addEventListener("DOMContentLoaded", () => {
  const feed = document.getElementById("lifestyle-feed");
  const template = document.getElementById("event-card-template");
  const searchInput = document.getElementById("search-events");

  let debounceTimer;

  // Fetch events from API (with optional search)
  const fetchEvents = (search = "") => {
    fetch(`/api/events?search=${encodeURIComponent(search)}`)
      .then(res => res.json())
      .then(events => {
        feed.innerHTML = ""; // Clear current feed

        if (events.length === 0) {
          feed.innerHTML =
            '<p class="col-span-4 text-center text-gray-500 text-sm py-4">No events found</p>';
          return;
        }

        events.forEach(event => {
          const card = template.content.cloneNode(true);

          // Event image
          card.querySelector("img").src =
            event.image_url || "https://via.placeholder.com/400x200";

          // Title
          card.querySelector("h2").textContent = event.title;

          // Date badge
          card.querySelector("span.bg-indigo-50").textContent = event.start_time
            ? new Date(event.start_time).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })
            : "TBA";

          // Description
          card.querySelector("p").textContent = event.description;

          // Campus instead of location
          card.querySelector("div.flex span.text-green-600").textContent =
            event.campus || "Campus TBA";

          // Ticket button
          card.querySelector("button").addEventListener("click", () => {
            fetch(`/api/events/${event._id}/ticket`, { method: "POST" })
              .then(r => r.json())
              .then(resp => alert(resp.message || "Ticket reserved!"))
              .catch(() => alert("Error processing ticket"));
          });

          feed.appendChild(card);
        });
      })
      .catch(err => {
        console.error("❌ Error fetching events:", err);
        feed.innerHTML =
          '<p class="col-span-4 text-center text-red-500 text-sm py-4">Failed to load events.</p>';
      });
  };

  // Initial fetch of all events
  fetchEvents();

  // Live search with debounce (300ms)
  searchInput.addEventListener("input", e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const search = e.target.value.trim();
      fetchEvents(search);
    }, 300);
  });
});
