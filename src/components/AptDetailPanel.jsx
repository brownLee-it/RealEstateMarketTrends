import { formatPrice, formatDealDate, sqmToPyeong } from '../utils/format';

export default function AptDetailPanel({ apartment, searchInfo, onShowPanorama, isFavorite, onToggleFavorite }) {
    if (!apartment) return null;

    const transactions = apartment.transactions || [];
    const avgPrice = transactions.length > 0
        ? Math.round(transactions.reduce((s, t) => s + t.price, 0) / transactions.length)
        : 0;

    return (
        <div className="detail-panel">
            <div className="detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3>{apartment.aptName}</h3>
                    <div className="detail-address">
                        {searchInfo.regionName} {searchInfo.districtName} {apartment.dong} {apartment.jibun}
                    </div>
                </div>
                <button
                    className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                    onClick={onToggleFavorite}
                    title={isFavorite ? "관심 목록에서 제거" : "관심 목록에 추가"}
                >
                    {isFavorite ? '★' : '☆'}
                </button>
            </div>

            <div className="detail-info-grid">
                <div className="detail-info-item">
                    <div className="detail-info-label">평균 거래가</div>
                    <div className="detail-info-value" style={{ color: 'var(--accent-blue)' }}>
                        {formatPrice(avgPrice)}
                    </div>
                </div>
                <div className="detail-info-item">
                    <div className="detail-info-label">건축년도</div>
                    <div className="detail-info-value">{apartment.buildYear}년</div>
                </div>
                <div className="detail-info-item">
                    <div className="detail-info-label">거래건수</div>
                    <div className="detail-info-value">{transactions.length}건</div>
                </div>
                <div className="detail-info-item">
                    <div className="detail-info-label">법정동</div>
                    <div className="detail-info-value">{apartment.dong}</div>
                </div>
            </div>

            {/* 평수 종류 */}
            {transactions.length > 0 && (() => {
                const uniqueAreas = [...new Set(transactions.map(t => t.area))].sort((a, b) => a - b);
                return (
                    <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                        <div className="detail-info-label" style={{ marginBottom: '8px' }}>📐 평수 종류</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {uniqueAreas.map(area => {
                                const count = transactions.filter(t => t.area === area).length;
                                return (
                                    <span
                                        key={area}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '20px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            background: 'rgba(99, 102, 241, 0.15)',
                                            color: 'var(--accent-blue)',
                                            border: '1px solid rgba(99, 102, 241, 0.25)',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {sqmToPyeong(area)}평 ({area}㎡) · {count}건
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

            <div className="detail-actions">
                {apartment.lat && apartment.lng && (
                    <button
                        className="detail-action-btn panorama-btn"
                        onClick={() => onShowPanorama(apartment.lat, apartment.lng)}
                    >
                        📷 거리뷰 보기
                    </button>
                )}
            </div>

            {/* Transaction history table */}
            <div className="section-title" style={{ marginTop: 16 }}>
                거래 이력
                <span className="count-badge">{transactions.length}</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className="transaction-table">
                    <thead>
                        <tr>
                            <th>거래일</th>
                            <th>거래가</th>
                            <th>면적</th>
                            <th>동</th>
                            <th>층</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((t, idx) => (
                            <tr key={idx}>
                                <td>{formatDealDate(t.dealYear, t.dealMonth, t.dealDay)}</td>
                                <td className="td-price">{formatPrice(t.price)}</td>
                                <td>{t.area}㎡ ({sqmToPyeong(t.area)}평)</td>
                                <td>{t.aptDong || '-'}</td>
                                <td>{t.floor}층</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
