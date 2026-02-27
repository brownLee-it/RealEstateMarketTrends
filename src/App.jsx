import { useState, useCallback, useEffect } from 'react';
import './App.css';
import SearchPanel from './components/SearchPanel';
import StatsCards from './components/StatsCards';
import PriceChart from './components/PriceChart';
import AptDetailPanel from './components/AptDetailPanel';
import KakaoMap from './components/KakaoMap';
import PanoramaView from './components/PanoramaView';
import { fetchApartments, geocodeAddress, fetchApartmentsByKeyword, geocodeKeyword } from './utils/api';
import { PYEONG_OPTIONS, BUILD_YEAR_OPTIONS } from './components/SearchPanel';
import { REGIONS, DISTRICTS, REGION_CENTERS } from './utils/regions';

import GoogleMap from './components/GoogleMap';

function App() {
    const [apartments, setApartments] = useState([]);
    const [selectedApt, setSelectedApt] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchInfo, setSearchInfo] = useState({ regionCode: '', yearMonth: '', regionName: '', districtName: '', keyword: '' });
    const [showPanorama, setShowPanorama] = useState(false);
    const [panoramaPosition, setPanoramaPosition] = useState(null);
    const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.9780 });
    const [mapZoom, setMapZoom] = useState(14);
    const [geocodedApts, setGeocodedApts] = useState([]);
    const [sidebarTab, setSidebarTab] = useState('search'); // 'search', 'detail', 'chart', 'favorites'
    const [mapProvider, setMapProvider] = useState('kakao'); // 'kakao' | 'google'
    const [favorites, setFavorites] = useState(() => {
        const saved = localStorage.getItem('remt_favorites');
        try {
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Failed to parse favorites from local storage', e);
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem('remt_favorites', JSON.stringify(favorites));
    }, [favorites]);

    const toggleFavorite = useCallback((apt) => {
        setFavorites(prev => {
            const isFav = prev.some(f => f.aptName === apt.aptName && f.dong === apt.dong && f.jibun === apt.jibun);
            if (isFav) {
                return prev.filter(f => !(f.aptName === apt.aptName && f.dong === apt.dong && f.jibun === apt.jibun));
            } else {
                return [...prev, apt];
            }
        });
    }, []);

    const handleSearch = useCallback(async (regionCode, yearMonth, regionName, districtName, keyword = '', filters = {}) => {
        setLoading(true);
        setError(null);
        setSelectedApt(null);
        setSidebarTab('search');

        try {
            let data;
            if (keyword) {
                data = await fetchApartmentsByKeyword(regionCode, keyword);
                setSearchInfo({ regionCode, yearMonth: '최근 6개월', regionName, districtName, keyword });
            } else {
                data = await fetchApartments(regionCode, yearMonth);
                setSearchInfo({ regionCode, yearMonth, regionName, districtName, keyword: '' });
            }

            let filteredApartments = data.apartments || [];

            // 건축년도 필터 적용
            if (filters.buildYear) {
                const [minYear, maxYear] = filters.buildYear.split('-').map(Number);
                filteredApartments = filteredApartments.filter(apt =>
                    apt.buildYear >= minYear && apt.buildYear <= maxYear
                );
            }

            // 평수 필터 적용 (전용면적 기준)
            if (filters.pyeong) {
                const pyeongOption = PYEONG_OPTIONS.find(o => o.value === filters.pyeong);
                if (pyeongOption) {
                    filteredApartments = filteredApartments.map(apt => {
                        const filteredTx = apt.transactions.filter(t =>
                            t.area >= pyeongOption.minArea && t.area < pyeongOption.maxArea
                        );
                        return { ...apt, transactions: filteredTx };
                    }).filter(apt => apt.transactions.length > 0);
                }
            }

            setApartments(filteredApartments);

            // Move map to region center
            const regionPrefix = regionCode.substring(0, 2);
            const center = REGION_CENTERS[regionPrefix];
            if (center) {
                setMapCenter(center);
                setMapZoom(14);
            }

            // Geocode apartments for map markers
            const aptGroups = filteredApartments;

            // Geocode up to 30 apartments for display
            const toGeocode = aptGroups.slice(0, 30);

            const geocodedResults = await Promise.all(toGeocode.map(async (apt) => {
                try {
                    // Try keyword search first: "구/군 동 아파트명"
                    const keywordQuery = `${districtName} ${apt.dong} ${apt.aptName}`;
                    let geoResult = await geocodeKeyword(keywordQuery);

                    // Fallback to exact address
                    if (!geoResult.addresses || geoResult.addresses.length === 0) {
                        let address = `${districtName} ${apt.dong} ${apt.jibun}`;
                        geoResult = await geocodeAddress(address);
                    }

                    // Retry 1: Relaxed address (District + Dong)
                    if (!geoResult.addresses || geoResult.addresses.length === 0) {
                        const dongAddress = `${districtName} ${apt.dong}`;
                        geoResult = await geocodeAddress(dongAddress);
                    }

                    // Retry 2: City + Dong
                    if ((!geoResult.addresses || geoResult.addresses.length === 0) && districtName.includes(' ')) {
                        const cityPart = districtName.split(' ')[0];
                        const fallbackAddress = `${cityPart} ${apt.dong}`;
                        geoResult = await geocodeAddress(fallbackAddress);
                    }

                    if (geoResult.addresses && geoResult.addresses.length > 0) {
                        const { x, y } = geoResult.addresses[0];
                        const avgPrice = apt.transactions.reduce((sum, t) => sum + t.price, 0) / apt.transactions.length;
                        return {
                            ...apt,
                            lat: parseFloat(y),
                            lng: parseFloat(x),
                            avgPrice: Math.round(avgPrice),
                        };
                    }
                } catch (e) {
                    console.error('Geocoding failed for:', apt.aptName);
                }
                return null;
            }));

            const geocoded = geocodedResults.filter(item => item !== null);

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



    const handleSelectApt = useCallback(async (apt) => {
        // If we already have coordinates AND searchInfo has region properly set, just use them
        // If the user selects a favorite that was saved with a bad coordinate or missing searchInfo, we re-geocode it.
        // For simplicity, let's always update searchInfo if we can.

        let targetRegionName = null;
        let targetDistrictName = null;

        if (apt.regionCode) {
            const regionPrefix = apt.regionCode.substring(0, 2);
            const region = REGIONS.find(r => r.code === regionPrefix);
            const districtList = DISTRICTS[regionPrefix] || [];
            const district = districtList.find(d => d.code === apt.regionCode);

            if (region) {
                targetRegionName = region.name;
                if (district) targetDistrictName = district.name;
            }
        }

        if (apt.lat && apt.lng) {
            setSelectedApt(apt);
            setSidebarTab('detail');
            // Do NOT re-center map if it already has coordinates, to allow Google-like behavior
            // setMapCenter({ lat: apt.lat, lng: apt.lng });
            // setMapZoom(17);

            // Fix searchInfo for display in DetailPanel
            if (targetRegionName) {
                setSearchInfo(prev => ({
                    ...prev,
                    regionCode: apt.regionCode,
                    regionName: targetRegionName,
                    districtName: targetDistrictName || prev.districtName
                }));
            }

            // Add to geocodedApts if not already there so it shows on the map
            setGeocodedApts(prev => {
                const exists = prev.some(g => g.aptName === apt.aptName && g.dong === apt.dong && g.jibun === apt.jibun);
                if (!exists) return [...prev, apt];
                return prev;
            });
            return;
        }

        // Setup loading state for the UI while we geocode
        setLoading(true);
        setSelectedApt(apt);
        setSidebarTab('detail');

        try {
            // Try to construct a full address using the region code if available
            let address = apt.fullAddress;
            let fallbackAddress = apt.dong;
            let keywordQuery = `${apt.dong} ${apt.aptName}`;

            if (targetRegionName) {
                if (targetDistrictName) {
                    address = `${targetRegionName} ${targetDistrictName} ${apt.dong} ${apt.jibun}`;
                    fallbackAddress = `${targetRegionName} ${targetDistrictName} ${apt.dong}`;
                    keywordQuery = `${targetRegionName} ${targetDistrictName} ${apt.dong} ${apt.aptName}`;
                } else {
                    address = `${targetRegionName} ${apt.dong} ${apt.jibun}`;
                    fallbackAddress = `${targetRegionName} ${apt.dong}`;
                    keywordQuery = `${targetRegionName} ${apt.dong} ${apt.aptName}`;
                }
            }

            // Ultimate fallback
            if (!address) address = `${apt.dong} ${apt.jibun}`;

            // Try Keyword Search first for precise POI location
            let geoResult = await geocodeKeyword(keywordQuery);

            // Fallback to Address Search if Keyword fails
            if (!geoResult.addresses || geoResult.addresses.length === 0) {
                geoResult = await geocodeAddress(address);
            }

            if (!geoResult.addresses || geoResult.addresses.length === 0) {
                geoResult = await geocodeAddress(fallbackAddress);
            }

            if (geoResult.addresses && geoResult.addresses.length > 0) {
                const { x, y } = geoResult.addresses[0];
                const updatedApt = {
                    ...apt,
                    lat: parseFloat(y),
                    lng: parseFloat(x)
                };

                setSelectedApt(updatedApt);
                // setMapCenter({ lat: updatedApt.lat, lng: updatedApt.lng });
                // setMapZoom(17);

                // Add to geocodedApts so it appears on the map
                setGeocodedApts(prev => {
                    const exists = prev.some(g => g.aptName === updatedApt.aptName && g.dong === updatedApt.dong && g.jibun === updatedApt.jibun);
                    if (!exists) return [...prev, updatedApt];
                    return prev;
                });
            } else {
                console.warn("Could not find coordinates for this apartment.");
            }
        } catch (err) {
            console.error("Geocoding failed when selecting apartment", err);
        } finally {
            setLoading(false);
        }
    }, [searchInfo]);

    const handleShowPanorama = useCallback((lat, lng) => {
        setPanoramaPosition({ lat, lng });
        setShowPanorama(true);
    }, []);

    const handleClosePanorama = useCallback(() => {
        setShowPanorama(false);
        setPanoramaPosition(null);
    }, []);

    const handleMapMove = useCallback((newCenter, newZoom) => {
        setMapCenter(newCenter);
        if (newZoom) setMapZoom(newZoom);
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
                    <div className="header-badge">
                        <span className="badge-dot"></span>
                        <span>Live Data</span>
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
                        <button
                            className={`tab-btn ${sidebarTab === 'favorites' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('favorites')}
                        >
                            ⭐ 관심
                        </button>
                    </div>

                    <div className="sidebar-content">
                        {sidebarTab === 'search' && (
                            <div className="animate-fade-in">
                                <SearchPanel onSearch={handleSearch} loading={loading} />
                                {error && <div className="error-msg">{error}</div>}
                                <StatsCards apartments={apartments} searchInfo={searchInfo} />

                                {/* No results message */}
                                {!loading && apartments.length === 0 && searchInfo.regionCode && (
                                    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                                        <p style={{ margin: 0, fontWeight: 600, marginBottom: '0.5rem' }}>조회된 데이터가 없습니다.</p>
                                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                                            검색 조건(거래 년월, 건축년도, 평수)을<br />변경하여 다시 검색해 보세요.
                                        </p>
                                    </div>
                                )}

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
                                    isFavorite={favorites.some(f => f.aptName === selectedApt.aptName && f.dong === selectedApt.dong && f.jibun === selectedApt.jibun)}
                                    onToggleFavorite={() => toggleFavorite(selectedApt)}
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

                        {sidebarTab === 'favorites' && (
                            <div className="animate-fade-in">
                                <h3 className="section-title">
                                    관심 아파트 목록
                                    <span className="count-badge">{favorites.length}</span>
                                </h3>
                                {favorites.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⭐</div>
                                        <p>관심 아파트가 없습니다.<br />아파트 상세 화면에서 별표를 눌러 추가해보세요!</p>
                                    </div>
                                ) : (
                                    <div className="apt-list">
                                        {favorites.map((apt, idx) => {
                                            const avgPrice = apt.avgPrice || (apt.transactions ? apt.transactions.reduce((s, t) => s + t.price, 0) / apt.transactions.length : 0);
                                            return (
                                                <div
                                                    key={`fav_${apt.aptName}_${apt.dong}_${apt.jibun}_${idx}`}
                                                    className={`apt-list-item ${selectedApt?.aptName === apt.aptName && selectedApt?.dong === apt.dong && selectedApt?.jibun === apt.jibun ? 'selected' : ''}`}
                                                    onClick={() => handleSelectApt(apt)}
                                                    style={{ position: 'relative' }}
                                                >
                                                    <div className="apt-list-name">{apt.aptName}</div>
                                                    <button
                                                        className="favorite-btn active"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleFavorite(apt);
                                                        }}
                                                        style={{ position: 'absolute', top: '12px', right: '12px' }}
                                                    >
                                                        ★
                                                    </button>
                                                    <div className="apt-list-meta">
                                                        <span>{apt.dong}</span>
                                                        <span className="apt-list-price">
                                                            {avgPrice > 0 ? `평균 ${Math.round(avgPrice).toLocaleString()}만원` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="apt-list-footer">
                                                        {apt.transactions && <span className="apt-list-count">{apt.transactions.length}건</span>}
                                                        <span className="apt-list-year">건축 {apt.buildYear}년</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </aside>

                {/* Map Area */}
                <main className="map-area">
                    <div className="map-provider-toggle">
                        <button
                            className={`provider-btn ${mapProvider === 'kakao' ? 'active' : ''}`}
                            onClick={() => setMapProvider('kakao')}
                        >
                            Kakao Map
                        </button>
                        <button
                            className={`provider-btn ${mapProvider === 'google' ? 'active' : ''}`}
                            onClick={() => setMapProvider('google')}
                        >
                            Google Map
                        </button>
                    </div>

                    {mapProvider === 'kakao' ? (
                        <KakaoMap
                            center={mapCenter}
                            zoom={mapZoom}
                            apartments={geocodedApts}
                            selectedApt={selectedApt}
                            onSelectApt={handleSelectApt}
                            onShowPanorama={handleShowPanorama}
                            favorites={favorites}
                            onMapMove={handleMapMove}
                        />
                    ) : (
                        <GoogleMap
                            center={mapCenter}
                            zoom={mapZoom}
                            apartments={geocodedApts}
                            selectedApt={selectedApt}
                            onSelectApt={handleSelectApt}
                            onShowPanorama={handleShowPanorama}
                            favorites={favorites}
                            onMapMove={handleMapMove}
                        />
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
