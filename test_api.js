
import axios from 'axios';

const serviceKey = 'd4229880284eab4692bd775d65106a774d1f28dd4c37d8d313c44a092ff23516';
const url = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

async function test() {
    try {
        console.log('Testing API with key:', serviceKey);
        const response = await axios.get(url, {
            params: {
                serviceKey,
                LAWD_CD: '11110',
                DEAL_YMD: '202602',
                pageNo: 1,
                numOfRows: 10,
            },
            timeout: 10000,
            responseType: 'text' // Important for XML
        });
        console.log('Status:', response.status);
        console.log('Data substring:', response.data.substring(0, 200));
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

test();
