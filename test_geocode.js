
import axios from 'axios';

async function testGeocode() {
    const address = '서울'; // Known working address via curl
    try {
        console.log(`Testing geocode for: ${address}`);
        const response = await axios.get('http://localhost:3001/api/geocode', {
            params: { query: address }
        });
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response:', e.response.data);
        }
    }
}

testGeocode();
