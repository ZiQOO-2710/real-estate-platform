const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 전체 통계 대시보드
router.get('/', async (req, res) => {
  try {
    // 네이버 데이터 통계
    const [naverComplexes, naverListings, naverStats] = await Promise.all([
      db.queryNaver('SELECT COUNT(DISTINCT complex_id) as count FROM apartment_complexes'),
      db.queryNaver('SELECT COUNT(*) as count FROM current_listings'),
      db.queryNaver(`
        SELECT 
          COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
          COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count,
          COUNT(CASE WHEN deal_type = '월세' THEN 1 END) as rent_count,
          AVG(price_amount) as avg_price
        FROM current_listings
      `)
    ]);

    // 국토부 데이터 통계
    const [molitTransactions, molitRegions, molitStats] = await Promise.all([
      db.queryMolit('SELECT COUNT(*) as count FROM apartment_transactions'),
      db.queryMolit('SELECT COUNT(DISTINCT region_name) as count FROM apartment_transactions'),
      db.queryMolit(`
        SELECT 
          COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
          COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count,
          COUNT(CASE WHEN deal_type = '월세' THEN 1 END) as rent_count,
          COUNT(DISTINCT apartment_name) as unique_apartments
        FROM apartment_transactions
      `)
    ]);

    // 최근 업데이트 정보
    const [lastNaverUpdate, lastMolitUpdate] = await Promise.all([
      db.queryNaver('SELECT MAX(crawled_at) as last_update FROM current_listings'),
      db.queryMolit('SELECT MAX(crawled_at) as last_update FROM apartment_transactions')
    ]);

    res.json({
      overview: {
        naver_data: {
          total_complexes: naverComplexes[0].count,
          total_listings: naverListings[0].count,
          sale_listings: naverStats[0].sale_count,
          lease_listings: naverStats[0].lease_count,
          rent_listings: naverStats[0].rent_count,
          avg_price: naverStats[0].avg_price,
          last_update: lastNaverUpdate[0].last_update
        },
        molit_data: {
          total_transactions: molitTransactions[0].count,
          total_regions: molitRegions[0].count,
          total_apartments: molitStats[0].unique_apartments,
          sale_transactions: molitStats[0].sale_count,
          lease_transactions: molitStats[0].lease_count,
          rent_transactions: molitStats[0].rent_count,
          last_update: lastMolitUpdate[0].last_update
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

// 지역별 통계
router.get('/regions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // 네이버 데이터 지역별 통계
    const naverRegionStats = await db.queryNaver(`
      SELECT 
        SUBSTR(ac.address, 1, INSTR(ac.address || ' ', ' ') - 1) as region,
        COUNT(DISTINCT ac.complex_id) as complex_count,
        COUNT(cl.id) as listing_count,
        AVG(cl.price_amount) as avg_price
      FROM apartment_complexes ac
      LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
      WHERE ac.address IS NOT NULL AND ac.address != ''
      GROUP BY region
      ORDER BY complex_count DESC
      LIMIT ?
    `, [parseInt(limit)]);

    // 국토부 데이터 지역별 통계
    const molitRegionStats = await db.queryMolit(`
      SELECT 
        region_name,
        COUNT(*) as transaction_count,
        COUNT(DISTINCT apartment_name) as apartment_count,
        COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
        COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count
      FROM apartment_transactions
      GROUP BY region_name
      ORDER BY transaction_count DESC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({
      naver_regions: naverRegionStats,
      molit_regions: molitRegionStats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch region statistics',
      message: error.message
    });
  }
});

// 월별 트렌드 분석
router.get('/trends', async (req, res) => {
  try {
    const { months = 12 } = req.query;

    // 국토부 데이터 월별 거래량
    const monthlyTransactions = await db.queryMolit(`
      SELECT 
        deal_year,
        deal_month,
        COUNT(*) as transaction_count,
        COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
        COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count
      FROM apartment_transactions
      GROUP BY deal_year, deal_month
      ORDER BY deal_year DESC, deal_month DESC
      LIMIT ?
    `, [parseInt(months)]);

    // 네이버 데이터 매물 추가 트렌드
    const listingTrends = await db.queryNaver(`
      SELECT 
        DATE(crawled_at) as date,
        COUNT(*) as listings_added
      FROM current_listings
      WHERE crawled_at >= datetime('now', '-30 days')
      GROUP BY DATE(crawled_at)
      ORDER BY date DESC
    `);

    res.json({
      monthly_transactions: monthlyTransactions,
      daily_listings: listingTrends
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch trend analysis',
      message: error.message
    });
  }
});

// 가격 분석
router.get('/price-analysis', async (req, res) => {
  try {
    const { region = '', deal_type = '매매' } = req.query;

    let whereClause = `WHERE deal_type = ? AND deal_amount IS NOT NULL AND deal_amount != ''`;
    let params = [deal_type];

    if (region) {
      whereClause += ' AND region_name LIKE ?';
      params.push(`%${region}%`);
    }

    // 국토부 데이터 가격 분석
    const priceAnalysis = await db.queryMolit(`
      SELECT 
        region_name,
        COUNT(*) as transaction_count,
        AVG(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as avg_price,
        MIN(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as min_price,
        MAX(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as max_price
      FROM apartment_transactions
      ${whereClause}
      GROUP BY region_name
      ORDER BY avg_price DESC
      LIMIT 20
    `, params);

    // 면적별 가격 분석
    const areaAnalysis = await db.queryMolit(`
      SELECT 
        CASE 
          WHEN CAST(area AS REAL) < 60 THEN '소형 (60㎡ 미만)'
          WHEN CAST(area AS REAL) < 85 THEN '중형 (60-85㎡)'
          WHEN CAST(area AS REAL) < 135 THEN '대형 (85-135㎡)'
          ELSE '초대형 (135㎡ 이상)'
        END as area_category,
        COUNT(*) as transaction_count,
        AVG(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as avg_price
      FROM apartment_transactions
      ${whereClause} AND area IS NOT NULL AND area != ''
      GROUP BY area_category
      ORDER BY avg_price DESC
    `, params);

    res.json({
      regional_price_analysis: priceAnalysis,
      area_price_analysis: areaAnalysis,
      filters: {
        region,
        deal_type
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch price analysis',
      message: error.message
    });
  }
});

// 인기 아파트 분석
router.get('/popular-apartments', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // 거래량 기준 인기 아파트
    const popularByTransactions = await db.queryMolit(`
      SELECT 
        apartment_name,
        region_name,
        COUNT(*) as transaction_count,
        AVG(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as avg_price,
        MAX(deal_year) as latest_year
      FROM apartment_transactions
      WHERE deal_amount IS NOT NULL AND deal_amount != ''
      GROUP BY apartment_name, region_name
      ORDER BY transaction_count DESC
      LIMIT ?
    `, [parseInt(limit)]);

    // 매물 등록 기준 인기 아파트
    const popularByListings = await db.queryNaver(`
      SELECT 
        ac.complex_name,
        ac.address,
        COUNT(cl.id) as listing_count,
        AVG(cl.price_amount) as avg_price
      FROM apartment_complexes ac
      JOIN current_listings cl ON ac.complex_id = cl.complex_id
      WHERE ac.address IS NOT NULL
      GROUP BY ac.complex_name, ac.address
      ORDER BY listing_count DESC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({
      popular_by_transactions: popularByTransactions,
      popular_by_listings: popularByListings
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch popular apartments',
      message: error.message
    });
  }
});

module.exports = router;