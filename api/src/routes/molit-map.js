const express = require('express');
const router = express.Router();
const Database = require('../config/database');

/**
 * 지도용 마커 데이터 조회 (집계된 데이터)
 * 
 * Query Parameters:
 * - region: 지역 필터 (optional)
 * - zoom_level: 줌 레벨 (기본값: 8)
 * - limit: 결과 제한 (기본값: 50)
 * - bounds: 지도 영역 {north, south, east, west} (optional)
 * - deal_type: 거래 유형 필터 (optional)
 */
router.get('/markers', async (req, res) => {
  try {
    const startTime = Date.now();
    
    const { 
      region, 
      zoom_level = 8, 
      limit = 50,
      bounds, // JSON string: {"north": 37.7, "south": 37.4, "east": 127.2, "west": 126.8}
      deal_type = null,
      household_filter = 'all' // 'all', 'small', 'medium', 'large'
    } = req.query;

    // 줌 레벨에 따른 거래량 임계값 설정
    let minTransactionCount = 1;
    if (zoom_level < 7) {
      minTransactionCount = 10; // 광역 뷰: 거래량 많은 단지만
    } else if (zoom_level < 10) {
      minTransactionCount = 5;  // 중간 뷰: 거래량 5건 이상
    }

    let sql = `
      SELECT 
        name,
        region_name,
        longitude,
        latitude,
        coordinate_source,
        transaction_count,
        avg_deal_amount,
        first_deal_date,
        last_deal_date,
        sale_count,
        jeonse_count,
        monthly_count
      FROM map_markers
      WHERE transaction_count >= ?
    `;
    
    const params = [minTransactionCount];

    // 지역 필터
    if (region) {
      sql += ' AND region_name LIKE ?';
      params.push(`%${region}%`);
    }

    // 지도 영역 필터 (뷰포트 기반 + 반경 3km 최적화)
    if (bounds) {
      try {
        const boundsObj = typeof bounds === 'string' ? JSON.parse(bounds) : bounds;
        
        // 지도 중심점 계산
        const centerLat = (boundsObj.north + boundsObj.south) / 2;
        const centerLng = (boundsObj.east + boundsObj.west) / 2;
        
        // 반경 3km 내 데이터만 조회 (Haversine 공식 사용)
        sql += ` AND (
          6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          ) <= 3
        )`;
        
        params.push(centerLat, centerLng, centerLat);
        
        console.log(`🎯 반경 3km 필터 적용: 중심(${centerLat.toFixed(4)}, ${centerLng.toFixed(4)})`);
      } catch (error) {
        console.warn('Invalid bounds parameter:', bounds);
      }
    }

    // 거래 유형 필터
    if (deal_type) {
      if (deal_type === '매매') {
        sql += ' AND sale_count > 0';
      } else if (deal_type === '전세') {
        sql += ' AND jeonse_count > 0';
      } else if (deal_type === '월세') {
        sql += ' AND monthly_count > 0';
      }
    }

    // 거래량 기준 아파트 규모 필터 (대용량 데이터에서 규모를 거래량으로 추정)
    if (household_filter && household_filter !== 'all') {
      if (household_filter === 'small') {
        // 소형 단지: 거래량 10건 미만 (소규모 단지)
        sql += ' AND transaction_count < 10';
      } else if (household_filter === 'medium') {
        // 중형 단지: 거래량 10~50건 (중규모 단지)
        sql += ' AND transaction_count >= 10 AND transaction_count < 50';
      } else if (household_filter === 'large') {
        // 대형 단지: 거래량 50건 이상 (대규모 단지)
        sql += ' AND transaction_count >= 50';
      }
    }

    // 거래량 순 정렬 및 제한
    sql += ' ORDER BY transaction_count DESC, avg_deal_amount DESC LIMIT ?';
    params.push(parseInt(limit));

    const results = await Database.queryMolit(sql, params);
    
    // 성능 메트릭 계산
    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      data: results,
      meta: {
        count: results.length,
        zoom_level: parseInt(zoom_level),
        region: region || 'all',
        bounds: bounds ? (typeof bounds === 'string' ? JSON.parse(bounds) : bounds) : null,
        deal_type: deal_type || 'all',
        min_transaction_count: minTransactionCount,
        execution_time_ms: executionTime
      }
    });

  } catch (error) {
    console.error('지도 마커 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '지도 마커 데이터 조회 중 오류가 발생했습니다',
      message: error.message
    });
  }
});

/**
 * 특정 단지의 상세 거래 내역
 */
router.get('/complex/:name/transactions', async (req, res) => {
  try {
    const startTime = Date.now();
    const { name } = req.params;
    const { limit = 20, year, deal_type } = req.query;

    let sql = `
      SELECT 
        deal_year,
        deal_month,
        deal_day,
        deal_amount,
        deal_type,
        area,
        floor,
        apartment_name,
        region_name,
        longitude,
        latitude
      FROM apartment_transactions 
      WHERE apartment_name = ?
    `;
    
    const params = [decodeURIComponent(name)];

    if (year) {
      sql += ' AND deal_year = ?';
      params.push(year);
    }

    if (deal_type) {
      sql += ' AND deal_type = ?';
      params.push(deal_type);
    }

    sql += ' ORDER BY deal_year DESC, deal_month DESC, deal_day DESC LIMIT ?';
    params.push(parseInt(limit));

    const transactions = await Database.queryMolit(sql, params);
    
    // 통계 계산
    const stats = {
      total_count: transactions.length,
      avg_amount: transactions.length > 0 ? 
        transactions.reduce((sum, t) => {
          const amount = parseFloat(t.deal_amount?.replace(/,/g, '') || 0);
          return sum + amount;
        }, 0) / transactions.length : 0,
      deal_types: {}
    };

    // 거래 유형별 통계
    transactions.forEach(t => {
      if (t.deal_type) {
        stats.deal_types[t.deal_type] = (stats.deal_types[t.deal_type] || 0) + 1;
      }
    });

    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        apartment_name: decodeURIComponent(name),
        transactions: transactions,
        statistics: stats,
        meta: {
          execution_time_ms: executionTime
        }
      }
    });

  } catch (error) {
    console.error('단지 거래내역 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '거래내역 조회 중 오류가 발생했습니다',
      message: error.message
    });
  }
});

/**
 * 지도 통계 정보 조회
 */
router.get('/stats', async (req, res) => {
  try {
    const startTime = Date.now();
    const { region } = req.query;

    let whereClause = '';
    const params = [];

    if (region) {
      whereClause = 'WHERE region_name LIKE ?';
      params.push(`%${region}%`);
    }

    const sql = `
      SELECT 
        COUNT(*) as total_complexes,
        SUM(transaction_count) as total_transactions,
        AVG(avg_deal_amount) as overall_avg_amount,
        COUNT(DISTINCT region_name) as regions_count,
        SUM(sale_count) as total_sales,
        SUM(jeonse_count) as total_jeonse,
        SUM(monthly_count) as total_monthly
      FROM map_markers
      ${whereClause}
    `;

    const stats = await Database.getMolitRow(sql, params);
    
    // 지역별 분포
    const regionSql = `
      SELECT 
        region_name,
        COUNT(*) as complex_count,
        SUM(transaction_count) as transaction_count,
        AVG(avg_deal_amount) as avg_amount
      FROM map_markers
      ${whereClause}
      GROUP BY region_name
      ORDER BY transaction_count DESC
      LIMIT 10
    `;

    const regionStats = await Database.queryMolit(regionSql, params);
    
    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        overview: stats,
        top_regions: regionStats,
        meta: {
          region_filter: region || 'all',
          execution_time_ms: executionTime
        }
      }
    });

  } catch (error) {
    console.error('지도 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '통계 데이터 조회 중 오류가 발생했습니다',
      message: error.message
    });
  }
});

/**
 * 마커 클러스터링을 위한 API
 * 줌 레벨이 낮을 때 인근 마커들을 그룹화
 */
router.get('/clusters', async (req, res) => {
  try {
    const startTime = Date.now();
    
    const { 
      zoom_level = 8,
      bounds,
      cluster_size = 0.01, // 클러스터링 반경 (도 단위)
      region
    } = req.query;

    const clusterParam = parseFloat(cluster_size);
    
    let sql = `
      SELECT 
        ROUND(longitude / ?, 0) * ? as cluster_lng,
        ROUND(latitude / ?, 0) * ? as cluster_lat,
        COUNT(*) as marker_count,
        SUM(transaction_count) as total_transactions,
        AVG(avg_deal_amount) as avg_price,
        GROUP_CONCAT(name, '|') as apartment_names,
        region_name
      FROM map_markers
      WHERE 1=1
    `;

    const params = [clusterParam, clusterParam, clusterParam, clusterParam];

    // 지역 필터
    if (region) {
      sql += ' AND region_name LIKE ?';
      params.push(`%${region}%`);
    }

    // 지도 영역 필터 (뷰포트 기반 + 반경 3km 최적화)
    if (bounds) {
      try {
        const boundsObj = typeof bounds === 'string' ? JSON.parse(bounds) : bounds;
        
        // 지도 중심점 계산
        const centerLat = (boundsObj.north + boundsObj.south) / 2;
        const centerLng = (boundsObj.east + boundsObj.west) / 2;
        
        // 반경 3km 내 데이터만 조회 (클러스터용)
        sql += ` AND (
          6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          ) <= 3
        )`;
        
        params.push(centerLat, centerLng, centerLat);
        
        console.log(`🎯 클러스터 반경 3km 필터 적용: 중심(${centerLat.toFixed(4)}, ${centerLng.toFixed(4)})`);
      } catch (error) {
        console.warn('Invalid bounds parameter:', bounds);
      }
    }

    sql += `
      GROUP BY cluster_lng, cluster_lat, region_name
      HAVING marker_count >= 1
      ORDER BY total_transactions DESC
      LIMIT 100
    `;

    const clusters = await Database.queryMolit(sql, params);
    
    // 클러스터 데이터 후처리
    const processedClusters = clusters.map(cluster => ({
      ...cluster,
      apartment_names: cluster.apartment_names ? cluster.apartment_names.split('|').slice(0, 5) : [], // 최대 5개만
      cluster_type: cluster.marker_count === 1 ? 'single' : 'cluster'
    }));

    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      data: processedClusters,
      meta: {
        cluster_size: clusterParam,
        zoom_level: parseInt(zoom_level),
        cluster_count: processedClusters.length,
        total_markers: processedClusters.reduce((sum, c) => sum + c.marker_count, 0),
        execution_time_ms: executionTime
      }
    });

  } catch (error) {
    console.error('클러스터 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '클러스터 데이터 조회 중 오류가 발생했습니다',
      message: error.message
    });
  }
});

/**
 * 지역별 마커 밀도 조회
 */
router.get('/density', async (req, res) => {
  try {
    const startTime = Date.now();
    const { region, grid_size = 0.01 } = req.query;

    const gridParam = parseFloat(grid_size);
    
    let sql = `
      SELECT 
        ROUND(longitude / ?, 0) * ? as grid_lng,
        ROUND(latitude / ?, 0) * ? as grid_lat,
        COUNT(*) as complex_count,
        SUM(transaction_count) as transaction_density,
        AVG(avg_deal_amount) as avg_price,
        region_name
      FROM map_markers
      WHERE 1=1
    `;

    const params = [gridParam, gridParam, gridParam, gridParam];

    if (region) {
      sql += ' AND region_name LIKE ?';
      params.push(`%${region}%`);
    }

    sql += `
      GROUP BY grid_lng, grid_lat, region_name
      HAVING complex_count > 0
      ORDER BY transaction_density DESC
      LIMIT 200
    `;

    const densityData = await Database.queryMolit(sql, params);
    
    // 밀도 등급 계산
    const maxDensity = Math.max(...densityData.map(d => d.transaction_density));
    const processedData = densityData.map(grid => ({
      ...grid,
      density_level: Math.ceil((grid.transaction_density / maxDensity) * 5), // 1-5 등급
      heat_intensity: grid.transaction_density / maxDensity // 0-1 정규화
    }));

    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      data: processedData,
      meta: {
        grid_size: gridParam,
        grid_count: processedData.length,
        max_density: maxDensity,
        region_filter: region || 'all',
        execution_time_ms: executionTime
      }
    });

  } catch (error) {
    console.error('밀도 데이터 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '밀도 데이터 조회 중 오류가 발생했습니다',
      message: error.message
    });
  }
});

module.exports = router;