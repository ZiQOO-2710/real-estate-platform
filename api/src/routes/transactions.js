const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 거래 내역 조회
router.get('/', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      region = '',
      apartment_name = '',
      deal_type = '',
      year = '',
      month = ''
    } = req.query;

    let whereClause = '';
    let params = [];

    // 필터 조건 구성
    const conditions = [];
    
    if (region) {
      conditions.push('region_name LIKE ?');
      params.push(`%${region}%`);
    }
    
    if (apartment_name) {
      conditions.push('apartment_name LIKE ?');
      params.push(`%${apartment_name}%`);
    }
    
    if (deal_type) {
      conditions.push('deal_type = ?');
      params.push(deal_type);
    }
    
    if (year) {
      conditions.push('deal_year = ?');
      params.push(year);
    }
    
    if (month) {
      conditions.push('deal_month = ?');
      params.push(month);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const sql = `
      SELECT 
        id,
        region_name,
        apartment_name,
        deal_type,
        deal_year,
        deal_month,
        deal_day,
        deal_amount,
        area,
        floor,
        construction_year,
        road_name,
        legal_dong,
        monthly_rent,
        deposit,
        crawled_at
      FROM apartment_transactions
      ${whereClause}
      ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const transactions = await db.queryMolit(sql, params);
    
    // 총 개수 조회
    const countSql = `SELECT COUNT(*) as total FROM apartment_transactions ${whereClause}`;
    const countParams = params.slice(0, -2); // limit, offset 제거
    const totalResult = await db.queryMolit(countSql, countParams);
    
    res.json({
      data: transactions,
      pagination: {
        total: totalResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: totalResult[0].total > parseInt(offset) + parseInt(limit)
      },
      filters: {
        region,
        apartment_name,
        deal_type,
        year,
        month
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch transactions',
      message: error.message
    });
  }
});

// 거래 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await db.getMolitRow(
      'SELECT * FROM apartment_transactions WHERE id = ?',
      [id]
    );

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: `Transaction with id ${id} does not exist`
      });
    }

    // 같은 아파트의 최근 거래 내역
    const similarTransactions = await db.queryMolit(`
      SELECT * FROM apartment_transactions 
      WHERE apartment_name = ? AND id != ?
      ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
      LIMIT 10
    `, [transaction.apartment_name, id]);

    res.json({
      transaction,
      similar_transactions: similarTransactions
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch transaction details',
      message: error.message
    });
  }
});

// 거래 통계
router.get('/stats/summary', async (req, res) => {
  try {
    const { region = '', year = '' } = req.query;

    let whereClause = '';
    let params = [];

    if (region) {
      whereClause += ' WHERE region_name LIKE ?';
      params.push(`%${region}%`);
    }

    if (year) {
      whereClause += whereClause ? ' AND ' : ' WHERE ';
      whereClause += ' deal_year = ?';
      params.push(year);
    }

    const stats = await db.queryMolit(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
        COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count,
        COUNT(CASE WHEN deal_type = '월세' THEN 1 END) as rent_count,
        COUNT(DISTINCT apartment_name) as unique_apartments,
        COUNT(DISTINCT region_name) as unique_regions
      FROM apartment_transactions
      ${whereClause}
    `, params);

    // 지역별 거래량
    const regionStats = await db.queryMolit(`
      SELECT 
        region_name,
        COUNT(*) as transaction_count,
        COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
        COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count
      FROM apartment_transactions
      ${whereClause}
      GROUP BY region_name
      ORDER BY transaction_count DESC
      LIMIT 10
    `, params);

    // 월별 거래량 (최근 12개월)
    const monthlyStats = await db.queryMolit(`
      SELECT 
        deal_year,
        deal_month,
        COUNT(*) as transaction_count
      FROM apartment_transactions
      ${whereClause}
      GROUP BY deal_year, deal_month
      ORDER BY deal_year DESC, deal_month DESC
      LIMIT 12
    `, params);

    res.json({
      summary: stats[0],
      region_distribution: regionStats,
      monthly_trend: monthlyStats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch transaction stats',
      message: error.message
    });
  }
});

// 가격 분석
router.get('/stats/price-analysis', async (req, res) => {
  try {
    const { region = '', apartment_name = '', deal_type = '매매' } = req.query;

    let whereClause = `WHERE deal_type = ? AND deal_amount IS NOT NULL AND deal_amount != ''`;
    let params = [deal_type];

    if (region) {
      whereClause += ' AND region_name LIKE ?';
      params.push(`%${region}%`);
    }

    if (apartment_name) {
      whereClause += ' AND apartment_name LIKE ?';
      params.push(`%${apartment_name}%`);
    }

    const priceStats = await db.queryMolit(`
      SELECT 
        COUNT(*) as total_deals,
        AVG(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as avg_price,
        MIN(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as min_price,
        MAX(CAST(REPLACE(deal_amount, ',', '') AS REAL)) as max_price,
        (SELECT CAST(REPLACE(deal_amount, ',', '') AS REAL) 
         FROM apartment_transactions 
         ${whereClause}
         ORDER BY CAST(REPLACE(deal_amount, ',', '') AS REAL) 
         LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM apartment_transactions ${whereClause})) as median_price
      FROM apartment_transactions
      ${whereClause}
    `, [...params, ...params]);

    // 가격대별 분포
    const priceDistribution = await db.queryMolit(`
      SELECT 
        CASE 
          WHEN CAST(REPLACE(deal_amount, ',', '') AS REAL) < 50000 THEN '5억 미만'
          WHEN CAST(REPLACE(deal_amount, ',', '') AS REAL) < 100000 THEN '5억-10억'
          WHEN CAST(REPLACE(deal_amount, ',', '') AS REAL) < 150000 THEN '10억-15억'
          WHEN CAST(REPLACE(deal_amount, ',', '') AS REAL) < 200000 THEN '15억-20억'
          ELSE '20억 이상'
        END as price_range,
        COUNT(*) as count
      FROM apartment_transactions
      ${whereClause}
      GROUP BY price_range
      ORDER BY MIN(CAST(REPLACE(deal_amount, ',', '') AS REAL))
    `, params);

    res.json({
      price_statistics: priceStats[0],
      price_distribution: priceDistribution,
      filters: {
        region,
        apartment_name,
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

module.exports = router;