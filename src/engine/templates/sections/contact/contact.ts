// === PP:FUNC:contact-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="contact"]');
  if (!section) {
    return;
  }

  const mapElement = section.querySelector<HTMLElement>('[data-map-container]');
  if (mapElement) {
    const lat = Number(mapElement.dataset.mapLat ?? '');
    const lng = Number(mapElement.dataset.mapLng ?? '');
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const coords: [number, number] = hasCoords ? [lat, lng] : [0, 0];

    type LeafletTileLayer = { addTo: (map: LeafletMap) => void };
    type LeafletMarker = { addTo: (map: LeafletMap) => void };
    type LeafletMap = { setView: (center: [number, number], zoom: number) => LeafletMap };
    type LeafletLike = {
      map: (element: HTMLElement) => LeafletMap;
      tileLayer: (url: string, options: { attribution: string }) => LeafletTileLayer;
      marker: (center: [number, number]) => LeafletMarker;
    };

    const leaflet = (window as Window & { L?: LeafletLike }).L;
    if (leaflet) {
      const map = leaflet.map(mapElement).setView(coords, hasCoords ? 13 : 2);
      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '(c) OpenStreetMap contributors',
        })
        .addTo(map);
      leaflet.marker(coords).addTo(map);
    }
  }

  const form = section.querySelector<HTMLFormElement>('[data-contact-form]');
  const status = section.querySelector<HTMLElement>('[data-form-status]');

  if (form) {
    form.addEventListener('submit', () => {
      form.setAttribute('data-status', 'sending');
      if (status) {
        status.textContent = 'Sending...';
      }
    });
  }
})();
// === /PP:FUNC:contact-init ===
