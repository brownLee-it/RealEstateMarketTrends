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

        // ... (axios call) ...
        const response = await axios.get(url, {
            params: {
                serviceKey,
                LAWD_CD: regionCode,
                DEAL_YMD: yearMonth,
                pageNo: 1,
                numOfRows: 1000,
            },
            timeout: 15000,
            responseType: 'text', // Force text to handle both XML and JSON manually
        });

        // ...

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

        // Fetch data for each month
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
                            timeout: 15000,
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
