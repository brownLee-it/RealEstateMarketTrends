import express from 'express';
import axios from 'axios';

const router = express.Router();

// GET /api/geocode?query=서울시 강남구 역삼동 123&type=address
router.get('/', async (req, res) => {
    try {
        const { query, type = 'address' } = req.query;
        console.log(`Geocoding request for query: '${query}', type: '${type}'`);

        const apiKey = process.env.KAKAO_REST_API_KEY;
        if (!apiKey) {
            console.error('KAKAO_REST_API_KEY is missing');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        if (!query) {
            return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
        }

        const url = type === 'keyword'
            ? 'https://dapi.kakao.com/v2/local/search/keyword.json'
            : 'https://dapi.kakao.com/v2/local/search/address.json';

        const response = await axios.get(url, {
            params: { query },
            headers: {
                'Authorization': `KakaoAK ${apiKey}`,
            },
            timeout: 20000,
        });

        // Transform Kakao response to match existing frontend format
        const kakaoDocuments = response.data.documents || [];

        const addresses = kakaoDocuments.map(doc => ({
            x: doc.x,  // longitude
            y: doc.y,  // latitude
            roadAddress: doc.road_address ? doc.road_address.address_name : (doc.road_address_name || ''),
            jibunAddress: doc.address ? doc.address.address_name : (doc.address_name || ''),
            placeName: doc.place_name || ''
        }));

        res.json({ addresses });
    } catch (error) {
        console.error('Geocoding API 호출 오류:', error.message);
        if (error.response) {
            console.error('Kakao API Status:', error.response.status);
            console.error('Kakao API Data:', JSON.stringify(error.response.data));
        }
        res.status(500).json({ error: 'Geocoding 실패', detail: error.message });
    }
});

export default router;
