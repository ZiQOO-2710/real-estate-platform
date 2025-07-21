const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * 향상된 한국어 검색 API
 * Full Text Search와 일반 LIKE 검색을 조합하여 최적의 성능 제공
 */

// 통합 검색 엔드포인트
router.get('/', async (req, res) => {
  try {
    const { 
      q = '',           // 검색 쿼리
      type = 'all',     // 검색 타입: 'listings', 'complexes', 'all'
      limit = 50, 
      offset = 0,
      deal_type = '',
      min_price = '',
      max_price = ''
    } = req.query;

    if (!q.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        message: 'Please provide a search term (q parameter)'
      });
    }

    const results = {};

    // 매물 검색
    if (type === 'listings' || type === 'all') {
      results.listings = await searchListings(q, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        deal_type,
        min_price,
        max_price
      });
    }

    // 복합단지 검색
    if (type === 'complexes' || type === 'all') {
      results.complexes = await searchComplexes(q, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    res.json({
      query: q,
      type,
      results,
      suggestion: generateSearchSuggestion(q)
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

/**
 * 매물 검색 (FTS + LIKE 하이브리드)
 */
async function searchListings(query, options = {}) {
  const { limit = 50, offset = 0, deal_type, min_price, max_price } = options;
  
  let whereConditions = [];
  let params = [];

  // 한국어 검색을 위한 하이브리드 접근법
  // 1. FTS 검색 시도 (빠름)
  // 2. 실패시 LIKE 검색 (정확함)
  
  let searchClause;
  let searchParams;

  try {
    // FTS 검색 시도
    searchClause = `cl.id IN (
      SELECT rowid FROM listings_fts 
      WHERE listings_fts MATCH ?
    )`;
    searchParams = [query];
  } catch (error) {
    // FTS 실패시 LIKE 검색
    searchClause = `(cl.description LIKE ? OR cl.raw_text LIKE ?)`;
    searchParams = [`%${query}%`, `%${query}%`];
  }

  whereConditions.push(searchClause);
  params.push(...searchParams);

  // 추가 필터링
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

  const whereClause = whereConditions.length > 0 ? 
    'WHERE ' + whereConditions.join(' AND ') : '';

  const sql = `
    SELECT 
      cl.*,
      ac.complex_name,
      CASE 
        WHEN cl.description LIKE ? THEN 10
        WHEN cl.raw_text LIKE ? THEN 5
        ELSE 1
      END as relevance_score
    FROM current_listings cl
    JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
    ${whereClause}
    ORDER BY relevance_score DESC, cl.crawled_at DESC
    LIMIT ? OFFSET ?
  `;

  // 관련성 점수를 위한 추가 파라미터
  params.unshift(`%${query}%`, `%${query}%`);
  params.push(limit, offset);

  const listings = await db.queryNaver(sql, params);

  // 총 개수 조회
  const countSql = `
    SELECT COUNT(*) as total 
    FROM current_listings cl
    JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
    ${whereClause}
  `;
  
  const countParams = params.slice(2, -2); // relevance_score와 limit/offset 제외
  const totalResult = await db.queryNaver(countSql, countParams);

  return {
    data: listings,
    pagination: {
      total: totalResult[0].total,
      limit,
      offset,
      has_more: totalResult[0].total > offset + limit
    }
  };
}

/**
 * 복합단지 검색
 */
async function searchComplexes(query, options = {}) {
  const { limit = 50, offset = 0 } = options;

  const sql = `
    SELECT 
      ac.*,
      (SELECT COUNT(*) FROM current_listings cl WHERE cl.complex_id = ac.complex_id) as listing_count,
      CASE 
        WHEN ac.complex_name LIKE ? THEN 10
        WHEN ac.complex_id IN (
          SELECT DISTINCT complex_id FROM current_listings 
          WHERE description LIKE ?
        ) THEN 8
        WHEN ac.address LIKE ? THEN 5
        ELSE 1
      END as relevance_score
    FROM apartment_complexes ac
    WHERE (
      ac.complex_name LIKE ? OR 
      ac.complex_id = ? OR 
      ac.address LIKE ? OR
      ac.complex_id IN (
        SELECT DISTINCT complex_id FROM current_listings 
        WHERE description LIKE ? OR raw_text LIKE ?
      )
    )
    ORDER BY relevance_score DESC, listing_count DESC
    LIMIT ? OFFSET ?
  `;

  const searchPattern = `%${query}%`;
  const params = [
    searchPattern, searchPattern, searchPattern,  // relevance_score용
    searchPattern, query, searchPattern,          // WHERE절용
    searchPattern, searchPattern,                 // 서브쿼리용
    limit, offset
  ];

  const complexes = await db.queryNaver(sql, params);

  // 총 개수 조회
  const countSql = `
    SELECT COUNT(*) as total 
    FROM apartment_complexes ac
    WHERE (
      ac.complex_name LIKE ? OR 
      ac.complex_id = ? OR 
      ac.address LIKE ? OR
      ac.complex_id IN (
        SELECT DISTINCT complex_id FROM current_listings 
        WHERE description LIKE ? OR raw_text LIKE ?
      )
    )
  `;

  const countParams = [searchPattern, query, searchPattern, searchPattern, searchPattern];
  const totalResult = await db.queryNaver(countSql, countParams);

  return {
    data: complexes,
    pagination: {
      total: totalResult[0].total,
      limit,
      offset,
      has_more: totalResult[0].total > offset + limit
    }
  };
}

/**
 * 검색 제안 생성
 */
function generateSearchSuggestion(query) {
  const suggestions = [];
  
  // 일반적인 한국어 아파트 브랜드 제안
  const brands = ['푸르지오', '래미안', '아이파크', '롯데캐슬', '자이', '더샵'];
  const matchedBrands = brands.filter(brand => 
    brand.includes(query) || query.includes(brand)
  );
  
  if (matchedBrands.length > 0) {
    suggestions.push(...matchedBrands);
  }

  // 지역명 기반 제안
  const regions = ['강남', '서초', '송파', '강서', '마포', '용산', '성동'];
  const matchedRegions = regions.filter(region => 
    region.includes(query) || query.includes(region)
  );
  
  if (matchedRegions.length > 0) {
    suggestions.push(...matchedRegions.map(region => region + '구'));
  }

  return suggestions.slice(0, 5); // 최대 5개 제안
}

// 인기 검색어 엔드포인트
router.get('/popular', async (req, res) => {
  try {
    // 가장 많은 매물이 있는 단지명들 추출
    const popularComplexes = await db.queryNaver(`
      SELECT 
        ac.complex_name,
        COUNT(cl.id) as listing_count
      FROM apartment_complexes ac
      JOIN current_listings cl ON ac.complex_id = cl.complex_id
      WHERE ac.complex_name != '정보없음' AND ac.complex_name IS NOT NULL
      GROUP BY ac.complex_name
      ORDER BY listing_count DESC
      LIMIT 10
    `);

    res.json({
      popular_complexes: popularComplexes,
      suggested_searches: [
        '강남', '서초', '송파', '래미안', '푸르지오', 
        '아이파크', '매매', '전세', '월세', '신축'
      ]
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch popular searches',
      message: error.message
    });
  }
});

module.exports = router;