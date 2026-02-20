import { useEffect, useRef, useState } from 'react';
import { formatPriceShort } from '../utils/format';
import { getMarkerColorByPrice } from '../utils/colors';

export default function NaverMap({ center, zoom, apartments, selectedApt, onSelectApt, onShowPanorama }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const [mapReady, setMapReady] = useState(false);

    // Initialize map
    useEffect(() => {
        if (!mapRef.current) return;

        // Check if SDK is available
        if (!window.naver || !window.naver.maps) {
            console.error('Naver Maps SDK not loaded');
            return;
        }

        try {
            const mapOptions = {
                center: new window.naver.maps.LatLng(center.lat, center.lng),
                zoom: zoom,
                scaleControl: false,
                logoControl: false,
                mapDataControl: false,
                zoomControl: true,
                minZoom: 10,
                maxZoom: 21,
            };

            const map = new window.naver.maps.Map(mapRef.current, mapOptions);
            mapInstanceRef.current = map;
            setMapReady(true);

            console.log('Naver Map initialized successfully');
        } catch (err) {
            console.error('Naver Map initialization error:', err);
        }

        return () => {
            // Cleanup if needed
        };
    }, []);

    // Update center and zoom
    useEffect(() => {
        if (!mapInstanceRef.current || !mapReady) return;

        const currentCenter = mapInstanceRef.current.getCenter();
        const newCenter = new window.naver.maps.LatLng(center.lat, center.lng);

        // Only move if distance is significant to avoid jitter
        if (!currentCenter.equals(newCenter)) {
            mapInstanceRef.current.setCenter(newCenter);
        }

        if (mapInstanceRef.current.getZoom() !== zoom) {
            mapInstanceRef.current.setZoom(zoom);
        }
    }, [center.lat, center.lng, zoom, mapReady]);

    // Update markers
    useEffect(() => {
        if (!mapInstanceRef.current || !mapReady) return;

        // Clear existing markers
        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        if (!apartments || apartments.length === 0) return;

        apartments.forEach((apt) => {
            if (!apt.lat || !apt.lng) return;

            const bgColor = getMarkerColorByPrice(apt.avgPrice);
            const isSelected = selectedApt?.aptName === apt.aptName && selectedApt?.dong === apt.dong;

            // HTML Marker content
            const contentHTML = `
                <div class="apt-marker">
                    <div class="marker-bubble ${isSelected ? 'selected' : ''}" style="background: ${bgColor};">
                        <span class="marker-name">${apt.aptName.length > 8 ? apt.aptName.slice(0, 8) + '…' : apt.aptName}</span>
                        ${formatPriceShort(apt.avgPrice)}
                    </div>
                    <div class="marker-tail" style="border-top: 6px solid ${bgColor};"></div>
                </div>
            `;

            const marker = new window.naver.maps.Marker({
                position: new window.naver.maps.LatLng(apt.lat, apt.lng),
                map: mapInstanceRef.current,
                title: apt.aptName,
                icon: {
                    content: contentHTML,
                    size: new window.naver.maps.Size(120, 50),
                    anchor: new window.naver.maps.Point(60, 50),
                },
                zIndex: isSelected ? 100 : 1
            });

            window.naver.maps.Event.addListener(marker, 'click', () => {
                onSelectApt(apt);
            });

            markersRef.current.push(marker);
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
                        📷 거리뷰 (카카오)
                    </button>
                )}
            </div>
        </div>
    );
}
