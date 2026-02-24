import { useEffect, useRef, useState } from 'react';
import { formatPriceShort } from '../utils/format';
import { getMarkerColorByPrice } from '../utils/colors';

export default function KakaoMap({ center, zoom, apartments, selectedApt, onSelectApt, onShowPanorama, favorites = [], onMapMove }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const overlaysRef = useRef([]);
    const [mapReady, setMapReady] = useState(false);

    // Convert Naver-style zoom (1-21, higher=closer) to Kakao level (1-14, lower=closer)
    function zoomToLevel(naverZoom) {
        return Math.max(1, Math.min(14, 21 - naverZoom + 1));
    }

    // Initialize map
    useEffect(() => {
        if (!mapRef.current) return;

        // Check if SDK is available
        if (!window.kakao || !window.kakao.maps) {
            console.error('Kakao Maps SDK not loaded');
            return;
        }

        try {
            const mapOption = {
                center: new window.kakao.maps.LatLng(center.lat, center.lng),
                level: zoomToLevel(zoom),
            };

            const map = new window.kakao.maps.Map(mapRef.current, mapOption);

            // Add zoom control
            const zoomControl = new window.kakao.maps.ZoomControl();
            map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);

            // Add map type control
            const mapTypeControl = new window.kakao.maps.MapTypeControl();
            map.addControl(mapTypeControl, window.kakao.maps.ControlPosition.TOPRIGHT);

            // Listen for map movements to sync with parent
            window.kakao.maps.event.addListener(map, 'dragend', function () {
                if (onMapMove) {
                    const currentCenter = map.getCenter();
                    const lat = currentCenter.getLat();
                    const lng = currentCenter.getLng();
                    lastPannedCenter.current = { lat, lng };
                    onMapMove({ lat, lng }, 21 - map.getLevel() + 1); // rough back-conversion
                }
            });

            window.kakao.maps.event.addListener(map, 'zoom_changed', function () {
                if (onMapMove) {
                    const currentCenter = map.getCenter();
                    const lat = currentCenter.getLat();
                    const lng = currentCenter.getLng();
                    lastPannedCenter.current = { lat, lng };
                    onMapMove({ lat, lng }, 21 - map.getLevel() + 1);
                }
            });

            mapInstanceRef.current = map;
            setMapReady(true);

            console.log('Kakao Map initialized successfully');
        } catch (err) {
            console.error('Kakao Map initialization error:', err);
        }

        return () => {
            overlaysRef.current.forEach((o) => o.setMap(null));
            overlaysRef.current = [];
        };
    }, []);

    // Track the last center prop we actually panned to, so we don't re-pan
    // if the app just re-renders with the same coordinates.
    const lastPannedCenter = useRef({ lat: center.lat, lng: center.lng });

    // Update center and zoom
    useEffect(() => {
        if (!mapInstanceRef.current) return;

        // Has the desired center actually changed from our last known target?
        const reqLat = center.lat;
        const reqLng = center.lng;

        const knownLat = lastPannedCenter.current.lat;
        const knownLng = lastPannedCenter.current.lng;

        if (Math.abs(reqLat - knownLat) > 0.000001 || Math.abs(reqLng - knownLng) > 0.000001) {
            // The parent specifically requested a new location we haven't seen yet.
            const propCenter = new window.kakao.maps.LatLng(reqLat, reqLng);

            // Check if the map is already there anyway (e.g. from user drag)
            const currentCenter = mapInstanceRef.current.getCenter();
            const latDiff = Math.abs(currentCenter.getLat() - propCenter.getLat());
            const lngDiff = Math.abs(currentCenter.getLng() - propCenter.getLng());

            if (latDiff > 0.0001 || lngDiff > 0.0001) {
                mapInstanceRef.current.panTo(propCenter);
            }

            // Remember this as the last target we processed
            lastPannedCenter.current = { lat: reqLat, lng: reqLng };
        }

        const currentLevel = mapInstanceRef.current.getLevel();
        const targetLevel = zoomToLevel(zoom);
        if (currentLevel !== targetLevel) {
            mapInstanceRef.current.setLevel(targetLevel);
        }
    }, [center.lat, center.lng, zoom]); // Depend on primitives, not the 'center' object itself

    // Update markers
    useEffect(() => {
        if (!mapInstanceRef.current || !mapReady) return;

        // Clear existing overlays
        overlaysRef.current.forEach((o) => o.setMap(null));
        overlaysRef.current = [];

        if (!apartments || apartments.length === 0) return;

        apartments.forEach((apt) => {
            if (!apt.lat || !apt.lng) return;

            const bgColor = getMarkerColorByPrice(apt.avgPrice);
            const isSelected = selectedApt?.aptName === apt.aptName && selectedApt?.dong === apt.dong;
            const isFavorite = favorites.some(f => f.aptName === apt.aptName && f.dong === apt.dong && f.jibun === apt.jibun);

            const content = document.createElement('div');
            content.className = 'apt-marker';
            content.innerHTML = `
                <div class="marker-bubble ${isSelected ? 'selected' : ''}" style="background: ${bgColor};">
                    ${isFavorite ? '<span style="color: #ffd700; text-shadow: 0 0 2px rgba(0,0,0,0.5);">★</span> ' : ''}<span class="marker-name">${apt.aptName.length > 8 ? apt.aptName.slice(0, 8) + '…' : apt.aptName}</span>
                    ${formatPriceShort(apt.avgPrice)}
                </div>
                <div class="marker-tail" style="border-top: 6px solid ${bgColor};"></div>
            `;
            content.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelectApt(apt);
            });

            const overlay = new window.kakao.maps.CustomOverlay({
                position: new window.kakao.maps.LatLng(apt.lat, apt.lng),
                content: content,
                yAnchor: 1.3,
                zIndex: isSelected ? 100 : 1,
            });

            overlay.setMap(mapInstanceRef.current);
            overlaysRef.current.push(overlay);
        });
    }, [apartments, selectedApt, mapReady]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

            {/* Custom Controls Overlay */}
            <div className="map-controls-overlay">
                {selectedApt?.lat && selectedApt?.lng && (
                    <button
                        className="map-control-btn"
                        onClick={() => onShowPanorama(selectedApt.lat, selectedApt.lng)}
                    >
                        📷 거리뷰
                    </button>
                )}
            </div>
        </div>
    );
}
