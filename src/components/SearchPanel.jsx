import { useState } from 'react';
import { REGIONS, DISTRICTS } from '../utils/regions';
import { getRecentYearMonths } from '../utils/format';

// 평수 필터 옵션 (전용면적 m² 기준)
const PYEONG_OPTIONS = [
    { label: '전체', value: '' },
    { label: '10평대 (33~66㎡)', value: '10', minArea: 33, maxArea: 66 },
    { label: '20평대 (66~99㎡)', value: '20', minArea: 66, maxArea: 99 },
    { label: '30평대 (99~132㎡)', value: '30', minArea: 99, maxArea: 132 },
    { label: '40평대 (132~165㎡)', value: '40', minArea: 132, maxArea: 165 },
    { label: '50평 이상 (165㎡~)', value: '50', minArea: 165, maxArea: 99999 },
];

// 건축년도 필터 옵션
const BUILD_YEAR_OPTIONS = [
    { label: '전체', value: '' },
    { label: '~1990년', minYear: 0, maxYear: 1990 },
    { label: '1991~2000년', minYear: 1991, maxYear: 2000 },
    { label: '2001~2005년', minYear: 2001, maxYear: 2005 },
    { label: '2006~2010년', minYear: 2006, maxYear: 2010 },
    { label: '2011~2015년', minYear: 2011, maxYear: 2015 },
    { label: '2016~2020년', minYear: 2016, maxYear: 2020 },
    { label: '2021년~', minYear: 2021, maxYear: 9999 },
];

export { PYEONG_OPTIONS, BUILD_YEAR_OPTIONS };

export default function SearchPanel({ onSearch, loading }) {
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [selectedYearMonth, setSelectedYearMonth] = useState('');
    const [keyword, setKeyword] = useState('');
    const [selectedPyeong, setSelectedPyeong] = useState('');
    const [selectedBuildYear, setSelectedBuildYear] = useState('');

    const yearMonths = getRecentYearMonths(24);
    const districts = selectedRegion ? (DISTRICTS[selectedRegion] || []) : [];

    const handleRegionChange = (e) => {
        setSelectedRegion(e.target.value);
        setSelectedDistrict('');
    };

    const handleSearch = () => {
        if (!selectedDistrict) return;
        // Either yearMonth or keyword must be provided
        if (!selectedYearMonth && !keyword) return;

        const region = REGIONS.find((r) => r.code === selectedRegion);
        const district = districts.find((d) => d.code === selectedDistrict);
        onSearch(
            selectedDistrict,
            selectedYearMonth,
            region?.name || '',
            district?.name || '',
            keyword.trim(),
            { pyeong: selectedPyeong, buildYear: selectedBuildYear }
        );
    };

    const formatYM = (ym) => {
        return `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4), 10)}월`;
    };

    // disable search if no district is selected, or if BOTH yearMonth and keyword are empty
    const isSearchDisabled = !selectedDistrict || (!selectedYearMonth && !keyword.trim()) || loading;

    return (
        <div className="search-panel">
            <h3>🔍 지역 검색</h3>

            <div className="search-row">
                <select
                    className="search-select"
                    value={selectedRegion}
                    onChange={handleRegionChange}
                >
                    <option value="">시/도 선택</option>
                    {REGIONS.map((r) => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                </select>
            </div>

            <div className="search-row">
                <select
                    className="search-select"
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    disabled={!selectedRegion}
                >
                    <option value="">시/군/구 선택</option>
                    {districts.map((d) => (
                        <option key={d.code} value={d.code}>{d.name}</option>
                    ))}
                </select>
            </div>

            <div className="search-row" style={{ display: 'flex', gap: '8px' }}>
                <select
                    className="search-select"
                    value={selectedYearMonth}
                    onChange={(e) => setSelectedYearMonth(e.target.value)}
                    style={{ flex: 1 }}
                >
                    <option value="">거래 년월 선택 (선택)</option>
                    {yearMonths.map((ym) => (
                        <option key={ym} value={ym}>{formatYM(ym)}</option>
                    ))}
                </select>
                <input
                    type="text"
                    className="search-input"
                    placeholder="아파트명 (선택)"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isSearchDisabled) {
                            handleSearch();
                        }
                    }}
                    style={{ flex: 1 }}
                />
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', marginTop: '-4px', textAlign: 'right' }}>
                * 아파트명 입력 시 최근 6개월 거래 내역을 모두 검색합니다.
            </div>

            <div className="search-row" style={{ display: 'flex', gap: '8px' }}>
                <select
                    className="search-select"
                    value={selectedBuildYear}
                    onChange={(e) => setSelectedBuildYear(e.target.value)}
                    style={{ flex: 1 }}
                >
                    <option value="">건축년도 (전체)</option>
                    {BUILD_YEAR_OPTIONS.filter(o => o.value !== '').map((o, i) => (
                        <option key={i} value={`${o.minYear}-${o.maxYear}`}>{o.label}</option>
                    ))}
                </select>
                <select
                    className="search-select"
                    value={selectedPyeong}
                    onChange={(e) => setSelectedPyeong(e.target.value)}
                    style={{ flex: 1 }}
                >
                    <option value="">평수 (전체)</option>
                    {PYEONG_OPTIONS.filter(o => o.value !== '').map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>

            <button
                className="search-btn"
                onClick={handleSearch}
                disabled={isSearchDisabled}
            >
                {loading ? (
                    <>
                        <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                        조회중...
                    </>
                ) : (
                    <>🔎 실거래가 조회</>
                )}
            </button>
        </div>
    );
}
