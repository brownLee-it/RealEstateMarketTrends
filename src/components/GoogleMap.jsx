import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, Marker } from '@react-google-maps/api';
import { formatPriceShort } from '../utils/format';
import { getMarkerColorByPrice } from '../utils/colors';

const containerStyle = {
    width: '100%',
    height: '100%'
};

const mapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    clickableIcons: false, // Prevent clicking on POIs
};

function GoogleMapComponent({ center, zoom, apartments, selectedApt, onSelectApt, onShowPanorama }) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        language: 'ko'
    });

    const [map, setMap] = useState(null);
    const mapRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    const onLoad = useCallback(function callback(map) {
        if (center) {
            map.setCenter(center);
        }
        map.setZoom(zoom);
        setMap(map);
        mapRef.current = map;

        // Slight delay to ensure projection is available before rendering OverlayViews
        setTimeout(() => setMapReady(true), 150);
    }, [center, zoom]);

    const onUnmount = useCallback(function callback(map) {
        setMap(null);
        mapRef.current = null;
        setMapReady(false);
    }, []);

    // Update center and zoom when props change
    useEffect(() => {
        if (map) {
            map.panTo(center);
            map.setZoom(zoom);
        }
    }, [center, zoom, map]);

    if (!isLoaded) {
        return <div className="map-loading-overlay">
            <div className="loading-spinner"></div>
            <span>Google Maps 로딩중...</span>
        </div>;
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <GoogleMap
                mapContainerStyle={containerStyle}
                center={center}
                zoom={zoom}
                options={mapOptions}
                onLoad={onLoad}
                onUnmount={onUnmount}
            >
                {/* Debug Marker to verify map is working */}
                {/* <Marker position={center} label="Center" /> */}

                {mapReady && apartments && apartments.map((apt, index) => {
                    if (!apt.lat || !apt.lng) return null;

                    const bgColor = getMarkerColorByPrice(apt.avgPrice);
                    const isSelected = selectedApt?.aptName === apt.aptName && selectedApt?.dong === apt.dong;

                    return (
                        <OverlayView
                            key={`${apt.aptName}-${index}`}
                            position={{ lat: apt.lat, lng: apt.lng }}
                            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                            getPixelPositionOffset={(width, height) => ({
                                x: -(width / 2),
                                y: -height,
                            })}
                        >
                            <div
                                className="apt-marker"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectApt(apt);
                                }}
                                style={{ cursor: 'pointer', zIndex: isSelected ? 100 : 1 }}
                            >
                                <div className={`marker-bubble ${isSelected ? 'selected' : ''}`} style={{ background: bgColor }}>
                                    <span className="marker-name">
                                        {apt.aptName.length > 8 ? apt.aptName.slice(0, 8) + '…' : apt.aptName}
                                    </span>
                                    {formatPriceShort(apt.avgPrice)}
                                </div>
                                <div className="marker-tail" style={{ borderTop: `6px solid ${bgColor}` }}></div>
                            </div>
                        </OverlayView>
                    );
                })}
            </GoogleMap>

            {/* Custom Controls Overlay - similar to KakaoMap */}
            <div className="map-controls-overlay">
                {selectedApt?.lat && selectedApt?.lng && (
                    <button
                        className="map-control-btn"
                        onClick={() => {
                            onShowPanorama(selectedApt.lat, selectedApt.lng)
                        }}
                    >
                        📷 거리뷰 (Kakao)
                    </button>
                )}
            </div>
        </div>
    );
}

export default React.memo(GoogleMapComponent);
