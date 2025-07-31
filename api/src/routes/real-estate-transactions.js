/**
 * 실거래가 데이터 API 라우터
 * transaction_history 테이블에서 완전한 거래 데이터 제공
 */

const express = require('express');
const { executeQuery, getSupabaseClient } = require('../config/supabase');
const router = express.Router();

/**
 * 최근 1년 실거래가 데이터 전체 컬럼 조회
 * GET /api/real-estate-transactions/recent-year
 */
router.get('/recent-year', async (req, res) => {
  try {
    console.log('🔍 최근 1년 실거래가 데이터 조회 시작');
    
    const startTime = Date.now();
    
    // 1년 전 날짜 계산
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    // transaction_history 테이블에서 전체 컬럼 조회
    const data = await executeQuery('transaction_history', {
      select: '*',  // 모든 컬럼
      filters: [
        {
          type: 'gte',
          column: 'created_at',
          value: oneYearAgo.toISOString()
        }
      ],
      order: {
        column: 'created_at',
        ascending: false
      }
    }, 'primary');  // Primary DB 사용
    
    const executionTime = Date.now() - startTime;
    
    // 응답 데이터 구성
    const response = {
      success: true,
      message: '최근 1년 실거래가 데이터 조회 완료',
      data: {
        transactions: data,
        summary: {
          total_count: data.length,
          date_range: {
            from: oneYearAgo.toISOString().split('T')[0],
            to: new Date().toISOString().split('T')[0]
          },
          columns: data.length > 0 ? Object.keys(data[0]) : [],
          execution_time_ms: executionTime
        }
      }
    };
    
    // 거래 유형별 통계 추가
    if (data.length > 0) {
      const typeStats = {};
      const priceStats = [];
      
      data.forEach(transaction => {
        // 거래 유형 통계
        if (transaction.transaction_type) {
          typeStats[transaction.transaction_type] = (typeStats[transaction.transaction_type] || 0) + 1;
        }
        
        // 가격 통계용 데이터
        if (transaction.price_amount && transaction.price_amount > 0) {
          priceStats.push(transaction.price_amount);
        }
      });
      
      // 가격 통계 계산
      if (priceStats.length > 0) {
        priceStats.sort((a, b) => b - a);
        response.data.summary.price_statistics = {
          max_price: priceStats[0],
          min_price: priceStats[priceStats.length - 1],
          avg_price: Math.round(priceStats.reduce((a, b) => a + b, 0) / priceStats.length),
          valid_price_count: priceStats.length
        };
      }
      
      response.data.summary.transaction_type_stats = typeStats;
    }
    
    console.log(`✅ 실거래가 데이터 조회 완료: ${data.length}건 (${executionTime}ms)`);
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ 실거래가 데이터 조회 오류:', error);
    
    res.status(500).json({
      success: false,
      message: '실거래가 데이터 조회 중 오류가 발생했습니다.',
      error: error.message,
      code: 'REAL_ESTATE_QUERY_ERROR'
    });
  }
});

/**
 * 특정 단지 실거래가 데이터 조회
 * GET /api/real-estate-transactions/complex/:complexId
 */
router.get('/complex/:complexId', async (req, res) => {
  try {
    const { complexId } = req.params;
    const { months = 12 } = req.query; // 기본 12개월
    
    console.log(`🔍 단지 ${complexId} 실거래가 데이터 조회 (${months}개월)`);
    
    const startTime = Date.now();
    
    // N개월 전 날짜 계산
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - parseInt(months));
    
    const data = await executeQuery('transaction_history', {
      select: '*',
      filters: [
        {
          type: 'eq',
          column: 'complex_id',
          value: complexId
        },
        {
          type: 'gte',
          column: 'created_at',
          value: monthsAgo.toISOString()
        }
      ],
      order: {
        column: 'created_at',
        ascending: false
      }
    }, 'primary');
    
    const executionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      message: `단지 ${complexId} 실거래가 데이터 조회 완료`,
      data: {
        complex_id: complexId,
        transactions: data,
        summary: {
          total_count: data.length,
          period_months: parseInt(months),
          date_range: {
            from: monthsAgo.toISOString().split('T')[0],
            to: new Date().toISOString().split('T')[0]
          },
          execution_time_ms: executionTime
        }
      }
    });
    
    console.log(`✅ 단지 ${complexId} 거래 데이터: ${data.length}건 (${executionTime}ms)`);
    
  } catch (error) {
    console.error('❌ 단지별 실거래가 조회 오류:', error);
    
    res.status(500).json({
      success: false,
      message: '단지별 실거래가 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 거래 유형별 통계 조회
 * GET /api/real-estate-transactions/stats/by-type
 */
router.get('/stats/by-type', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    
    console.log(`📊 거래 유형별 통계 조회 (${months}개월)`);
    
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - parseInt(months));
    
    const data = await executeQuery('transaction_history', {
      select: 'transaction_type, price_amount, area_sqm, area_pyeong',
      filters: [
        {
          type: 'gte',
          column: 'created_at',
          value: monthsAgo.toISOString()
        }
      ]
    }, 'primary');
    
    // 거래 유형별 통계 계산
    const statsByType = {};
    
    data.forEach(transaction => {
      const type = transaction.transaction_type || '기타';
      
      if (!statsByType[type]) {
        statsByType[type] = {
          count: 0,
          prices: [],
          areas_sqm: [],
          areas_pyeong: []
        };
      }
      
      statsByType[type].count++;
      
      if (transaction.price_amount && transaction.price_amount > 0) {
        statsByType[type].prices.push(transaction.price_amount);
      }
      
      if (transaction.area_sqm && transaction.area_sqm > 0) {
        statsByType[type].areas_sqm.push(transaction.area_sqm);
      }
      
      if (transaction.area_pyeong && transaction.area_pyeong > 0) {
        statsByType[type].areas_pyeong.push(transaction.area_pyeong);
      }
    });
    
    // 통계 계산
    const processedStats = {};
    Object.entries(statsByType).forEach(([type, stats]) => {
      processedStats[type] = {
        transaction_count: stats.count,
        price_stats: stats.prices.length > 0 ? {
          max: Math.max(...stats.prices),
          min: Math.min(...stats.prices),
          avg: Math.round(stats.prices.reduce((a, b) => a + b, 0) / stats.prices.length),
          count: stats.prices.length
        } : null,
        area_stats_sqm: stats.areas_sqm.length > 0 ? {
          max: Math.max(...stats.areas_sqm),
          min: Math.min(...stats.areas_sqm),
          avg: parseFloat((stats.areas_sqm.reduce((a, b) => a + b, 0) / stats.areas_sqm.length).toFixed(1)),
          count: stats.areas_sqm.length
        } : null,
        area_stats_pyeong: stats.areas_pyeong.length > 0 ? {
          max: Math.max(...stats.areas_pyeong),
          min: Math.min(...stats.areas_pyeong),
          avg: parseFloat((stats.areas_pyeong.reduce((a, b) => a + b, 0) / stats.areas_pyeong.length).toFixed(1)),
          count: stats.areas_pyeong.length
        } : null
      };
    });
    
    res.json({
      success: true,
      message: '거래 유형별 통계 조회 완료',
      data: {
        period_months: parseInt(months),
        total_transactions: data.length,
        stats_by_type: processedStats
      }
    });
    
  } catch (error) {
    console.error('❌ 거래 유형별 통계 오류:', error);
    
    res.status(500).json({
      success: false,
      message: '거래 유형별 통계 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

module.exports = router;