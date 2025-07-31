const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 매물 목록 조회
router.get('/', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      deal_type = '',
      min_price = '',
      max_price = '',
      region = '',
      complex_name = ''
    } = req.query;

    let whereConditions = [];
    let params = [];
    
    // 검색 조건 구성
    if (deal_type) {
      whereConditions.push('cl.deal_type = ?');
      params.push(deal_type);
    }
    
    if (min_price) {
      whereConditions.push('cl.price_amount >= ?');
      params.push(parseFloat(min_price));
    }
    
    if (max_price) {
      whereConditions.push('cl.price_amount <= ?');
      params.push(parseFloat(max_price));
    }
    
    if (complex_name) {
      whereConditions.push('(ac.complex_name LIKE ? OR cl.description LIKE ? OR cl.complex_id = ?)');
      params.push(`%${complex_name}%`, `%${complex_name}%`, complex_name);
    }

    if (region) {
      whereConditions.push('(ac.address LIKE ? OR cl.description LIKE ?)');
      params.push(`%${region}%`, `%${region}%`);
    }

    let whereClause = '';
    if (whereConditions.length > 0) {
      whereClause = 'WHERE ' + whereConditions.join(' AND ');
    }

    const sql = `
      SELECT 
        cl.*,
        ac.complex_name
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      ${whereClause}
      ORDER BY cl.crawled_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const listings = await db.queryNaver(sql, params);
    
    // 총 개수 조회
    const countSql = `
      SELECT COUNT(*) as total 
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      ${whereClause}
    `;
    
    // limit과 offset 제외한 파라미터들만 사용
    const countParams = params.slice(0, -2);
    const totalResult = await db.queryNaver(countSql, countParams);
    
    res.json({
      data: listings,
      pagination: {
        total: totalResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: totalResult[0].total > parseInt(offset) + parseInt(limit)
      },
      filters: {
        deal_type,
        min_price,
        max_price,
        region,
        complex_name
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch listings',
      message: error.message
    });
  }
});

// 매물 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await db.getNaverRow(`
      SELECT 
        cl.*,
        ac.complex_name
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      WHERE cl.id = ?
    `, [id]);

    if (!listing) {
      return res.status(404).json({
        error: 'Listing not found',
        message: `Listing with id ${id} does not exist`
      });
    }

    // 같은 단지의 유사 매물
    const similarListings = await db.queryNaver(`
      SELECT 
        cl.*,
        ac.complex_name
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      WHERE cl.complex_id = ? AND cl.id != ? AND cl.deal_type = ?
      ORDER BY ABS(cl.price_amount - ?) ASC
      LIMIT 5
    `, [listing.complex_id, id, listing.deal_type, listing.price_amount]);

    res.json({
      listing,
      similar_listings: similarListings
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch listing details',
      message: error.message
    });
  }
});

// 매물 통계
router.get('/stats/summary', async (req, res) => {
  try {
    const { region = '', deal_type = '' } = req.query;

    let whereClause = '';
    let params = [];


    if (deal_type) {
      whereClause += whereClause ? ' AND ' : ' WHERE ';
      whereClause += ' cl.deal_type = ?';
      params.push(deal_type);
    }

    const stats = await db.queryNaver(`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN cl.deal_type = '매매' THEN 1 END) as sale_count,
        COUNT(CASE WHEN cl.deal_type = '전세' THEN 1 END) as lease_count,
        COUNT(CASE WHEN cl.deal_type = '월세' THEN 1 END) as rent_count,
        AVG(cl.price_amount) as avg_price,
        MIN(cl.price_amount) as min_price,
        MAX(cl.price_amount) as max_price,
        COUNT(DISTINCT cl.complex_id) as unique_complexes
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      ${whereClause}
    `, params);

    // 단지별 분포
    const complexStats = await db.queryNaver(`
      SELECT 
        ac.complex_name,
        COUNT(*) as listing_count,
        AVG(cl.price_amount) as avg_price
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      ${whereClause}
      GROUP BY ac.complex_name
      ORDER BY listing_count DESC
      LIMIT 10
    `, params);

    res.json({
      summary: stats[0],
      complex_distribution: complexStats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch listing stats',
      message: error.message
    });
  }
});

module.exports = router;