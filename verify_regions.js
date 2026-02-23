import { REGIONS, DISTRICTS } from './src/utils/regions.js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const apiKey = process.env.KAKAO_REST_API_KEY;

if (!apiKey) {
    console.error('KAKAO_REST_API_KEY is not set');
    process.exit(1);
}

async function verifyRegions() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    let hasError = false;
    let checked = 0;

    const delay = ms => new Promise(res => setTimeout(res, ms));

    for (const regionId of Object.keys(DISTRICTS)) {
        const province = REGIONS.find(r => r.code === regionId)?.name || '';
        const districts = DISTRICTS[regionId];

        for (const dist of districts) {
            let query = `${province} ${dist.name}`;

            if (regionId === '36') query = '세종특별자치시';

            try {
                const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
                    params: { query },
                    headers: { 'Authorization': `KakaoAK ${apiKey}` }
                });

                const docs = response.data.documents;
                if (docs && docs.length > 0) {
                    const doc = docs[0];
                    const b_code = doc.address ? doc.address.b_code : (doc.road_address ? doc.road_address.b_code : '');

                    if (b_code) {
                        const verifiedCode = b_code.substring(0, 5);

                        if (verifiedCode !== dist.code) {
                            log(`[MISMATCH] ${query}: Expected ${dist.code}, but got ${verifiedCode} (Full b_code: ${b_code})`);
                            hasError = true;
                        }
                    } else {
                        log(`[WARN] No b_code found for ${query}`);
                    }
                } else {
                    log(`[WARN] No results found for ${query}`);
                }
            } catch (err) {
                log(`[ERROR] querying ${query}: ${err.message}`);
            }

            checked++;
            if (checked % 10 === 0) {
                await delay(200);
            }
        }
    }

    if (!hasError) {
        log('All region codes successfully verified!');
    } else {
        log('Verification finished with mismatches.');
    }

    fs.writeFileSync('verification_results.txt', output, 'utf8');
}

verifyRegions();
