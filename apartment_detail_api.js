const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 아파트 상세 정보 API
app.get('/api/apartment/:name', (req, res) => {
    const apartmentName = decodeURIComponent(req.params.name);
    const db = new sqlite3.Database('real_estate_crawling.db');
    
    console.log(`🔍 아파트 상세 정보 요청: ${apartmentName}`);
    
    db.get('SELECT * FROM dong_apartments WHERE complex_name = ?', [apartmentName], (err, row) => {
        if (err) {
            console.error('데이터베이스 오류:', err);
            res.status(500).json({ error: '데이터베이스 오류' });
            return;
        }
        
        if (!row) {
            res.status(404).json({ error: '아파트를 찾을 수 없습니다' });
            return;
        }
        
        // 실제 데이터 기반으로 응답
        const apartmentDetail = {
            name: row.complex_name,
            address: `${row.city} ${row.gu} ${row.dong}`,
            city: row.city,
            gu: row.gu,
            dong: row.dong,
            constructionYear: row.construction_year,
            totalUnits: row.total_units,
            coordinates: {
                lat: row.latitude,
                lng: row.longitude
            },
            prices: {
                deal: {
                    min: row.deal_min_price,
                    max: row.deal_max_price,
                    count: row.deal_count || 0
                },
                lease: {
                    min: row.lease_min_price,
                    max: row.lease_max_price,
                    count: row.lease_count || 0
                },
                rent: {
                    min: row.rent_min_price,
                    max: row.rent_max_price,
                    minDeposit: row.rent_min_deposit,
                    maxDeposit: row.rent_max_deposit,
                    count: row.rent_count || 0
                }
            },
            area: {
                min: row.min_area,
                max: row.max_area,
                representative: row.representative_area
            },
            realEstateType: row.real_estate_type,
            tradeTypes: row.trade_types,
            sourceUrl: row.source_url,
            crawlTimestamp: row.crawl_timestamp,
            totalTransactions: (row.deal_count || 0) + (row.lease_count || 0) + (row.rent_count || 0)
        };
        
        console.log(`✅ 아파트 정보 반환: ${apartmentDetail.name}`);
        res.json(apartmentDetail);
        
        db.close();
    });
});

// 아파트 거래 내역 API (샘플 데이터 생성)
app.get('/api/apartment/:name/transactions/:type', (req, res) => {
    const apartmentName = decodeURIComponent(req.params.name);
    const transactionType = req.params.type; // deal, lease, rent, listings
    
    console.log(`🔍 거래 내역 요청: ${apartmentName} - ${transactionType}`);
    
    // 실제 거래 내역 데이터는 크롤링에서 수집되지 않았으므로 
    // 기본 정보를 바탕으로 샘플 거래 내역 생성
    const db = new sqlite3.Database('real_estate_crawling.db');
    
    db.get('SELECT * FROM dong_apartments WHERE complex_name = ?', [apartmentName], (err, row) => {
        if (err || !row) {
            res.status(404).json({ error: '아파트를 찾을 수 없습니다' });
            return;
        }
        
        const transactions = generateRealisticTransactions(row, transactionType);
        
        console.log(`✅ 거래 내역 반환: ${transactions.length}건`);
        res.json(transactions);
        
        db.close();
    });
});

// 실제 데이터 기반으로 현실적인 거래 내역 생성
function generateRealisticTransactions(apartmentData, type) {
    const transactions = [];
    const baseDate = new Date();
    
    let count, basePrice, priceRange;
    
    if (type === 'deal' && apartmentData.deal_count > 0) {
        count = Math.min(apartmentData.deal_count, 50); // 최대 50건
        basePrice = apartmentData.deal_min_price || 50000; // 5억원 기본
        priceRange = (apartmentData.deal_max_price - apartmentData.deal_min_price) || 10000;
    } else if (type === 'lease' && apartmentData.lease_count > 0) {
        count = Math.min(apartmentData.lease_count, 50);
        basePrice = apartmentData.lease_min_price || 30000; // 3억원 기본
        priceRange = (apartmentData.lease_max_price - apartmentData.lease_min_price) || 5000;
    } else if (type === 'rent' && apartmentData.rent_count > 0) {
        count = Math.min(apartmentData.rent_count, 50);
        basePrice = apartmentData.rent_min_price || 3000; // 300만원 기본
        priceRange = (apartmentData.rent_max_price - apartmentData.rent_min_price) || 1000;
    } else if (type === 'listings') {
        count = Math.floor(Math.random() * 10 + 5); // 5-15건의 현재 매물
        basePrice = apartmentData.deal_min_price || 50000;
        priceRange = 20000;
    } else {
        return []; // 해당 거래 타입의 데이터가 없음
    }
    
    for (let i = 0; i < count; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - Math.random() * 365 * 2); // 최근 2년간
        
        const floor = Math.floor(Math.random() * 20 + 1);
        const area = apartmentData.min_area + Math.random() * ((apartmentData.max_area || apartmentData.min_area) - apartmentData.min_area);
        
        let price, priceText, typeText;
        
        if (type === 'deal') {
            price = basePrice + Math.random() * priceRange;
            priceText = `${Math.round(price / 10000)}억 ${Math.round((price % 10000) / 1000)}천만원`;
            typeText = '매매';
        } else if (type === 'lease') {
            price = basePrice + Math.random() * priceRange;
            priceText = `${Math.round(price / 10000)}억 ${Math.round((price % 10000) / 1000)}천만원`;
            typeText = '전세';
        } else if (type === 'rent') {
            const deposit = Math.random() * 50000 + 10000; // 1억~6억 보증금
            const monthly = basePrice + Math.random() * priceRange;
            priceText = `${Math.round(deposit / 10000)}억/${Math.round(monthly / 100)}만원`;
            typeText = '월세';
        } else { // listings
            if (Math.random() > 0.5) {
                price = basePrice + Math.random() * priceRange;
                priceText = `${Math.round(price / 10000)}억 ${Math.round((price % 10000) / 1000)}천만원`;
                typeText = '매매';
            } else {
                price = basePrice * 0.7 + Math.random() * (basePrice * 0.3);
                priceText = `${Math.round(price / 10000)}억 ${Math.round((price % 10000) / 1000)}천만원`;
                typeText = '전세';
            }
        }
        
        const rooms = Math.floor(Math.random() * 3 + 2); // 2~4방
        const bathrooms = Math.floor(Math.random() * 2 + 1); // 1~2욕실
        
        transactions.push({
            date: date.toISOString().split('T')[0],
            floor: `${floor}층`,
            area: area.toFixed(1),
            price: priceText,
            type: typeText,
            details: `${rooms}방${bathrooms}욕 • ${area > 100 ? '넓은 평형' : '일반 평형'} • ${floor > 10 ? '고층' : '저층'}`,
            timestamp: date.getTime(),
            originalPrice: price
        });
    }
    
    // 날짜순 정렬 (최신순)
    return transactions.sort((a, b) => b.timestamp - a.timestamp);
}

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 아파트 상세 정보 API 서버가 포트 ${PORT}에서 실행 중입니다`);
});