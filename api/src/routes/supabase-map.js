/**
 * Supabase + PostGIS 기반 지도 API 라우트
 * 기존 SQLite molit-map.js를 Supabase로 마이그레이션
 */

const express = require('express');
const router = express.Router();
const { supabase, executeQuery, executeRawQuery, getRow, buildRadiusCondition } = require('../config/supabase');

/**
 * 지도용 마커 데이터 조회 (PostGIS 최적화)
 * 
 * Query Parameters:
 * - region: 지역 필터 (optional)
 * - zoom_level: 줌 레벨 (기본값: 8)
 * - limit: 결과 제한 (기본값: 50)
 * - bounds: 지도 영역 {north, south, east, west} (optional)
 * - deal_type: 거래 유형 필터 (optional)
 * - household_filter: 단지 규모 필터 (optional)
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

    // 지도 경계에서 중심점 계산
    let centerLat = null;
    let centerLng = null;
    
    if (bounds) {
      try {
        const boundsObj = typeof bounds === 'string' ? JSON.parse(bounds) : bounds;
        centerLat = (boundsObj.north + boundsObj.south) / 2;
        centerLng = (boundsObj.east + boundsObj.west) / 2;
        console.log(`🎯 PostGIS 반경 3km 필터 적용: 중심(${centerLat.toFixed(4)}, ${centerLng.toFixed(4)})`);
      } catch (error) {
        console.warn('Invalid bounds parameter:', bounds);
      }
    }

    console.log('🔍 Supabase RPC 함수 호출:', {
      center_lat: centerLat,
      center_lng: centerLng,
      radius_km: 3,
      zoom_level: parseInt(zoom_level),
      region_filter: region,
      deal_type_filter: deal_type,
      household_filter: household_filter,
      result_limit: parseInt(limit)
    });

    // Supabase RPC 함수 호출
    const { data: rpcResult, error } = await supabase.rpc('get_map_markers', {
      center_lat: centerLat,
      center_lng: centerLng,
      radius_km: 3,
      zoom_level: parseInt(zoom_level),
      region_filter: region,
      deal_type_filter: deal_type,
      household_filter: household_filter,
      result_limit: parseInt(limit)
    });

    if (error) {
      console.error('❌ Supabase RPC 오류:', error);
      throw error;
    }

    // JSON 배열을 파싱 (RPC 함수가 JSON을 반환)
    const results = Array.isArray(rpcResult) ? rpcResult : [];
    console.log('📊 Supabase 결과:', results.length, '건 조회됨');
    
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
        household_filter: household_filter,
        min_transaction_count: minTransactionCount,
        execution_time_ms: executionTime,
        database_type: 'supabase_postgis'
      }
    });

  } catch (error) {
    console.error('지도 마커 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '지도 마커 데이터 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_postgis'
    });
  }
});

/**
 * 특정 단지의 상세 거래 내역 (PostGIS)
 */
router.get('/complex/:name/transactions', async (req, res) => {
  try {
    const startTime = Date.now();
    const { name } = req.params;
    const { limit = 20, year, deal_type } = req.query;

    const conditions = [`apartment_name = '${decodeURIComponent(name)}'`];

    if (year) {
      conditions.push(`deal_year = ${year}`);
    }

    if (deal_type && ['매매', '전세', '월세'].includes(deal_type)) {
      conditions.push(`deal_type = '${deal_type}'`);
    }

    const sql = `
      SELECT 
        deal_year,
        deal_month,
        deal_day,
        deal_amount,
        deal_type,
        area,
        floor,
        apartment_name,
        region as region_name,
        ST_X(coordinates) as longitude,
        ST_Y(coordinates) as latitude
      FROM apartment_transactions 
      WHERE ${conditions.join(' AND ')}
      ORDER BY deal_year DESC, deal_month DESC, deal_day DESC 
      LIMIT ${parseInt(limit)}
    `;

    console.log('🏢 단지 상세 조회:', sql.substring(0, 150) + '...');

    const transactions = await executeRawQuery(sql);
    
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
          execution_time_ms: executionTime,
          database_type: 'supabase_postgis'
        }
      }
    });

  } catch (error) {
    console.error('단지 거래내역 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '거래내역 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_postgis'
    });
  }
});

/**
 * 지도 통계 정보 조회 (PostGIS)
 */
router.get('/stats', async (req, res) => {
  try {
    const startTime = Date.now();
    const { region } = req.query;

    let whereCondition = '';
    
    if (region) {
      whereCondition = `WHERE region ILIKE '%${region}%'`;
    }

    const sql = `
      SELECT 
        COUNT(DISTINCT apartment_name) as total_complexes,
        COUNT(*) as total_transactions,
        ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as overall_avg_amount,
        COUNT(DISTINCT region) as regions_count,
        COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as total_sales,
        COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as total_jeonse,
        COUNT(CASE WHEN deal_type = '월세' THEN 1 END) as total_monthly
      FROM apartment_transactions
      ${whereCondition}
    `;

    console.log('📊 통계 조회:', sql);

    const stats = await executeRawQuery(sql);
    
    // 지역별 분포
    const regionSql = `
      SELECT 
        region as region_name,
        COUNT(DISTINCT apartment_name) as complex_count,
        COUNT(*) as transaction_count,
        ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as avg_amount
      FROM apartment_transactions
      ${whereCondition}
      GROUP BY region
      ORDER BY transaction_count DESC
      LIMIT 10
    `;

    const regionStats = await executeRawQuery(regionSql);
    
    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        overview: stats[0] || {},
        top_regions: regionStats,
        meta: {
          region_filter: region || 'all',
          execution_time_ms: executionTime,
          database_type: 'supabase_postgis'
        }
      }
    });

  } catch (error) {
    console.error('지도 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '통계 데이터 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_postgis'
    });
  }
});

/**
 * PostGIS 클러스터링 API
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
    const conditions = [];
    
    // 지역 필터
    if (region) {
      conditions.push(`region ILIKE '%${region}%'`);
    }

    // 지도 경계 및 반경 필터
    if (bounds) {
      try {
        const boundsObj = typeof bounds === 'string' ? JSON.parse(bounds) : bounds;
        const centerLat = (boundsObj.north + boundsObj.south) / 2;
        const centerLng = (boundsObj.east + boundsObj.west) / 2;
        
        const radiusCondition = buildRadiusCondition(centerLat, centerLng, 3);
        conditions.push(radiusCondition);
        
        console.log(`🎯 클러스터 반경 3km 필터 적용: 중심(${centerLat.toFixed(4)}, ${centerLng.toFixed(4)})`);
      } catch (error) {
        console.warn('Invalid bounds parameter:', bounds);
      }
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // PostGIS 기반 클러스터링 쿼리
    const sql = `
      SELECT 
        ROUND(ST_X(coordinates) / ${clusterParam}, 0) * ${clusterParam} as cluster_lng,
        ROUND(ST_Y(coordinates) / ${clusterParam}, 0) * ${clusterParam} as cluster_lat,
        COUNT(*) as marker_count,
        COUNT(*) as total_transactions,
        ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as avg_price,
        STRING_AGG(DISTINCT apartment_name, '|') as apartment_names,
        region as region_name
      FROM apartment_transactions
      ${whereClause}
      GROUP BY 
        ROUND(ST_X(coordinates) / ${clusterParam}, 0) * ${clusterParam},
        ROUND(ST_Y(coordinates) / ${clusterParam}, 0) * ${clusterParam},
        region
      HAVING COUNT(*) >= 1
      ORDER BY total_transactions DESC
      LIMIT 100
    `;

    console.log('🔗 PostGIS 클러스터 쿼리:', sql.substring(0, 200) + '...');

    const clusters = await executeRawQuery(sql);
    
    // 클러스터 데이터 후처리
    const processedClusters = clusters.map(cluster => ({
      ...cluster,
      apartment_names: cluster.apartment_names ? cluster.apartment_names.split('|').slice(0, 5) : [],
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
        execution_time_ms: executionTime,
        database_type: 'supabase_postgis'
      }
    });

  } catch (error) {
    console.error('클러스터 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '클러스터 데이터 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_postgis'
    });
  }
});

/**
 * PostGIS 밀도 히트맵 API
 */
router.get('/density', async (req, res) => {
  try {
    const startTime = Date.now();
    const { region, grid_size = 0.01 } = req.query;

    const gridParam = parseFloat(grid_size);
    const conditions = [];
    
    if (region) {
      conditions.push(`region ILIKE '%${region}%'`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT 
        ROUND(ST_X(coordinates) / ${gridParam}, 0) * ${gridParam} as grid_lng,
        ROUND(ST_Y(coordinates) / ${gridParam}, 0) * ${gridParam} as grid_lat,
        COUNT(DISTINCT apartment_name) as complex_count,
        COUNT(*) as transaction_density,
        ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as avg_price,
        region as region_name
      FROM apartment_transactions
      ${whereClause}
      GROUP BY 
        ROUND(ST_X(coordinates) / ${gridParam}, 0) * ${gridParam},
        ROUND(ST_Y(coordinates) / ${gridParam}, 0) * ${gridParam},
        region
      HAVING COUNT(*) > 0
      ORDER BY transaction_density DESC
      LIMIT 200
    `;

    console.log('🌡️ PostGIS 밀도 쿼리:', sql.substring(0, 150) + '...');

    const densityData = await executeRawQuery(sql);
    
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
        execution_time_ms: executionTime,
        database_type: 'supabase_postgis'
      }
    });

  } catch (error) {
    console.error('밀도 데이터 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '밀도 데이터 조회 중 오류가 발생했습니다',
      message: error.message,
      database_type: 'supabase_postgis'
    });
  }
});

module.exports = router;