const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 단지 목록 조회
router.get('/', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      search = '',
      region = ''
    } = req.query;

    let whereConditions = [];
    let params = [];

    // 기본 쿼리 구성
    let sql = `
      SELECT 
        ac.complex_id,
        ac.complex_name,
        ac.address,
        ac.completion_year,
        ac.total_households,
        ac.total_buildings,
        ac.area_range,
        ac.source_url,
        ac.created_at,
        ac.updated_at,
        (SELECT COUNT(*) FROM current_listings cl WHERE cl.complex_id = ac.complex_id) as listing_count
      FROM apartment_complexes ac
    `;

    // 검색 조건 추가 - 실제 한국어 이름이 description에 있으므로 listings 테이블에서도 검색
    if (search) {
      whereConditions.push(`(
        ac.complex_name LIKE ? OR 
        ac.complex_id = ? OR 
        ac.complex_id IN (
          SELECT DISTINCT complex_id FROM current_listings 
          WHERE description LIKE ? OR raw_text LIKE ?
        )
      )`);
      params.push(`%${search}%`, search, `%${search}%`, `%${search}%`);
    }

    if (region) {
      whereConditions.push(`(
        ac.address LIKE ? OR 
        ac.complex_id IN (
          SELECT DISTINCT complex_id FROM current_listings 
          WHERE description LIKE ? OR raw_text LIKE ?
        )
      )`);
      params.push(`%${region}%`, `%${region}%`, `%${region}%`);
    }

    if (whereConditions.length > 0) {
      sql += ' WHERE ' + whereConditions.join(' AND ');
    }

    sql += ` ORDER BY listing_count DESC, ac.complex_name LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const complexes = await db.queryNaver(sql, params);
    
    // 총 개수 조회
    let countSql = 'SELECT COUNT(*) as total FROM apartment_complexes ac';
    let countParams = [];
    
    if (whereConditions.length > 0) {
      countSql += ' WHERE ' + whereConditions.join(' AND ');
      // limit과 offset 제외한 파라미터들만 사용
      countParams = params.slice(0, -2);
    }
    
    const totalResult = await db.queryNaver(countSql, countParams);
    
    res.json({
      data: complexes,
      pagination: {
        total: totalResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: totalResult[0].total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch complexes',
      message: error.message
    });
  }
});

// 단지 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 단지 기본 정보
    const complex = await db.getNaverRow(
      'SELECT * FROM apartment_complexes WHERE complex_id = ?',
      [id]
    );

    if (!complex) {
      return res.status(404).json({
        error: 'Complex not found',
        message: `Complex with id ${id} does not exist`
      });
    }

    // 해당 단지의 매물 정보
    const listings = await db.queryNaver(
      'SELECT * FROM current_listings WHERE complex_id = ? ORDER BY crawled_at DESC',
      [id]
    );

    // 해당 단지의 거래 내역 (국토부 데이터)
    const transactions = await db.queryMolit(
      `SELECT * FROM apartment_transactions 
       WHERE apartment_name = ? 
       ORDER BY deal_year DESC, deal_month DESC 
       LIMIT 10`,
      [complex.complex_name]
    );

    res.json({
      complex,
      listings: {
        count: listings.length,
        data: listings
      },
      transactions: {
        count: transactions.length,
        data: transactions
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch complex details',
      message: error.message
    });
  }
});

// 단지별 통계
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    // 단지 정보 확인
    const complex = await db.getNaverRow(
      'SELECT complex_name FROM apartment_complexes WHERE complex_id = ?',
      [id]
    );

    if (!complex) {
      return res.status(404).json({
        error: 'Complex not found'
      });
    }

    // 매물 통계
    const listingStats = await db.queryNaver(`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
        COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as lease_count,
        COUNT(CASE WHEN deal_type = '월세' THEN 1 END) as rent_count
      FROM current_listings 
      WHERE complex_id = ?
    `, [id]);

    // 거래 통계 (국토부 데이터)
    const transactionStats = await db.queryMolit(`
      SELECT 
        COUNT(*) as total_transactions,
        AVG(CAST(REPLACE(deal_amount, ',', '') AS INTEGER)) as avg_price,
        MIN(CAST(REPLACE(deal_amount, ',', '') AS INTEGER)) as min_price,
        MAX(CAST(REPLACE(deal_amount, ',', '') AS INTEGER)) as max_price,
        COUNT(DISTINCT deal_year) as active_years
      FROM apartment_transactions 
      WHERE apartment_name = ? AND deal_amount IS NOT NULL AND deal_amount != ''
    `, [complex.complex_name]);

    res.json({
      complex_id: id,
      complex_name: complex.complex_name,
      listings: listingStats[0],
      transactions: transactionStats[0]
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch complex stats',
      message: error.message
    });
  }
});

module.exports = router;