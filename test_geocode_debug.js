
import axios from 'axios';

const queries = [
    '서울특별시 종로구 명륜2가 23',
    '종로구 명륜2가 23',
    '명륜2가 23',
    '서울특별시 종로구 명륜2가',
    '종로구 명륜2가',
    '서울시청' // This is expected to fail on address search
];

async function testVariations() {
    for (const q of queries) {
        try {
            console.log(`Testing: "${q}"`);
            const response = await axios.get('http://localhost:3001/api/geocode', {
                params: { query: q }
            });
            const count = response.data.addresses ? response.data.addresses.length : 0;
            console.log(`Result: ${count} addresses found.`);
        } catch (e) {
            console.error(`Error for "${q}":`, e.message);
        }
    }
}

testVariations();
