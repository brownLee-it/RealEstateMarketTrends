const express = require('express');
const axios = require('axios');
const router = express.Router();

// GET /api/geocode?query=서울시 강남구 역삼동 123
router.get('/', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
        }

        const response = await axios.get('https://maps.apigw.ntruss.com/map-geocode/v2/geocode', {
            params: { query },
            headers: {
                'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_MAPS_CLIENT_ID,
                'X-NCP-APIGW-API-KEY': process.env.NAVER_MAPS_CLIENT_SECRET,
            },
            timeout: 10000,
        });

        res.json(response.data);
    } catch (error) {
        console.error('Geocoding API 호출 오류:', error.message);
        res.status(500).json({ error: 'Geocoding 실패', detail: error.message });
    }
});

module.exports = router;
