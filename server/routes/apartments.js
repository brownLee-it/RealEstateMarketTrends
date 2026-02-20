import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const router = express.Router();

// In-memory cache
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(regionCode, yearMonth) {
    return `${regionCode}_${yearMonth}`;
}

// GET /api/apartments?regionCode=11680&yearMonth=202601
router.get('/', async (req, res) => {
    try {
        const { regionCode, yearMonth } = req.query;
        if (!regionCode || !yearMonth) {
            return res.status(400).json({ error: 'regionCode와 yearMonth 파라미터가 필요합니다.' });
        }

        const cacheKey = getCacheKey(regionCode, yearMonth);
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return res.json(cached.data);
        }

        if (!process.env.DATA_GO_KR_API_KEY) {
            console.error('DATA_GO_KR_API_KEY is missing');
            return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });
        }
        const serviceKey = process.env.DATA_GO_KR_API_KEY;
        const url = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

        const response = await axios.get(url, {
            params: {
                serviceKey,
                LAWD_CD: regionCode,
                DEAL_YMD: yearMonth,
                pageNo: 1,
                numOfRows: 1000,
            },
            timeout: 45000,
            responseType: 'text',
        });

        const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        let body;
        if (rawData.trim().startsWith('<')) {
            const parsed = await parseStringPromise(rawData, {
                explicitArray: false,
                trim: true,
            });
            body = parsed?.response?.body;
        } else {
            try {
                const jsonData = typeof response.data === 'string' ? JSON.parse(rawData) : response.data;
                body = jsonData?.response?.body;
            } catch (e) {
                console.error('API 응답 파싱 실패:', rawData.substring(0, 200));
                return res.status(502).json({ error: 'API 응답 파싱 오류' });
            }
        }
        if (!body || !body.items) {
            return res.json({ apartments: [], totalCount: 0 });
        }

        let items = body.items.item;
        if (!items) {
            return res.json({ apartments: [], totalCount: 0 });
        }
        if (!Array.isArray(items)) {
            items = [items];
        }

        const apartments = items.map((item) => ({
            aptName: String(item['아파트'] || item.aptNm || '').trim(),
            price: String(item['거래금액'] || item.dealAmount || '').trim().replace(/,/g, ''),
            area: parseFloat(item['전용면적'] || item.excluUseAr || 0),
            floor: parseInt(item['층'] || item.floor || 0, 10),
            buildYear: parseInt(item['건축년도'] || item.buildYear || 0, 10),
            dealYear: parseInt(item['년'] || item.dealYear || 0, 10),
            dealMonth: parseInt(item['월'] || item.dealMonth || 0, 10),
            dealDay: parseInt(item['일'] || item.dealDay || 0, 10),
            dong: String(item['법정동'] || item.umdNm || '').trim(),
            jibun: String(item['지번'] || item.jibun || '').trim(),
            regionCode: String(item['지역코드'] || item.dealingGbn || regionCode).trim(),
            serialNumber: String(item['일련번호'] || '').trim(),
        }));

        // Group by apartment name for aggregation
        const groupedMap = new Map();
        apartments.forEach((apt) => {
            const key = `${apt.aptName}_${apt.dong}_${apt.jibun}`;
            if (!groupedMap.has(key)) {
                groupedMap.set(key, {
                    aptName: apt.aptName,
                    dong: apt.dong,
                    jibun: apt.jibun,
                    buildYear: apt.buildYear,
                    regionCode: apt.regionCode,
                    transactions: [],
                });
            }
            groupedMap.get(key).transactions.push({
                price: parseInt(apt.price, 10),
                area: apt.area,
                floor: apt.floor,
                dealYear: apt.dealYear,
                dealMonth: apt.dealMonth,
                dealDay: apt.dealDay,
            });
        });

        const result = {
            apartments: Array.from(groupedMap.values()),
            totalCount: apartments.length,
            regionCode,
            yearMonth,
        };

        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        res.json(result);
    } catch (error) {
        console.error('아파트 실거래가 API 호출 오류:', error.message);
        if (error.response) {
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
        }
        res.status(500).json({
            error: '데이터를 불러오는 중 오류가 발생했습니다.',
            detail: error.message,
            upstreamError: error.response?.data
        });
    }
});

// GET /api/apartments/history?regionCode=11680&aptName=래미안&months=36
router.get('/history', async (req, res) => {
    try {
        const { regionCode, aptName, months = 12 } = req.query;
        if (!regionCode || !aptName) {
            return res.status(400).json({ error: 'regionCode와 aptName이 필요합니다.' });
        }

        const now = new Date();
        const monthCount = Math.min(parseInt(months, 10), 60);
        const allTransactions = [];

        const fetchPromises = [];
        for (let i = 0; i < monthCount; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;

            const cacheKey = getCacheKey(regionCode, ym);
            const cached = cache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                const matching = cached.data.apartments.filter(
                    (a) => a.aptName.includes(aptName)
                );
                matching.forEach((m) => {
                    m.transactions.forEach((t) => allTransactions.push(t));
                });
            } else {
                fetchPromises.push(
                    axios
                        .get('https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade', {
                            params: {
                                serviceKey: process.env.DATA_GO_KR_API_KEY,
                                LAWD_CD: regionCode,
                                DEAL_YMD: ym,
                                pageNo: 1,
                                numOfRows: 1000,
                            },
                            timeout: 45000,
                        })
                        .then(async (response) => {
                            const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                            let body;
                            if (rawData.trim().startsWith('<')) {
                                const parsed = await parseStringPromise(rawData, {
                                    explicitArray: false,
                                    trim: true,
                                });
                                body = parsed?.response?.body;
                            } else {
                                const jsonData = typeof response.data === 'string' ? JSON.parse(rawData) : response.data;
                                body = jsonData?.response?.body;
                            }
                            if (!body || !body.items) return;
                            let items = body.items.item;
                            if (!items) return;
                            if (!Array.isArray(items)) items = [items];
                            items.forEach((item) => {
                                const name = String(item['아파트'] || item.aptNm || '').trim();
                                if (name.includes(aptName)) {
                                    allTransactions.push({
                                        price: parseInt(String(item['거래금액'] || item.dealAmount || '0').trim().replace(/,/g, ''), 10),
                                        area: parseFloat(item['전용면적'] || 0),
                                        floor: parseInt(item['층'] || 0, 10),
                                        dealYear: parseInt(item['년'] || 0, 10),
                                        dealMonth: parseInt(item['월'] || 0, 10),
                                        dealDay: parseInt(item['일'] || 0, 10),
                                    });
                                }
                            });
                        })
                        .catch(() => { })
                );
            }
        }

        await Promise.all(fetchPromises);

        allTransactions.sort((a, b) => {
            const dateA = a.dealYear * 10000 + a.dealMonth * 100 + a.dealDay;
            const dateB = b.dealYear * 10000 + b.dealMonth * 100 + b.dealDay;
            return dateA - dateB;
        });

        res.json({
            aptName,
            regionCode,
            transactions: allTransactions,
            totalCount: allTransactions.length,
        });
    } catch (error) {
        console.error('아파트 이력 조회 오류:', error.message);
        res.status(500).json({ error: '이력 데이터를 불러오는 중 오류가 발생했습니다.' });
    }
});

export default router;
