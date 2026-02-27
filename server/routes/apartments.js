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
            console.error('DATA_GO_KR_API_KEY is missing in process.env');
            return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });
        }
        console.log(`Requesting data for region: ${regionCode}, yearMonth: ${yearMonth}`);
        const serviceKey = process.env.DATA_GO_KR_API_KEY;
        // console.log('Service Key:', serviceKey); // Be careful logging keys

        const url = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

        console.log('Calling axios...');
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
        console.log('Axios response received. Status:', response.status);

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
            aptDong: String(item['동'] || '').trim(),
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
                aptDong: apt.aptDong,
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
                                        area: parseFloat(item['전용면적'] || item.excluUseAr || 0),
                                        floor: parseInt(item['층'] || item.floor || 0, 10),
                                        dealYear: parseInt(item['년'] || item.dealYear || 0, 10),
                                        dealMonth: parseInt(item['월'] || item.dealMonth || 0, 10),
                                        dealDay: parseInt(item['일'] || item.dealDay || 0, 10),
                                        aptDong: String(item['동'] || '').trim(),
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

// GET /api/apartments/search?regionCode=11680&keyword=래미안&months=6
router.get('/search', async (req, res) => {
    try {
        const { regionCode, keyword, months = 6 } = req.query;
        if (!regionCode || !keyword) {
            return res.status(400).json({ error: 'regionCode와 keyword 파라미터가 필요합니다.' });
        }

        const now = new Date();
        const monthCount = Math.min(parseInt(months, 10), 12); // Limit to 12 months for performance
        const allApartments = [];

        const fetchPromises = [];
        for (let i = 0; i < monthCount; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;

            const cacheKey = getCacheKey(regionCode, ym);
            const cached = cache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                // If we have cached data for this month, filter by keyword
                const matching = cached.data.apartments.filter(
                    (a) => a.aptName.includes(keyword)
                );
                allApartments.push(...matching);
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
                            if (!body || !body.items) return null;
                            let items = body.items.item;
                            if (!items) return null;
                            if (!Array.isArray(items)) items = [items];

                            // Map and filter items for this month
                            const monthApartments = items.map((item) => ({
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
                                aptDong: String(item['동'] || '').trim(),
                            })).filter(apt => apt.aptName.includes(keyword));

                            return { ym, items: monthApartments };
                        })
                        .catch((e) => {
                            console.error(`Failed to fetch for ${ym}:`, e.message);
                            return null;
                        })
                );
            }
        }

        const results = await Promise.all(fetchPromises);

        // Process new fetched data
        results.forEach(result => {
            if (result && result.items) {
                // Group raw items from this month into apartment objects
                const groupedForMonth = new Map();
                result.items.forEach(apt => {
                    const key = `${apt.aptName}_${apt.dong}_${apt.jibun}`;
                    if (!groupedForMonth.has(key)) {
                        groupedForMonth.set(key, {
                            aptName: apt.aptName,
                            dong: apt.dong,
                            jibun: apt.jibun,
                            buildYear: apt.buildYear,
                            regionCode: apt.regionCode,
                            transactions: [],
                        });
                    }
                    groupedForMonth.get(key).transactions.push({
                        price: parseInt(apt.price, 10),
                        area: apt.area,
                        floor: apt.floor,
                        dealYear: apt.dealYear,
                        dealMonth: apt.dealMonth,
                        dealDay: apt.dealDay,
                        aptDong: apt.aptDong,
                    });
                });
                allApartments.push(...Array.from(groupedForMonth.values()));
            }
        });

        // Now we have a list of apartment objects from all months (cached + freshly fetched)
        // Need to merge apartments with the same key across different months
        const finalGroupedMap = new Map();
        allApartments.forEach(apt => {
            const key = `${apt.aptName}_${apt.dong}_${apt.jibun}`;
            if (!finalGroupedMap.has(key)) {
                // Clone the object to avoid mutating cached data
                finalGroupedMap.set(key, {
                    ...apt,
                    transactions: [...apt.transactions]
                });
            } else {
                // Merge transactions
                const existing = finalGroupedMap.get(key);
                existing.transactions.push(...apt.transactions);
            }
        });

        const mergedApartments = Array.from(finalGroupedMap.values());

        // Sort transactions within each apartment
        mergedApartments.forEach(apt => {
            apt.transactions.sort((a, b) => {
                const dateA = a.dealYear * 10000 + a.dealMonth * 100 + a.dealDay;
                const dateB = b.dealYear * 10000 + b.dealMonth * 100 + b.dealDay;
                return dateB - dateA; // Descending (newest first)
            });
        });

        res.json({
            apartments: mergedApartments,
            totalCount: mergedApartments.length,
            regionCode,
            keyword,
            monthsChecked: monthCount
        });
    } catch (error) {
        console.error('아파트 키워드 검색 오류:', error.message);
        res.status(500).json({ error: '데이터를 검색하는 중 오류가 발생했습니다.' });
    }
});

export default router;
