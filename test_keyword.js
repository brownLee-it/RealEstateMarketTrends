
import axios from 'axios';

const apiKey = 'a9898d8e77891f18eaa3bc1a2cd4f70b'; // REST API Key

const queries = [
    '서울특별시 종로구 명륜2가 23',
    '서울시청'
];

async function testKeyword() {
    for (const q of queries) {
        try {
            console.log(`Testing Keyword Search: "${q}"`);
            const response = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
                params: { query: q },
                headers: { 'Authorization': `KakaoAK ${apiKey}` }
            });
            const count = response.data.documents ? response.data.documents.length : 0;
            console.log(`Result: ${count} documents found.`);
            if (count > 0) {
                console.log('First result:', JSON.stringify(response.data.documents[0], null, 2));
            }
        } catch (e) {
            console.error(`Error for "${q}":`, e.message);
        }
    }
}

testKeyword();
