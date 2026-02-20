import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import SearchPanel from './components/SearchPanel';
import StatsCards from './components/StatsCards';
import PriceChart from './components/PriceChart';
import AptDetailPanel from './components/AptDetailPanel';
import KakaoMap from './components/KakaoMap';
import NaverMap from './components/NaverMap';
import PanoramaView from './components/PanoramaView';
import { fetchApartments, geocodeAddress } from './utils/api';
import { REGION_CENTERS } from './utils/regions';

function App() {
    const [apartments, setApartments] = useState([]);
    const [selectedApt, setSelectedApt] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchInfo, setSearchInfo] = useState({ regionCode: '', yearMonth: '', regionName: '', districtName: '' });
    const [showPanorama, setShowPanorama] = useState(false);
    const [panoramaPosition, setPanoramaPosition] = useState(null);
    const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.9780 });
    const [mapZoom, setMapZoom] = useState(14);
    const [geocodedApts, setGeocodedApts] = useState([]);
    const [sidebarTab, setSidebarTab] = useState('search'); // 'search', 'detail', 'chart'
    const [activeMap, setActiveMap] = useState('kakao'); // 'kakao', 'naver'
    const [naverScriptLoaded, setNaverScriptLoaded] = useState(false);

    // Load Naver Map Script dynamically
    useEffect(() => {
        if (activeMap === 'naver') {
            if (window.naver && window.naver.maps) {
                setNaverScriptLoaded(true);
                return;
            }

            const scriptId = 'naver-map-script';
            if (document.getElementById(scriptId)) {
                setNaverScriptLoaded(true);
                return;
            }

            // Fallback to hardcoded ID if env var fails
            const clientId = import.meta.env.VITE_NAVER_CLIENT_ID?.trim() || 'rnv3toh53y';

            if (!clientId) {
                console.error('Naver Client ID is missing!');
                return;
            }

            const script = document.createElement('script');
            script.id = scriptId;
            script.type = 'text/javascript';
            script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`;
            script.async = true;
            script.referrerPolicy = "origin"; // Fix for Vercel deployment auth error
            document.head.appendChild(script);

            script.onload = () => {
                console.log('Naver Map script loaded. Client ID:', import.meta.env.VITE_NAVER_CLIENT_ID);
                setNaverScriptLoaded(true);
            };
        }
    }, [activeMap]);

    const handleSearch = useCallback(async (regionCode, yearMonth, regionName, districtName) => {
        setLoading(true);
        setError(null);
        setSelectedApt(null);
        setSidebarTab('search');

        try {
            const data = await fetchApartments(regionCode, yearMonth);
            setApartments(data.apartments || []);
            setSearchInfo({ regionCode, yearMonth, regionName, districtName });

            // Move map to region center
            const regionPrefix = regionCode.substring(0, 2);
            const center = REGION_CENTERS[regionPrefix];
            if (center) {
                setMapCenter(center);
                setMapZoom(14);
            }

            // Geocode apartments for map markers
            const geocoded = [];
            const aptGroups = data.apartments || [];

            // Geocode up to 30 apartments for display
            const toGeocode = aptGroups.slice(0, 30);
            for (const apt of toGeocode) {
                try {
                    let address = `${districtName} ${apt.dong} ${apt.jibun}`;
                    let geoResult = await geocodeAddress(address);

                    // Retry with relaxed address (City + Dong) if failed
                    // e.g. "창원시 성산구 북면" (Fail) -> "창원시 북면" (Success)
                    if ((!geoResult.addresses || geoResult.addresses.length === 0) && districtName.includes(' ')) {
                        const cityPart = districtName.split(' ')[0];
                        const fallbackAddress = `${cityPart} ${apt.dong} ${apt.jibun}`;
                        // console.log(`Geocoding retry: ${fallbackAddress}`);
                        geoResult = await geocodeAddress(fallbackAddress);
                    }

                    if (geoResult.addresses && geoResult.addresses.length > 0) {
                        const { x, y } = geoResult.addresses[0];
                        const avgPrice = apt.transactions.reduce((sum, t) => sum + t.price, 0) / apt.transactions.length;
                        geocoded.push({
                            ...apt,
                            lat: parseFloat(y),
                            lng: parseFloat(x),
                            avgPrice: Math.round(avgPrice),
                        });
                    }
                } catch (e) {
                    // console.error('Geocoding failed for:', apt.aptName);
                }
            }

            setGeocodedApts(geocoded);
            if (geocoded.length > 0) {
                setMapCenter({ lat: geocoded[0].lat, lng: geocoded[0].lng });
            }
        } catch (err) {
            setError('데이터를 불러오는 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSelectApt = useCallback((apt) => {
        setSelectedApt(apt);
        setSidebarTab('detail');
        if (apt.lat && apt.lng) {
            setMapCenter({ lat: apt.lat, lng: apt.lng });
            setMapZoom(17);
        }
    }, []);

    const handleShowPanorama = useCallback((lat, lng) => {
        setPanoramaPosition({ lat, lng });
        setShowPanorama(true);
    }, []);

    const handleClosePanorama = useCallback(() => {
        setShowPanorama(false);
        setPanoramaPosition(null);
    }, []);

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="header-left">
                    <div className="logo">
                        <span className="logo-icon">🏢</span>
                        <h1>REMTMap</h1>
                    </div>
                    <span className="header-subtitle">전국 아파트 실거래가 비교 서비스</span>
                </div>
                <div className="header-right">
                    <div className="map-toggle-group">
                        <button
                            className={`map-toggle-btn ${activeMap === 'kakao' ? 'active' : ''}`}
                            onClick={() => setActiveMap('kakao')}
                        >
                            카카오
                        </button>
                        <button
                            className={`map-toggle-btn ${activeMap === 'naver' ? 'active' : ''}`}
                            onClick={() => setActiveMap('naver')}
                        >
                            네이버
                        </button>
                    </div>
                </div>
            </header>

            <div className="app-body">
                {/* Sidebar */}
                <aside className="sidebar">
                    {/* Sidebar tabs */}
                    <div className="sidebar-tabs">
                        <button
                            className={`tab-btn ${sidebarTab === 'search' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('search')}
                        >
                            🔍 검색
                        </button>
                        <button
                            className={`tab-btn ${sidebarTab === 'detail' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('detail')}
                            disabled={!selectedApt}
                        >
                            📋 상세
                        </button>
                        <button
                            className={`tab-btn ${sidebarTab === 'chart' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('chart')}
                            disabled={!selectedApt}
                        >
                            📊 차트
                        </button>
                    </div>

                    <div className="sidebar-content">
                        {sidebarTab === 'search' && (
                            <div className="animate-fade-in">
                                <SearchPanel onSearch={handleSearch} loading={loading} />
                                {error && <div className="error-msg">{error}</div>}
                                <StatsCards apartments={apartments} searchInfo={searchInfo} />

                                {/* Apartment list */}
                                {apartments.length > 0 && (
                                    <div className="apt-list">
                                        <h3 className="section-title">
                                            거래 아파트 목록
                                            <span className="count-badge">{apartments.length}</span>
                                        </h3>
                                        {apartments.map((apt, idx) => {
                                            const avgPrice = apt.transactions.reduce((s, t) => s + t.price, 0) / apt.transactions.length;
                                            const geoApt = geocodedApts.find(
                                                (g) => g.aptName === apt.aptName && g.dong === apt.dong
                                            );
                                            return (
                                                <div
                                                    key={`${apt.aptName}_${apt.dong}_${idx}`}
                                                    className={`apt-list-item ${selectedApt?.aptName === apt.aptName && selectedApt?.dong === apt.dong ? 'selected' : ''}`}
                                                    onClick={() => handleSelectApt(geoApt || apt)}
                                                >
                                                    <div className="apt-list-name">{apt.aptName}</div>
                                                    <div className="apt-list-meta">
                                                        <span>{apt.dong}</span>
                                                        <span className="apt-list-price">
                                                            평균 {Math.round(avgPrice).toLocaleString()}만원
                                                        </span>
                                                    </div>
                                                    <div className="apt-list-footer">
                                                        <span className="apt-list-count">{apt.transactions.length}건</span>
                                                        <span className="apt-list-year">건축 {apt.buildYear}년</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {sidebarTab === 'detail' && selectedApt && (
                            <div className="animate-slide-in-right">
                                <AptDetailPanel
                                    apartment={selectedApt}
                                    searchInfo={searchInfo}
                                    onShowPanorama={handleShowPanorama}
                                />
                            </div>
                        )}

                        {sidebarTab === 'chart' && selectedApt && (
                            <div className="animate-slide-in-right">
                                <PriceChart
                                    apartment={selectedApt}
                                    searchInfo={searchInfo}
                                />
                            </div>
                        )}
                    </div>
                </aside>

                {/* Map Area */}
                <main className="map-area">
                    {activeMap === 'kakao' ? (
                        <KakaoMap
                            center={mapCenter}
                            zoom={mapZoom}
                            apartments={geocodedApts}
                            selectedApt={selectedApt}
                            onSelectApt={handleSelectApt}
                            onShowPanorama={handleShowPanorama}
                        />
                    ) : (
                        naverScriptLoaded && (
                            <NaverMap
                                center={mapCenter}
                                zoom={mapZoom}
                                apartments={geocodedApts}
                                selectedApt={selectedApt}
                                onSelectApt={handleSelectApt}
                                onShowPanorama={handleShowPanorama}
                            />
                        )
                    )}

                    {/* Panorama Overlay */}
                    {showPanorama && panoramaPosition && (
                        <PanoramaView
                            position={panoramaPosition}
                            onClose={handleClosePanorama}
                        />
                    )}

                    {/* Loading overlay */}
                    {loading && (
                        <div className="map-loading-overlay">
                            <div className="loading-spinner"></div>
                            <span>실거래 데이터 로딩중...</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
