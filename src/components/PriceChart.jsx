import { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend, Area, ComposedChart
} from 'recharts';
import { fetchApartmentHistory } from '../utils/api';
import { formatPrice } from '../utils/format';

export default function PriceChart({ apartment, searchInfo }) {
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [months, setMonths] = useState(12);

    // searchInfo.regionCode가 없으면 apartment.regionCode를 폴백으로 사용
    const effectiveRegionCode = searchInfo.regionCode || apartment?.regionCode || '';

    useEffect(() => {
        if (!apartment || !effectiveRegionCode) return;
        loadHistory();
    }, [apartment?.aptName, effectiveRegionCode, months]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const data = await fetchApartmentHistory(
                effectiveRegionCode,
                apartment.aptName,
                months
            );

            // Group by year-month for the chart
            const grouped = {};
            (data.transactions || []).forEach((t) => {
                const key = `${t.dealYear}.${String(t.dealMonth).padStart(2, '0')}`;
                if (!grouped[key]) {
                    grouped[key] = { month: key, prices: [], count: 0 };
                }
                grouped[key].prices.push(t.price);
                grouped[key].count++;
            });

            const chartItems = Object.values(grouped)
                .map((g) => ({
                    month: g.month,
                    avgPrice: Math.round(g.prices.reduce((a, b) => a + b, 0) / g.prices.length),
                    maxPrice: Math.max(...g.prices),
                    minPrice: Math.min(...g.prices),
                    count: g.count,
                }))
                .sort((a, b) => a.month.localeCompare(b.month));

            setChartData(chartItems);
        } catch (err) {
            console.error('차트 데이터 로드 오류:', err);
        } finally {
            setLoading(false);
        }
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    boxShadow: 'var(--shadow-lg)',
                }}>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>{label}</p>
                    {payload.map((entry, idx) => (
                        <p key={idx} style={{ color: entry.color, fontSize: 13, margin: '2px 0' }}>
                            {entry.name}: {formatPrice(entry.value)}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const formatYAxis = (val) => {
        if (val >= 10000) return `${(val / 10000).toFixed(0)}억`;
        return `${(val / 1000).toFixed(0)}천`;
    };

    return (
        <div className="chart-panel">
            <h3>📊 {apartment?.aptName} 가격 추이</h3>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[6, 12, 24, 36].map((m) => (
                    <button
                        key={m}
                        className={`map-control-btn ${months === m ? 'active' : ''}`}
                        onClick={() => setMonths(m)}
                        style={{ padding: '6px 12px' }}
                    >
                        {m}개월
                    </button>
                ))}
            </div>

            <div className="chart-container">
                {loading ? (
                    <div className="chart-empty">
                        <span className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
                        &nbsp; 데이터 로딩중...
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="chart-empty">
                        거래 이력이 없습니다
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={chartData}>
                            <defs>
                                <linearGradient id="avgGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4a9eff" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#4a9eff" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="maxGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis
                                dataKey="month"
                                tick={{ fill: '#6b7085', fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                            />
                            <YAxis
                                tickFormatter={formatYAxis}
                                tick={{ fill: '#6b7085', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                width={50}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                wrapperStyle={{ fontSize: 12, color: '#a0a5b5' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="maxPrice"
                                name="최고가"
                                stroke="#ef4444"
                                fill="url(#maxGradient)"
                                strokeWidth={1.5}
                                dot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="avgPrice"
                                name="평균가"
                                stroke="#4a9eff"
                                fill="url(#avgGradient)"
                                strokeWidth={2}
                                dot={{ r: 3, fill: '#4a9eff' }}
                                activeDot={{ r: 5, stroke: '#4a9eff', strokeWidth: 2 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="minPrice"
                                name="최저가"
                                stroke="#22c55e"
                                strokeWidth={1.5}
                                dot={false}
                                strokeDasharray="4 4"
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>

            {chartData.length > 0 && (
                <div className="stats-cards" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="stat-card">
                        <div className="stat-label">데이터 포인트</div>
                        <div className="stat-value">{chartData.length}</div>
                        <div className="stat-sub">개월</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">총 거래건수</div>
                        <div className="stat-value">{chartData.reduce((s, d) => s + d.count, 0)}</div>
                        <div className="stat-sub">건</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">최근 평균</div>
                        <div className="stat-value price" style={{ fontSize: 16 }}>
                            {formatPrice(chartData[chartData.length - 1]?.avgPrice || 0)}
                        </div>
                        <div className="stat-sub">원</div>
                    </div>
                </div>
            )}
        </div>
    );
}
